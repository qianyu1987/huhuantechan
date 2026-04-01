// cloudfunctions/reviewMgr/index_final.js
// 评价管理云函数（最终版 - 基于测试文件逻辑）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 将单个 cloud:// fileID 转为 https 临时链接
async function resolveCloudUrl(url) {
  if (!url || !url.startsWith('cloud://')) return url
  try {
    const res = await cloud.getTempFileURL({ fileList: [url] })
    return (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) ? res.fileList[0].tempFileURL : url
  } catch (e) {
    return url
  }
}

// 获取产品信息
async function getProductInfo(productId) {
  if (!productId) return null
  try {
    const productRes = await db.collection('products').doc(productId).get()
    const product = productRes.data
    if (product) {
      // 处理图片URL
      if (product.images && product.images.length > 0) {
        product.coverUrl = await resolveCloudUrl(product.images[0])
      }
    }
    return product
  } catch (e) {
    console.error('获取产品信息失败:', e)
    return null
  }
}

// 获取用户信息
async function getUserInfo(openid) {
  if (!openid) return null
  try {
    const userRes = await db.collection('users').where({ _openid: openid }).get()
    const user = userRes.data && userRes.data[0]
    if (user && user.avatarUrl) {
      user.avatarUrl = await resolveCloudUrl(user.avatarUrl)
    }
    return user
  } catch (e) {
    console.error('获取用户信息失败:', e)
    return null
  }
}

