// cloudfunctions/orderMgr/index.js
// 订单/互换流程管理云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 信用分变化规则
const CREDIT_DELTA = {
  complete: +5,
  good_review: +2,
  bad_review: -10,
  cancel_after_confirm: -5,
  dispute_lose: -15
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

// 处理图片URL，将cloud://转换为临时链接
async function processProductImages(products) {
  if (!products || products.length === 0) return products
  
  // 收集所有需要转换的fileID（去重）
  const fileIDSet = new Set()
  products.forEach(p => {
    if (p && p.images && Array.isArray(p.images)) {
      p.images.forEach(img => {
        if (img && img.startsWith('cloud://')) {
          fileIDSet.add(img)
        }
      })
    }
  })

  const fileIDs = [...fileIDSet]
  if (fileIDs.length === 0) return products

  // 分批获取临时链接，每批最多50个
  const BATCH_SIZE = 50
  let tempUrlMap = {}
  try {
    for (let i = 0; i < fileIDs.length; i += BATCH_SIZE) {
      const batch = fileIDs.slice(i, i + BATCH_SIZE)
      const tempRes = await cloud.getTempFileURL({ fileList: batch })
      tempRes.fileList.forEach(f => {
        if (f.tempFileURL) {
          tempUrlMap[f.fileID] = f.tempFileURL
        }
      })
    }
  } catch (e) {
    console.error('获取临时链接失败:', e)
  }

  // 替换图片URL
  return products.map(p => {
    if (p && p.images && Array.isArray(p.images)) {
      p.images = p.images.map(img => {
        if (img && img.startsWith('cloud://')) {
          return tempUrlMap[img] || img
        }
        return img
      })
    }
    return p
  })
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event

  // ========== 创建互换请求 ==========
  if (action === 'create') {
    try {
      const { myProductId, targetProductId } = event

      // 检查自己的特产
      const myProduct = await db.collection('products').doc(myProductId).get()
      if (myProduct.data.openid !== openid) return { success: false, message: '这不是你的特产' }
      if (myProduct.data.status !== 'active') return { success: false, message: '特产不可用' }

      // 检查目标特产
      const targetProduct = await db.collection('products').doc(targetProductId).get()
      if (targetProduct.data.status !== 'active') return { success: false, message: '对方特产已下架' }
      if (targetProduct.data.openid === openid) return { success: false, message: '不能和自己互换' }

      // 神秘特产检查：只能与神秘特产互换，普通特产不能与神秘特产互换
      const myIsMystery = myProduct.data.isMystery || false
      const targetIsMystery = targetProduct.data.isMystery || false
      if (myIsMystery !== targetIsMystery) {
        return { success: false, message: '神秘特产只能与神秘特产互换' }
      }

      // 检查是否已有进行中的订单
      const existing = await db.collection('orders').where({
        initiatorOpenid: openid,
        initiatorProductId: myProductId,
        receiverProductId: targetProductId,
        status: _.nin(['completed', 'cancelled'])
      }).count()
      if (existing.total > 0) return { success: false, message: '已经发起过此互换请求' }

      // 判断是否为神秘互换
      const isMysterySwap = myIsMystery && targetIsMystery

      // 创建订单
      const orderId = await db.collection('orders').add({
        data: {
          initiatorOpenid: openid,
          receiverOpenid: targetProduct.data.openid,
          initiatorProductId: myProductId,
          receiverProductId: targetProductId,
          status: 'pending',
          isMysterySwap: isMysterySwap,  // 标记是否为神秘互换
          // 快递信息（后续填写）
          initiatorTracking: { company: '', number: '' },
          receiverTracking: { company: '', number: '' },
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })

      // 锁定特产状态
      await Promise.all([
        db.collection('products').doc(myProductId).update({ data: { status: 'in_swap' } }),
        db.collection('products').doc(targetProductId).update({ data: { status: 'in_swap', swapRequestCount: _.inc(1) } })
      ])

      // 发送订阅消息通知对方（TODO：配置模板ID后启用）
      // await sendNotification(targetProduct.data.openid, '有人想和你互换特产！')

      return { success: true, orderId: orderId._id }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 获取订单列表 ==========
  if (action === 'list') {
    try {
      const { tabFilter = 'all', page = 1, pageSize = 10 } = event

      let statusFilter = {}
      if (tabFilter === 'pending') statusFilter = { status: 'pending' }
      else if (tabFilter === 'ongoing') statusFilter = { status: _.in(['confirmed', 'shipped_a', 'shipped_b', 'shipped', 'received_a', 'received_b']) }
      else if (tabFilter === 'completed') statusFilter = { status: 'completed' }

      const query = {
        $or: [{ initiatorOpenid: openid }, { receiverOpenid: openid }],
        ...statusFilter
      }

      const res = await db.collection('orders')
        .where(query)
        .orderBy('updateTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()

      // 获取所有涉及的productId
      const productIds = []
      res.data.forEach(o => {
        productIds.push(o.initiatorProductId)
        productIds.push(o.receiverProductId)
      })
      const productMap = {}
      if (productIds.length > 0) {
        const productsRes = await db.collection('products')
          .where({ _id: _.in(productIds) })
          .field({ _id: true, name: true, images: true, province: true, isMystery: true })
          .get()
        productsRes.data.forEach(p => { productMap[p._id] = p })
      }

      // 获取所有涉及的openid（包含自己）
      const allOpenids = []
      res.data.forEach(o => {
        allOpenids.push(o.initiatorOpenid)
        allOpenids.push(o.receiverOpenid)
      })
      const uniqueOpenids = [...new Set(allOpenids)]
      
      // 获取所有用户信息（如果没订单则跳过）
      let userMap = {}
      if (uniqueOpenids.length > 0) {
        const usersRes = await db.collection('users')
          .where({ openid: _.in(uniqueOpenids) })
          .field({ openid: true, nickName: true, avatarUrl: true, creditScore: true, rating: true, ratingCount: true })
          .get()
        for (const u of usersRes.data) {
          u.avatarUrl = await resolveCloudUrl(u.avatarUrl)
          userMap[u.openid] = u
        }
      }

      let orders = res.data.map(o => {
        const isInitiator = o.initiatorOpenid === openid
        const myProductId = isInitiator ? o.initiatorProductId : o.receiverProductId
        const theirProductId = isInitiator ? o.receiverProductId : o.initiatorProductId
        return {
          ...o,
          myProduct: productMap[myProductId] || {},
          theirProduct: productMap[theirProductId] || {},
          // 双方用户信息
          initiator: userMap[o.initiatorOpenid] || {},
          receiver: userMap[o.receiverOpenid] || {},
          // 对方信息（兼容旧代码）
          counterpart: userMap[isInitiator ? o.receiverOpenid : o.initiatorOpenid] || {},
          isInitiator
        }
      })

      // 处理产品图片URL
      const productsToProcess = []
      orders.forEach(o => {
        if (o.myProduct) productsToProcess.push(o.myProduct)
        if (o.theirProduct) productsToProcess.push(o.theirProduct)
      })
      await processProductImages(productsToProcess)

      // 统计各Tab数量（包括cancelled状态）
      const allOrders = await db.collection('orders')
        .where({ $or: [{ initiatorOpenid: openid }, { receiverOpenid: openid }] })
        .field({ status: true })
        .get()
      const tabCounts = { all: allOrders.data.length, pending: 0, ongoing: 0, completed: 0 }
      allOrders.data.forEach(o => {
        if (o.status === 'pending') tabCounts.pending++
        else if (['confirmed','shipped_a','shipped_b','shipped','received_a','received_b'].includes(o.status)) tabCounts.ongoing++
        else if (o.status === 'completed') tabCounts.completed++
        // cancelled 订单不计入任何tab，只在"全部"中显示
      })

      // 确保返回数据格式正确
      return { 
        success: true, 
        list: orders || [], 
        tabCounts: tabCounts || { all: 0, pending: 0, ongoing: 0, completed: 0 }
      }
    } catch (e) {
      console.error('list order error:', e)
      return { success: false, list: [], tabCounts: { all: 0, pending: 0, ongoing: 0, completed: 0 }, message: e.message }
    }
  }

  // ========== 获取神秘互换列表 ==========
  if (action === 'mysteryList') {
    try {
      // 获取当前用户参与的神秘互换订单
      const res = await db.collection('orders')
        .where({ 
          $or: [{ initiatorOpenid: openid }, { receiverOpenid: openid }],
          isMysterySwap: true
        })
        .orderBy('createTime', 'desc')
        .limit(20)
        .get()

      // 获取涉及的特产和用户信息
      const productIds = []
      const openids = []
      res.data.forEach(o => {
        productIds.push(o.initiatorProductId, o.receiverProductId)
        openids.push(o.initiatorOpenid, o.receiverOpenid)
      })

      const productMap = {}
      if (productIds.length > 0) {
        const productsRes = await db.collection('products')
          .where({ _id: _.in([...new Set(productIds)]) })
          .field({ _id: true, name: true, images: true, province: true, isMystery: true })
          .get()
        productsRes.data.forEach(p => { productMap[p._id] = p })
      }

      const userMap = {}
      const uniqueOpenids = [...new Set(openids)]
      if (uniqueOpenids.length > 0) {
        const usersRes = await db.collection('users')
          .where({ openid: _.in(uniqueOpenids) })
          .field({ openid: true, nickName: true, avatarUrl: true })
          .get()
        for (const u of usersRes.data) {
          u.avatarUrl = await resolveCloudUrl(u.avatarUrl)
          userMap[u.openid] = u
        }
      }

      // 处理订单数据
      let list = res.data.map(o => {
        const isInitiator = o.initiatorOpenid === openid
        const myProductId = isInitiator ? o.initiatorProductId : o.receiverProductId
        const theirProductId = isInitiator ? o.receiverProductId : o.initiatorProductId
        const myProduct = productMap[myProductId] || {}
        const theirProduct = productMap[theirProductId] || {}
        
        return {
          ...o,
          myProduct,
          theirProduct,
          myProductImage: myProduct.images?.[0] || '',
          counterpart: userMap[isInitiator ? o.receiverOpenid : o.initiatorOpenid] || {},
          partnerName: (userMap[isInitiator ? o.receiverOpenid : o.initiatorOpenid] || {}).nickName || '',
          createTime: o.createTime,
          updateTime: o.updateTime
        }
      })

      // 处理图片URL
      const productsToProcess = list.filter(o => o.myProduct).map(o => o.myProduct)
      await processProductImages(productsToProcess)

      return { success: true, list }
    } catch (e) {
      console.error('mysteryList error:', e)
      return { success: false, list: [], message: e.message }
    }
  }

  // ========== 接受互换（旧的简单逻辑，现在已弃用） ==========
  if (action === 'accept') {
    try {
      const order = await db.collection('orders').doc(event.orderId).get()
      if (order.data.receiverOpenid !== openid) return { success: false, message: '无权操作' }
      if (order.data.status !== 'pending') return { success: false, message: '订单状态不对' }
      
      await db.collection('orders').doc(event.orderId).update({
        data: { 
          status: 'confirmed', 
          confirmTime: db.serverDate(),
          updateTime: db.serverDate() 
        }
      })
      return { success: true, message: '已接受互换请求' }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 拒绝互换 ==========
  if (action === 'reject') {
    try {
      const order = await db.collection('orders').doc(event.orderId).get()
      const o = order.data
      
      // 只有接收方可以拒绝
      if (o.receiverOpenid !== openid) return { success: false, message: '无权操作' }
      if (o.status !== 'pending') return { success: false, message: '订单状态不对' }
      
      // 更新订单状态为已拒绝（使用cancelled状态，但记录为拒绝）
      await db.collection('orders').doc(event.orderId).update({
        data: { 
          status: 'cancelled', 
          cancelBy: openid,
          cancelReason: 'rejected',
          updateTime: db.serverDate() 
        }
      })
      
      // 释放特产状态
      await Promise.all([
        db.collection('products').doc(o.initiatorProductId).update({ 
          data: { status: 'active', updateTime: db.serverDate() } 
        }),
        db.collection('products').doc(o.receiverProductId).update({ 
          data: { status: 'active', updateTime: db.serverDate() } 
        })
      ])
      
      return { success: true, message: '已拒绝互换请求' }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 拒绝/撤回互换 ==========
  if (action === 'cancel') {
    try {
      const order = await db.collection('orders').doc(event.orderId).get()
      const o = order.data
      if (o.initiatorOpenid !== openid && o.receiverOpenid !== openid) return { success: false, message: '无权操作' }

      // 扣信用分（确认后取消）
      let creditDelta = 0
      if (['confirmed', 'shipped_a', 'shipped_b', 'shipped'].includes(o.status)) {
        creditDelta = CREDIT_DELTA.cancel_after_confirm
      }

      await db.collection('orders').doc(event.orderId).update({
        data: { status: 'cancelled', cancelBy: openid, updateTime: db.serverDate() }
      })

      // 释放特产
      await Promise.all([
        db.collection('products').doc(o.initiatorProductId).update({ data: { status: 'active' } }),
        db.collection('products').doc(o.receiverProductId).update({ data: { status: 'active' } })
      ])

      // 扣分
      if (creditDelta !== 0) {
        await db.collection('users').where({ openid }).update({
          data: { creditScore: _.inc(creditDelta) }
        })
        await db.collection('credit_logs').add({
          data: { openid, delta: creditDelta, reason: '取消已确认的互换', orderId: event.orderId, createTime: db.serverDate() }
        })
      }

      return { success: true, message: '订单已取消' }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 填写快递信息/发货 ==========
  if (action === 'ship') {
    try {
      const { orderId, company, trackingNo, trackingCompany, trackingNumber } = event
      const order = await db.collection('orders').doc(orderId).get()
      const o = order.data
      const isInitiator = o.initiatorOpenid === openid

      if (!isInitiator && o.receiverOpenid !== openid) return { success: false, message: '无权操作' }
      if (!['confirmed', 'shipped_a', 'shipped_b'].includes(o.status)) return { success: false, message: '状态不对' }

      const trackingField = isInitiator ? 'initiatorTracking' : 'receiverTracking'
      let newStatus = o.status

      if (isInitiator) {
        newStatus = o.status === 'shipped_b' ? 'shipped' : 'shipped_a'
      } else {
        newStatus = o.status === 'shipped_a' ? 'shipped' : 'shipped_b'
      }

      // 兼容两种参数名
      const finalCompany = company || trackingCompany || ''
      const finalNumber = trackingNo || trackingNumber || ''

      await db.collection('orders').doc(orderId).update({
        data: {
          [trackingField]: { company: finalCompany, number: finalNumber, shipTime: db.serverDate() },
          status: newStatus,
          updateTime: db.serverDate()
        }
      })

      return { success: true, message: '发货信息已记录', newStatus }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 确认收货 ==========
  if (action === 'receive') {
    try {
      const order = await db.collection('orders').doc(event.orderId).get()
      const o = order.data
      const isInitiator = o.initiatorOpenid === openid
      if (!isInitiator && o.receiverOpenid !== openid) return { success: false, message: '无权操作' }

      let newStatus
      if (isInitiator) {
        newStatus = o.status === 'received_b' ? 'completed' : 'received_a'
      } else {
        newStatus = o.status === 'received_a' ? 'completed' : 'received_b'
      }

      await db.collection('orders').doc(event.orderId).update({
        data: { status: newStatus, updateTime: db.serverDate() }
      })

      // 完成时加信用分 + 更新统计
      if (newStatus === 'completed') {
        await Promise.all([
          db.collection('products').doc(o.initiatorProductId).update({ data: { status: 'swapped' } }),
          db.collection('products').doc(o.receiverProductId).update({ data: { status: 'swapped' } }),
          db.collection('users').where({ openid: o.initiatorOpenid }).update({
            data: { creditScore: _.inc(CREDIT_DELTA.complete), swapCount: _.inc(1) }
          }),
          db.collection('users').where({ openid: o.receiverOpenid }).update({
            data: { creditScore: _.inc(CREDIT_DELTA.complete), swapCount: _.inc(1) }
          })
        ])

        // 更新省份集章（发起方拿到了对方省份的特产）
        const initiatorProduct = await db.collection('products').doc(o.initiatorProductId).get()
        const receiverProduct = await db.collection('products').doc(o.receiverProductId).get()

        await db.collection('users').where({ openid: o.initiatorOpenid }).update({
          data: { provincesBadges: _.addToSet(receiverProduct.data.province) }
        })
        await db.collection('users').where({ openid: o.receiverOpenid }).update({
          data: { provincesBadges: _.addToSet(initiatorProduct.data.province) }
        })

        // ====== 邀请好友首次互换奖励（双方各得20积分）======
        const FIRST_SWAP_REWARD = 20
        try {
          // 获取双方最新用户信息（swapCount 已经 +1 了）
          const [initiatorUserRes, receiverUserRes] = await Promise.all([
            db.collection('users').where({ openid: o.initiatorOpenid }).limit(1).get(),
            db.collection('users').where({ openid: o.receiverOpenid }).limit(1).get()
          ])
          const initiatorUser = initiatorUserRes.data && initiatorUserRes.data[0]
          const receiverUser = receiverUserRes.data && receiverUserRes.data[0]

          // 检查发起方是否是被邀请用户且首次完成互换
          if (initiatorUser && initiatorUser.invitedBy && initiatorUser.swapCount === 1) {
            const inviterOpenid = initiatorUser.invitedBy
            // 给被邀请人（发起方）加20积分
            await db.collection('users').where({ openid: o.initiatorOpenid }).update({
              data: { points: _.inc(FIRST_SWAP_REWARD) }
            })
            await db.collection('points_log').add({
              data: {
                openid: o.initiatorOpenid,
                type: 'first_swap_bonus',
                amount: FIRST_SWAP_REWARD,
                desc: '首次互换奖励',
                orderId: event.orderId,
                createTime: db.serverDate()
              }
            })
            // 给邀请人加20积分
            await db.collection('users').where({ openid: inviterOpenid }).update({
              data: { points: _.inc(FIRST_SWAP_REWARD) }
            })
            await db.collection('points_log').add({
              data: {
                openid: inviterOpenid,
                type: 'invitee_first_swap',
                amount: FIRST_SWAP_REWARD,
                desc: '好友首次互换奖励',
                relatedUser: o.initiatorOpenid,
                orderId: event.orderId,
                createTime: db.serverDate()
              }
            })
          }

          // 检查接收方是否是被邀请用户且首次完成互换
          if (receiverUser && receiverUser.invitedBy && receiverUser.swapCount === 1) {
            const inviterOpenid = receiverUser.invitedBy
            // 给被邀请人（接收方）加20积分
            await db.collection('users').where({ openid: o.receiverOpenid }).update({
              data: { points: _.inc(FIRST_SWAP_REWARD) }
            })
            await db.collection('points_log').add({
              data: {
                openid: o.receiverOpenid,
                type: 'first_swap_bonus',
                amount: FIRST_SWAP_REWARD,
                desc: '首次互换奖励',
                orderId: event.orderId,
                createTime: db.serverDate()
              }
            })
            // 给邀请人加20积分
            await db.collection('users').where({ openid: inviterOpenid }).update({
              data: { points: _.inc(FIRST_SWAP_REWARD) }
            })
            await db.collection('points_log').add({
              data: {
                openid: inviterOpenid,
                type: 'invitee_first_swap',
                amount: FIRST_SWAP_REWARD,
                desc: '好友首次互换奖励',
                relatedUser: o.receiverOpenid,
                orderId: event.orderId,
                createTime: db.serverDate()
              }
            })
          }
        } catch (rewardErr) {
          console.error('首次互换奖励发放失败:', rewardErr)
          // 奖励失败不影响主流程
        }
      }

      return { success: true, message: newStatus === 'completed' ? '互换完成！' : '已确认收货', newStatus }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 评价 ==========
  if (action === 'review') {
    try {
      const { orderId, rating, content, tags } = event
      const order = await db.collection('orders').doc(orderId).get()
      const o = order.data

      // 检查权限
      if (o.initiatorOpenid !== openid && o.receiverOpenid !== openid) {
        return { success: false, message: '无权操作' }
      }
      if (o.status !== 'completed') {
        return { success: false, message: '订单未完成，无法评价' }
      }

      // 确定评价对象
      const isInitiator = o.initiatorOpenid === openid
      const targetOpenid = isInitiator ? o.receiverOpenid : o.initiatorOpenid
      const reviewField = isInitiator ? 'initiatorReview' : 'receiverReview'

      // 检查是否已评价
      if (o[reviewField]) {
        return { success: false, message: '您已评价过此订单' }
      }

      // 保存评价
      const reviewData = {
        rating,
        content,
        tags: tags || [],
        reviewerOpenid: openid,
        targetOpenid,
        createTime: db.serverDate()
      }

      await db.collection('orders').doc(orderId).update({
        data: { [reviewField]: reviewData }
      })

      // 更新被评价用户的评分统计
      const targetUserRes = await db.collection('users').where({ openid: targetOpenid }).limit(1).get()
      if (targetUserRes.data.length > 0) {
        const targetUser = targetUserRes.data[0]
        const currentRating = targetUser.rating || 5
        const currentCount = targetUser.ratingCount || 0
        const newCount = currentCount + 1
        const newRating = ((currentRating * currentCount) + rating) / newCount

        await db.collection('users').where({ openid: targetOpenid }).update({
          data: {
            rating: Math.round(newRating * 10) / 10,
            ratingCount: newCount
          }
        })
      }

      return { success: true, message: '评价成功' }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 未读消息数 ==========
  if (action === 'unreadCount') {
    try {
      const res = await db.collection('orders')
        .where({
          receiverOpenid: openid,
          status: 'pending'
        })
        .count()
      return { count: res.total }
    } catch (e) {
      return { count: 0 }
    }
  }

  // ========== 获取订单详情 ==========
  if (action === 'detail') {
    try {
      const { orderId } = event
      const orderRes = await db.collection('orders').doc(orderId).get()
      const order = orderRes.data

      if (!order) {
        return { success: false, message: '订单不存在' }
      }

      // 检查权限
      if (order.initiatorOpenid !== openid && order.receiverOpenid !== openid) {
        return { success: false, message: '无权查看此订单' }
      }

      const isInitiator = order.initiatorOpenid === openid

      // 获取双方产品信息
      const [initiatorProductRes, receiverProductRes] = await Promise.all([
        db.collection('products').doc(order.initiatorProductId).get().catch(() => null),
        db.collection('products').doc(order.receiverProductId).get().catch(() => null)
      ])

      // 获取双方用户信息
      const [initiatorUserRes, receiverUserRes] = await Promise.all([
        db.collection('users').where({ openid: order.initiatorOpenid }).limit(1).get(),
        db.collection('users').where({ openid: order.receiverOpenid }).limit(1).get()
      ])

      // 获取评价信息
      const reviewsRes = await db.collection('reviews')
        .where({ orderId })
        .get()

      let initiatorProduct = initiatorProductRes ? initiatorProductRes.data : null
      let receiverProduct = receiverProductRes ? receiverProductRes.data : null

      // 处理产品图片URL
      await processProductImages([initiatorProduct, receiverProduct])

      return {
        success: true,
        order: {
          ...order,
          initiatorProduct,
          receiverProduct,
          initiator: initiatorUserRes.data[0] || {},
          receiver: receiverUserRes.data[0] || {},
          reviews: reviewsRes.data || []
        },
        isInitiator
      }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 获取用户的默认收货地址 ==========
  if (action === 'getDefaultAddress') {
    try {
      // 获取默认地址
      const defaultRes = await db.collection('addresses').where({
        openid,
        isDefault: true
      }).get()
      
      if (defaultRes.data && defaultRes.data.length > 0) {
        const addr = defaultRes.data[0]
        return {
          success: true,
          address: {
            contactName: addr.contactName,
            contactPhone: addr.contactPhone,
            province: addr.province,
            city: addr.city,
            district: addr.district,
            detailAddress: addr.detailAddress,
            fullAddress: (addr.province || '') + (addr.city || '') + (addr.district || '') + (addr.detailAddress || '')
          }
        }
      }
      
      // 没有默认地址，返回第一个地址
      const listRes = await db.collection('addresses').where({ openid }).get()
      if (listRes.data && listRes.data.length > 0) {
        const addr = listRes.data[0]
        return {
          success: true,
          address: {
            contactName: addr.contactName,
            contactPhone: addr.contactPhone,
            province: addr.province,
            city: addr.city,
            district: addr.district,
            detailAddress: addr.detailAddress,
            fullAddress: (addr.province || '') + (addr.city || '') + (addr.district || '') + (addr.detailAddress || '')
          }
        }
      }
      
      return { success: false, message: '请先添加收货地址', needAddress: true }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 确认互换（双方都可以确认） ==========
  if (action === 'confirm') {
    try {
      const { orderId, addressId } = event
      const orderRes = await db.collection('orders').doc(orderId).get()
      const order = orderRes.data

      if (!order) {
        return { success: false, message: '订单不存在' }
      }

      // 权限检查：订单双方都可以确认
      const isInitiator = order.initiatorOpenid === openid
      const isReceiver = order.receiverOpenid === openid
      if (!isInitiator && !isReceiver) {
        return { success: false, message: '无权限' }
      }

      // 状态检查
      if (order.status !== 'pending') {
        return { success: false, message: '订单状态已变化' }
      }

      // 获取我的收货地址（不管是谁确认，都用我的默认地址）
      let myAddress
      if (addressId) {
        // 使用指定的地址
        const addrRes = await db.collection('addresses').doc(addressId).get()
        if (addrRes.data && addrRes.data.openid === openid) {
          const addr = addrRes.data
          myAddress = {
            contactName: addr.contactName,
            contactPhone: addr.contactPhone,
            province: addr.province,
            city: addr.city,
            district: addr.district,
            detailAddress: addr.detailAddress,
            fullAddress: (addr.province || '') + (addr.city || '') + (addr.district || '') + (addr.detailAddress || ''),
            addressId: addr._id
          }
        }
      }
      
      // 如果没有指定地址或指定地址无效，获取默认地址
      if (!myAddress) {
        const defaultRes = await db.collection('addresses').where({
          openid,
          isDefault: true
        }).get()
        
        if (defaultRes.data && defaultRes.data.length > 0) {
          const addr = defaultRes.data[0]
          myAddress = {
            contactName: addr.contactName,
            contactPhone: addr.contactPhone,
            province: addr.province,
            city: addr.city,
            district: addr.district,
            detailAddress: addr.detailAddress,
            fullAddress: (addr.province || '') + (addr.city || '') + (addr.district || '') + (addr.detailAddress || ''),
            addressId: addr._id
          }
        } else {
          // 获取第一个地址
          const listRes = await db.collection('addresses').where({ openid }).get()
          if (listRes.data && listRes.data.length > 0) {
            const addr = listRes.data[0]
            myAddress = {
              contactName: addr.contactName,
              contactPhone: addr.contactPhone,
              province: addr.province,
              city: addr.city,
              district: addr.district,
              detailAddress: addr.detailAddress,
              fullAddress: (addr.province || '') + (addr.city || '') + (addr.district || '') + (addr.detailAddress || ''),
              addressId: addr._id
            }
          }
        }
      }
      
      if (!myAddress || !myAddress.contactName) {
        return { success: false, message: '请先添加收货地址', needAddress: true }
      }

      // 获取发起方的默认收货地址
      let initiatorAddress = null
      const initiatorDefaultRes = await db.collection('addresses').where({
        openid: order.initiatorOpenid,
        isDefault: true
      }).get()
      
      if (initiatorDefaultRes.data && initiatorDefaultRes.data.length > 0) {
        const addr = initiatorDefaultRes.data[0]
        initiatorAddress = {
          contactName: addr.contactName,
          contactPhone: addr.contactPhone,
          province: addr.province,
          city: addr.city,
          district: addr.district,
          detailAddress: addr.detailAddress,
          fullAddress: (addr.province || '') + (addr.city || '') + (addr.district || '') + (addr.detailAddress || ''),
          addressId: addr._id
        }
      } else {
        // 获取第一个地址
        const initiatorListRes = await db.collection('addresses').where({ openid: order.initiatorOpenid }).get()
        if (initiatorListRes.data && initiatorListRes.data.length > 0) {
          const addr = initiatorListRes.data[0]
          initiatorAddress = {
            contactName: addr.contactName,
            contactPhone: addr.contactPhone,
            province: addr.province,
            city: addr.city,
            district: addr.district,
            detailAddress: addr.detailAddress,
            fullAddress: (addr.province || '') + (addr.city || '') + (addr.district || '') + (addr.detailAddress || ''),
            addressId: addr._id
          }
        }
      }

      // 更新订单状态，保存双方收货地址
      await db.collection('orders').doc(orderId).update({
        data: {
          status: 'confirmed',
          confirmTime: db.serverDate(),
          updateTime: db.serverDate(),
          // 发起方的收货信息（对方要发货给你的地址）
          initiatorShipping: initiatorAddress || { contactName: '', contactPhone: '', fullAddress: '' },
          // 接收方（我）的收货信息（对方要发货给你的地址）
          receiverShipping: myAddress
        }
      })

      return { success: true, message: '已确认互换' }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }
  
  // ========== 更新订单中的收货地址 ==========
  if (action === 'updateShipping') {
    try {
      const { orderId, addressId } = event
      const orderRes = await db.collection('orders').doc(orderId).get()
      const order = orderRes.data

      if (!order) {
        return { success: false, message: '订单不存在' }
      }

      // 权限检查：只有订单双方可以修改
      if (order.initiatorOpenid !== openid && order.receiverOpenid !== openid) {
        return { success: false, message: '无权限' }
      }

      // 状态检查：只有confirmed状态可以修改收货地址
      if (order.status !== 'confirmed' && order.status !== 'shipped_a' && order.status !== 'shipped_b' && order.status !== 'shipped') {
        return { success: false, message: '当前状态不能修改收货地址' }
      }

      // 获取新地址
      const addrRes = await db.collection('addresses').doc(addressId).get()
      if (!addrRes.data || addrRes.data.openid !== openid) {
        return { success: false, message: '地址无效' }
      }
      
      const addr = addrRes.data
      const newAddress = {
        contactName: addr.contactName,
        contactPhone: addr.contactPhone,
        province: addr.province,
        city: addr.city,
        district: addr.district,
        detailAddress: addr.detailAddress,
        fullAddress: (addr.province || '') + (addr.city || '') + (addr.district || '') + (addr.detailAddress || ''),
        addressId: addr._id
      }

      // 判断是发起方还是接收方
      const isInitiator = order.initiatorOpenid === openid
      
      const updateData = {
        updateTime: db.serverDate()
      }
      
      if (isInitiator) {
        updateData.initiatorShipping = newAddress
      } else {
        updateData.receiverShipping = newAddress
      }

      await db.collection('orders').doc(orderId).update({
        data: updateData
      })

      return { success: true, message: '收货地址已更新' }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  return { success: false, message: '未知操作' }
}
