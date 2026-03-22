// cloudfunctions/reviewMgr/index.js
// 评价管理云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const CREDIT_DELTA = {
  good_review: +2,
  bad_review: -10
}

// 将单个 cloud:// fileID 转为 https 临时链接
async function resolveCloudUrl(url) {
  if (!url || !url.startsWith('cloud://')) return url
  try {
    const res = await cloud.getTempFileURL({ fileList: [url] })
    return res.fileList[0]?.tempFileURL || url
  } catch (e) {
    return url
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event

  // ========== 提交评价 ==========
  if (action === 'submit') {
    try {
      const { orderId, rating, comment } = event
      // rating: 1=好评, 0=差评

      const order = await db.collection('orders').doc(orderId).get()
      const o = order.data
      if (o.status !== 'completed') return { success: false, message: '订单未完成' }
      if (o.initiatorOpenid !== openid && o.receiverOpenid !== openid) return { success: false, message: '无权操作' }

      // 检查是否已评价
      const existing = await db.collection('reviews')
        .where({ orderId, reviewerOpenid: openid })
        .count()
      if (existing.total > 0) return { success: false, message: '已经评价过了' }

      const revieweeOpenid = o.initiatorOpenid === openid ? o.receiverOpenid : o.initiatorOpenid

      // 创建评价
      await db.collection('reviews').add({
        data: {
          orderId,
          reviewerOpenid: openid,
          revieweeOpenid,
          rating,
          comment: comment || '',
          createTime: db.serverDate()
        }
      })

      // 更新被评价者信用分
      const delta = rating === 1 ? CREDIT_DELTA.good_review : CREDIT_DELTA.bad_review
      await db.collection('users').where({ openid: revieweeOpenid }).update({
        data: { creditScore: _.inc(delta) }
      })

      // 写信用日志
      await db.collection('credit_logs').add({
        data: {
          openid: revieweeOpenid,
          delta,
          reason: rating === 1 ? '获得好评' : '获得差评',
          orderId,
          createTime: db.serverDate()
        }
      })

      return { success: true, message: '评价提交成功' }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 获取用户评价列表（从 orders 集合） ==========
  if (action === 'list') {
    try {
      const { targetOpenid, page = 1, pageSize = 20 } = event
      const target = targetOpenid || openid

      // 查询 target 作为发起者/接收者且对方已评价的已完成订单
      const [res1, res2] = await Promise.all([
        db.collection('orders')
          .where({ initiatorOpenid: target, 'receiverReview.rating': _.exists(true), status: 'completed' })
          .limit(100)
          .get(),
        db.collection('orders')
          .where({ receiverOpenid: target, 'initiatorReview.rating': _.exists(true), status: 'completed' })
          .limit(100)
          .get()
      ])

      const allItems = []
      // target 是发起者，对方（接收者）评价了他
      res1.data.forEach(o => {
        const r = o.receiverReview
        if (!r) return
        allItems.push({
          _id: o._id + '_rv',
          orderId: o._id,
          rating: r.rating,
          comment: r.content || r.comment || '',
          createTime: r.createTime || o.updateTime,
          reviewerOpenid: r.reviewerOpenid || o.receiverOpenid
        })
      })
      // target 是接收者，对方（发起者）评价了他
      res2.data.forEach(o => {
        const r = o.initiatorReview
        if (!r) return
        allItems.push({
          _id: o._id + '_ir',
          orderId: o._id,
          rating: r.rating,
          comment: r.content || r.comment || '',
          createTime: r.createTime || o.updateTime,
          reviewerOpenid: r.reviewerOpenid || o.initiatorOpenid
        })
      })

      allItems.sort((a, b) => {
        const ta = a.createTime ? new Date(a.createTime).getTime() : 0
        const tb = b.createTime ? new Date(b.createTime).getTime() : 0
        return tb - ta
      })
      const paged = allItems.slice((page - 1) * pageSize, page * pageSize)

      // 补充评价者信息
      const reviewerIds = [...new Set(paged.map(r => r.reviewerOpenid).filter(Boolean))]
      let userMap = {}
      if (reviewerIds.length > 0) {
        const usersRes = await db.collection('users')
          .where({ openid: _.in(reviewerIds) })
          .field({ openid: true, nickName: true, avatarUrl: true })
          .get()
        // 转换所有 reviewer 头像 cloud:// → https
        for (const u of usersRes.data) {
          u.avatarUrl = await resolveCloudUrl(u.avatarUrl)
          userMap[u.openid] = u
        }
      }

      const reviews = paged.map(r => ({
        ...r,
        reviewer: userMap[r.reviewerOpenid] || {}
      }))

      return { success: true, list: reviews, total: allItems.length }
    } catch (e) {
      return { success: false, list: [] }
    }
  }

  // ========== 获取信用日志 ==========
  if (action === 'creditLogs') {
    try {
      const res = await db.collection('credit_logs')
        .where({ openid })
        .orderBy('createTime', 'desc')
        .limit(50)
        .get()
      return { success: true, list: res.data }
    } catch (e) {
      return { success: false, list: [] }
    }
  }

  // ========== 获取我发出的评价列表（从 orders 集合） ==========
  if (action === 'myReviews') {
    try {
      const { page = 1, pageSize = 20 } = event

      // 并行查询：我作为发起者且已评价 + 我作为接收者且已评价
      const [res1, res2] = await Promise.all([
        db.collection('orders')
          .where({ initiatorOpenid: openid, 'initiatorReview.rating': _.exists(true), status: 'completed' })
          .limit(100)
          .get(),
        db.collection('orders')
          .where({ receiverOpenid: openid, 'receiverReview.rating': _.exists(true), status: 'completed' })
          .limit(100)
          .get()
      ])

      // 合并并提取评价数据
      const allItems = []
      res1.data.forEach(o => {
        const r = o.initiatorReview
        allItems.push({
          _id: o._id,
          orderId: o._id,
          rating: r.rating,
          content: r.content,
          tags: r.tags || [],
          createTime: r.createTime,
          revieweeOpenid: o.receiverOpenid,
          productName: o.initiatorProduct?.name || '',
          productCover: o.initiatorProduct?.images?.[0] || ''
        })
      })
      res2.data.forEach(o => {
        const r = o.receiverReview
        allItems.push({
          _id: o._id,
          orderId: o._id,
          rating: r.rating,
          content: r.content,
          tags: r.tags || [],
          createTime: r.createTime,
          revieweeOpenid: o.initiatorOpenid,
          productName: o.receiverProduct?.name || '',
          productCover: o.receiverProduct?.images?.[0] || ''
        })
      })

      // 按时间降序排列并分页
      allItems.sort((a, b) => {
        const ta = a.createTime ? new Date(a.createTime).getTime() : 0
        const tb = b.createTime ? new Date(b.createTime).getTime() : 0
        return tb - ta
      })
      const paged = allItems.slice((page - 1) * pageSize, page * pageSize)

      // 补充被评价用户信息
      const revieweeIds = [...new Set(paged.map(r => r.revieweeOpenid).filter(Boolean))]
      let userMap = {}
      if (revieweeIds.length > 0) {
        const usersRes = await db.collection('users')
          .where({ openid: _.in(revieweeIds) })
          .field({ openid: true, nickName: true, avatarUrl: true })
          .get()
        for (const u of usersRes.data) {
          u.avatarUrl = await resolveCloudUrl(u.avatarUrl)
          userMap[u.openid] = u
        }
      }

      const reviews = paged.map(r => ({
        ...r,
        reviewee: userMap[r.revieweeOpenid] || {},
        ratingText: r.rating === 5 ? '超级满意' : r.rating === 4 ? '满意' : r.rating === 3 ? '一般' : r.rating === 2 ? '不满意' : '非常差',
        ratingClass: r.rating >= 4 ? 'good' : r.rating >= 3 ? 'normal' : 'bad'
      }))

      return { success: true, list: reviews, total: allItems.length }
    } catch (e) {
      console.error('获取我的评价失败', e)
      return { success: false, list: [] }
    }
  }

  // ========== 获取我收到的评价列表（从 orders 集合） ==========
  if (action === 'receivedReviews') {
    try {
      const { page = 1, pageSize = 20 } = event

      // 并行查询：我作为发起者且对方（接收者）已评价我 + 我作为接收者且对方（发起者）已评价我
      const [res1, res2] = await Promise.all([
        db.collection('orders')
          .where({ initiatorOpenid: openid, 'receiverReview.rating': _.exists(true), status: 'completed' })
          .limit(100)
          .get(),
        db.collection('orders')
          .where({ receiverOpenid: openid, 'initiatorReview.rating': _.exists(true), status: 'completed' })
          .limit(100)
          .get()
      ])

      // 合并并提取评价数据
      const allItems = []
      res1.data.forEach(o => {
        const r = o.receiverReview
        allItems.push({
          _id: o._id,
          orderId: o._id,
          rating: r.rating,
          content: r.content,
          tags: r.tags || [],
          createTime: r.createTime,
          reviewerOpenid: r.reviewerOpenid || o.receiverOpenid,
          productName: o.receiverProduct?.name || o.initiatorProduct?.name || '',
          productCover: o.receiverProduct?.images?.[0] || o.initiatorProduct?.images?.[0] || ''
        })
      })
      res2.data.forEach(o => {
        const r = o.initiatorReview
        allItems.push({
          _id: o._id,
          orderId: o._id,
          rating: r.rating,
          content: r.content,
          tags: r.tags || [],
          createTime: r.createTime,
          reviewerOpenid: r.reviewerOpenid || o.initiatorOpenid,
          productName: o.initiatorProduct?.name || o.receiverProduct?.name || '',
          productCover: o.initiatorProduct?.images?.[0] || o.receiverProduct?.images?.[0] || ''
        })
      })

      // 按时间降序排列并分页
      allItems.sort((a, b) => {
        const ta = a.createTime ? new Date(a.createTime).getTime() : 0
        const tb = b.createTime ? new Date(b.createTime).getTime() : 0
        return tb - ta
      })
      const paged = allItems.slice((page - 1) * pageSize, page * pageSize)

      // 补充评价者用户信息
      const reviewerIds = [...new Set(paged.map(r => r.reviewerOpenid).filter(Boolean))]
      let userMap = {}
      if (reviewerIds.length > 0) {
        const usersRes = await db.collection('users')
          .where({ openid: _.in(reviewerIds) })
          .field({ openid: true, nickName: true, avatarUrl: true })
          .get()
        for (const u of usersRes.data) {
          u.avatarUrl = await resolveCloudUrl(u.avatarUrl)
          userMap[u.openid] = u
        }
      }

      const reviews = paged.map(r => ({
        ...r,
        reviewer: userMap[r.reviewerOpenid] || {},
        ratingText: r.rating === 5 ? '超级满意' : r.rating === 4 ? '满意' : r.rating === 3 ? '一般' : r.rating === 2 ? '不满意' : '非常差',
        ratingClass: r.rating >= 4 ? 'good' : r.rating >= 3 ? 'normal' : 'bad'
      }))

      return { success: true, list: reviews, total: allItems.length }
    } catch (e) {
      console.error('获取收到的评价失败', e)
      return { success: false, list: [] }
    }
  }

  // ========== 获取积分日志 ==========
  if (action === 'pointsLogs') {
    try {
      const res = await db.collection('points_log')
        .where({ openid })
        .orderBy('createTime', 'desc')
        .limit(50)
        .get()
      return { success: true, list: res.data }
    } catch (e) {
      return { success: true, list: [] }
    }
  }

  // ========== 检查是否已评价 ==========
  if (action === 'checkReviewed') {
    try {
      const { orderId } = event
      // 使用 wxContext.OPENID 而不是 event.openid，确保获取当前用户
      const res = await db.collection('reviews')
        .where({ orderId, reviewerOpenid: openid })
        .count()
      return { reviewed: res.total > 0 }
    } catch (e) {
      console.error('检查评价状态失败', e)
      return { reviewed: false }
    }
  }

  return { success: false, message: '未知操作' }
}