// 格式化时间
function formatTime(time) {
  if (!time) return ''
  const date = new Date(time)
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return minutes + '分钟前'
  if (hours < 24) return hours + '小时前'
  if (days < 30) return days + '天前'

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 获取评分文本和样式
function getRatingInfo(rating) {
  let ratingText, ratingClass
  
  if (rating === 5) {
    ratingText = '超级满意'
    ratingClass = 'excellent'
  } else if (rating === 4) {
    ratingText = '满意'
    ratingClass = 'good'
  } else if (rating === 3) {
    ratingText = '一般'
    ratingClass = 'normal'
  } else if (rating === 2) {
    ratingText = '不满意'
    ratingClass = 'bad'
  } else if (rating === 1) {
    ratingText = '非常差'
    ratingClass = 'terrible'
  } else {
    ratingText = '未评价'
    ratingClass = 'unknown'
  }
  
  return { ratingText, ratingClass }
}

exports.main = async (event, context) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    const { action } = event

    console.log('reviewMgr调用:', { action, openid: openid ? openid.substring(0, 8) + '...' : 'null' })

    // ========== 提交评价 ==========
    if (action === 'submit') {
      const { orderId, rating, comment, tags } = event
      
      // 验证参数
      if (!orderId || rating === undefined) {
        return { success: false, message: '参数不完整' }
      }
      
      if (rating < 1 || rating > 5) {
        return { success: false, message: '评分必须在1-5之间' }
      }

      // 获取订单信息
      let order
      try {
        const orderRes = await db.collection('orders').doc(orderId).get()
        order = orderRes.data
      } catch (e) {
        return { success: false, message: '订单不存在' }
      }
      
      if (!order) {
        return { success: false, message: '订单不存在' }
      }
      
      if (order.status !== 'completed') {
        return { success: false, message: '订单未完成' }
      }
      
      if (order.initiatorOpenid !== openid && order.receiverOpenid !== openid) {
        return { success: false, message: '无权操作' }
      }

      // 检查是否已评价
      const isInitiator = order.initiatorOpenid === openid
      const reviewField = isInitiator ? 'initiatorReview' : 'receiverReview'
      
      if (order[reviewField] && order[reviewField].rating !== undefined) {
        return { success: false, message: '已经评价过了' }
      }

      // 更新订单中的评价信息
      const reviewData = {
        rating,
        content: comment || '',
        tags: tags || [],
        createTime: db.serverDate(),
        reviewerOpenid: openid
      }

      await db.collection('orders').doc(orderId).update({
        data: {
          [reviewField]: reviewData
        }
      })

      return { success: true, message: '评价提交成功' }
    }

    // ========== 获取我发出的评价（从orders集合） ==========
    if (action === 'myReviews') {
      const { page = 1, pageSize = 20 } = event
      
      console.log('获取我发出的评价:', { openid: openid ? openid.substring(0, 8) + '...' : 'null' })

      try {
        // 并行查询：我作为发起者且已评价 + 我作为接收者且已评价
        const [res1, res2] = await Promise.all([
          db.collection('orders')
            .where({ 
              initiatorOpenid: openid, 
              'initiatorReview.rating': _.exists(true), 
              status: 'completed' 
            })
            .limit(100)
            .get(),
          db.collection('orders')
            .where({ 
              receiverOpenid: openid, 
              'receiverReview.rating': _.exists(true), 
              status: 'completed' 
            })
            .limit(100)
            .get()
        ])

        // 合并并提取评价数据
        const allItems = []
        
        // 我作为发起者评价了对方
        res1.data.forEach(o => {
          const r = o.initiatorReview
          allItems.push({
            _id: o._id + '_ir',
            orderId: o._id,
            rating: r.rating,
            content: r.content,
            tags: r.tags || [],
            createTime: r.createTime,
            revieweeOpenid: o.receiverOpenid,
            productName: (o.receiverProduct && o.receiverProduct.name) ? o.receiverProduct.name : '',
            productCover: (o.receiverProduct && o.receiverProduct.images && o.receiverProduct.images[0]) ? o.receiverProduct.images[0] : ''
          })
        })
        
        // 我作为接收者评价了对方
        res2.data.forEach(o => {
          const r = o.receiverReview
          allItems.push({
            _id: o._id + '_rr',
            orderId: o._id,
            rating: r.rating,
            content: r.content,
            tags: r.tags || [],
            createTime: r.createTime,
            revieweeOpenid: o.initiatorOpenid,
            productName: (o.initiatorProduct && o.initiatorProduct.name) ? o.initiatorProduct.name : '',
            productCover: (o.initiatorProduct && o.initiatorProduct.images && o.initiatorProduct.images[0]) ? o.initiatorProduct.images[0] : ''
          })
        })

        // 按时间降序排列
        allItems.sort((a, b) => {
          const ta = a.createTime ? new Date(a.createTime).getTime() : 0
          const tb = b.createTime ? new Date(b.createTime).getTime() : 0
          return tb - ta
        })
        
        // 分页
        const start = (page - 1) * pageSize
        const end = start + pageSize
        const paged = allItems.slice(start, end)

        // 补充被评价用户信息
        const enrichedReviews = []
        for (const review of paged) {
          try {
            const reviewee = await getUserInfo(review.revieweeOpenid)
            const productInfo = await getProductInfo(review.productId)
            
            const ratingInfo = getRatingInfo(review.rating)
            
            enrichedReviews.push({
              ...review,
              reviewee: {
                nickName: (reviewee && reviewee.nickName) ? reviewee.nickName : '用户',
                avatarUrl: (reviewee && reviewee.avatarUrl) ? reviewee.avatarUrl : ''
              },
              productName: (productInfo && productInfo.name) ? productInfo.name : review.productName,
              productCover: (productInfo && productInfo.coverUrl) ? productInfo.coverUrl : review.productCover,
              ratingInfo,
              createTimeText: formatTime(review.createTime)
            })
          } catch (e) {
            console.error('处理评价数据失败:', e)
            // 即使失败也添加基本数据
            const ratingInfo = getRatingInfo(review.rating)
            enrichedReviews.push({
              ...review,
              reviewee: { nickName: '用户', avatarUrl: '' },
              ratingInfo,
              createTimeText: formatTime(review.createTime)
            })
          }
        }

        return { 
          success: true, 
          list: enrichedReviews, 
          total: allItems.length,
          page,
          pageSize
        }
      } catch (e) {
        console.error('获取我发出的评价失败:', e)
        return { success: false, list: [], error: e.message }
      }
    }

    // ========== 获取我收到的评价（从orders集合） ==========
    if (action === 'receivedReviews') {
      const { page = 1, pageSize = 20 } = event
      
      console.log('获取我收到的评价:', { openid: openid ? openid.substring(0, 8) + '...' : 'null' })

      try {
        // 并行查询：我作为发起者且对方（接收者）已评价我 + 我作为接收者且对方（发起者）已评价我
        const [res1, res2] = await Promise.all([
          db.collection('orders')
            .where({ 
              initiatorOpenid: openid, 
              'receiverReview.rating': _.exists(true), 
              status: 'completed' 
            })
            .limit(100)
            .get(),
          db.collection('orders')
            .where({ 
              receiverOpenid: openid, 
              'initiatorReview.rating': _.exists(true), 
              status: 'completed' 
            })
            .limit(100)
            .get()
        ])

        // 合并并提取评价数据
        const allItems = []
        
        // 我作为发起者，对方（接收者）评价了我
        res1.data.forEach(o => {
          const r = o.receiverReview
          allItems.push({
            _id: o._id + '_rr',
            orderId: o._id,
            rating: r.rating,
            content: r.content,
            tags: r.tags || [],
            createTime: r.createTime,
            reviewerOpenid: r.reviewerOpenid || o.receiverOpenid,
            productName: (o.initiatorProduct && o.initiatorProduct.name) ? o.initiatorProduct.name : '',
            productCover: (o.initiatorProduct && o.initiatorProduct.images && o.initiatorProduct.images[0]) ? o.initiatorProduct.images[0] : ''
          })
        })
        
        // 我作为接收者，对方（发起者）评价了我
        res2.data.forEach(o => {
          const r = o.initiatorReview
          allItems.push({
            _id: o._id + '_ir',
            orderId: o._id,
            rating: r.rating,
            content: r.content,
            tags: r.tags || [],
            createTime: r.createTime,
            reviewerOpenid: r.reviewerOpenid || o.initiatorOpenid,
            productName: (o.receiverProduct && o.receiverProduct.name) ? o.receiverProduct.name : '',
            productCover: (o.receiverProduct && o.receiverProduct.images && o.receiverProduct.images[0]) ? o.receiverProduct.images[0] : ''
          })
        })

        // 按时间降序排列
        allItems.sort((a, b) => {
          const ta = a.createTime ? new Date(a.createTime).getTime() : 0
          const tb = b.createTime ? new Date(b.createTime).getTime() : 0
          return tb - ta
        })
        
        // 分页
        const start = (page - 1) * pageSize
        const end = start + pageSize
        const paged = allItems.slice(start, end)

        // 补充评价者信息
        const enrichedReviews = []
        for (const review of paged) {
          try {
            const reviewer = await getUserInfo(review.reviewerOpenid)
            const productInfo = await getProductInfo(review.productId)
            
            const ratingInfo = getRatingInfo(review.rating)
            
            enrichedReviews.push({
              ...review,
              reviewer: {
                nickName: (reviewer && reviewer.nickName) ? reviewer.nickName : '用户',
                avatarUrl: (reviewer && reviewer.avatarUrl) ? reviewer.avatarUrl : ''
              },
              productName: (productInfo && productInfo.name) ? productInfo.name : review.productName,
              productCover: (productInfo && productInfo.coverUrl) ? productInfo.coverUrl : review.productCover,
              ratingInfo,
              createTimeText: formatTime(review.createTime)
            })
          } catch (e) {
            console.error('处理评价数据失败:', e)
            // 即使失败也添加基本数据
            const ratingInfo = getRatingInfo(review.rating)
            enrichedReviews.push({
              ...review,
              reviewer: { nickName: '用户', avatarUrl: '' },
              ratingInfo,
              createTimeText: formatTime(review.createTime)
            })
          }
        }

        return { 
          success: true, 
          list: enrichedReviews, 
          total: allItems.length,
          page,
          pageSize
        }
      } catch (e) {
        console.error('获取我收到的评价失败:', e)
        return { success: false, list: [], error: e.message }
      }
    }

    // ========== 获取评价列表（公开） ==========
    if (action === 'list') {
      const { targetOpenid, page = 1, pageSize = 20 } = event
      const target = targetOpenid || openid
      
      console.log('获取评价列表:', { target: target ? target.substring(0, 8) + '...' : 'null' })

      try {
        // 尝试从reviews集合查询（如果存在）
        let reviewsRes
        try {
          reviewsRes = await db.collection('reviews')
            .where({ revieweeOpenid: target })
            .orderBy('createTime', 'desc')
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .get()
        } catch (e) {
          console.log('reviews集合不存在或查询失败，从orders集合查询:', e.message)
          // 从orders集合查询
          return await getReviewsFromOrders(target, page, pageSize)
        }

        // 获取评价者信息
        const reviewerIds = [...new Set(reviewsRes.data.map(r => r.reviewerOpenid).filter(Boolean))]
        let userMap = {}
        
        if (reviewerIds.length > 0) {
          try {
            const usersRes = await db.collection('users')
              .where({ _openid: _.in(reviewerIds) })
              .field({ _openid: true, nickName: true, avatarUrl: true })
              .get()
            
            for (const u of usersRes.data) {
              u.avatarUrl = await resolveCloudUrl(u.avatarUrl)
              userMap[u._openid] = u
            }
          } catch (userError) {
            console.error('获取用户信息失败:', userError)
          }
        }

        const reviews = reviewsRes.data.map(r => {
          const reviewer = userMap[r.reviewerOpenid] || {}
          const { ratingText, ratingClass } = getRatingInfo(r.rating)
          
          return {
            ...r,
            reviewer: {
              nickName: (reviewer && reviewer.nickName) ? reviewer.nickName : '用户',
              avatarUrl: (reviewer && reviewer.avatarUrl) ? reviewer.avatarUrl : ''
            },
            ratingText,
            ratingClass,
            createTimeText: formatTime(r.createTime)
          }
        })

        return { 
          success: true, 
          list: reviews, 
          total: reviewsRes.total
        }
      } catch (error) {
        console.error('获取评价列表失败:', error)
        return { success: false, list: [], error: error.message }
      }
    }

    // ========== 获取信用日志 ==========
    if (action === 'creditLogs') {
      try {
        const res = await db.collection('credit_logs')
          .where(_.or([{ openid }, { _openid: openid }]))
          .orderBy('createTime', 'desc')
          .limit(50)
          .get()
        return { success: true, list: res.data }
      } catch (e) {
        return { success: false, list: [] }
      }
    }

    // 未知的action
    return { 
      success: false, 
      message: '未知的操作类型',
      supportedActions: ['submit', 'list', 'myReviews', 'receivedReviews', 'creditLogs']
    }

  } catch (error) {
    console.error('reviewMgr云函数错误:', error)
    return { 
      success: false, 
      message: '服务器错误',
      error: error.message,
      stack: error.stack
    }
  }
}

