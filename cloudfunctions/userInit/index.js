// cloudfunctions/userInit/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

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

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const action = event.action || 'init'

  // ========== 初始化/获取用户 ==========
  if (action === 'init') {
    try {
      // 查询用户（支持重装后 openid 丢失的情况）
      let userRes = await db.collection('users').where({ openid }).get()
      let userData = userRes.data && userRes.data[0]

      if (!userData) {
        userRes = await db.collection('users').where({ _openid: openid }).get()
        userData = userRes.data && userRes.data[0]
      }

      if (!userData) {
        // 新用户，创建记录
        await db.collection('users').add({
          data: {
            openid,
            nickName: '',
            avatarUrl: '',
            province: '',
            creditScore: 100,
            publishCount: 0,
            swapCount: 0,
            provincesBadges: [],
            createTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        })
        const newUserRes = await db.collection('users').where({ _openid: openid }).get()
        userData = newUserRes.data && newUserRes.data[0]
      }

      return {
        success: true,
        openid,
        userInfo: {
          nickName: userData.nickName || '',
          avatarUrl: userData.avatarUrl || ''
        },
        creditScore: userData.creditScore || 100,
        province: userData.province || '',
        provincesBadges: userData.provincesBadges || []
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ========== 更新资料 ==========
  if (action === 'updateProfile') {
    try {
      // 获取当前用户信息，检查是否已有家乡（支持重装后 openid 丢失的情况）
      let currentUserRes = await db.collection('users').where({ openid }).get()
      let currentUser = currentUserRes.data && currentUserRes.data[0]

      if (!currentUser) {
        currentUserRes = await db.collection('users').where({ _openid: openid }).get()
        currentUser = currentUserRes.data && currentUserRes.data[0]
      }

      if (!currentUser) {
        return { success: false, error: '用户不存在' }
      }
      const currentProvince = currentUser.province

      // 构建更新数据
      const updateData = {
        nickName: event.nickName !== undefined ? event.nickName : currentUser.nickName,
        avatarUrl: event.avatarUrl !== undefined ? event.avatarUrl : currentUser.avatarUrl,
        updateTime: db.serverDate()
      }

      // 只有当没有设置过家乡时，才能设置家乡
      // 如果已有家乡且新传来的province与当前不同，拒绝修改
      if (event.province !== undefined) {
        if (currentProvince && currentProvince !== event.province) {
          // 已设置过家乡，不能修改
          return {
            success: false,
            error: '家乡已设置，不能修改',
            currentProvince: currentProvince
          }
        }
        if (!currentProvince && event.province) {
          // 首次设置家乡
          updateData.province = event.province
        }
      }

      await db.collection('users').where({ _openid: openid }).update({
        data: updateData
      })
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ========== 获取统计数据 ==========
  if (action === 'getStats') {
    try {
      // 查询用户（支持重装后 openid 丢失的情况）
      let userRes = await db.collection('users').where({ openid }).get()
      let user = userRes.data && userRes.data[0]

      if (!user) {
        userRes = await db.collection('users').where({ _openid: openid }).get()
        user = userRes.data && userRes.data[0]
      }

      if (!user) {
        return { success: false, error: '用户不存在' }
      }
      const u = user

      // 获取订单各状态计数
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
      const { targetOpenid } = event
      if (!targetOpenid) return { success: false, message: '缺少参数' }

      const userFields = { nickName: true, avatarUrl: true, province: true, creditScore: true, publishCount: true, swapCount: true, provincesBadges: true, createTime: true, openid: true }

      // 先按自定义 openid 字段查询
      let userRes = await db.collection('users').where({ openid: targetOpenid })
        .field(userFields).limit(1).get()
      let user = userRes.data && userRes.data[0]

      // fallback: 按系统 _openid 字段查询
      if (!user) {
        userRes = await db.collection('users').where({ _openid: targetOpenid })
          .field(userFields).limit(1).get()
        user = userRes.data && userRes.data[0]
      }

      if (!user) return { success: false, message: '用户不存在' }

      // 后续查产品使用实际的 openid 字段
      const actualOpenid = user.openid || targetOpenid

      user.avatarUrl = await resolveCloudUrl(user.avatarUrl)

      // 用户所有特产（含各状态）
      const productsRes = await db.collection('products')
        .where({ openid: actualOpenid, status: _.in(['active', 'in_swap', 'swapped']) })
        .orderBy('createTime', 'desc').limit(100)
        .field({ _id: true, name: true, images: true, province: true, category: true, valueMin: true, valueMax: true, viewCount: true, isMystery: true, status: true })
        .get()

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
          valueMin: p.valueMin, valueMax: p.valueMax,
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
          provincesBadges: user.provincesBadges || [], createTime: user.createTime
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
      
      const addressRes = await db.collection('addresses').where({ openid }).get()
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
      
      const address = event.address
      if (!address || !address.contactName || !address.contactPhone || !address.detailAddress) {
        return { success: false, message: '请填写完整信息' }
      }
      
      const addressRes = await db.collection('addresses').where({ openid }).count()
      if (addressRes.total >= 5 && !address._id) {
        return { success: false, message: '最多只能保存5个地址' }
      }
      
      // 如果设置为默认地址，先取消其他默认地址
      if (address.isDefault) {
        await db.collection('addresses').where({
          openid,
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
      const addressId = event.addressId
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
      const addressId = event.addressId
      if (!addressId) {
        return { success: false, message: '地址ID不能为空' }
      }
      
      // 取消其他默认地址
      await db.collection('addresses').where({
        openid,
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
      const addressId = event.addressId
      if (addressId) {
        // 获取指定地址
        const addressRes = await db.collection('addresses').doc(addressId).get()
        return {
          success: true,
          address: addressRes.data
        }
      } else {
        // 获取默认地址，如果没有默认则返回第一个
        const defaultRes = await db.collection('addresses').where({ openid, isDefault: true }).get()
        if (defaultRes.data && defaultRes.data.length > 0) {
          return { success: true, address: defaultRes.data[0] }
        }
        // 没有默认地址，返回第一个
        const listRes = await db.collection('addresses').where({ openid }).get()
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
      // 获取或生成邀请码（支持重装后 openid 丢失的情况）
      let userRes = await db.collection('users').where({ openid }).get()
      let user = userRes.data && userRes.data[0]

      if (!user) {
        userRes = await db.collection('users').where({ _openid: openid }).get()
        user = userRes.data && userRes.data[0]
      }

      const actualOpenid = user && (user.openid || openid)

      let inviteCode = user && user.inviteCode

      // 如果没有邀请码，生成一个
      if (!inviteCode && actualOpenid) {
        inviteCode = 'INV' + actualOpenid.slice(-6).toUpperCase()
        // 使用 _openid 精准定位
        await db.collection('users').where({ _openid: openid }).update({
          data: { inviteCode }
        })
      }

      // 获取邀请列表（查询邀请人为当前 openid 的用户）
      const inviteRes = await db.collection('users').where({
        invitedBy: actualOpenid
      }).get()

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
      const inviteCode = event.inviteCode

      if (!inviteCode) {
        return { success: false, error: '邀请码不能为空' }
      }

      // 查询当前用户（支持重装后 openid 丢失的情况）
      let currentUserRes = await db.collection('users').where({ openid }).get()
      let currentUser = currentUserRes.data && currentUserRes.data[0]
      if (!currentUser) {
        currentUserRes = await db.collection('users').where({ _openid: openid }).get()
        currentUser = currentUserRes.data && currentUserRes.data[0]
      }

      if (!currentUser) {
        return { success: false, error: '用户不存在，请先完成注册' }
      }

      if (currentUser.invitedBy) {
        return { success: false, error: '已绑定过邀请关系' }
      }

      // 查找邀请人（邀请人必须有自定义 openid 字段）
      const inviterRes = await db.collection('users').where({
        inviteCode: inviteCode
      }).get()

      const inviter = inviterRes.data && inviterRes.data[0]

      if (!inviter) {
        return { success: false, error: '邀请码无效' }
      }

      // 不能自己邀请自己
      const inviterOpenid = inviter.openid || inviter._openid
      const myOpenid = currentUser.openid || openid
      if (inviterOpenid === myOpenid) {
        return { success: false, error: '不能邀请自己' }
      }

      // 绑定邀请关系（用 _openid 精准定位）
      await db.collection('users').where({ _openid: openid }).update({
        data: {
          invitedBy: inviterOpenid,
          inviteTime: db.serverDate()
        }
      })

      // 给邀请人增加积分奖励
      const INVITE_REWARD = 10
      const inviterActualOpenid = inviter.openid || inviter._openid
      await db.collection('users').where({ _openid: inviterActualOpenid }).update({
        data: {
          points: _.inc(INVITE_REWARD),
          inviteCount: _.inc(1)
        }
      })

      // 记录邀请人积分变动
      await db.collection('points_log').add({
        data: {
          openid: inviterActualOpenid,
          type: 'invite',
          amount: INVITE_REWARD,
          desc: '邀请好友奖励',
          createTime: db.serverDate()
        }
      })

      // 记录被邀请用户的积分
      await db.collection('users').where({ _openid: openid }).update({
        data: {
          points: _.inc(INVITE_REWARD)
        }
      })

      await db.collection('points_log').add({
        data: {
          openid: openid,
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
      const inviteCode = event.inviteCode
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

  return { success: false, message: '未知操作' }
}
