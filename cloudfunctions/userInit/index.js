// cloudfunctions/userInit/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 计算属相和星座
function calculateZodiacInfo(birthday) {
  const date = new Date(birthday)
  if (isNaN(date.getTime())) return { zodiac: '', zodiacAnimal: '' }

  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()

  // 属相（以2020年鼠年为基准，需要处理负数取模）
  const zodiacAnimals = [
    { name: '鼠', emoji: '🐭' },
    { name: '牛', emoji: '🐂' },
    { name: '虎', emoji: '🐅' },
    { name: '兔', emoji: '🐇' },
    { name: '龙', emoji: '🐉' },
    { name: '蛇', emoji: '🐍' },
    { name: '马', emoji: '🐎' },
    { name: '羊', emoji: '🐏' },
    { name: '猴', emoji: '🐵' },
    { name: '鸡', emoji: '🐔' },
    { name: '狗', emoji: '🐕' },
    { name: '猪', emoji: '🐷' }
  ]
  // 正确处理负数取模：((year - 2020) % 12 + 12) % 12
  const zodiacIndex = ((year - 2020) % 12 + 12) % 12
  const zodiacAnimal = zodiacAnimals[zodiacIndex]
  const zodiacAnimalStr = `${zodiacAnimal.emoji}${zodiacAnimal.name}`

  // 星座
  let zodiac = ''
  let zodiacEmoji = ''
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) { zodiac = '白羊座'; zodiacEmoji = '♈' }
  else if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) { zodiac = '金牛座'; zodiacEmoji = '♉' }
  else if ((month === 5 && day >= 21) || (month === 6 && day <= 21)) { zodiac = '双子座'; zodiacEmoji = '♊' }
  else if ((month === 6 && day >= 22) || (month === 7 && day <= 22)) { zodiac = '巨蟹座'; zodiacEmoji = '♋' }
  else if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) { zodiac = '狮子座'; zodiacEmoji = '♌' }
  else if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) { zodiac = '处女座'; zodiacEmoji = '♍' }
  else if ((month === 9 && day >= 23) || (month === 10 && day <= 23)) { zodiac = '天秤座'; zodiacEmoji = '♎' }
  else if ((month === 10 && day >= 24) || (month === 11 && day <= 22)) { zodiac = '天蝎座'; zodiacEmoji = '♏' }
  else if ((month === 11 && day >= 23) || (month === 12 && day <= 21)) { zodiac = '射手座'; zodiacEmoji = '♐' }
  else if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) { zodiac = '摩羯座'; zodiacEmoji = '♑' }
  else if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) { zodiac = '水瓶座'; zodiacEmoji = '♒' }
  else { zodiac = '双鱼座'; zodiacEmoji = '♓' }

  const zodiacStr = `${zodiacEmoji}${zodiac}`

  return { zodiac: zodiacStr, zodiacAnimal: zodiacAnimalStr }
}

// 将 cloud:// fileID 转为 https 临时链接
async function resolveCloudUrl(url) {
  if (!url || !url.startsWith('cloud://')) return url
  try {
    const res = await cloud.getTempFileURL({ fileList: [url] })
    return res.fileList[0]?.tempFileURL || url
  } catch (e) {
    return url
  }
}

