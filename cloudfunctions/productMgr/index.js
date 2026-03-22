// cloudfunctions/productMgr/index.js
// 特产管理云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

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
// 注意：getTempFileURL 单次最多50个fileID，需分批处理
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

  // ========== 发布特产 ==========
  if (action === 'create') {
    try {
      const { data } = event
      const isMystery = data.isMystery || false

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
      
      const productId = await db.collection('products').add({
        data: {
          openid,
          name: isMystery ? '神秘特产' : data.name,
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
          status: 'active',
          viewCount: 0,
          swapRequestCount: 0,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })

      // 更新用户发布数（使用 _openid 精准定位）
      await db.collection('users').where({ _openid: openid }).update({
        data: { publishCount: _.inc(1) }
      })

      return { success: true, productId: productId._id }
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

      // 只允许 active 或 removed 状态的特产编辑
      if (!['active', 'removed'].includes(product.data.status)) {
        return { success: false, message: '当前状态不允许编辑' }
      }

      const isMystery = product.data.isMystery || false

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
        updateData.category = data.category
        updateData.valueRange = data.valueRange
        updateData.descTags = data.descTags || []
        updateData.images = data.images || []
      }

      await db.collection('products').doc(productId).update({
        data: updateData
      })

      return { success: true }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 获取特产列表（发现页）==========
  if (action === 'list') {
    try {
      const { province, status, page = 1, pageSize = 20, isMystery, random } = event
      
      // 构建查询条件（无指定状态时排除 banned/removed）
      let whereClause = {
        ...(status ? { status } : { status: _.nin(['banned', 'removed']) }),
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

      // 补充用户信息
      const openids = [...new Set(res.data.map(p => p.openid))]
      const usersRes = await db.collection('users')
        .where({ openid: _.in(openids) })
        .field({ openid: true, nickName: true, avatarUrl: true, creditScore: true })
        .get()
      const userMap = {}
      for (const u of usersRes.data) {
        u.avatarUrl = await resolveCloudUrl(u.avatarUrl)
        userMap[u.openid] = u
      }

      let list = res.data.map(p => {
        const user = userMap[p.openid] || {}
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

      // 补充用户信息
      const openids = [...new Set(resultData.map(p => p.openid))]
      let userMap = {}
      if (openids.length > 0) {
        const usersRes = await db.collection('users')
          .where({ openid: _.in(openids) })
          .field({ openid: true, nickName: true, avatarUrl: true, creditScore: true })
          .get()
        for (const u of usersRes.data) {
          u.avatarUrl = await resolveCloudUrl(u.avatarUrl)
          userMap[u.openid] = u
        }
      }

      let list = resultData.map(p => {
        const user = userMap[p.openid] || {}
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

      // 获取发布者信息
      const userRes = await db.collection('users')
        .where({ openid: product.data.openid })
        .field({ openid: true, nickName: true, avatarUrl: true, creditScore: true, swapCount: true, provincesBadges: true })
        .limit(1)
        .get()

      // 是否是自己的特产
      const isMine = product.data.openid === openid
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
      const publisher = userRes.data[0] || {}
      publisher.avatarUrl = await resolveCloudUrl(publisher.avatarUrl)

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
      if (product.data.openid !== openid) {
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
          .where({ _id: _.in(batch), status: _.nin(['banned', 'removed']) })
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
      const openids = [...new Set(res.data.map(p => p.openid))]
      let userMap = {}
      if (openids.length > 0) {
        const usersRes = await db.collection('users')
          .where({ openid: _.in(openids) })
          .field({ openid: true, nickName: true, avatarUrl: true, creditScore: true })
          .get()
        for (const u of usersRes.data) {
          u.avatarUrl = await resolveCloudUrl(u.avatarUrl)
          userMap[u.openid] = u
        }
      }

      let list = res.data.map(p => {
        const user = userMap[p.openid] || {}
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
