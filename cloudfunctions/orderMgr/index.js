// cloudfunctions/orderMgr/index.js
// 订单/互换流程管理云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 引入工具模块
const { success, error, wrapHandler } = require('./utils/errorHandler')
const openidHelper = require('./utils/openidHelper')

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
      if (myProduct.data.status !== 'active') return { success: false, message: '你的特产当前不可用' }

      // 检查目标特产
      const targetProduct = await db.collection('products').doc(targetProductId).get()
      if (targetProduct.data.status !== 'active') return { success: false, message: '对方特产当前不可用' }
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

      // 发送订阅消息通知对方有新的互换申请
      try {
        await cloud.callFunction({
          name: 'sendSubscribeMsg',
          data: {
            action: 'swapRequest',
            openid: targetProduct.data.openid,
            params: {
              requesterName: '有用户',  // 可以获取发起者昵称
              productName: targetProduct.data.name,
              requestTime: new Date().toLocaleString(),
              page: `pages/order-detail/index?id=${orderId._id}`
            }
          }
        })
      } catch (e) { console.log('[orderMgr/create] 发送互换申请通知失败', e) }

      // 记录订单创建日志
      try {
        await cloud.callFunction({
          name: 'adminMgr',
          data: {
            action: 'logUserAction',
            targetType: 'order',
            targetId: orderId._id,
            userInfo: { openid },
            detail: {
              myProductName: myProduct.data.name,
              targetProductName: targetProduct.data.name,
              isMysterySwap
            }
          }
        })
      } catch (e) {
        console.log('[orderMgr] 记录订单创建日志失败', e)
      }

      return { success: true, orderId: orderId._id }
    } catch (e) {
      console.error('[orderMgr/create] 错误:', e)
      return error(e.message, 'CREATE_FAILED')
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
          .where({ _openid: _.in(uniqueOpenids) })
          .field({ _openid: true, nickName: true, avatarUrl: true, creditScore: true, rating: true, ratingCount: true })
          .get()
        for (const u of usersRes.data) {
          u.avatarUrl = await resolveCloudUrl(u.avatarUrl)
          u.openid = u._openid  // 确保前端可通过 openid 跳转用户主页
          userMap[u._openid] = u
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

      // 确保返回数据格式正确（不用 success() 包装，避免嵌套 data 字段）
      return {
        success: true,
        list: orders || [],
        tabCounts: tabCounts || { all: 0, pending: 0, ongoing: 0, completed: 0 }
      }
    } catch (e) {
      console.error('[orderMgr/list] 错误:', e)
      return {
        success: false,
        message: e.message,
        list: [],
        tabCounts: { all: 0, pending: 0, ongoing: 0, completed: 0 }
      }
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
          .where({ _openid: _.in(uniqueOpenids) })
          .field({ _openid: true, nickName: true, avatarUrl: true })
          .get()
        for (const u of usersRes.data) {
          u.avatarUrl = await resolveCloudUrl(u.avatarUrl)
          u.openid = u._openid  // 确保前端可通过 openid 跳转用户主页
          userMap[u._openid] = u
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
      console.error('[orderMgr/mysteryList] 错误:', e)
      return error(e.message, 'QUERY_FAILED', { list: [] })
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
      
      // 记录接受订单日志
      try {
        await cloud.callFunction({
          name: 'adminMgr',
          data: {
            action: 'logUserAction',
            targetType: 'order',
            targetId: event.orderId,
            userInfo: { openid },
            detail: { status: 'confirmed' }
          }
        })
      } catch (e) { console.log('[orderMgr] 记录日志失败', e) }

      // 发送订阅消息通知发起者对方已同意
      try {
        await cloud.callFunction({
          name: 'sendSubscribeMsg',
          data: {
            action: 'swapAccept',
            openid: order.data.initiatorOpenid,
            params: {
              accepterName: '对方用户',
              productName: '您的特产',
              acceptTime: new Date().toLocaleString(),
              page: `pages/order-detail/index?id=${event.orderId}`
            }
          }
        })
      } catch (e) { console.log('[orderMgr/accept] 发送接受通知失败', e) }
      
      return success({ message: '已接受互换请求' })
    } catch (e) {
      return error(e.message, 'ACCEPT_FAILED')
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
      
      // 记录拒绝订单日志
      try {
        await cloud.callFunction({
          name: 'adminMgr',
          data: {
            action: 'logUserAction',
            targetType: 'order',
            targetId: event.orderId,
            userInfo: { openid },
            detail: { reason: 'rejected' }
          }
        })
      } catch (e) { console.log('[orderMgr] 记录日志失败', e) }

      // 发送订阅消息通知发起者对方已拒绝
      try {
        await cloud.callFunction({
          name: 'sendSubscribeMsg',
          data: {
            action: 'swapReject',
            openid: o.initiatorOpenid,
            params: {
              rejecterName: '对方用户',
              productName: '您的特产',
              rejectTime: new Date().toLocaleString(),
              page: `pages/order-detail/index?id=${event.orderId}`
            }
          }
        })
      } catch (e) { console.log('[orderMgr/reject] 发送拒绝通知失败', e) }
      
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
        await db.collection('users').where({ _openid: openid }).update({
          data: { creditScore: _.inc(creditDelta) }
        })
        await db.collection('credit_logs').add({
          data: { openid, delta: creditDelta, reason: '取消已确认的互换', orderId: event.orderId, createTime: db.serverDate() }
        })
      }

      // 发送订单取消通知给对方
      try {
        const otherOpenid = o.initiatorOpenid === openid ? o.receiverOpenid : o.initiatorOpenid
        await cloud.callFunction({
          name: 'sendSubscribeMsg',
          data: {
            action: 'orderCancel',
            openid: otherOpenid,
            params: {
              reason: creditDelta !== 0 ? '对方取消已确认的订单（已扣信用分）' : '对方取消了订单',
              cancelTime: new Date().toLocaleString(),
              page: `pages/order-detail/index?id=${event.orderId}`
            }
          }
        })
      } catch (e) { console.log('[orderMgr] 发送取消通知失败', e) }

      return { success: true, message: '订单已取消' }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 删除订单（管理员） ==========
  if (action === 'deleteOrder') {
    try {
      const { orderId } = event
      if (!orderId) {
        return { success: false, message: '缺少订单ID' }
      }

      console.log('[orderMgr] 删除订单:', orderId)

      // 获取订单信息
      const order = await db.collection('orders').doc(orderId).get()
      if (!order.data) {
        return { success: false, message: '订单不存在' }
      }

      const o = order.data

      // 如果订单进行中，需要释放特产
      if (['pending', 'confirmed', 'shipped_a', 'shipped_b', 'shipped'].includes(o.status)) {
        await Promise.all([
          db.collection('products').doc(o.initiatorProductId).update({ data: { status: 'active' } }),
          db.collection('products').doc(o.receiverProductId).update({ data: { status: 'active' } })
        ])
      }

      // 删除订单
      await db.collection('orders').doc(orderId).remove()

      console.log('[orderMgr] 订单已删除:', orderId)

      return { success: true, message: '订单已删除' }
    } catch (e) {
      console.error('[orderMgr] 删除订单失败:', e)
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

      // 记录发货日志
      try {
        await cloud.callFunction({
          name: 'adminMgr',
          data: {
            action: 'logUserAction',
            targetType: 'order',
            targetId: orderId,
            userInfo: { openid },
            detail: { company: finalCompany, trackingNo: finalNumber, newStatus }
          }
        })
      } catch (e) { console.log('[orderMgr] 记录日志失败', e) }

      // 发送发货通知给收件人
      try {
        const recipientOpenid = isInitiator ? o.receiverOpenid : o.initiatorOpenid
        await cloud.callFunction({
          name: 'sendSubscribeMsg',
          data: {
            action: 'shipment',
            openid: recipientOpenid,
            params: {
              status: '已发货',
              deliveryMethod: finalCompany || '快递配送',
              trackingNumber: finalNumber || '暂无',
              page: `pages/order-detail/index?id=${orderId}`
            }
          }
        })
      } catch (e) { console.log('[orderMgr] 发送发货通知失败', e) }

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
        // 先读取双方用户信息（在 swapCount 递增之前），用于判断首次互换
        const [initiatorUserBeforeRes, receiverUserBeforeRes] = await Promise.all([
          db.collection('users').where({ _openid: o.initiatorOpenid }).limit(1).get(),
          db.collection('users').where({ _openid: o.receiverOpenid }).limit(1).get()
        ])
        const initiatorBefore = initiatorUserBeforeRes.data && initiatorUserBeforeRes.data[0]
        const receiverBefore = receiverUserBeforeRes.data && receiverUserBeforeRes.data[0]
        const initiatorIsFirstSwap = initiatorBefore && (initiatorBefore.swapCount || 0) === 0
        const receiverIsFirstSwap = receiverBefore && (receiverBefore.swapCount || 0) === 0

        await Promise.all([
          db.collection('products').doc(o.initiatorProductId).update({ data: { status: 'swapped' } }),
          db.collection('products').doc(o.receiverProductId).update({ data: { status: 'swapped' } }),
          db.collection('users').where({ _openid: o.initiatorOpenid }).update({
            data: { creditScore: _.inc(CREDIT_DELTA.complete), swapCount: _.inc(1) }
          }),
          db.collection('users').where({ _openid: o.receiverOpenid }).update({
            data: { creditScore: _.inc(CREDIT_DELTA.complete), swapCount: _.inc(1) }
          }),
          // 记录信用日志
          db.collection('credit_logs').add({
            data: {
              openid: o.initiatorOpenid,
              delta: CREDIT_DELTA.complete,
              reason: '完成互换',
              orderId: event.orderId,
              createTime: db.serverDate()
            }
          }),
          db.collection('credit_logs').add({
            data: {
              openid: o.receiverOpenid,
              delta: CREDIT_DELTA.complete,
              reason: '完成互换',
              orderId: event.orderId,
              createTime: db.serverDate()
            }
          })
        ])

        // 更新省份集章（发起方拿到了对方省份的特产）
        const initiatorProduct = await db.collection('products').doc(o.initiatorProductId).get()
        const receiverProduct = await db.collection('products').doc(o.receiverProductId).get()

        await db.collection('users').where({ _openid: o.initiatorOpenid }).update({
          data: { provincesBadges: _.addToSet(receiverProduct.data.province) }
        })
        await db.collection('users').where({ _openid: o.receiverOpenid }).update({
          data: { provincesBadges: _.addToSet(initiatorProduct.data.province) }
        })

        // ====== 完成互换积分奖励（双方各得10积分）======
        const SWAP_COMPLETE_REWARD = 10
        await Promise.all([
          db.collection('users').where({ _openid: o.initiatorOpenid }).update({
            data: { points: _.inc(SWAP_COMPLETE_REWARD) }
          }),
          db.collection('users').where({ _openid: o.receiverOpenid }).update({
            data: { points: _.inc(SWAP_COMPLETE_REWARD) }
          }),
          db.collection('points_log').add({
            data: {
              openid: o.initiatorOpenid,
              type: 'swap_complete',
              amount: SWAP_COMPLETE_REWARD,
              desc: '完成互换奖励',
              orderId: event.orderId,
              createTime: db.serverDate()
            }
          }),
          db.collection('points_log').add({
            data: {
              openid: o.receiverOpenid,
              type: 'swap_complete',
              amount: SWAP_COMPLETE_REWARD,
              desc: '完成互换奖励',
              orderId: event.orderId,
              createTime: db.serverDate()
            }
          })
        ])

        // ====== 邀请好友首次互换奖励（双方各得20积分）======
        const FIRST_SWAP_REWARD = 20
        // 获取首次互换现金奖励配置
        let FIRST_SWAP_CASH_REWARD = 10.00
        try {
          const configRes = await db.collection('system_config').where({
            configKey: 'first_swap_cash_reward'
          }).get()
          if (configRes.data && configRes.data.length > 0) {
            FIRST_SWAP_CASH_REWARD = parseFloat(configRes.data[0].configValue) || 10.00
          }
        } catch (e) {
          console.log('获取首次互换现金奖励配置失败，使用默认值:', e.message)
        }
        try {
          // 检查发起方是否是被邀请用户且首次完成互换（使用递增前的 swapCount）
          if (initiatorIsFirstSwap && initiatorBefore.invitedBy) {
            const inviterOpenid = initiatorBefore.invitedBy
            // 给被邀请人（发起方）加20积分
            await db.collection('users').where({ _openid: o.initiatorOpenid }).update({
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
            await db.collection('users').where({ _openid: inviterOpenid }).update({
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
            // 记录到 invite_rewards 集合
            await db.collection('invite_rewards').add({
              data: {
                inviterOpenid: inviterOpenid,
                invitedOpenid: o.initiatorOpenid,
                type: 'first_swap',
                amount: FIRST_SWAP_REWARD,
                cashAmount: FIRST_SWAP_CASH_REWARD,
                orderId: event.orderId,
                createTime: db.serverDate()
              }
            })
          }

          // 检查接收方是否是被邀请用户且首次完成互换（使用递增前的 swapCount）
          if (receiverIsFirstSwap && receiverBefore.invitedBy) {
            const inviterOpenid = receiverBefore.invitedBy
            // 给被邀请人（接收方）加20积分
            await db.collection('users').where({ _openid: o.receiverOpenid }).update({
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
            await db.collection('users').where({ _openid: inviterOpenid }).update({
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
            // 记录到 invite_rewards 集合
            await db.collection('invite_rewards').add({
              data: {
                inviterOpenid: inviterOpenid,
                invitedOpenid: o.receiverOpenid,
                type: 'first_swap',
                amount: FIRST_SWAP_REWARD,
                cashAmount: FIRST_SWAP_CASH_REWARD,
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

      // 记录收货日志
      const logAction = newStatus === 'completed' ? 'swap_success' : 'receive_order'
      try {
        await cloud.callFunction({
          name: 'adminMgr',
          data: {
            action: 'logUserAction',
            actionType: logAction,  // 使用 actionType 而不是重复定义 action
            targetType: 'order',
            targetId: event.orderId,
            userInfo: { openid },
            detail: { newStatus, isCompleted: newStatus === 'completed' }
          }
        })
      } catch (e) { console.log('[orderMgr] 记录日志失败', e) }

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
      const targetUserRes = await db.collection('users').where({ _openid: targetOpenid }).limit(1).get()
      if (targetUserRes.data.length > 0) {
        const targetUser = targetUserRes.data[0]
        const currentRating = targetUser.rating || 5
        const currentCount = targetUser.ratingCount || 0
        const newCount = currentCount + 1
        const newRating = ((currentRating * currentCount) + rating) / newCount

        await db.collection('users').where({ _openid: targetOpenid }).update({
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
        db.collection('users').where({ _openid: order.initiatorOpenid }).limit(1).get(),
        db.collection('users').where({ _openid: order.receiverOpenid }).limit(1).get()
      ])

      // 获取评价信息
      const reviewsRes = await db.collection('reviews')
        .where({ orderId })
        .get()

      let initiatorProduct = initiatorProductRes ? initiatorProductRes.data : null
      let receiverProduct = receiverProductRes ? receiverProductRes.data : null

      // 处理产品图片URL
      await processProductImages([initiatorProduct, receiverProduct])

      const initiatorUser = initiatorUserRes.data[0] || {}
      const receiverUser = receiverUserRes.data[0] || {}
      // 确保前端能通过 openid 字段跳转用户主页
      initiatorUser.openid = initiatorUser._openid || order.initiatorOpenid
      receiverUser.openid = receiverUser._openid || order.receiverOpenid

      return {
        success: true,
        order: {
          ...order,
          initiatorProduct,
          receiverProduct,
          initiator: initiatorUser,
          receiver: receiverUser,
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

  // ========== 创建纠纷申请 ==========
  if (action === 'createDispute') {
    try {
      const { orderId, type, description, images } = event
      
      // 获取订单信息
      const orderRes = await db.collection('orders').doc(orderId).get()
      if (!orderRes.data) {
        return { success: false, message: '订单不存在' }
      }
      const order = orderRes.data
      
      // 检查权限
      if (order.initiatorOpenid !== openid && order.receiverOpenid !== openid) {
        return { success: false, message: '无权操作' }
      }
      
      // 检查订单状态是否允许申请纠纷
      if (!['confirmed', 'shipped_a', 'shipped_b', 'shipped', 'received_a', 'received_b', 'completed'].includes(order.status)) {
        return { success: false, message: '当前订单状态不能申请纠纷' }
      }
      
      // 检查是否已存在纠纷
      const existingDispute = await db.collection('disputes').where({ orderId }).get()
      if (existingDispute.data && existingDispute.data.length > 0) {
        return { success: false, message: '该订单已存在纠纷申请' }
      }
      
      // 创建纠纷记录
      const disputeData = {
        orderId,
        initiatorOpenid: openid,
        type,
        description,
        images: images || [],
        status: 'pending',
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
      
      const disputeRes = await db.collection('disputes').add({ data: disputeData })
      
      // 更新订单状态为纠纷中
      await db.collection('orders').doc(orderId).update({
        data: {
          status: 'disputed',
          disputeId: disputeRes._id,
          updateTime: db.serverDate()
        }
      })
      
      // 记录纠纷日志
      try {
        await cloud.callFunction({
          name: 'adminMgr',
          data: {
            action: 'logUserAction',
            actionType: 'create_dispute',
            targetType: 'order',
            targetId: orderId,
            userInfo: { openid },
            detail: { type, description: description.substring(0, 100) }
          }
        })
      } catch (e) { console.log('[orderMgr] 记录纠纷日志失败', e) }
      
      return { success: true, message: '纠纷申请已提交', disputeId: disputeRes._id }
    } catch (e) {
      console.error('createDispute error:', e)
      return { success: false, message: e.message }
    }
  }

  // ========== 获取纠纷信息 ==========
  if (action === 'getDispute') {
    try {
      const { orderId } = event
      
      // 获取订单信息
      const orderRes = await db.collection('orders').doc(orderId).get()
      if (!orderRes.data) {
        return { success: false, message: '订单不存在' }
      }
      const order = orderRes.data
      
      // 检查权限
      if (order.initiatorOpenid !== openid && order.receiverOpenid !== openid) {
        return { success: false, message: '无权查看' }
      }
      
      // 获取纠纷记录
      const disputeRes = await db.collection('disputes').where({ orderId }).get()
      if (!disputeRes.data || disputeRes.data.length === 0) {
        return { success: false, message: '未找到纠纷记录' }
      }
      
      const dispute = disputeRes.data[0]
      
      // 处理图片URL
      if (dispute.images && dispute.images.length > 0) {
        const processedImages = []
        for (const img of dispute.images) {
          if (img.startsWith('cloud://')) {
            try {
              const tempRes = await cloud.getTempFileURL({ fileList: [img] })
              processedImages.push(tempRes.fileList[0]?.tempFileURL || img)
            } catch (e) {
              processedImages.push(img)
            }
          } else {
            processedImages.push(img)
          }
        }
        dispute.images = processedImages
      }
      
      return { success: true, dispute }
    } catch (e) {
      console.error('getDispute error:', e)
      return { success: false, message: e.message }
    }
  }

  return { success: false, message: '未知操作' }
}