// 从orders集合获取评价（辅助函数）
async function getReviewsFromOrders(targetOpenid, page = 1, pageSize = 20) {
  try {
    // 查询target作为被评价者的订单
    const [res1, res2] = await Promise.all([
      db.collection('orders')
        .where({ 
          initiatorOpenid: targetOpenid, 
          'receiverReview.rating': _.exists(true), 
          status: 'completed' 
        })
        .limit(100)
        .get(),
      db.collection('orders')
        .where({ 
          receiverOpenid: targetOpenid, 
          'initiatorReview.rating': _.exists(true), 
          status: 'completed' 
        })
        .limit(100)
        .get()
    ])

    // 合并评价数据
    const allItems = []
    
    res1.data.forEach(o => {
      const r = o.receiverReview
      allItems.push({
        _id: o._id + '_rr',
        orderId: o._id,
        rating: r.rating,
        content: r.content,
        tags: r.tags || [],
        createTime: r.createTime,
        reviewerOpenid: r.reviewerOpenid || o.receiverOpenid,
        revieweeOpenid: targetOpenid
      })
    })
    
    res2.data.forEach(o => {
      const r = o.initiatorReview
      allItems.push({
        _id: o._id + '_ir',
        orderId: o._id,
        rating: r.rating,
        content: r.content,
        tags: r.tags || [],
        createTime: r.createTime,
        reviewerOpenid: r.reviewerOpenid || o.initiatorOpenid,
        revieweeOpenid: targetOpenid
      })
    })

    // 按时间降序排列并分页
    allItems.sort((a, b) => {
      const ta = a.createTime ? new Date(a.createTime).getTime() : 0
      const tb = b.createTime ? new Date(b.createTime).getTime() : 0
      return tb - ta
    })
    
    const start = (page - 1) * pageSize
    const end = start + pageSize
    const paged = allItems.slice(start, end)

    // 补充评价者信息
    const reviewerIds = [...new Set(paged.map(r => r.reviewerOpenid).filter(Boolean))]
    let userMap = {}
    
    if (reviewerIds.length > 0) {
      try {
        const usersRes = await db.collection('users')
          .where({ _openid: _.in(reviewerIds) })
          .field({ _openid: true, nickName: true, avatarUrl: true })
          .get()
        
        for (const u of usersRes.data) {
          u.avatarUrl = await resolveCloudUrl(u.avatarUrl)
          userMap[u._openid] = u
        }
      } catch (userError) {
        console.error('获取用户信息失败:', userError)
      }
    }

    const reviews = paged.map(r => {
      const reviewer = userMap[r.reviewerOpenid] || {}
      const { ratingText, ratingClass } = getRatingInfo(r.rating)
      
      return {
        ...r,
        reviewer: {
          nickName: (reviewer && reviewer.nickName) ? reviewer.nickName : '用户',
          avatarUrl: (reviewer && reviewer.avatarUrl) ? reviewer.avatarUrl : ''
        },
        ratingText,
        ratingClass,
        createTimeText: formatTime(r.createTime)
      }
    })

    return { 
      success: true, 
      list: reviews, 
      total: allItems.length
    }
  } catch (e) {
    console.error('从orders集合获取评价失败:', e)
    return { success: false, list: [], error: e.message }
  }
}