// cloudfunctions/productMgr/index.js
// 特产管理云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 简单的内存缓存
const _cache = new Map()
const simpleCache = {
  get: (key) => {
    const item = _cache.get(key)
    if (!item) return null
    if (Date.now() > item.expireAt) {
      _cache.delete(key)
      return null
    }
    return item.value
  },
  set: (key, value, ttlMs = 5 * 60 * 1000) => {
    _cache.set(key, { value, expireAt: Date.now() + ttlMs })
  }
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
// ✅ 优化：内存缓存临时链接（有效期1.5小时），减少重复调用 getTempFileURL
// 注意：getTempFileURL 单次最多50个fileID，需分批处理
const IMG_CACHE_TTL = 90 * 60 * 1000 // 1.5小时（临时链接2小时有效）

async function processImages(products) {
  // 收集所有需要转换的fileID（去重）
  const fileIDSet = new Set()
  products.forEach(p => {
    if (p.images && Array.isArray(p.images)) {
      p.images.forEach(img => {
        if (img && img.startsWith('cloud://')) {
          fileIDSet.add(img)
        }
      })
    }
  })

  const fileIDs = [...fileIDSet]
  if (fileIDs.length === 0) return products

  // ✅ 先从内存缓存里取，只请求未命中的
  const tempUrlMap = {}
  const missIDs = []
  fileIDs.forEach(fid => {
    const cached = simpleCache.get(`img:${fid}`)
    if (cached) {
      tempUrlMap[fid] = cached
    } else {
      missIDs.push(fid)
    }
  })

  // 分批获取临时链接，每批最多50个
  if (missIDs.length > 0) {
    const BATCH_SIZE = 50
    try {
      for (let i = 0; i < missIDs.length; i += BATCH_SIZE) {
        const batch = missIDs.slice(i, i + BATCH_SIZE)
        const tempRes = await cloud.getTempFileURL({ fileList: batch })
        tempRes.fileList.forEach(f => {
          if (f.tempFileURL) {
            tempUrlMap[f.fileID] = f.tempFileURL
            simpleCache.set(`img:${f.fileID}`, f.tempFileURL, IMG_CACHE_TTL) // 写入缓存
          }
        })
      }
    } catch (e) {
      console.error('获取临时链接失败:', e)
    }
  }

  // 替换图片URL
  return products.map(p => {
    if (p.images && Array.isArray(p.images)) {
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

  // ========== 文本内容安全检测 ==========
async function checkTextContent(text) {
  try {
    const result = await cloud.openapi.security.msgSecCheck({
      openid: openid,
      scene: 2,  // 资料审核场景
      version: 2,
      content: text
    })
    // result.result.label: 100=正常, 其他=违规
    if (result.result && result.result.suggest === 'risky') {
      return { pass: false, reason: '内容包含违规信息' }
    }
    return { pass: true }
  } catch (e) {
    // 接口调用失败时宽容处理，让内容通过
    console.warn('文本检测失败:', e.message)
    return { pass: true }
  }
}

// ========== 图片安全检测（异步版） ==========
async function checkImage(fileId) {
  try {
    // 先获取临时链接
    const tempRes = await cloud.getTempFileURL({ fileList: [fileId] })
    const tempUrl = tempRes.fileList && tempRes.fileList[0] && tempRes.fileList[0].tempFileURL
    if (!tempUrl) {
      return { pass: false, reason: '图片获取失败' }
    }
    
    const result = await cloud.openapi.security.mediaCheckAsync({
      media_url: tempUrl,
      media_type: 2,  // 2=图片
      version: 2,
      openid: openid,
      scene: 2  // 资料审核场景
    })
    // 异步接口返回 trace_id，实际结果通过回调通知
    // 这里只能做同步检测：先放行，后续通过异步回调处理
    // 如果需要同步阻断，可用旧版 imgSecCheck（传 Buffer）
    return { pass: true, traceId: result.trace_id }
  } catch (e) {
    console.warn('图片检测失败:', e.message)
    return { pass: true }
  }
}

// ========== 发布特产 ==========
  if (action === 'create') {
    try {
      const { data } = event
      const isMystery = data.isMystery || false

      // ========== 发布积分门槛 ==========
      const PUBLISH_COST = isMystery ? 10 : 5  // 神秘特产消耗更多
      const MIN_POINTS_TO_PUBLISH = 5  // 最低保留积分

      // 获取用户当前积分（支持 _openid 和 openid 两种字段）
      let userRes = await db.collection('users').where({ _openid: openid }).get()
      let user = userRes.data && userRes.data[0]
      
      // 如果没找到，尝试用 openid 字段查询（兼容旧数据）
      if (!user) {
        userRes = await db.collection('users').where({ openid: openid }).get()
        user = userRes.data && userRes.data[0]
      }
      
      // 如果用户不存在，返回错误
      if (!user || !user._id) {
        console.log('[productMgr/create] 用户不存在:', { openid })
        return { 
          success: false, 
          message: '用户不存在，请先完善个人资料'
        }
      }
      
      // 确保积分和发布数是数字类型
      const currentPoints = Number(user.points) || 0
      const currentPublishCount = Number(user.publishCount) || 0
      
      console.log('[productMgr/create] 积分检查:', {
        openid,
        userId: user?._id,
        currentPoints,
        publishCost: PUBLISH_COST,
        minReserve: MIN_POINTS_TO_PUBLISH,
        isMystery
      })
      
      // 检查积分是否足够（发布消耗的积分，无需预留）
      if (currentPoints < PUBLISH_COST) {
        console.log('[productMgr/create] 积分不足:', {
          currentPoints,
          required: PUBLISH_COST
        })
        return { 
          success: false, 
          message: `积分不足，发布${isMystery ? '神秘特产' : '特产'}需要${PUBLISH_COST}积分，当前积分${currentPoints}`,
          needPoints: PUBLISH_COST - currentPoints
        }
      }

      // ========== 发布频率限制 ==========
      // 检查最近1小时内发布数量
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
      const recentCount = await db.collection('products').where({
        _openid: openid,
        createTime: _.gte(oneHourAgo)
      }).count()
      
      if (recentCount.total >= 10) {
        return { success: false, message: '发布太频繁，请稍后再试' }
      }

      // 神秘特产只需要省份，其他可选
      if (isMystery) {
        if (!data.province) {
          return { success: false, message: '请选择特产省份' }
        }
      } else {
        // 普通特产需要完整信息
        if (!data.name || !data.province || !data.category || !data.valueRange || !data.images?.length) {
          return { success: false, message: '请填写完整信息' }
        }
      }

      // ========== 自动审核 ==========
      let auditPass = true
      let auditReason = ''

      // 神秘特产也需要审核（不能直接上线）
      if (isMystery) {
        // 神秘特产直接进入待审核状态
        auditPass = false
        auditReason = '神秘特产需人工审核'
      } else {
        // 1. 文本检测（名称 + 描述标签）
        const textToCheck = data.name + ' ' + (data.descTags || []).join(' ')
        if (textToCheck.trim()) {
          const textResult = await checkTextContent(textToCheck)
          if (!textResult.pass) {
            auditPass = false
            auditReason = textResult.reason
          }
        }
        
        // 2. 图片检测（逐张检测）
        if (auditPass && data.images && data.images.length > 0) {
          for (const img of data.images) {
            // 跳过已经是 http/https 的图片（已经是临时链接）
            if (img.startsWith('http://') || img.startsWith('https://')) {
              continue
            }
            const imgResult = await checkImage(img)
            if (!imgResult.pass) {
              auditPass = false
              auditReason = imgResult.reason
              break
            }
          }
        }
      }

      // 3. 根据审核结果设置状态
      const status = auditPass ? 'active' : 'pending_review'
      
      // ========== 代购字段 ==========
      let daigouData = null
      if (!isMystery && data.daigou && data.daigou.enabled) {
        const price = parseFloat(data.daigou.price) || 0
        if (price > 0) {
          daigouData = {
            enabled: true,
            price: price,
            originalPrice: parseFloat(data.daigou.originalPrice) || 0,
            stock: parseInt(data.daigou.stock) || 0,
            soldCount: 0,
            serviceFee: Math.round(price * 0.05 * 100) / 100
          }
        }
      }

      const productId = await db.collection('products').add({
        data: {
          openid,
          name: isMystery ? '神秘特产' : data.name,
          description: isMystery ? '' : (data.description || ''),
          province: data.province,
          city: data.city || '',
          district: data.district || '',
          category: isMystery ? '' : data.category,
          valueRange: isMystery ? '' : data.valueRange,
          descTags: isMystery ? [] : (data.descTags || []),
          images: data.images || [],
          wantProvince: data.wantProvince || '',
          wantCity: data.wantCity || '',
          wantDistrict: data.wantDistrict || '',
          wantCategory: data.wantCategory || '',
          isMystery: isMystery,
          gender: data.gender || '',  // 发布者性别
          daigou: daigouData,         // 代购信息（null 表示不支持代购）
          status: status,
          auditReason: auditReason,  // 审核不通过原因
          viewCount: 0,
          swapRequestCount: 0,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })

      // 更新用户发布数，同时扣除积分
      // 使用 set 确保字段类型正确（$inc 在字段为字符串时会报错）
      await db.collection('users').doc(user._id).update({
        data: { 
          publishCount: currentPublishCount + 1,
          points: currentPoints - PUBLISH_COST
        }
      })

      // 记录积分变动
      await db.collection('points_log').add({
        data: {
          _openid: openid,
          type: 'publish',
          amount: -PUBLISH_COST,
          desc: isMystery ? '发布神秘特产' : '发布特产',
          createTime: db.serverDate()
        }
      })

      return { 
        success: true, 
        productId: productId._id,
        auditPass: auditPass,  // 返回审核结果，供前端提示
        message: auditPass ? '发布成功' : '已提交，系统审核中'
      }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 编辑特产 ==========
  if (action === 'update') {
    try {
      const { productId, data } = event
      if (!productId) {
        return { success: false, message: '缺少产品ID' }
      }

      // 验证是否为本人的特产
      const product = await db.collection('products').doc(productId).get()
      if (product.data.openid !== openid) {
        return { success: false, message: '无权操作' }
      }

      // 只允许 active、removed 或 rejected 状态的特产编辑
      // rejected 状态编辑后需要重新审核
      const canEditStatuses = ['active', 'removed', 'rejected']
      if (!canEditStatuses.includes(product.data.status)) {
        return { success: false, message: '当前状态不允许编辑' }
      }

      const isMystery = product.data.isMystery || false
      const needReAudit = product.data.status === 'rejected'  // 被拒绝的产品重新编辑后需要重新审核

      // 如果是编辑被拒绝的产品，需要重新审核
      let auditPass = true
      let auditReason = ''
      
      if (needReAudit && !isMystery) {
        // 重新检测文本
        const textToCheck = data.name + ' ' + (data.descTags || []).join(' ')
        if (textToCheck.trim()) {
          const textResult = await checkTextContent(textToCheck)
          if (!textResult.pass) {
            auditPass = false
            auditReason = textResult.reason
          }
        }
        
        // 重新检测图片
        if (auditPass && data.images && data.images.length > 0) {
          for (const img of data.images) {
            if (img.startsWith('http://') || img.startsWith('https://')) {
              continue
            }
            const imgResult = await checkImage(img)
            if (!imgResult.pass) {
              auditPass = false
              auditReason = imgResult.reason
              break
            }
          }
        }
      }

      const updateData = {
        province: data.province,
        city: data.city || '',
        district: data.district || '',
        wantProvince: data.wantProvince || '',
        wantCity: data.wantCity || '',
        wantDistrict: data.wantDistrict || '',
        wantCategory: data.wantCategory || '',
        updateTime: db.serverDate()
      }

      // 非神秘特产可以编辑更多字段
      if (!isMystery) {
        updateData.name = data.name
        updateData.description = data.description || ''
        updateData.category = data.category
        updateData.valueRange = data.valueRange
        updateData.descTags = data.descTags || []
        updateData.images = data.images || []

        // 更新代购信息
        if (data.daigou && data.daigou.enabled) {
          const price = parseFloat(data.daigou.price) || 0
          if (price > 0) {
            updateData.daigou = {
              enabled: true,
              price: price,
              originalPrice: parseFloat(data.daigou.originalPrice) || 0,
              stock: parseInt(data.daigou.stock) || 0,
              soldCount: product.data.daigou?.soldCount || 0,
              serviceFee: Math.round(price * 0.05 * 100) / 100
            }
          }
        } else {
          // 关闭代购
          updateData.daigou = null
        }
      }

      // 根据审核结果设置状态
      if (needReAudit) {
        updateData.status = auditPass ? 'active' : 'pending_review'
        updateData.auditReason = auditPass ? '' : auditReason
      }

      await db.collection('products').doc(productId).update({
        data: updateData
      })

      return { 
        success: true,
        auditPass: needReAudit ? auditPass : true,
        message: needReAudit ? (auditPass ? '保存成功' : '已提交，系统审核中') : '保存成功'
      }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 获取特产列表（发现页）==========
  if (action === 'list') {
    try {
      const { province, status, page = 1, pageSize = 20, isMystery, random } = event
      
      // 构建查询条件（无指定状态时只显示有效状态：active/swapped/in_swap）
      // 使用 _.in() 比 _.nin() 更安全，避免 status 为 null/undefined 的数据通过
      let whereClause = {
        ...(status ? { status } : { status: _.in(['active', 'swapped', 'in_swap']) }),
        ...(province ? { province } : {}),
        ...(isMystery !== undefined ? { isMystery } : {})
      }
      
      let query = db.collection('products').where(whereClause)

      const total = await query.count()
      
      // 随机排序或按时间排序
      if (random) {
        // 随机获取，需要先获取全部然后随机打乱
        const allRes = await query.limit(100).get()  // 最多取100个
        const allList = allRes.data
        
        // 随机打乱
        for (let i = allList.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allList[i], allList[j]] = [allList[j], allList[i]]
        }
        
        // 返回指定数量
        var res = { data: allList.slice(0, pageSize) }
      } else {
        res = await query
          .orderBy('createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()
      }

      // 补充用户信息（products 存 openid，users 用 _openid）
      // 微信云开发 _.in() 单次最多 100 个，分批查询防数据缺失
      const openids = [...new Set(res.data.map(p => p.openid || p._openid).filter(Boolean))]
      const userMap = {}
      const USER_BATCH = 100
      for (let i = 0; i < openids.length; i += USER_BATCH) {
        try {
          const batchIds = openids.slice(i, i + USER_BATCH)
          const usersRes = await db.collection('users')
            .where({ _openid: _.in(batchIds) })
            .field({ _openid: true, nickName: true, avatarUrl: true, creditScore: true })
            .get()
          for (const u of usersRes.data) {
            u.avatarUrl = await resolveCloudUrl(u.avatarUrl)
            u.openid = u._openid
            userMap[u._openid] = u
          }
        } catch (e) {
          console.warn('[productMgr/list] 批量查用户信息失败:', e.message)
        }
      }

      let list = res.data.map(p => {
        const user = userMap[p.openid || p._openid] || {}
        const isMystery = p.isMystery || false
        
        // 神秘特产隐藏用户信息
        let displayData = {
          ...p,
          userAvatar: isMystery ? 'https://img.icons8.com/ios/100/999999/user.png' : (user.avatarUrl || 'https://img.icons8.com/ios-filled/100/cccccc/user.png'),
          userCreditScore: isMystery ? null : (user.creditScore || 100)
        }
        
        // 神秘特产：只显示省份，其他都隐藏
        if (isMystery) {
          displayData.name = '神秘特产'
          displayData.desc = ''           // 不显示描述
          displayData.category = ''       // 不显示分类
          displayData.wantCategory = ''  // 不显示想要
          displayData.wantProvince = ''  // 不显示想要省份
          // 使用统一的"神秘礼物"图片
          displayData.images = ['https://img.icons8.com/color/200/gift.png']
          displayData.coverUrl = 'https://img.icons8.com/color/200/gift.png'
        }
        
        return displayData
      })

      // 处理图片URL（非神秘的才处理）
      const normalList = list.filter(p => !p.isMystery)
      if (normalList.length > 0) {
        const processed = await processImages(normalList)
        let processedIndex = 0
        list = list.map(p => {
          if (!p.isMystery) {
            p.images = processed[processedIndex].images
            processedIndex++
          }
          return p
        })
      }

      return { success: true, list, total: total.total }
    } catch (e) {
      return { success: false, message: e.message, list: [] }
    }
  }

  // ========== 我的特产 ==========
  if (action === 'myList') {
    try {
      const { page = 1, pageSize = 20, status, isMystery } = event
      let whereClause = { openid }
      if (status) whereClause.status = status
      if (isMystery !== undefined) whereClause.isMystery = isMystery

      const totalRes = await db.collection('products').where(whereClause).count()
      
      const res = await db.collection('products')
        .where(whereClause)
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()

      // 处理图片URL（非神秘的才处理）
      let list = res.data.map(p => ({
        ...p,
        isMystery: p.isMystery || false
      }))
      
      const normalList = list.filter(p => !p.isMystery)
      if (normalList.length > 0) {
        const processed = await processImages(normalList)
        let processedIndex = 0
        list = list.map(p => {
          if (!p.isMystery) {
            p.images = processed[processedIndex].images
            processedIndex++
          }
          return p
        })
      }

      return { success: true, list, total: totalRes.total }
    } catch (e) {
      return { success: false, list: [], total: 0, message: e.message }
    }
  }

  // ========== 推荐匹配（互换页）==========
  if (action === 'recommend') {
    try {
      const { myProductId, page = 1, pageSize = 15 } = event
      
      // 获取我的特产信息
      let myProduct = null
      let myIsMystery = false
      if (myProductId) {
        const myProductRes = await db.collection('products').doc(myProductId).get().catch(() => null)
        myProduct = myProductRes?.data || null
        myIsMystery = myProduct?.isMystery || false
      }
      
      const base = { status: 'active', openid: _.neq(openid) }
      let resultData = []
      const existIds = new Set()

      // 辅助：去重追加，直到满 pageSize
      const merge = (items) => {
        for (const p of items) {
          if (resultData.length >= pageSize) break
          if (!existIds.has(p._id)) {
            resultData.push(p)
            existIds.add(p._id)
          }
        }
      }

      if (myProductId && myProduct) {
        if (myIsMystery) {
          // ====== 神秘特产：只匹配其他神秘特产 ======
          const res = await db.collection('products').where({
            ...base, isMystery: true
          }).orderBy('createTime', 'desc')
            .skip((page - 1) * pageSize)
            .limit(pageSize).get()
          resultData = res.data

        } else {
          // ====== 普通特产：基于兑换规则的多级匹配 ======
          const myProvince = myProduct.province || ''
          const myCategory = myProduct.category || ''
          const myValueRange = myProduct.valueRange || ''
          const myWantProvince = myProduct.wantProvince || ''
          const myWantCategory = myProduct.wantCategory || ''

          // 普通特产条件：isMystery 不为 true（兼容老数据中没有此字段的文档）
          const notMystery = _.neq(true)

          // ---------- 第1级：双向意愿完全匹配 ----------
          if (myWantProvince && myWantCategory && myValueRange) {
            const r = await db.collection('products').where({
              ...base,
              isMystery: notMystery,
              province: myWantProvince,
              category: myWantCategory,
              valueRange: myValueRange,
              wantProvince: myProvince,
              wantCategory: myCategory
            }).orderBy('createTime', 'desc').limit(pageSize).get()
            merge(r.data)
          }

          // ---------- 第2级：我的意愿匹配 ----------
          if (resultData.length < pageSize && myWantProvince && myWantCategory) {
            const q = {
              ...base,
              isMystery: notMystery,
              province: myWantProvince,
              category: myWantCategory
            }
            if (myValueRange) q.valueRange = myValueRange
            const r = await db.collection('products').where(q)
              .orderBy('createTime', 'desc').limit(pageSize).get()
            merge(r.data)
          }

          // ---------- 第3级：对方意愿匹配我 + 同价值 ----------
          if (resultData.length < pageSize && myProvince && myCategory && myValueRange) {
            const r = await db.collection('products').where({
              ...base,
              isMystery: notMystery,
              wantProvince: myProvince,
              wantCategory: myCategory,
              valueRange: myValueRange
            }).orderBy('createTime', 'desc').limit(pageSize).get()
            merge(r.data)
          }

          // ---------- 第4级：省份意愿匹配（单向）+ 同价值 ----------
          if (resultData.length < pageSize && myWantProvince && myValueRange) {
            const r = await db.collection('products').where({
              ...base,
              isMystery: notMystery,
              province: myWantProvince,
              valueRange: myValueRange
            }).orderBy('createTime', 'desc').limit(pageSize).get()
            merge(r.data)
          }
          if (resultData.length < pageSize && myProvince && myValueRange) {
            const r = await db.collection('products').where({
              ...base,
              isMystery: notMystery,
              wantProvince: myProvince,
              valueRange: myValueRange
            }).orderBy('createTime', 'desc').limit(pageSize).get()
            merge(r.data)
          }

          // ---------- 第5级：跨省 + 同价值区间 ----------
          if (resultData.length < pageSize && myProvince && myValueRange) {
            const r = await db.collection('products').where({
              ...base,
              isMystery: notMystery,
              province: _.neq(myProvince),
              valueRange: myValueRange
            }).orderBy('createTime', 'desc').limit(pageSize).get()
            merge(r.data)
          }

          // ---------- 第6级：跨省（任意价值）----------
          if (resultData.length < pageSize && myProvince) {
            const r = await db.collection('products').where({
              ...base,
              isMystery: notMystery,
              province: _.neq(myProvince)
            }).orderBy('createTime', 'desc').limit(pageSize).get()
            merge(r.data)
          }

          // ---------- 第7级：兜底 ----------
          if (resultData.length < 3) {
            const r = await db.collection('products').where({
              ...base, isMystery: notMystery
            }).orderBy('createTime', 'desc').limit(pageSize).get()
            merge(r.data)
          }
        }
      } else {
        // 未选择特产：返回所有其他用户的特产（不区分类型）
        const allRes = await db.collection('products').where(base)
          .orderBy('createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()
        resultData = allRes.data
        console.log('[recommend] 未选择特产，查询到', resultData.length, '条，其中普通:', resultData.filter(p => !p.isMystery).length, '神秘:', resultData.filter(p => p.isMystery).length)
      }

      // 截取到 pageSize
      resultData = resultData.slice(0, pageSize)

      // 补充用户信息（recommend）
      // 微信云开发 _.in() 单次最多 100 个，分批查询
      const openids = [...new Set(resultData.map(p => p.openid || p._openid).filter(Boolean))]
      let userMap = {}
      const REC_BATCH = 100
      for (let i = 0; i < openids.length; i += REC_BATCH) {
        try {
          const batchIds = openids.slice(i, i + REC_BATCH)
          const usersRes = await db.collection('users')
            .where({ _openid: _.in(batchIds) })
            .field({ _openid: true, nickName: true, avatarUrl: true, creditScore: true })
            .get()
          for (const u of usersRes.data) {
            u.avatarUrl = await resolveCloudUrl(u.avatarUrl)
            u.openid = u._openid
            userMap[u._openid] = u
          }
        } catch (e) {
          console.warn('[productMgr/recommend] 批量查用户信息失败:', e.message)
        }
      }

      let list = resultData.map(p => {
        const user = userMap[p.openid || p._openid] || {}
        const isMystery = p.isMystery || false
        
        return {
          ...p,
          userAvatar: isMystery ? 'https://img.icons8.com/ios/100/999999/user.png' : (user.avatarUrl || 'https://img.icons8.com/ios-filled/100/cccccc/user.png'),
          userCreditScore: isMystery ? null : (user.creditScore || 100)
        }
      })

      // 处理图片URL（只处理非神秘的）
      const normalList = list.filter(p => !p.isMystery)
      if (normalList.length > 0) {
        const processed = await processImages(normalList)
        let processedIndex = 0
        list = list.map(p => {
          if (!p.isMystery && p.images) {
            p.images = processed[processedIndex]?.images || p.images
            processedIndex++
          }
          return p
        })
      }

      return { success: true, list }
    } catch (e) {
      return { success: false, list: [], message: e.message }
    }
  }

  // ========== 获取特产详情 ==========
  if (action === 'detail') {
    try {
      const { productId } = event
      const product = await db.collection('products').doc(productId).get()
      
      // 被封禁的产品不允许访问
      if (product.data.status === 'banned') {
        return { success: false, message: '该特产已被管理员下架', banned: true }
      }

      // 增加浏览量
      await db.collection('products').doc(productId).update({
        data: { viewCount: _.inc(1) }
      })

      // 获取发布者信息（products 存 openid 显式字段，users 用 _openid 系统字段）
      const publisherOpenid = product.data.openid || product.data._openid
      let userRes
      let publisher

      // 尝试用 _openid 查询
      if (publisherOpenid) {
        userRes = await db.collection('users')
          .where({ _openid: publisherOpenid })
          .field({ _openid: true, nickName: true, avatarUrl: true, creditScore: true, swapCount: true, provincesBadges: true, gender: true })
          .limit(1)
          .get()
        publisher = userRes.data[0]
      }

      // 如果没找到，尝试用 openid 字段查询（兼容旧数据）
      if (!publisher && product.data.openid) {
        userRes = await db.collection('users')
          .where({ openid: product.data.openid })
          .field({ _openid: true, nickName: true, avatarUrl: true, creditScore: true, swapCount: true, provincesBadges: true, gender: true })
          .limit(1)
          .get()
        publisher = userRes.data[0]
      }

      // 是否是自己的特产
      const isMine = publisherOpenid === openid
      const isMystery = product.data.isMystery || false

      // 统计发布者完成的互换数
      const swapCount = await db.collection('orders')
        .where({
          $or: [{ initiatorOpenid: product.data.openid }, { receiverOpenid: product.data.openid }],
          status: 'completed'
        }).count()

      // 处理图片URL
      let productData = { ...product.data }
      
      // 神秘特产处理：非所有者看不到真实信息
      if (isMystery && !isMine) {
        productData.name = '神秘特产'
        productData.desc = '神秘盲盒，等待匹配后揭晓'
        productData.images = ['https://img.icons8.com/ios/200/999999/mystery.png']
      } else if (productData.images && Array.isArray(productData.images)) {
        const processed = await processImages([productData])
        productData.images = processed[0].images
      }

      // 转换发布者头像 cloud:// → https
      if (publisher) {
        publisher.avatarUrl = await resolveCloudUrl(publisher.avatarUrl)
        // 统一用 openid 字段供前端跳转使用
        publisher.openid = publisher._openid || product.data.openid || publisherOpenid
      } else {
        // 如果没找到用户，创建空对象避免报错
        publisher = {
          _openid: publisherOpenid,
          nickName: '未知用户',
          avatarUrl: '',
          creditScore: 100,
          swapCount: 0,
          provincesBadges: [],
          gender: '',
          openid: publisherOpenid
        }
      }

      return {
        success: true,
        product: productData,
        publisher,
        isMine,
        isMystery,
        publisherSwapCount: swapCount.total
      }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 下架特产 ==========
  if (action === 'remove') {
    try {
      const { productId } = event
      const product = await db.collection('products').doc(productId).get()
      if (product.data.openid !== openid && product.data._openid !== openid) {
        return { success: false, message: '无权操作' }
      }
      await db.collection('products').doc(productId).update({
        data: { status: 'removed', updateTime: db.serverDate() }
      })
      return { success: true }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 管理员删除特产（真正删除）==========
  if (action === 'adminRemove') {
    try {
      const { productId } = event
      if (!productId) {
        return { success: false, message: '缺少特产ID' }
      }

      console.log('[productMgr] 管理员删除特产:', productId)

      // 验证管理员权限
      const adminConfig = await db.collection('system_config').where({
        configKey: 'superAdmins'
      }).get()
      
      const superAdmins = (adminConfig.data[0] && adminConfig.data[0].configValue) || []
      if (!superAdmins.includes(openid)) {
        return { success: false, message: '需要管理员权限' }
      }

      // 获取特产信息
      const product = await db.collection('products').doc(productId).get()
      if (!product.data) {
        return { success: false, message: '特产不存在' }
      }

      // 删除特产的收藏记录
      await db.collection('favorites').where({ productId }).remove()

      // 删除特产
      await db.collection('products').doc(productId).remove()

      console.log('[productMgr] 特产已删除:', productId)

      return { success: true, message: '删除成功' }
    } catch (e) {
      console.error('[productMgr] 删除特产失败:', e)
      return { success: false, message: e.message }
    }
  }

  // ========== 更新特产状态（重新上架等）==========
  if (action === 'updateStatus') {
    try {
      const { productId, status } = event
      if (!productId || !status) {
        return { success: false, message: '参数错误' }
      }

      const product = await db.collection('products').doc(productId).get()
      if (product.data.openid !== openid) {
        return { success: false, message: '无权操作' }
      }

      const validStatuses = ['active', 'removed']
      if (!validStatuses.includes(status)) {
        return { success: false, message: '无效的状态' }
      }

      await db.collection('products').doc(productId).update({
        data: { 
          status, 
          updateTime: db.serverDate() 
        }
      })

      return { success: true, message: '状态更新成功' }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 删除特产（彻底删除）==========
  if (action === 'delete') {
    try {
      const { productId } = event
      const product = await db.collection('products').doc(productId).get()
      
      if (!product.data) {
        return { success: false, message: '特产不存在' }
      }
      
      if (product.data.openid !== openid) {
        return { success: false, message: '无权操作' }
      }

      // 检查是否有关联的进行中订单
      const relatedOrders = await db.collection('orders')
        .where({
          $or: [
            { initiatorProductId: productId },
            { receiverProductId: productId }
          ],
          status: _.nin(['completed', 'cancelled'])
        })
        .count()

      if (relatedOrders.total > 0) {
        return { success: false, message: '该特产有关联的进行中订单，无法删除' }
      }

      // 删除特产
      await db.collection('products').doc(productId).remove()

      // 减少用户发布数（使用 _openid 精准定位）
      await db.collection('users').where({ _openid: openid }).update({
        data: { publishCount: _.inc(-1) }
      })

      return { success: true, message: '删除成功' }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 添加收藏 ==========
  if (action === 'addFavorite') {
    try {
      const { productId } = event
      if (!productId) return { success: false, message: '参数错误' }

      // 检查产品是否存在且可收藏
      const product = await db.collection('products').doc(productId).get()
      if (!product.data) return { success: false, message: '产品不存在' }
      
      // 检查产品状态是否可收藏（只允许收藏 active 状态）
      if (!['active', 'in_swap', 'swapped'].includes(product.data.status)) {
        return { success: false, message: '该产品不可收藏' }
      }

      // 检查是否已收藏
      const exists = await db.collection('favorites')
        .where({ openid, productId })
        .count()

      if (exists.total > 0) {
        return { success: true, message: '已收藏' }
      }

      await db.collection('favorites').add({
        data: {
          openid,
          productId,
          createTime: db.serverDate()
        }
      })

      return { success: true }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 取消收藏 ==========
  if (action === 'removeFavorite') {
    try {
      const { productId } = event
      if (!productId) return { success: false, message: '参数错误' }

      await db.collection('favorites')
        .where({ openid, productId })
        .remove()

      return { success: true }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 检查是否已收藏 ==========
  if (action === 'checkFavorite') {
    try {
      const { productId } = event
      if (!productId) return { success: true, isFav: false }

      const res = await db.collection('favorites')
        .where({ openid, productId })
        .count()

      return { success: true, isFav: res.total > 0 }
    } catch (e) {
      return { success: true, isFav: false }
    }
  }

  // ========== 我的收藏列表 ==========
  if (action === 'myFavorites') {
    try {
      // 获取收藏记录
      const favRes = await db.collection('favorites')
        .where({ openid })
        .orderBy('createTime', 'desc')
        .limit(100)
        .get()

      if (favRes.data.length === 0) {
        return { success: true, list: [] }
      }

      // 获取对应的商品信息
      const productIds = favRes.data.map(f => f.productId)
      // 分批查询（每批20个，微信云数据库 where in 限制）
      const BATCH = 20
      let products = []
      for (let i = 0; i < productIds.length; i += BATCH) {
        const batch = productIds.slice(i, i + BATCH)
        const pRes = await db.collection('products')
          .where({ _id: _.in(batch), status: _.in(['active', 'swapped', 'in_swap']) })
          .get()
        products = products.concat(pRes.data)
      }

      // 构建商品映射
      const productMap = {}
      products.forEach(p => { productMap[p._id] = p })

      // 按收藏顺序组装列表，过滤掉已删除的商品
      let list = favRes.data
        .map(f => productMap[f.productId])
        .filter(Boolean)

      // 处理图片URL
      if (list.length > 0) {
        list = await processImages(list)
      }

      return { success: true, list }
    } catch (e) {
      return { success: false, message: e.message, list: [] }
    }
  }

  // ========== 搜索特产 ==========
  if (action === 'search') {
    try {
      const { keyword, page = 1, pageSize = 10, sort } = event
      if (!keyword || !keyword.trim()) {
        return { success: true, list: [], total: 0 }
      }

      const cleaned = keyword.trim()

      // 判断是否按省份搜索
      let whereClause = { status: 'active' }

      // 先尝试匹配省份名称
      const provincesRes = await db.collection('products')
        .where({ status: 'active' })
        .limit(1)
        .get()

      // 省份编码映射（从 constants 中的省份列表）
      const PROVINCE_MAP = {
        '北京': 'BJ', '天津': 'TJ', '河北': 'HE', '山西': 'SX', '内蒙古': 'NM',
        '辽宁': 'LN', '吉林': 'JL', '黑龙江': 'HL', '上海': 'SH', '江苏': 'JS',
        '浙江': 'ZJ', '安徽': 'AH', '福建': 'FJ', '江西': 'JX', '山东': 'SD',
        '河南': 'HA', '湖北': 'HB', '湖南': 'HN', '广东': 'GD', '广西': 'GX',
        '海南': 'HI', '重庆': 'CQ', '四川': 'SC', '贵州': 'GZ', '云南': 'YN',
        '西藏': 'XZ', '陕西': 'SN', '甘肃': 'GS', '青海': 'QH', '宁夏': 'NX',
        '新疆': 'XJ', '台湾': 'TW', '香港': 'HK', '澳门': 'MO'
      }

      // 检查关键词是否包含省份名
      let matchedProvince = null
      for (const [name, code] of Object.entries(PROVINCE_MAP)) {
        if (cleaned.includes(name) || name.includes(cleaned)) {
          matchedProvince = code
          break
        }
      }

      if (matchedProvince) {
        // 按省份搜索
        whereClause.province = matchedProvince
      } else {
        // 按名称模糊搜索
        whereClause.name = db.RegExp({
          regexp: cleaned,
          options: 'i'
        })
      }

      // 查询总数
      const totalRes = await db.collection('products').where(whereClause).count()

      // 排序
      let query = db.collection('products').where(whereClause)
      if (sort === 'newest') {
        query = query.orderBy('createTime', 'desc')
      } else {
        query = query.orderBy('createTime', 'desc')
      }

      const res = await query
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()

      // 补充用户信息
      const openids = [...new Set(res.data.map(p => p.openid || p._openid))]
      let userMap = {}
      if (openids.length > 0) {
        const usersRes = await db.collection('users')
          .where({ _openid: _.in(openids) })
          .field({ _openid: true, nickName: true, avatarUrl: true, creditScore: true })
          .get()
        for (const u of usersRes.data) {
          u.avatarUrl = await resolveCloudUrl(u.avatarUrl)
          u.openid = u._openid
          userMap[u._openid] = u
        }
      }

      let list = res.data.map(p => {
        const user = userMap[p.openid || p._openid] || {}
        return {
          ...p,
          userAvatar: user.avatarUrl || '',
          userNickName: user.nickName || '',
          userCreditScore: user.creditScore || 100
        }
      })

      // 处理图片
      const normalList = list.filter(p => !p.isMystery)
      if (normalList.length > 0) {
        const processed = await processImages(normalList)
        let idx = 0
        list = list.map(p => {
          if (!p.isMystery) {
            p.images = processed[idx].images
            idx++
          }
          return p
        })
      }

      return { success: true, list, total: totalRes.total }
    } catch (e) {
      return { success: false, message: e.message, list: [], total: 0 }
    }
  }

  return { success: false, message: '未知操作' }
}
