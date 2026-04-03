// pages/ai-face/index.js - 三合一版本
const app = getApp()

Page({
  data: {
    // Tab
    currentTab: 'camera',
    
    // 相机相关
    analyzed: false,
    cameraPosition: 'front',
    photoUrl: '',
    
    // 用户数据
    todayCount: 0,
    freeCount: 3,
    usedCount: 0,
    balance: 0,
    needPay: false,
    pricePerPhoto: 0.10,
    
    // 消费明细
    costDetail: {
      freeUsed: 0,
      paidCount: 0,
      totalCost: 0
    },
    
    // 日历
    currentYear: 2026,
    currentMonth: 4,
    weekDays: ['日', '一', '二', '三', '四', '五', '六'],
    calendarDays: [],
    selectedDate: '',
    selectedWeek: '',
    selectedDayRecords: [],
    currentRecordIndex: 0,
    currentRecord: null,
    monthStats: { count: 0, avgScore: 0, maxScore: 0 },
    
    // 设置
    reminderEnabled: false,
    reminderTime: '09:00',
    subscribed: false,
    stats: { totalDays: 0, consecutiveDays: 0, totalPhotos: 0 },
    
    // 邀请二维码
    inviteCode: '',
    qrcodeUrl: '',
    
    // 分析结果
    currentDate: '',
    analysis: {
      score: 88,
      features: [
        { name: '五官', score: 90, color: '#9CAF88' },
        { name: '皮肤', score: 85, color: '#E8B86D' },
        { name: '气质', score: 88, color: '#9CAF88' },
        { name: '笑容', score: 92, color: '#E8B86D' }
      ],
      age: 25,
      height: 168,
      career: '设计师',
      temperament: '知性优雅',
      comment: '您的五官比例协调，气质出众...',
      fortune: '今日颜值在线...'
    }
  },

  onLoad() {
    this.initCalendar()
    this.loadUserData()
    this.loadSettings()
    this.loadStats()
    this.checkCameraAuth()
    this.loadInviteData() // 加载邀请二维码
  },

  onShow() {
    this.loadUserData()
    this.loadSettings()
    this.loadStats()
  },

  // 检查相机权限
  async checkCameraAuth() {
    try {
      const res = await wx.getSetting()
      console.log('当前授权状态:', res.authSetting)
      
      // 相机权限在 scope.camera，但小程序不会自动弹出申请
      // 需要在用户点击拍照时主动申请
    } catch (e) {
      console.log('获取授权状态失败:', e)
    }
  },

  // ========== Tab 切换 ==========
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
    
    if (tab === 'calendar') {
      this.generateCalendar()
      this.loadMonthData()  // 加载当月数据
      // 默认选中今天
      const today = `${this.data.currentYear}-${String(this.data.currentMonth).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`
      this.onDayClick({ currentTarget: { dataset: { date: today } } })
    } else if (tab === 'settings') {
      this.loadSettings()
      this.loadStats()
    }
  },

  switchToCamera() {
    this.setData({ currentTab: 'camera' })
  },

  // ========== 邀请二维码 ==========
  async loadInviteData() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'userInit',
        data: { action: 'getInviteData' }
      })
      if (res.result) {
        const inviteCode = res.result.inviteCode || ''
        this.setData({ inviteCode })
        if (inviteCode) {
          this.generateInviteQrcode(inviteCode)
        }
      }
    } catch (e) {
      console.error('加载邀请数据失败:', e)
      // 使用openid作为备选
      const openid = app.globalData.openid
      if (openid) {
        const inviteCode = openid.slice(-6).toUpperCase()
        this.setData({ inviteCode })
        this.generateInviteQrcode(inviteCode)
      }
    }
  },

  async generateInviteQrcode(inviteCode) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'userInit',
        data: { action: 'getQrcode', inviteCode: inviteCode }
      })
      if (res.result && res.result.fileID) {
        const fileRes = await wx.cloud.getTempFileURL({
          fileList: [res.result.fileID]
        })
        if (fileRes.fileList && fileRes.fileList[0]) {
          this.setData({ qrcodeUrl: fileRes.fileList[0].tempFileURL })
        }
      }
    } catch (e) {
      console.error('生成二维码失败:', e)
    }
  },

  // ========== 用户数据 ==========
  async loadUserData() {
    try {
      console.log('开始加载用户数据...')
      const res = await wx.cloud.callFunction({ name: 'getAIFaceUserData' })
      console.log('getAIFaceUserData 返回:', res.result)
      
      if (res.result && res.result.success) {
        const { balance, todayCount, freeCount, pricePerPhoto } = res.result.data
        console.log('解析数据:', { balance, todayCount, freeCount, pricePerPhoto })
        
        const paidCount = Math.max(0, todayCount - freeCount)
        // 云函数返回的 balance 和 pricePerPhoto 已经是元
        const balanceYuan = Number(balance)
        const priceYuan = Number(pricePerPhoto)
        const newData = {
          balance: balanceYuan.toFixed(2),
          usedCount: todayCount,
          freeCount,
          pricePerPhoto: priceYuan.toFixed(2),
          needPay: todayCount >= freeCount,
          todayCount,
          costDetail: {
            freeUsed: Math.min(todayCount, freeCount),
            paidCount: paidCount,
            totalCost: (paidCount * priceYuan).toFixed(2)
          }
        }
        console.log('设置数据:', newData)
        this.setData(newData)
      } else {
        console.error('加载用户数据失败:', res.result.error)
        wx.showToast({ title: '加载数据失败', icon: 'none' })
      }
    } catch (e) {
      console.error('加载用户数据失败:', e)
      wx.showToast({ title: '加载数据失败', icon: 'none' })
    }
  },

  // ========== 相机功能 ==========
  async takePhoto() {
    // 检查相机权限
    try {
      const setting = await wx.getSetting()
      if (!setting.authSetting['scope.camera']) {
        try {
          await wx.authorize({ scope: 'scope.camera' })
        } catch (authErr) {
          wx.showModal({
            title: '需要相机权限',
            content: '拍照需要访问相机权限，请在设置中开启',
            confirmText: '去设置',
            success: (res) => { if (res.confirm) wx.openSetting() }
          })
          return
        }
      }
    } catch (e) {
      console.log('检查权限失败:', e)
    }

    // 检查余额（余额不足时提示）
    if (this.data.needPay && this.data.balance < 0.1) {
      wx.showModal({
        title: '余额不足',
        content: '今日免费次数已用完，余额不足0.1元，请先充值',
        confirmText: '去充值',
        success: (res) => { if (res.confirm) wx.navigateTo({ url: '/pages/wallet/index' }) }
      })
      return
    }
    
    const ctx = wx.createCameraContext()
    ctx.takePhoto({
      quality: 'normal',
      success: (res) => { this.analyzePhoto(res.tempImagePath) },
      fail: (err) => { 
        console.error('拍照失败:', err)
        wx.showToast({ title: '拍照失败', icon: 'none' }) 
      }
    })
  },

  chooseFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => { this.analyzePhoto(res.tempFiles[0].tempFilePath) }
    })
  },

  async analyzePhoto(photoPath) {
    wx.showLoading({ title: 'AI 分析中...', mask: true })
    try {
      const compressedPath = await this.compressImage(photoPath)
      const cloudPath = `ai-face/${Date.now()}.jpg`
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: compressedPath })
      const fileRes = await wx.cloud.getTempFileURL({ fileList: [uploadRes.fileID] })
      const photoUrl = fileRes.fileList[0].tempFileURL
      
      const analysisData = this.generateMockAnalysis()
      
      const saveRes = await wx.cloud.callFunction({
        name: 'saveAIFaceRecord',
        data: { photoUrl, analysis: analysisData }
      })
      
      if (saveRes.result && saveRes.result.limitReached) {
        wx.showToast({ title: '今日已达上限(20次)', icon: 'none' })
      }
      
      this.setData({
        analyzed: true,
        photoUrl,
        analysis: analysisData,
        todayCount: saveRes.result.todayCount || 1
      })
      this.loadUserData() // 刷新余额和消费明细
      this.loadStats() // 刷新拍照统计
    } catch (e) {
      wx.hideLoading()
      this.setData({ analyzed: true, photoUrl, analysis: this.generateMockAnalysis() })
    }
    wx.hideLoading()
  },

  compressImage(src) {
    return new Promise((resolve, reject) => {
      const fs = wx.getFileSystemManager()
      fs.getFileInfo({
        filePath: src,
        success: (fileInfo) => {
          const originalSize = fileInfo.size / 1024
          if (originalSize <= 30) { resolve(src); return }
          
          const ratio = Math.sqrt(30 / originalSize)
          const quality = Math.min(Math.floor(ratio * 100), 80)
          
          wx.compressImage({
            src: src,
            quality: quality,
            success: (res) => {
              fs.getFileInfo({
                filePath: res.tempFilePath,
                success: (compressedInfo) => {
                  const compressedSize = compressedInfo.size / 1024
                  if (compressedSize <= 30) {
                    resolve(res.tempFilePath)
                  } else {
                    this.compressImageRecursive(res.tempFilePath, 30, resolve, reject)
                  }
                },
                fail: reject
              })
            },
            fail: reject
          })
        },
        fail: reject
      })
    })
  },

  compressImageRecursive(src, targetSizeKB, resolve, reject, attempt = 1) {
    if (attempt > 3) { resolve(src); return }
    const fs = wx.getFileSystemManager()
    fs.getFileInfo({
      filePath: src,
      success: (fileInfo) => {
        const currentSize = fileInfo.size / 1024
        if (currentSize <= targetSizeKB) { resolve(src); return }
        const quality = Math.max(20, Math.floor((targetSizeKB / currentSize) * 70))
        wx.compressImage({
          src: src,
          quality: quality,
          success: (res) => { this.compressImageRecursive(res.tempFilePath, targetSizeKB, resolve, reject, attempt + 1) },
          fail: reject
        })
      },
      fail: reject
    })
  },

  generateMockAnalysis() {
    const careers = ['设计师', '教师', '医生', '律师', '程序员', '销售', '艺术家', '企业家']
    const temperaments = ['知性优雅', '阳光开朗', '沉稳内敛', '活泼可爱', '成熟稳重', '文艺清新']
    const score = Math.floor(Math.random() * 15) + 80
    
    // 六十四卦名称
    const hexagrams = ['乾为天', '坤为地', '水雷屯', '山水蒙', '水天需', '天水讼', '地水师', '水地比', 
                       '风天小畜', '天泽履', '地天泰', '天地否', '天火同人', '火天大有', '地山谦', '雷地豫',
                       '泽雷随', '山风蛊', '地泽临', '风地观', '火雷噬嗑', '山火贲', '山地剥', '地雷复',
                       '天雷无妄', '山天大畜', '山雷颐', '泽风大过', '坎为水', '离为火', '泽山咸', '雷风恒']
    // 八卦
    const trigrams = ['☰ 乾', '☷ 坤', '☳ 震', '☵ 坎', '☶ 艮', '☲ 离', '☴ 巽', '☱ 兑']
    // 五行
    const wuxing = ['金', '木', '水', '火', '土']
    // 生肖
    const zodiac = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪']
    // 十二时辰
    const shichen = ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时', '申时', '酉时', '戌时', '亥时']
    // 方位
    const directions = ['东', '南', '西', '北', '东南', '西南', '东北', '西北']
    // 幸运色
    const luckyColors = ['赤红', '明黄', '翠绿', '靛蓝', '紫罗兰', '橙红', '银白', '墨黑']
    // 幸运数字
    const luckyNumbers = ['3', '6', '8', '9', '12', '16', '18', '28']
    
    const todayHexagram = hexagrams[Math.floor(Math.random() * hexagrams.length)]
    const todayTrigram = trigrams[Math.floor(Math.random() * trigrams.length)]
    const todayWuxing = wuxing[Math.floor(Math.random() * wuxing.length)]
    const todayZodiac = zodiac[Math.floor(Math.random() * zodiac.length)]
    const todayShichen = shichen[Math.floor(Math.random() * shichen.length)]
    const todayDirection = directions[Math.floor(Math.random() * directions.length)]
    const todayColor = luckyColors[Math.floor(Math.random() * luckyColors.length)]
    const todayNumber = luckyNumbers[Math.floor(Math.random() * luckyNumbers.length)]
    
    // 生成详细运势分析
    const fortuneDetails = [
      {
        title: '六爻卦象',
        icon: '☯️',
        content: `今日得「${todayHexagram}」卦，${todayTrigram}为主卦。卦象显示：颜值即气场，气场即运势。面相饱满者，今日贵人运旺；眉目清秀者，桃花运至。`,
        advice: '宜微笑示人，忌愁眉苦脸'
      },
      {
        title: '易经解读',
        icon: '📜',
        content: `《易经》有云："${todayWuxing}生旺，气色红润"。今日五行主${todayWuxing}，与面相相生，主智慧、人缘双收。额头发亮主财运，嘴角上扬主桃花。`,
        advice: '上午宜处理重要事务，下午宜社交会友'
      },
      {
        title: '马仙儿术数',
        icon: '🔮',
        content: `仙家看相：今日${todayShichen}为吉时，${todayDirection}方为财位。${todayZodiac}年生人今日运势最佳，宜主动出击。颜值分数${score}为「上吉」之数。`,
        advice: `幸运色：${todayColor} | 幸运数：${todayNumber}`
      },
      {
        title: '面相风水',
        icon: '🎭',
        content: '天庭饱满主官运，地阁方圆主财运，眉清目秀主桃花，鼻直口方主贵气。今日面相磁场与宇宙能量共振，宜展现最佳状态。',
        advice: '保持自信微笑，正能量自然回流'
      }
    ]
    
    // 生成综合运势
    const fortuneSummary = `【${todayHexagram}·${todayWuxing}旺相】今日颜值指数${score}分，面相显示「${todayTrigram}」卦象。额头饱满主智慧，眉清目秀得人缘，${todayShichen}后运势渐旺。${todayDirection}方遇贵人，${todayColor}色增运势，数字${todayNumber}最吉利。`
    
    return {
      score: score,
      features: [
        { name: '五官', score: Math.floor(Math.random() * 20) + 80, color: '#9CAF88' },
        { name: '皮肤', score: Math.floor(Math.random() * 20) + 80, color: '#E8B86D' },
        { name: '气质', score: Math.floor(Math.random() * 20) + 80, color: '#9CAF88' },
        { name: '笑容', score: Math.floor(Math.random() * 20) + 80, color: '#E8B86D' }
      ],
      age: Math.floor(Math.random() * 15) + 20,
      height: Math.floor(Math.random() * 30) + 155,
      career: careers[Math.floor(Math.random() * careers.length)],
      temperament: temperaments[Math.floor(Math.random() * temperaments.length)],
      comment: '您的五官比例协调，气质出众，给人一种知性优雅的感觉。',
      fortune: fortuneSummary,
      fortuneDetails: fortuneDetails,
      luckyInfo: {
        color: todayColor,
        number: todayNumber,
        direction: todayDirection,
        shichen: todayShichen,
        hexagram: todayHexagram,
        wuxing: todayWuxing
      }
    }
  },

  switchCamera() {
    this.setData({ cameraPosition: this.data.cameraPosition === 'front' ? 'back' : 'front' })
  },

  retake() {
    this.setData({ analyzed: false, photoUrl: '' })
  },

  async saveResult() {
    try {
      wx.showLoading({ title: '保存中...' })
      if (!this.data.photoUrl) throw new Error('图片地址为空')
      
      // 生成分享图片（包含二维码）
      const shareImagePath = await this.generateShareImage()
      
      await wx.saveImageToPhotosAlbum({ filePath: shareImagePath })
      wx.hideLoading()
      wx.showToast({ title: '已保存到相册', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      if (e.errMsg && e.errMsg.includes('auth deny')) {
        wx.showModal({ title: '需要权限', content: '保存图片需要访问相册权限', confirmText: '去设置', success: (res) => { if (res.confirm) wx.openSetting() } })
      } else {
        wx.showToast({ title: '保存失败：' + (e.message || ''), icon: 'none' })
      }
    }
  },

  // 生成分享图片（包含二维码和颜值分析结果）
  generateShareImage() {
    return new Promise((resolve, reject) => {
      const ctx = wx.createCanvasContext('shareCanvas')
      const { analysis, photoUrl, qrcodeUrl } = this.data
      
      // 画布尺寸
      const canvasWidth = 750
      const canvasHeight = 1330
      
      // 背景
      ctx.setFillStyle('#F5F5F0')
      ctx.fillRect(0, 0, canvasWidth, canvasHeight)
      
      // 标题
      ctx.setFillStyle('#4A4A42')
      ctx.setFontSize(40)
      ctx.setTextAlign('center')
      ctx.fillText('AI颜值分析报告', canvasWidth / 2, 80)
      
      // 分数
      ctx.setFillStyle('#9CAF88')
      ctx.setFontSize(120)
      ctx.fillText(analysis.score + '', canvasWidth / 2, 220)
      ctx.setFontSize(32)
      ctx.setFillStyle('#7A8B6E')
      ctx.fillText('颜值分', canvasWidth / 2, 270)
      
      // 绘制照片（圆形裁剪）
      ctx.save()
      ctx.beginPath()
      ctx.arc(canvasWidth / 2, 450, 150, 0, Math.PI * 2)
      ctx.clip()
      
      // 下载照片和二维码
      Promise.all([
        this.downloadImage(photoUrl),
        qrcodeUrl ? this.downloadImage(qrcodeUrl) : Promise.resolve(null)
      ]).then(([photoRes, qrRes]) => {
        // 绘制照片
        ctx.drawImage(photoRes, canvasWidth / 2 - 150, 300, 300, 300)
        ctx.restore()
        
        // 特征分析
        ctx.setFillStyle('#4A4A42')
        ctx.setFontSize(28)
        ctx.setTextAlign('left')
        let y = 650
        analysis.features.forEach((feature, index) => {
          ctx.fillText(`${feature.name}: ${feature.score}分`, 100, y + index * 50)
        })
        
        // 评语
        ctx.setFillStyle('#7A8B6E')
        ctx.setFontSize(24)
        ctx.setTextAlign('center')
        ctx.fillText(analysis.comment, canvasWidth / 2, 900)
        
        // 运势
        ctx.setFillStyle('#E8B86D')
        ctx.setFontSize(26)
        // 截断运势文字避免过长
        let fortuneText = analysis.fortune || ''
        if (fortuneText.length > 26) {
          fortuneText = fortuneText.substring(0, 26) + '...'
        }
        ctx.fillText('今日运势: ' + fortuneText, canvasWidth / 2, 950)
        
        // 绘制二维码区域背景
        ctx.setFillStyle('#FFFFFF')
        ctx.fillRect(50, 1000, canvasWidth - 100, 280)
        ctx.setStrokeStyle('#E8E8E0')
        ctx.strokeRect(50, 1000, canvasWidth - 100, 280)
        
        // 绘制二维码
        if (qrRes) {
          ctx.drawImage(qrRes, 80, 1020, 180, 180)
        }
        
        // 二维码右侧文字
        ctx.setFillStyle('#4A4A42')
        ctx.setFontSize(32)
        ctx.setTextAlign('left')
        ctx.fillText('扫码测颜值', 300, 1070)
        
        ctx.setFillStyle('#7A8B6E')
        ctx.setFontSize(24)
        ctx.fillText('长按识别小程序码', 300, 1110)
        ctx.fillText('邀请好友一起测颜值', 300, 1145)
        ctx.fillText('还能获得积分奖励哦~', 300, 1180)
        
        // 底部提示
        ctx.setFillStyle('#9CAF88')
        ctx.setFontSize(22)
        ctx.setTextAlign('center')
        ctx.fillText('—— 特产互换小程序 · AI颜值分析 ——', canvasWidth / 2, 1310)
        
        ctx.draw(false, () => {
          setTimeout(() => {
            wx.canvasToTempFilePath({
              canvasId: 'shareCanvas',
              success: (res) => resolve(res.tempFilePath),
              fail: reject
            })
          }, 300)
        })
      }).catch(reject)
    })
  },

  // 下载图片辅助方法
  downloadImage(url) {
    return new Promise((resolve, reject) => {
      if (!url) {
        reject(new Error('图片URL为空'))
        return
      }
      wx.downloadFile({
        url: url,
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(res.tempFilePath)
          } else {
            reject(new Error('图片下载失败'))
          }
        },
        fail: reject
      })
    })
  },

  // 分享到朋友圈（生成海报）
  shareToMoments() {
    this.saveResult()
  },

  // ========== 日历功能 ==========
  initCalendar() {
    const now = new Date()
    const currentDate = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
    const calendarDays = []
    const weekDays = ['日', '一', '二', '三', '四', '五', '六']
    for (let i = -3; i <= 3; i++) {
      const date = new Date(now)
      date.setDate(date.getDate() + i)
      calendarDays.push({
        day: date.getDate(),
        week: weekDays[date.getDay()],
        active: i === 0
      })
    }
    this.setData({ currentDate, calendarDays })
  },

  generateCalendar() {
    const { currentYear, currentMonth } = this.data
    const firstDay = new Date(currentYear, currentMonth - 1, 1)
    const lastDay = new Date(currentYear, currentMonth, 0)
    const startWeek = firstDay.getDay()
    const daysInMonth = lastDay.getDate()
    
    const calendarDays = []
    const prevMonthLastDay = new Date(currentYear, currentMonth - 1, 0).getDate()
    
    for (let i = startWeek - 1; i >= 0; i--) {
      const day = prevMonthLastDay - i
      const date = `${currentYear}-${String(currentMonth - 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      calendarDays.push({ day, date, isCurrentMonth: false, isToday: false, hasData: false })
    }
    
    const today = new Date()
    for (let i = 1; i <= daysInMonth; i++) {
      const date = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(i).padStart(2, '0')}`
      const isToday = today.getFullYear() === currentYear && today.getMonth() + 1 === currentMonth && today.getDate() === i
      calendarDays.push({ day: i, date, isCurrentMonth: true, isToday, hasData: false, score: 0 })
    }
    
    const remaining = 42 - calendarDays.length
    for (let i = 1; i <= remaining; i++) {
      const date = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
      calendarDays.push({ day: i, date, isCurrentMonth: false, isToday: false, hasData: false })
    }
    
    this.setData({ calendarDays })
  },

  async loadMonthData() {
    try {
      const db = wx.cloud.database()
      const openid = app.globalData.openid
      if (!openid) {
        console.warn('[loadMonthData] openid 尚未就绪，跳过')
        return
      }
      const { currentYear, currentMonth } = this.data
      const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
      const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`
      
      // 获取当月所有记录
      const res = await db.collection('ai_face_records')
        .where({ 
          _openid: app.globalData.openid, 
          date: db.command.gte(startDate).and(db.command.lte(endDate)) 
        })
        .orderBy('date', 'asc')
        .orderBy('timestamp', 'asc')
        .get()
      
      const records = res.data || []
      
      // 按日期分组，获取每天的第一条记录用于日历显示
      const dateMap = {}
      records.forEach(r => {
        if (!dateMap[r.date]) {
          dateMap[r.date] = r
        }
      })
      
      const calendarDays = this.data.calendarDays.map(day => {
        const record = dateMap[day.date]
        return record ? { ...day, hasData: true, score: record.score } : day
      })
      
      // 计算统计数据
      const scores = records.map(r => r.score).filter(s => s)
      const monthStats = {
        count: records.length,
        avgScore: scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 0,
        maxScore: scores.length > 0 ? Math.max(...scores) : 0
      }
      
      this.setData({ calendarDays, monthStats })
    } catch (e) {
      console.error('加载数据失败:', e)
    }
  },

  async onDayClick(e) {
    const date = e.currentTarget.dataset.date
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const week = weekDays[new Date(date).getDay()]
    const records = await this.loadDayRecords(date)
    
    this.setData({
      selectedDate: date,
      selectedWeek: week,
      selectedDayRecords: records,
      currentRecordIndex: 0,
      currentRecord: records.length > 0 ? records[0] : null
    })
  },

  async loadDayRecords(date) {
    try {
      const openid = app.globalData.openid
      if (!openid) {
        console.warn('[loadDayRecords] openid 尚未就绪，跳过')
        return []
      }
      const db = wx.cloud.database()
      const res = await db.collection('ai_face_records')
        .where({ _openid: app.globalData.openid, date })
        .orderBy('timestamp', 'desc')
        .limit(20)
        .get()
      
      const records = res.data || []
      records.forEach(record => {
        const time = new Date(record.timestamp)
        record.time = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
      })
      return records
    } catch (e) {
      console.error('加载记录失败:', e)
      return []
    }
  },

  switchRecord(e) {
    const index = e.currentTarget.dataset.index
    this.setData({ currentRecordIndex: index, currentRecord: this.data.selectedDayRecords[index] })
  },

  prevRecord() {
    if (this.data.currentRecordIndex > 0) {
      const newIndex = this.data.currentRecordIndex - 1
      this.setData({ currentRecordIndex: newIndex, currentRecord: this.data.selectedDayRecords[newIndex] })
    }
  },

  nextRecord() {
    if (this.data.currentRecordIndex < this.data.selectedDayRecords.length - 1) {
      const newIndex = this.data.currentRecordIndex + 1
      this.setData({ currentRecordIndex: newIndex, currentRecord: this.data.selectedDayRecords[newIndex] })
    }
  },

  prevMonth() {
    let { currentYear, currentMonth } = this.data
    currentMonth--
    if (currentMonth < 1) { currentMonth = 12; currentYear-- }
    this.setData({ currentYear, currentMonth })
    this.generateCalendar()
    this.loadMonthData()
  },

  nextMonth() {
    let { currentYear, currentMonth } = this.data
    currentMonth++
    if (currentMonth > 12) { currentMonth = 1; currentYear++ }
    this.setData({ currentYear, currentMonth })
    this.generateCalendar()
    this.loadMonthData()
  },

  goToToday() {
    const now = new Date()
    this.setData({ currentYear: now.getFullYear(), currentMonth: now.getMonth() + 1 })
    this.generateCalendar()
    this.loadMonthData()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    this.onDayClick({ currentTarget: { dataset: { date: today } } })
  },

  // ========== 设置功能 ==========
  async loadSettings() {
    try {
      console.log('开始加载设置...')
      const res = await wx.cloud.callFunction({ name: 'getAIFaceSettings' })
      console.log('加载设置结果:', res)
      
      if (res.result && res.result.success) {
        const { reminderEnabled, reminderTime, subscribed } = res.result.data
        console.log('设置数据:', { reminderEnabled, reminderTime, subscribed })
        this.setData({
          reminderEnabled: reminderEnabled === true,
          reminderTime: reminderTime || '09:00',
          subscribed: subscribed === true
        })
      } else {
        console.error('加载设置失败:', res.result.error)
        wx.showToast({ title: '加载设置失败', icon: 'none' })
      }
    } catch (e) {
      console.error('加载设置失败:', e)
      wx.showToast({ title: '加载设置失败', icon: 'none' })
    }
  },

  async loadStats() {
    try {
      const openid = app.globalData.openid
      if (!openid) {
        console.warn('[loadStats] openid 尚未就绪，跳过')
        return
      }
      
      const db = wx.cloud.database()
      const totalRes = await db.collection('ai_face_records').where({ _openid: openid }).count()
      const recordsRes = await db.collection('ai_face_records')
        .where({ _openid: openid })
        .orderBy('date', 'desc')
        .get()
      
      const records = recordsRes.data
      const uniqueDays = [...new Set(records.map(r => r.date))]
      
      let consecutiveDays = 0
      const today = new Date()
      for (let i = 0; i < uniqueDays.length; i++) {
        const checkDate = new Date(today)
        checkDate.setDate(checkDate.getDate() - i)
        const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`
        if (uniqueDays.includes(dateStr)) { consecutiveDays++ } else { break }
      }
      
      this.setData({
        'stats.totalDays': uniqueDays.length,
        'stats.consecutiveDays': consecutiveDays,
        'stats.totalPhotos': totalRes.total
      })
    } catch (e) {
      console.error('加载统计失败:', e)
    }
  },

  async toggleReminder(e) {
    const enabled = e.detail.value
    console.log('切换提醒开关:', enabled)
    try {
      const res = await wx.cloud.callFunction({
        name: 'updateAIFaceSettings',
        data: { reminderEnabled: enabled }
      })
      console.log('更新提醒设置结果:', res)
      if (res.result && res.result.success) {
        this.setData({ reminderEnabled: enabled })
        if (enabled && !this.data.subscribed) {
          wx.showToast({ title: '请订阅消息', icon: 'none' })
        }
      } else {
        throw new Error(res.result.error || '更新失败')
      }
    } catch (e) {
      console.error('更新设置失败:', e)
      wx.showToast({ title: '设置保存失败', icon: 'none' })
      this.setData({ reminderEnabled: !enabled })
    }
  },

  async onTimeChange(e) {
    const time = e.detail.value
    console.log('选择时间:', time)
    try {
      const res = await wx.cloud.callFunction({ 
        name: 'updateAIFaceSettings', 
        data: { reminderTime: time } 
      })
      console.log('更新时间结果:', res)
      if (res.result && res.result.success) {
        this.setData({ reminderTime: time })
      } else {
        throw new Error(res.result.error || '更新失败')
      }
    } catch (e) {
      console.error('更新时间失败:', e)
      wx.showToast({ title: '时间保存失败', icon: 'none' })
    }
  },

  async requestSubscribe() {
    try {
      const res = await wx.requestSubscribeMessage({
        tmplIds: ['_GXTKy-pEGT4zntoE8b3xYkPaX2ho1sRbCVkPkOM0YE']
      })
      console.log('订阅结果:', res)
      const subscribeResult = res['_GXTKy-pEGT4zntoE8b3xYkPaX2ho1sRbCVkPkOM0YE']
      if (subscribeResult === 'accept') {
        const updateRes = await wx.cloud.callFunction({ 
          name: 'updateAIFaceSettings', 
          data: { subscribed: true } 
        })
        console.log('更新订阅状态结果:', updateRes)
        if (updateRes.result && updateRes.result.success) {
          this.setData({ subscribed: true })
          wx.showToast({ title: '订阅成功', icon: 'success' })
        } else {
          throw new Error(updateRes.result.error || '更新失败')
        }
      } else {
        wx.showToast({ title: '需要订阅才能收到提醒', icon: 'none' })
      }
    } catch (e) {
      console.error('订阅失败:', e)
      wx.showToast({ title: '订阅失败', icon: 'none' })
    }
  },

  // ========== 通用 ==========
  goToWallet() {
    wx.navigateTo({ url: '/pages/wallet/index' })
  },

  onShareAppMessage() {
    return {
      title: `我的颜值评分 ${this.data.analysis.score} 分，快来测测你的！`,
      path: '/pages/ai-face/index',
      imageUrl: this.data.photoUrl || '/images/share-ai-face.png'
    }
  }
})
