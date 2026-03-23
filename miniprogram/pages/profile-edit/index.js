// pages/profile-edit/index.js - 个人资料编辑
const { callCloud, toast, showLoading, uploadImage } = require('../../utils/util')
const { PROVINCES } = require('../../utils/constants')

Page({
  data: {
    profile: {},
    originalProfile: {},  // 记录原始资料，用于判断哪些字段真正改变的
    originalAvatarUrl: '', // 原始 cloud:// 头像链接，防止临时链接覆盖
    defaultAvatar: '/images/default-avatar.png',
    zodiac: { emoji: '', name: '' },
    zodiacAnimal: { emoji: '', name: '' },
    age: 0,
    isProfileLocked: false,
    hasChanges: false,
    provinces: PROVINCES,
    provinceIndex: -1,
    showProvinceModal: false,
    // 热门省份（前10个最常用）
    hotProvinces: [],
    // 按字母分组的省份
    provinceGroups: []
  },

  onLoad() {
    this.initProvinceData()
    this.loadProfile()
  },

  // 初始化省份数据（热门 + 分组）
  initProvinceData() {
    const { provinces } = this.data
    
    // 热门省份（用户量最大的10个：北京、上海、广东、浙江、江苏、山东、湖北、河北、河南、四川）
    const hotCodes = ['BJ', 'SH', 'GD', 'ZJ', 'JS', 'SD', 'HB', 'HE', 'HA', 'SC']
    const hotProvinces = hotCodes.map((code, idx) => {
      const prov = provinces.find(p => p.code === code)
      return prov ? { ...prov, index: provinces.findIndex(p => p.code === code) } : null
    }).filter(Boolean)

    // 按首字母分组
    const pinyinMap = {
      '安': 'A', '北': 'B', '重': 'C', '福': 'F', '甘': 'G', '广': 'G', '贵': 'G',
      '海': 'H', '河': 'H', '黑': 'H', '湖': 'H', '吉': 'J', '江': 'J', '辽': 'L',
      '内': 'N', '宁': 'N', '青': 'Q', '山': 'S', '上': 'S', '四': 'S', '天': 'T',
      '西': 'X', '新': 'X', '云': 'Y', '浙': 'Z', '香': 'X', '澳': 'A', '台': 'T'
    }
    
    const groups = {}
    provinces.forEach((prov, idx) => {
      const firstChar = prov.name.charAt(0)
      const letter = pinyinMap[firstChar] || 'Z'
      if (!groups[letter]) {
        groups[letter] = { letter, provinces: [] }
      }
      groups[letter].provinces.push({ ...prov, index: idx })
    })
    
    // 转换为数组并按字母排序
    const provinceGroups = Object.values(groups).sort((a, b) => a.letter.localeCompare(b.letter))

    this.setData({ hotProvinces, provinceGroups })
  },

  async loadProfile() {
    try {
      const res = await callCloud('userInit', { action: 'getMyProfile' })
      if (res && res.success) {
        const p = res.profile || {}
        // 保存原始资料的副本
        this.setData({
          profile: p,
          originalProfile: JSON.parse(JSON.stringify(p)),
          // 保存原始 cloud:// 链接，防止临时链接被写回数据库
          originalAvatarUrl: p.avatarUrl || ''
        })

        // 如果有生日，计算属相、星座、年龄
        if (p.birthday) {
          this.calculateZodiac(p.birthday)
        }

        // 如果服务端已存了 zodiac/zodiacAnimal 字符串，也解析用于展示
        if (p.zodiacAnimal && typeof p.zodiacAnimal === 'string' && !this.data.zodiacAnimal.name) {
          // 服务端存的格式如 "🐇兔"
          const emoji = p.zodiacAnimal.slice(0, 2)
          const name = p.zodiacAnimal.slice(2)
          this.setData({ zodiacAnimal: { emoji, name } })
        }
        if (p.zodiac && typeof p.zodiac === 'string' && !this.data.zodiac.name) {
          const emoji = p.zodiac.slice(0, 1)
          const name = p.zodiac.slice(1)
          this.setData({ zodiac: { emoji, name } })
        }

        // 找到省份索引
        const provinceIndex = p.province ? this.data.provinces.findIndex(prov => prov.code === p.province) : -1

        // 检查是否锁定（生日设置后即锁定）
        this.setData({
          isProfileLocked: !!p.birthday,
          provinceIndex: provinceIndex >= 0 ? provinceIndex : -1
        })
      }
    } catch (e) {
      console.error('加载资料失败', e)
    }
  },

  // 计算属相、星座、年龄
  calculateZodiac(birthday) {
    const date = new Date(birthday)
    if (isNaN(date.getTime())) return

    // 年龄
    const now = new Date()
    let age = now.getFullYear() - date.getFullYear()
    const monthDiff = now.getMonth() - date.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
      age--
    }
    this.setData({ age })

    // 属相（正确处理负数取模）
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
    const year = date.getFullYear()
    // 正确处理负数取模：((year - 2020) % 12 + 12) % 12
    const zodiacIndex = ((year - 2020) % 12 + 12) % 12
    this.setData({ zodiacAnimal: zodiacAnimals[zodiacIndex] })

    // 星座
    const month = date.getMonth() + 1
    const day = date.getDate()
    const constellations = [
      { name: '白羊座', emoji: '♈' },
      { name: '金牛座', emoji: '♉' },
      { name: '双子座', emoji: '♊' },
      { name: '巨蟹座', emoji: '♋' },
      { name: '狮子座', emoji: '♌' },
      { name: '处女座', emoji: '♍' },
      { name: '天秤座', emoji: '♎' },
      { name: '天蝎座', emoji: '♏' },
      { name: '射手座', emoji: '♐' },
      { name: '摩羯座', emoji: '♑' },
      { name: '水瓶座', emoji: '♒' },
      { name: '双鱼座', emoji: '♓' }
    ]

    let foundZodiac = constellations[11] // 默认双鱼
    if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) foundZodiac = constellations[0]
    else if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) foundZodiac = constellations[1]
    else if ((month === 5 && day >= 21) || (month === 6 && day <= 21)) foundZodiac = constellations[2]
    else if ((month === 6 && day >= 22) || (month === 7 && day <= 22)) foundZodiac = constellations[3]
    else if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) foundZodiac = constellations[4]
    else if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) foundZodiac = constellations[5]
    else if ((month === 9 && day >= 23) || (month === 10 && day <= 23)) foundZodiac = constellations[6]
    else if ((month === 10 && day >= 24) || (month === 11 && day <= 22)) foundZodiac = constellations[7]
    else if ((month === 11 && day >= 23) || (month === 12 && day <= 21)) foundZodiac = constellations[8]
    else if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) foundZodiac = constellations[9]
    else if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) foundZodiac = constellations[10]
    
    this.setData({ zodiac: foundZodiac })
  },

  // 选择省份（打开弹窗）
  onProvinceTap() {
    const { originalProfile } = this.data
    // 如果已经设置过省份，不能修改
    if (originalProfile.province) {
      toast('省份只能设置一次')
      return
    }
    this.setData({ showProvinceModal: true })
  },

  // 关闭省份弹窗
  closeProvinceModal() {
    this.setData({ showProvinceModal: false })
  },

  // 阻止滚动穿透
  preventTouchMove() {},

  // 选择省份
  selectProvince(e) {
    const { code, index } = e.currentTarget.dataset
    const idx = parseInt(index)
    this.setData({
      provinceIndex: idx,
      'profile.province': code,
      showProvinceModal: false,
      hasChanges: true
    })
  },

  // 生日选择变化
  onBirthdayChange(e) {
    if (this.data.isProfileLocked) {
      toast('生日只能设置一次，无法修改')
      return
    }
    const birthday = e.detail.value
    this.setData({
      'profile.birthday': birthday,
      hasChanges: true
    })
    this.calculateZodiac(birthday)
  },

  // 更改头像
  changeAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        showLoading('上传中...')
        try {
          const fileID = await uploadImage(tempFilePath, 'avatars')
          wx.hideLoading()
          this.setData({ 
            'profile.avatarUrl': fileID,
            hasChanges: true
          })
          toast('头像上传成功', 'success')
        } catch (e) {
          wx.hideLoading()
          toast('上传失败')
        }
      },
      fail: (e) => {
        console.log('选择图片取消或失败', e)
      }
    })
  },

  // 昵称输入
  onNicknameInput(e) {
    this.setData({ 
      'profile.nickName': e.detail.value,
      hasChanges: true
    })
  },

  // 选择性别
  selectGender(e) {
    this.setData({ 
      'profile.gender': e.currentTarget.dataset.gender,
      hasChanges: true
    })
  },

  // 选择省份
  onProvinceChange(e) {
    const idx = Number(e.detail.value)
    const province = this.data.provinces[idx]
    this.setData({ 
      provinceIndex: idx,
      'profile.province': province.code,
      hasChanges: true
    })
  },

  // 保存
  async saveProfile() {
    const { profile, isProfileLocked, originalAvatarUrl } = this.data

    // 校验昵称
    if (!profile.nickName || profile.nickName.trim().length === 0) {
      toast('请输入昵称')
      return
    }

    showLoading('保存中...')
    try {
      // 头像：只在上传了新头像（cloud:// fileID）时才发送
      // 如果头像没变（可能是临时 https 链接），不发给云函数，避免覆盖原始 cloud:// 链接
      const avatarToSend = (profile.avatarUrl && profile.avatarUrl.startsWith('cloud://')) ? profile.avatarUrl : ''

      const res = await callCloud('userInit', {
        action: 'saveProfile',
        nickName: profile.nickName || '',
        avatarUrl: avatarToSend,
        gender: profile.gender !== undefined ? profile.gender : '',
        province: profile.province || '',
        birthday: (!isProfileLocked && profile.birthday) ? profile.birthday : ''
      })

      wx.hideLoading()

      if (res && res.success) {
        toast('保存成功')
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        toast(res?.error || '保存失败')
      }
    } catch (e) {
      wx.hideLoading()
      console.error('[saveProfile] 错误:', e)
      toast('保存失败')
    }
  }
})