// 确保 addresses 集合存在
async function ensureAddressesCollection() {
  try {
    // 尝试获取集合信息，如果不存在会报错
    await db.collection('addresses').count()
  } catch (e) {
    // 集合不存在，尝试创建一个空文档来创建集合
    if (e.message && e.message.includes('collection not exist')) {
      try {
        await db.collection('addresses').add({
          data: {
            _openid: 'system_init',
            contactName: '_init_',
            contactPhone: '00000000000',
            province: '',
            city: '',
            district: '',
            detailAddress: '',
            isDefault: false,
            createTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        })
        // 删除这条初始化记录
        const initRes = await db.collection('addresses').where({
          contactName: '_init_'
        }).get()
        if (initRes.data && initRes.data.length > 0) {
          await db.collection('addresses').doc(initRes.data[0]._id).remove()
        }
      } catch (addErr) {
        console.log('创建集合失败:', addErr)
      }
    }
  }
}

// 确保 phone_verify_temp 集合存在
async function ensurePhoneVerifyCollection() {
  try {
    // 尝试获取集合信息，如果不存在会报错
    await db.collection('phone_verify_temp').count()
  } catch (e) {
    // 集合不存在，尝试创建一个空文档来创建集合
    if (e.message && e.message.includes('collection not exist')) {
      try {
        const initRes = await db.collection('phone_verify_temp').add({
          data: {
            _openid: 'system_init',
            verifyId: '_init_',
            phoneNumber: '00000000000',
            code: '000000',
            createTime: db.serverDate(),
            expireAt: new Date(Date.now() + 5 * 60 * 1000) // 5分钟后过期
          }
        })
        // 删除这条初始化记录
        await db.collection('phone_verify_temp').doc(initRes._id).remove()
        console.log('phone_verify_temp 集合创建成功')
      } catch (addErr) {
        console.log('创建 phone_verify_temp 集合失败:', addErr)
      }
    }
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  // 支持 HTTP 触发：HTTP 请求时 event 结构不同
  let actualEvent = event
  if (event.httpMethod && event.body) {
    // HTTP 触发，解析 body
    try {
      actualEvent = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
      console.log('[HTTP触发] 解析后的数据:', actualEvent)
    } catch (e) {
      console.error('[HTTP触发] 解析 body 失败:', e)
      return { success: false, error: '请求格式错误' }
    }
  }
  
  const openid = wxContext.OPENID
  const unionid = wxContext.UNIONID // 多端统一标识

  const action = actualEvent.action || 'init'

  // ========== 初始化/获取用户 ==========
  if (action === 'init') {
    try {
      console.log('[userInit] 平台信息:', {
        openid,
        unionid,
        platform: wxContext.PLATFORM,
        source: wxContext.SOURCE
      })
      
      // 尝试多种方式查询用户
      let userData = null
      
      // 优先用 UNIONID 查询（多端统一）
      if (unionid) {
        const unionRes = await db.collection('users').where({ unionid: unionid }).get()
        userData = unionRes.data && unionRes.data[0]
        console.log('[userInit] UNIONID 查询结果:', userData ? '找到' : '未找到')
      }
      
      // 如果没有 UNIONID 或未找到，尝试用 _openid
      if (!userData) {
        const openRes = await db.collection('users').where({ _openid: openid }).get()
        userData = openRes.data && openRes.data[0]
        console.log('[userInit] _openid 查询结果:', userData ? '找到' : '未找到')
      }
      
      // 最后尝试用 openid 字段（兼容旧数据）
      if (!userData) {
        const oldRes = await db.collection('users').where({ openid: openid }).get()
        userData = oldRes.data && oldRes.data[0]
        console.log('[userInit] openid 字段查询结果:', userData ? '找到' : '未找到')
      }

      if (!userData) {
        // 新用户，创建记录
        const NEW_USER_POINTS = 50
        
        const addRes = await db.collection('users').add({
          data: {
            // 多端统一标识
            unionid: unionid || '', // 存储 UNIONID 用于跨平台识别
            // 不需要手动存储 openid，云数据库会自动添加 _openid
            nickName: '',
            avatarUrl: '',
            province: '',
            creditScore: 100,
            publishCount: 0,
            swapCount: 0,
            points: NEW_USER_POINTS,
            provincesBadges: [],
            createTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        })
        
        // 记录积分变动
        await db.collection('points_log').add({
          data: {
            _openid: openid,
            type: 'signup',
            amount: NEW_USER_POINTS,
            desc: '新用户注册奖励',
            createTime: db.serverDate()
          }
        })
        
        // ✅ 直接用 add 返回的 _id 精准查询，避免因索引延迟导致 points 读到 0
        try {
          const newUserRes = await db.collection('users').doc(addRes._id).get()
          userData = newUserRes.data
        } catch (e) {
          // 极少数情况下 doc 查询也失败，降级用 where 查
          const newUserRes = await db.collection('users').where({ _openid: openid }).get()
          userData = newUserRes.data && newUserRes.data[0]
        }
        
        // ✅ 兜底：如果 userData 里 points 字段为空（极端情况），用已知值补充
        if (userData && (userData.points === undefined || userData.points === null)) {
          userData.points = NEW_USER_POINTS
        }
        
        console.log('[userInit] 创建新用户成功, points:', userData && userData.points)
      } else {
        // 如果用户存在但没有 unionid，补充 unionid
        if (unionid && !userData.unionid) {
          await db.collection('users').doc(userData._id).update({
            data: { unionid: unionid }
          })
          console.log('[userInit] 已补充 unionid')
        }
      }

      // 不再转换 cloud:// 为临时链接，直接返回原始链接
      // 前端展示时由 WXML 处理（小程序 image 组件支持 cloud://）
      const avatarUrl = userData.avatarUrl || ''

      // 判断用户信息是否"未完善"：
      // 昵称为空、或是默认昵称"微信用户"，视为未设置
      // 头像为空、或是旧版默认头像路径，视为未设置
      const DEFAULT_NICK_NAMES = ['微信用户', 'WeChat User', '用户']
      const isDefaultNick = !userData.nickName || DEFAULT_NICK_NAMES.includes(userData.nickName.trim())
      const isDefaultAvatar = !avatarUrl || avatarUrl.includes('default-avatar') || avatarUrl.includes('defaultAvatar')
      // 若昵称或头像未完善，返回空值，让前端显示设置引导组件
      const returnNickName = isDefaultNick ? '' : userData.nickName
      const returnAvatarUrl = isDefaultAvatar ? '' : avatarUrl
      
      console.log('[init] 用户数据:', {
        _id: userData._id,
        phoneNumber: userData.phoneNumber,
        phoneVerified: userData.phoneVerified,
        isDefaultNick,
        isDefaultAvatar
      })

      return {
        success: true,
        openid,
        userInfo: {
          nickName: returnNickName,
          avatarUrl: returnAvatarUrl
        },
        creditScore: userData.creditScore || 100,
        province: userData.province || '',
        provincesBadges: userData.provincesBadges || [],
        points: userData.points || 0,
        // 手机号验证状态
        phoneNumber: userData.phoneNumber || '',
        phoneVerified: userData.phoneVerified || false
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ========== 更新资料(mine页面头像+昵称) ==========
  if (action === 'updateProfile') {
    try {
      console.log('[updateProfile] 收到请求, openid:', openid, 'actualEvent:', JSON.stringify(actualEvent))
      
      const unionid = wxContext.UNIONID
      
      // 尝试多种方式查询用户
      let currentUser = null
      
      // 优先用 UNIONID
      if (unionid) {
        const unionRes = await db.collection('users').where({ unionid: unionid }).get()
        currentUser = unionRes.data && unionRes.data[0]
        console.log('[updateProfile] UNIONID 查询:', currentUser ? '找到' : '未找到')
      }
      
      // 如果没有 UNIONID 或未找到，尝试用 _openid
      if (!currentUser) {
        const openRes = await db.collection('users').where({ _openid: openid }).get()
        currentUser = openRes.data && openRes.data[0]
        console.log('[updateProfile] _openid 查询:', currentUser ? '找到' : '未找到')
      }
      
      // 最后尝试用 openid 字段
      if (!currentUser) {
        const oldRes = await db.collection('users').where({ openid: openid }).get()
        currentUser = oldRes.data && oldRes.data[0]
        console.log('[updateProfile] openid 字段查询:', currentUser ? '找到' : '未找到')
      }

      if (!currentUser) {
        console.log('[updateProfile] 用户不存在')
        return { success: false, error: '用户不存在，请先点击头像完成登录' }
      }
      const currentProvince = currentUser.province

      // 构建更新数据 - 只更新非空值
      const updateData = { updateTime: db.serverDate() }

      // 头像：只接受 cloud:// 格式（防止临时链接覆盖原始链接）
      if (actualEvent.avatarUrl && actualEvent.avatarUrl.startsWith('cloud://')) {
        updateData.avatarUrl = actualEvent.avatarUrl
      }
      // 昵称：只接受非空字符串
      if (actualEvent.nickName && typeof actualEvent.nickName === 'string' && actualEvent.nickName.trim().length > 0) {
        updateData.nickName = actualEvent.nickName.trim()
      }

      // 只有当没有设置过家乡时，才能设置家乡
      if (actualEvent.province !== undefined) {
        if (currentProvince && currentProvince !== actualEvent.province) {
          return {
            success: false,
            error: '家乡已设置，不能修改',
            currentProvince: currentProvince
          }
        }
        if (!currentProvince && actualEvent.province) {
          updateData.province = actualEvent.province
        }
      }

      // 使用 _id 精确更新，避免 _openid/openid 字段混乱问题
      await db.collection('users').doc(currentUser._id).update({
        data: updateData
      })
      return { 
        success: true,
        openid: openid  // 返回 openid，供前端判断登录状态
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ========== 保存完整资料(头像、昵称、性别、生日) ==========
  if (action === 'saveProfile') {
    try {
      console.log('[saveProfile] 收到请求, openid:', openid)
      console.log('[saveProfile] actualEvent:', JSON.stringify(actualEvent))
      
      const unionid = wxContext.UNIONID
      
      // 尝试多种方式查询用户
      let currentUser = null
      
      // 优先用 UNIONID
      if (unionid) {
        const unionRes = await db.collection('users').where({ unionid: unionid }).get()
        currentUser = unionRes.data && unionRes.data[0]
      }
      
      // 如果没有 UNIONID 或未找到，尝试用 _openid
      if (!currentUser) {
        const openRes = await db.collection('users').where({ _openid: openid }).get()
        currentUser = openRes.data && openRes.data[0]
      }
      
      // 最后尝试用 openid 字段
      if (!currentUser) {
        const oldRes = await db.collection('users').where({ openid: openid }).get()
        currentUser = oldRes.data && oldRes.data[0]
      }
      
      console.log('[saveProfile] 查询结果:', currentUser ? '找到用户' : '未找到')

      if (!currentUser) {
        console.log('[saveProfile] 用户不存在, openid:', openid)
        return { success: false, error: '用户不存在，请先登录' }
      }

      console.log('[saveProfile] 当前用户ID:', currentUser._id)

      // 构建更新数据
      const updateData = { updateTime: db.serverDate() }

      // 头像和昵称：可随意修改（但头像只接受 cloud:// 格式）
      if (actualEvent.nickName !== undefined && actualEvent.nickName !== '') {
        updateData.nickName = actualEvent.nickName
      }
      if (actualEvent.avatarUrl && typeof actualEvent.avatarUrl === 'string' && actualEvent.avatarUrl.startsWith('cloud://')) {
        updateData.avatarUrl = actualEvent.avatarUrl
      }
      // 性别：可随意修改
      if (actualEvent.gender !== undefined && actualEvent.gender !== '') {
        updateData.gender = actualEvent.gender
      }
      // 省份：只能设置一次
      if (actualEvent.province !== undefined && actualEvent.province !== '') {
        if (currentUser.province && currentUser.province !== actualEvent.province) {
          return { success: false, error: '省份只能设置一次，无法修改' }
        }
        if (!currentUser.province) {
          updateData.province = actualEvent.province
        }
      }
      // 生日、属相、星座：只能设置一次
      if (actualEvent.birthday !== undefined && actualEvent.birthday !== '') {
        // 如果已有生日，且传来的新值不同，则拒绝修改
        if (currentUser.birthday && String(currentUser.birthday) !== String(actualEvent.birthday)) {
          return { success: false, error: '生日只能设置一次，无法修改' }
        }
        // 首次设置生日，或者值相同也不需要更新
        if (!currentUser.birthday) {
          updateData.birthday = actualEvent.birthday
          // 自动计算并存储属相和星座
          const zodiacInfo = calculateZodiacInfo(actualEvent.birthday)
          updateData.zodiac = zodiacInfo.zodiac
          updateData.zodiacAnimal = zodiacInfo.zodiacAnimal
        }
      }

      console.log('[saveProfile] 准备更新, updateData:', JSON.stringify(updateData))

      // 使用 _id 精确更新，避免 _openid/openid 字段混乱问题
      const updateRes = await db.collection('users').doc(currentUser._id).update({
        data: updateData
      })

      console.log('[saveProfile] 更新结果:', JSON.stringify(updateRes))
      return { success: true }
    } catch (e) {
      console.error('[saveProfile] 错误:', e.message, e.stack)
      return { success: false, error: e.message }
    }
  }

  // ========== 获取当前用户资料 ==========
  if (action === 'getMyProfile') {
    try {
      const unionid = wxContext.UNIONID
      
      // 尝试多种方式查询用户
      let user = null
      
      // 优先用 UNIONID
      if (unionid) {
        const unionRes = await db.collection('users').where({ unionid: unionid }).get()
        user = unionRes.data && unionRes.data[0]
      }
      
      // 如果没有 UNIONID 或未找到，尝试用 _openid
      if (!user) {
        const openRes = await db.collection('users').where({ _openid: openid }).get()
        user = openRes.data && openRes.data[0]
      }
      
      // 最后尝试用 openid 字段
      if (!user) {
        const oldRes = await db.collection('users').where({ openid: openid }).get()
        user = oldRes.data && oldRes.data[0]
      }

      if (!user) {
        return { success: false, error: '用户不存在' }
      }

      // 不再转换 cloud:// 为临时链接，直接返回原始链接
      // 前端 image 组件支持 cloud:// fileID
      const avatarUrl = user.avatarUrl || ''

      return {
        success: true,
        profile: {
          nickName: user.nickName || '',
          avatarUrl: avatarUrl,
          gender: user.gender || '',
          birthday: user.birthday || '',
          zodiac: user.zodiac || '',
          zodiacAnimal: user.zodiacAnimal || '',
          province: user.province || ''
        }
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ========== 获取统计数据 ==========
  if (action === 'getStats') {
    try {
      // 只使用 _openid 查询用户
      let userRes = await db.collection('users').where({ _openid: openid }).get()
      let user = userRes.data && userRes.data[0]

      if (!user) {
        return { success: false, error: '用户不存在' }
      }
      const u = user

      // 获取订单各状态计数（订单中存储的是用户的 openid，需要用 _openid 匹配）
      const pendingOrders = await db.collection('orders')
        .where({
          $or: [{ initiatorOpenid: openid }, { receiverOpenid: openid }],
          status: db.command.in(['pending', 'confirmed', 'shipped_a', 'shipped_b', 'shipped', 'received_a', 'received_b'])
        }).count()

      const orderStats = {
        pending: 0, confirmed: 0, shipped: 0, completed: 0
      }
      // 简化版：一次性统计
      const allOrders = await db.collection('orders')
        .where({
          $or: [{ initiatorOpenid: openid }, { receiverOpenid: openid }]
        })
        .field({ status: true })
        .get()

      ;(allOrders.data || []).forEach(o => {
        if (o.status === 'pending') orderStats.pending++
        else if (['confirmed'].includes(o.status)) orderStats.confirmed++
        else if (['shipped_a','shipped_b','shipped','received_a','received_b'].includes(o.status)) orderStats.shipped++
        else if (o.status === 'completed') orderStats.completed++
      })

      return {
        success: true,
        publishCount: u.publishCount || 0,
        swapCount: u.swapCount || 0,
        badgeCount: (u.provincesBadges || []).length,
        creditScore: u.creditScore || 100,
        points: u.points || 0,
        provincesBadges: u.provincesBadges || [],
        pendingCount: orderStats.pending + orderStats.confirmed,
        orderStats
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ========== 获取用户公开主页 ==========
  if (action === 'publicProfile') {
    try {
      // 修复：使用 actualEvent 而非 event，确保 HTTP 触发（APK/鸿蒙）时也能正确读取参数
      const { targetOpenid } = actualEvent
      if (!targetOpenid) return { success: false, message: '缺少参数' }

      const userFields = { nickName: true, avatarUrl: true, province: true, creditScore: true, publishCount: true, swapCount: true, provincesBadges: true, createTime: true, gender: true, _openid: true, openid: true }

      // 先用 _openid 查询
      let userRes = await db.collection('users').where({ _openid: targetOpenid })
        .field(userFields).limit(1).get()
      let user = userRes.data && userRes.data[0]

      // 如果没找到，尝试用 openid 字段查询（兼容旧数据）
      if (!user) {
        userRes = await db.collection('users').where({ openid: targetOpenid })
          .field(userFields).limit(1).get()
        user = userRes.data && userRes.data[0]
      }

      if (!user) return { success: false, message: '用户不存在' }

      // 使用正确的 openid 查询产品（优先用 _openid）
      const actualOpenid = user._openid || user.openid

      user.avatarUrl = await resolveCloudUrl(user.avatarUrl)

      // 用户所有特产（含各状态）
      // 注意：products 集合存的是 valueRange 字段，没有 valueMin/valueMax
      // 查询策略：先用 _openid 查，再用显式 openid 字段查，合并去重（兼容新旧数据）
      const productFields = { _id: true, name: true, images: true, province: true, category: true, valueRange: true, viewCount: true, isMystery: true, status: true }
      const statusFilter = _.in(['active', 'in_swap', 'swapped'])

      let productsRes = await db.collection('products')
        .where({ _openid: actualOpenid, status: statusFilter })
        .orderBy('createTime', 'desc').limit(100)
        .field(productFields)
        .get()

      // 如果 _openid 查不到，再用显式 openid 字段查（兼容旧数据或 openid 字段不一致的情况）
      if (!productsRes.data || productsRes.data.length === 0) {
        productsRes = await db.collection('products')
          .where({ openid: actualOpenid, status: statusFilter })
          .orderBy('createTime', 'desc').limit(100)
          .field(productFields)
          .get()
      }

      console.log('[publicProfile] 查询结果:', {
        targetOpenid,
        actualOpenid,
        productCount: productsRes.data.length
      })

      const products = []
      for (const p of productsRes.data) {
        let coverUrl = ''
        if (p.isMystery) {
          coverUrl = 'https://img.icons8.com/ios/200/999999/mystery.png'
        } else if (p.images && p.images[0]) {
          coverUrl = await resolveCloudUrl(p.images[0])
        }
        products.push({
          _id: p._id,
          name: p.isMystery ? '神秘特产' : p.name,
          coverUrl, province: p.province, category: p.category,
          valueRange: p.valueRange || '',
          viewCount: p.viewCount || 0,
          isMystery: p.isMystery || false,
          status: p.status || 'active'
        })
      }

      return {
        success: true,
        profile: {
          nickName: user.nickName || '', avatarUrl: user.avatarUrl || '',
          province: user.province || '', creditScore: user.creditScore || 100,
          publishCount: user.publishCount || 0, swapCount: user.swapCount || 0,
          provincesBadges: user.provincesBadges || [], createTime: user.createTime,
          gender: user.gender || ''
        },
        products
      }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 获取收货地址列表 ==========
  if (action === 'getAddressList') {
    try {
      // 确保 addresses 集合存在
      await ensureAddressesCollection()
      
      const addressRes = await db.collection('addresses').where({ _openid: openid }).get()
      return {
        success: true,
        addresses: addressRes.data || []
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ========== 保存收货地址（单条） ==========
  if (action === 'saveAddress') {
    try {
      // 确保 addresses 集合存在
      await ensureAddressesCollection()
      
      const address = actualEvent.address
      if (!address || !address.contactName || !address.contactPhone || !address.detailAddress) {
        return { success: false, message: '请填写完整信息' }
      }
      
      const addressRes = await db.collection('addresses').where({ _openid: openid }).count()
      if (addressRes.total >= 5 && !address._id) {
        return { success: false, message: '最多只能保存5个地址' }
      }
      
      // 如果设置为默认地址，先取消其他默认地址
      if (address.isDefault) {
        await db.collection('addresses').where({
          _openid: openid,
          isDefault: true
        }).update({
          data: { isDefault: false }
        })
      }
      
      if (address._id) {
        // 更新已有地址
        await db.collection('addresses').doc(address._id).update({
          data: {
            contactName: address.contactName,
            contactPhone: address.contactPhone,
            province: address.province || '',
            city: address.city || '',
            district: address.district || '',
            detailAddress: address.detailAddress,
            isDefault: address.isDefault || false,
            updateTime: db.serverDate()
          }
        })
      } else {
        // 新增地址
        await db.collection('addresses').add({
          data: {
            openid,
            contactName: address.contactName,
            contactPhone: address.contactPhone,
            province: address.province || '',
            city: address.city || '',
            district: address.district || '',
            detailAddress: address.detailAddress,
            isDefault: address.isDefault || false,
            createTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        })
      }
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ========== 删除收货地址 ==========
  if (action === 'deleteAddress') {
    try {
      const addressId = actualEvent.addressId
      if (!addressId) {
        return { success: false, message: '地址ID不能为空' }
      }
      await db.collection('addresses').doc(addressId).remove()
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ========== 设置默认收货地址 ==========
  if (action === 'setDefaultAddress') {
    try {
      const addressId = actualEvent.addressId
      if (!addressId) {
        return { success: false, message: '地址ID不能为空' }
      }
      
      // 取消其他默认地址
      await db.collection('addresses').where({
        _openid: openid,
        isDefault: true
      }).update({
        data: { isDefault: false }
      })
      
      // 设置当前为默认
      await db.collection('addresses').doc(addressId).update({
        data: { isDefault: true }
      })
      
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ========== 获取单个收货地址 ==========
  if (action === 'getAddress') {
    try {
      const addressId = actualEvent.addressId
      if (addressId) {
        // 获取指定地址
        const addressRes = await db.collection('addresses').doc(addressId).get()
        return {
          success: true,
          address: addressRes.data
        }
      } else {
        // 获取默认地址，如果没有默认则返回第一个
        const defaultRes = await db.collection('addresses').where({ _openid: openid, isDefault: true }).get()
        if (defaultRes.data && defaultRes.data.length > 0) {
          return { success: true, address: defaultRes.data[0] }
        }
        // 没有默认地址，返回第一个
        const listRes = await db.collection('addresses').where({ _openid: openid }).get()
        return {
          success: true,
          address: listRes.data && listRes.data[0] ? listRes.data[0] : null
        }
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ========== 获取邀请数据 ==========
  if (action === 'getInviteData') {
    try {
      // 获取或生成邀请码
      let userRes = await db.collection('users').where({ _openid: openid }).get()
      let user = userRes.data && userRes.data[0]

      if (!user) {
        userRes = await db.collection('users').where({ openid: openid }).get()
        user = userRes.data && userRes.data[0]
      }

      const actualOpenid = openid

      let inviteCode = user && user.inviteCode

      // 如果没有邀请码，生成一个
      if (!inviteCode) {
        inviteCode = 'INV' + openid.slice(-6).toUpperCase()
        // 使用 _id 精准更新
        await db.collection('users').doc(user._id).update({
          data: { inviteCode }
        })
      }

      // 获取邀请列表（查询 invitedBy = 当前用户 openid 的被邀请用户）
      // 云函数使用服务端权限，可查任意用户数据
      // 同时兼容 inviteCode 字段（老数据可能 invitedBy 存的是邀请码而非 openid）
      const inviteQueryValues = [openid]
      if (inviteCode && inviteCode !== openid) {
        inviteQueryValues.push(inviteCode)
      }
      console.log('[getInviteData] 查询邀请列表，invitedBy in:', inviteQueryValues)
      const inviteRes = await db.collection('users').where({
        invitedBy: _.in(inviteQueryValues)
      }).limit(100).get()
      console.log('[getInviteData] 查询结果数量:', inviteRes.data ? inviteRes.data.length : 0)

      // 获取邀请详情（包含首次互换状态）
      const inviteList = await Promise.all((inviteRes.data || []).map(async invitedUser => {
        // 转换 cloud:// 头像为 https 临时链接
        const avatarUrl = await resolveCloudUrl(invitedUser.avatarUrl || '')
        // 格式化邀请时间
        let inviteTime = ''
        if (invitedUser.inviteTime) {
          const d = new Date(invitedUser.inviteTime)
          inviteTime = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        }
        return {
          _id: invitedUser._id,
          openid: invitedUser.openid || invitedUser._openid,
          nickName: invitedUser.nickName || '好友',
          avatarUrl,
          inviteTime,
          swapCount: invitedUser.swapCount || 0,
          hasFirstSwap: (invitedUser.swapCount || 0) >= 1
        }
      }))

      // 计算累计奖励积分
      const INVITE_REWARD = 10
      const FIRST_SWAP_REWARD = 20
      const signupRewards = inviteList.length * INVITE_REWARD
      const firstSwapCount = inviteList.filter(f => f.hasFirstSwap).length
      const swapRewards = firstSwapCount * FIRST_SWAP_REWARD
      const totalRewards = signupRewards + swapRewards

      return {
        success: true,
        inviteCode,
        inviteCount: inviteList.length,
        inviteList,
        myPoints: user ? (user.points || 0) : 0,
        rewardSummary: {
          signupRewards,
          swapRewards,
          totalRewards,
          firstSwapCount
        }
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ========== 绑定邀请关系 ==========
  if (action === 'bindInvite') {
    try {
      const inviteCode = actualEvent.inviteCode

      if (!inviteCode) {
        return { success: false, error: '邀请码不能为空' }
      }

      // 查询当前用户
      let currentUserRes = await db.collection('users').where({ _openid: openid }).get()
      let currentUser = currentUserRes.data && currentUserRes.data[0]
      if (!currentUser) {
        // 兼容旧数据（openid 字段）
        currentUserRes = await db.collection('users').where({ openid: openid }).get()
        currentUser = currentUserRes.data && currentUserRes.data[0]
      }

      if (!currentUser) {
        return { success: false, error: '用户不存在，请先完成注册' }
      }

      if (currentUser.invitedBy) {
        return { success: false, error: '已绑定过邀请关系' }
      }

      // 查找邀请人
      const inviterRes = await db.collection('users').where({
        inviteCode: inviteCode
      }).get()

      const inviter = inviterRes.data && inviterRes.data[0]

      if (!inviter) {
        return { success: false, error: '邀请码无效' }
      }

      // 不能自己邀请自己
      if (inviter._openid === openid) {
        return { success: false, error: '不能邀请自己' }
      }

      // 绑定邀请关系（用 _id 精准更新）
      await db.collection('users').doc(currentUser._id).update({
        data: {
          invitedBy: inviter._openid,
          inviteTime: db.serverDate()
        }
      })

      // 给邀请人增加积分奖励（用 _id 精准更新）
      const INVITE_REWARD = 10
      await db.collection('users').doc(inviter._id).update({
        data: {
          points: _.inc(INVITE_REWARD),
          inviteCount: _.inc(1)
        }
      })

      // 记录邀请人积分变动
      await db.collection('points_log').add({
        data: {
          _openid: inviter._openid,
          type: 'invite',
          amount: INVITE_REWARD,
          desc: '邀请好友奖励',
          createTime: db.serverDate()
        }
      })

      // 记录被邀请用户的积分（用 _id 精准更新）
      await db.collection('users').doc(currentUser._id).update({
        data: {
          points: _.inc(INVITE_REWARD)
        }
      })

      await db.collection('points_log').add({
        data: {
          _openid: openid,
          type: 'invited',
          amount: INVITE_REWARD,
          desc: '被邀请注册奖励',
          createTime: db.serverDate()
        }
      })

      return {
        success: true,
        reward: INVITE_REWARD
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ========== 生成小程序码 ==========
  if (action === 'getQrcode') {
    try {
      const inviteCode = actualEvent.inviteCode
      if (!inviteCode) {
        return { success: false, error: '邀请码不能为空' }
      }

      // 生成小程序码
      const qrcodeRes = await cloud.openapi.wxacode.getUnlimited({
        scene: `inviteCode=${inviteCode}`,
        page: 'pages/index/index',
        width: 430,
        lineColor: { "r": 7, "g": 193, "b": 96 }
      })

      // 上传到云存储
      const uploadRes = await cloud.uploadFile({
        cloudPath: `qrcode/invite_${inviteCode}_${Date.now()}.png`,
        fileContent: qrcodeRes.buffer
      })

      return {
        success: true,
        fileID: uploadRes.fileID
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ========== 发送手机验证码 ==========
  if (action === 'sendPhoneVerifyCode') {
    try {
      const { cloudID, encryptedData, iv } = actualEvent
      
      if (!cloudID && !encryptedData) {
        return { success: false, message: '缺少手机号数据' }
      }

      // 通过 cloudID 解密手机号（推荐方式）
      let phoneNumber = ''
      
      if (cloudID) {
        try {
          const res = await cloud.getOpenData({
            list: [cloudID]
          })
          phoneNumber = res.list[0].data.phoneNumber
        } catch (e) {
          console.error('cloudID 解密失败:', e)
        }
      }
      
      // 如果 cloudID 失败，尝试用 encryptedData
      if (!phoneNumber && encryptedData) {
        try {
          const res = await cloud.openapi.phonenumber.getPhoneNumber({
            code: encryptedData
          })
          phoneNumber = res.phoneInfo.phoneNumber
        } catch (e) {
          console.error('encryptedData 解密失败:', e)
        }
      }

      if (!phoneNumber) {
        return { success: false, message: '获取手机号失败' }
      }

      // 生成验证码（6位数字）
      const code = Math.random().toString().slice(-6)
      
      // 生成验证ID
      const verifyId = `verify_${openid}_${Date.now()}`
      
      // 确保集合存在
      await ensurePhoneVerifyCollection()
      
      // 存储验证信息到临时表（5分钟有效期）
      await db.collection('phone_verify_temp').add({
        data: {
          verifyId,
          openid,
          phoneNumber,
          code,
          createdAt: db.serverDate(),
          expireAt: new Date(Date.now() + 5 * 60 * 1000), // 5分钟后过期
          verified: false
        }
      })

      // TODO: 实际项目中应该调用短信服务发送验证码
      // 这里为了演示,我们直接返回验证码(生产环境严禁这样做!)
      console.log(`[DEV] 验证码已生成: ${phoneNumber} -> ${code}`)

      // 开发环境：直接返回验证码（生产环境必须删除这行!）
      return {
        success: true,
        verifyId,
        phoneNumber,
        // 开发模式：返回验证码（生产环境必须删除!）
        _devCode: code
      }
    } catch (e) {
      console.error('发送验证码失败:', e)
      return { success: false, message: e.message }
    }
  }

  // ========== 重发验证码 ==========
  if (action === 'resendPhoneVerifyCode') {
    try {
      const { verifyId } = actualEvent
      
      if (!verifyId) {
        return { success: false, message: '缺少验证ID' }
      }

      // 查找原验证记录
      const verifyRes = await db.collection('phone_verify_temp').where({
        verifyId,
        openid,
        verified: false
      }).get()

      const verifyData = verifyRes.data && verifyRes.data[0]
      if (!verifyData) {
        return { success: false, message: '验证记录不存在或已过期' }
      }

      // 检查发送频率限制
      const timeSinceLastSend = Date.now() - new Date(verifyData.createdAt).getTime();
      if (timeSinceLastSend < 60 * 1000) {
        const waitSeconds = Math.ceil((60 * 1000 - timeSinceLastSend) / 1000);
        return { 
          success: false, 
          message: `请${waitSeconds}秒后再试` 
        };
      }

      // 生成新验证码
      const code = Math.random().toString().slice(-6)
      
      // 调用短信服务发送验证码
      if (smsClient) {
        const smsResult = await smsClient.sendVerifyCode(verifyData.phoneNumber, code, '5');
        
        if (!smsResult.success) {
          console.error('[SMS] 重发短信失败:', smsResult.errorMessage);
          return { 
            success: false, 
            message: '短信发送失败,请稍后重试',
            error: smsResult.errorMessage
          };
        }
        
        // 更新验证码
        await db.collection('phone_verify_temp').doc(verifyData._id).update({
          data: {
            code,
            createdAt: db.serverDate(),
            expireAt: new Date(Date.now() + 5 * 60 * 1000)
          }
        })
        
        console.log('[SMS] 重发短信成功:', verifyData.phoneNumber, 'bizId:', smsResult.bizId);
        
        return {
          success: true,
          message: '验证码已重新发送'
        };
      } else {
        // 短信服务未初始化,使用开发模式
        console.warn('[SMS] 短信服务未初始化,使用开发模式');
        
        // 更新验证码
        await db.collection('phone_verify_temp').doc(verifyData._id).update({
          data: {
            code,
            createdAt: db.serverDate(),
            expireAt: new Date(Date.now() + 5 * 60 * 1000)
          }
        })
        
        console.log(`[DEV] 验证码已重发: ${verifyData.phoneNumber} -> ${code}`)
        
        return {
          success: true,
          _devCode: code, // 仅开发环境使用
          message: '验证码已重发(开发模式)'
        };
      }
    } catch (e) {
      console.error('重发验证码失败:', e)
      return { success: false, message: e.message }
    }
  }

  // ========== 验证手机验证码 ==========
  if (action === 'verifyPhoneCode') {
    try {
      const { verifyId, code, phoneNumber } = actualEvent
      
      if (!verifyId || !code || !phoneNumber) {
        return { success: false, message: '参数不完整' }
      }

      // 查找验证记录
      const verifyRes = await db.collection('phone_verify_temp').where({
        verifyId,
        openid,
        phoneNumber,
        verified: false
      }).get()

      const verifyData = verifyRes.data && verifyRes.data[0]
      
      if (!verifyData) {
        return { success: false, message: '验证记录不存在或已过期' }
      }

      // 检查是否过期
      if (new Date() > verifyData.expireAt) {
        return { success: false, message: '验证码已过期' }
      }

      // 验证码是否正确
      if (verifyData.code !== code) {
        return { success: false, message: '验证码错误' }
      }

      // 标记为已验证
      await db.collection('phone_verify_temp').doc(verifyData._id).update({
        data: { verified: true }
      })

      // 查询用户
      let userRes = await db.collection('users').where({ _openid: openid }).get()
      let user = userRes.data && userRes.data[0]
      
      if (!user) {
        userRes = await db.collection('users').where({ openid: openid }).get()
        user = userRes.data && userRes.data[0]
      }

      if (!user) {
        return { success: false, message: '用户不存在' }
      }

      // 检查是否已验证过手机号（只能验证一次）
      if (user.phoneVerified) {
        return { 
          success: false, 
          message: '您已验证过手机号，每个用户只能验证一次' 
        }
      }

      // 首次验证奖励信用分
      const creditReward = 5

      // 更新用户手机号信息（用 _id 精准更新）
      await db.collection('users').doc(user._id).update({
        data: {
          phoneNumber,
          phoneVerified: true,
          phoneVerifyTime: db.serverDate(),
          creditScore: _.inc(creditReward),
          updateTime: db.serverDate()
        }
      })

      // 记录信用分变动（使用 credit_logs 表，字段名与其他地方一致）
      await db.collection('credit_logs').add({
        data: {
          openid: openid,
          delta: creditReward,
          reason: '首次验证手机号',
          createTime: db.serverDate()
        }
      })

      return {
        success: true,
        phoneNumber,
        creditScore: (user.creditScore || 100) + creditReward,
        isFirstVerify: true
      }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  // ========== 微信原生手机号验证(无需验证码) ==========
  if (action === 'verifyPhoneNumber') {
    try {
      const { code, cloudID, encryptedData, iv } = actualEvent
      
      // 微信新版本使用 code,旧版本使用 cloudID 或 encryptedData
      let phoneNumber = ''
      
      // 方式1: 使用 code (推荐,微信新版)
      if (code) {
        try {
          const res = await cloud.openapi.phonenumber.getPhoneNumber({
            code: code
          })
          phoneNumber = res.phoneInfo.phoneNumber
          console.log('[verifyPhoneNumber] 通过 code 获取手机号成功:', phoneNumber)
        } catch (e) {
          console.error('[verifyPhoneNumber] code 方式失败:', e)
        }
      }
      
      // 方式2: 使用 cloudID
      if (!phoneNumber && cloudID) {
        try {
          const res = await cloud.getOpenData({
            list: [cloudID]
          })
          phoneNumber = res.list[0].data.phoneNumber
          console.log('[verifyPhoneNumber] 通过 cloudID 获取手机号成功:', phoneNumber)
        } catch (e) {
          console.error('[verifyPhoneNumber] cloudID 方式失败:', e)
        }
      }
      
      // 方式3: 使用 encryptedData (旧版本,已不推荐)
      if (!phoneNumber && encryptedData) {
        return { 
          success: false, 
          message: '请更新微信版本后重试' 
        }
      }
      
      if (!phoneNumber) {
        return { success: false, message: '获取手机号失败,请重试' }
      }

      // 查询用户
      let userRes = await db.collection('users').where({ _openid: openid }).get()
      let user = userRes.data && userRes.data[0]
      
      if (!user) {
        userRes = await db.collection('users').where({ openid: openid }).get()
        user = userRes.data && userRes.data[0]
      }

      if (!user) {
        return { success: false, message: '用户不存在' }
      }

      // 检查是否已验证过手机号（只能验证一次）
      if (user.phoneVerified) {
        return { 
          success: false, 
          message: '您已验证过手机号，每个用户只能验证一次' 
        }
      }

      // 首次验证奖励信用分
      const creditReward = 5

      // 更新用户手机号信息
      const updateResult = await db.collection('users').doc(user._id).update({
        data: {
          phoneNumber,
          phoneVerified: true,
          phoneVerifyTime: db.serverDate(),
          creditScore: _.inc(creditReward),
          updateTime: db.serverDate()
        }
      })
      
      console.log('[verifyPhoneNumber] 更新数据库结果:', updateResult)
      console.log('[verifyPhoneNumber] 更新的手机号:', phoneNumber)

      // 记录信用分变动（使用 credit_logs 表，字段名与其他地方一致）
      await db.collection('credit_logs').add({
        data: {
          openid: openid,
          delta: creditReward,
          reason: '首次验证手机号',
          createTime: db.serverDate()
        }
      })

      return {
        success: true,
        phoneNumber,
        creditScore: (user.creditScore || 100) + creditReward,
        isFirstVerify: true
      }
    } catch (e) {
      console.error('验证手机号失败:', e)
      return { success: false, message: e.message }
    }
  }

  // ========== 调试：获取用户原始数据 ==========
  if (action === 'debugGetUser') {
    try {
      let userRes = await db.collection('users').where({ _openid: openid }).get()
      let user = userRes.data && userRes.data[0]
      
      if (!user) {
        userRes = await db.collection('users').where({ openid: openid }).get()
        user = userRes.data && userRes.data[0]
      }

      if (!user) {
        return { success: false, error: '用户不存在' }
      }

      return {
        success: true,
        rawUser: user,
        stats: {
          publishCount: user.publishCount || 0,
          swapCount: user.swapCount || 0,
          provincesBadges: user.provincesBadges || [],
          badgeCount: (user.provincesBadges || []).length,
          points: user.points || 0,
          creditScore: user.creditScore || 100
        }
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ========== 调试：修复用户积分 ==========
  if (action === 'debugFixPoints') {
    try {
      const targetPoints = actualEvent.points || 50
      
      let userRes = await db.collection('users').where({ _openid: openid }).get()
      let user = userRes.data && userRes.data[0]
      
      if (!user) {
        userRes = await db.collection('users').where({ openid: openid }).get()
        user = userRes.data && userRes.data[0]
      }

      if (!user) {
        return { success: false, error: '用户不存在' }
      }

      const oldPoints = user.points || 0
      
      // 使用 _id 精准更新
      await db.collection('users').doc(user._id).update({
        data: { 
          points: targetPoints,
          updateTime: db.serverDate()
        }
      })

      return {
        success: true,
        message: '积分已修复',
        oldPoints,
        newPoints: targetPoints
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ========== 修复我的发布数 ==========
  if (action === 'fixMyPublishCount') {
    try {
      // 获取当前用户
      let userRes = await db.collection('users').where({ _openid: openid }).get()
      let user = userRes.data && userRes.data[0]
      
      if (!user) {
        userRes = await db.collection('users').where({ openid: openid }).get()
        user = userRes.data && userRes.data[0]
      }

      if (!user) {
        return { success: false, error: '用户不存在' }
      }

      // 统计实际特产数量（所有状态，使用 _openid 精准定位）
      const countRes = await db.collection('products')
        .where({ _openid: openid })
        .count()
      
      const actualCount = countRes.total
      const storedCount = user.publishCount || 0
      
      // 更新发布数
      await db.collection('users').doc(user._id).update({
        data: { 
          publishCount: actualCount,
          updateTime: db.serverDate()
        }
      })

      console.log(`[fixMyPublishCount] 用户 ${openid} 发布数已修复: ${storedCount} -> ${actualCount}`)

      return {
        success: true,
        message: actualCount !== storedCount ? '发布数已修复' : '发布数正确，无需修复',
        oldCount: storedCount,
        newCount: actualCount,
        fixed: actualCount !== storedCount
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ========== 修复我的统计数据（发布数+分享数）==========
  if (action === 'fixMyStats') {
    try {
      // 获取当前用户
      let userRes = await db.collection('users').where({ _openid: openid }).get()
      let user = userRes.data && userRes.data[0]
      
      if (!user) {
        userRes = await db.collection('users').where({ openid: openid }).get()
        user = userRes.data && userRes.data[0]
      }

      if (!user) {
        return { success: false, error: '用户不存在' }
      }

      // 1. 统计实际特产数量（所有状态，兼容 _openid 和 openid 两种字段）
      // 注意：不能用 $or 在 count() 上，要分两次查再取最大值（云数据库限制）
      const productCountByOpenid = await db.collection('products')
        .where({ openid: openid })
        .count()
      const productCountByUnderOpenid = await db.collection('products')
        .where({ _openid: openid })
        .count()
      // 取两者中较大的值（防止字段不一致时取到 0）
      const actualPublishCount = Math.max(productCountByOpenid.total, productCountByUnderOpenid.total)
      const storedPublishCount = user.publishCount || 0
      
      // 2. 统计实际完成的订单数（分享数）
      const completedOrdersRes = await db.collection('orders')
        .where({
          $or: [{ initiatorOpenid: openid }, { receiverOpenid: openid }],
          status: 'completed'
        })
        .count()
      const actualSwapCount = completedOrdersRes.total
      const storedSwapCount = user.swapCount || 0
      
      // 3. 更新统计数据
      await db.collection('users').doc(user._id).update({
        data: { 
          publishCount: actualPublishCount,
          swapCount: actualSwapCount,
          updateTime: db.serverDate()
        }
      })

      console.log(`[fixMyStats] 用户 ${openid} 数据已修复: 发布数 ${storedPublishCount} -> ${actualPublishCount}, 分享数 ${storedSwapCount} -> ${actualSwapCount}`)

      return {
        success: true,
        message: '统计数据已修复',
        publishCount: { old: storedPublishCount, new: actualPublishCount, fixed: storedPublishCount !== actualPublishCount },
        swapCount: { old: storedSwapCount, new: actualSwapCount, fixed: storedSwapCount !== actualSwapCount }
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  return { success: false, message: '未知操作' }
}
