// pages/publish/index.js
const { PROVINCES, PRODUCT_CATEGORIES, VALUE_RANGES, DESC_TAGS } = require('../../utils/constants')
const { callCloud, uploadImage, toast, showLoading, hideLoading, getProvinceByName, getProvinceByCode, processImageUrl } = require('../../utils/util')

Page({
  data: {
    images: [],
    form: {
      name: '',
      description: '',     // 特产描述（必填，至少10字）
      province: '',
      city: '',
      district: '',
      category: '',
      valueRange: '',
      descTags: [],
      wantProvince: '',
      wantCity: '',
      wantDistrict: '',
      wantCategory: '',
      isMystery: false,
      gender: '',       // 性别: 'male' | 'female'
      // ── 代购字段 ──
      daigouEnabled: false,
      daigouPrice: '',
      daigouOriginalPrice: '',
      daigouStock: 1
    },
    region: [],
    wantRegion: [],
    descTagsSelected: {},
    categories: PRODUCT_CATEGORIES,
    valueRanges: VALUE_RANGES,
    descTags: DESC_TAGS,
    submitting: false,
    isEdit: false,
    editId: '',
    featureDisabled: false,
    // ── 表单完整度 ──
    errors: {},           // { fieldKey: '错误提示文字' }
    completeness: 0,      // 0~100
    completenessText: '0 / 6'  // 已完成/总计
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  onLoad(options) {
    // 初始化主题
    const savedTheme = wx.getStorageSync('appTheme') || 'dark'
    this.setData({ pageTheme: savedTheme })

    if (!getApp().isFeatureEnabled('tab_publish')) {
      this.setData({ featureDisabled: true })
      return
    }
    if (options.mystery === '1') {
      this.setData({ 'form.isMystery': true })
    }
    if (options.edit) {
      this.setData({ isEdit: true, editId: options.edit })
      this.loadProduct(options.edit)
    }
  },

  // 编辑模式：加载已有产品数据并回填表单
  async loadProduct(productId) {
    showLoading('加载中...')
    try {
      const res = await callCloud('productMgr', {
        action: 'detail',
        productId
      })
      if (!res.success || !res.product) {
        hideLoading()
        toast('加载失败')
        return
      }
      const p = res.product

      // 回填图片（保留原始 cloud:// URL，小程序 image 组件原生支持）
      const images = (p.images || []).filter(Boolean)

      // 回填地区 region picker
      const prov = getProvinceByCode(p.province)
      const region = prov ? [prov.name, p.city || '', p.district || ''] : []

      // 回填想换地区
      const wantProv = p.wantProvince ? getProvinceByCode(p.wantProvince) : null
      const wantRegion = wantProv ? [wantProv.name, p.wantCity || '', p.wantDistrict || ''] : []

      // 回填描述标签选中状态
      const descTags = p.descTags || []
      const descTagsSelected = {}
      descTags.forEach(id => { descTagsSelected[id] = true })

      this.setData({
        images,
        form: {
          name: p.name || '',
          description: p.description || '',
          province: p.province || '',
          city: p.city || '',
          district: p.district || '',
          category: p.category || '',
          valueRange: p.valueRange || '',
          descTags,
          wantProvince: p.wantProvince || '',
          wantCity: p.wantCity || '',
          wantDistrict: p.wantDistrict || '',
          wantCategory: p.wantCategory || '',
          isMystery: p.isMystery || false,
          // 代购回填
          daigouEnabled: !!(p.daigou && p.daigou.enabled),
          daigouPrice: p.daigou && p.daigou.enabled ? String(p.daigou.price || '') : '',
          daigouOriginalPrice: p.daigou && p.daigou.originalPrice ? String(p.daigou.originalPrice) : '',
          daigouStock: p.daigou && p.daigou.enabled ? (p.daigou.stock || 1) : 1
        },
        region,
        wantRegion,
        descTagsSelected
      })
      this._updateCompleteness()
      hideLoading()
    } catch (e) {
      hideLoading()
      toast('加载失败')
      console.error('loadProduct error', e)
    }
  },

  // 选择图片
  async chooseImages() {
    const remain = 6 - this.data.images.length
    if (remain <= 0) return
    try {
      const res = await wx.chooseMedia({
        count: remain,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed']
      })
      // 逐张压缩，质量80，加快上传和加载
      const compressed = []
      for (const f of res.tempFiles) {
        try {
          const c = await wx.compressImage({ src: f.tempFilePath, quality: 80 })
          compressed.push(c.tempFilePath)
        } catch (_) {
          compressed.push(f.tempFilePath) // 压缩失败用原图
        }
      }
      const newImages = [...this.data.images, ...compressed]
      this.setData({ images: newImages })
      // 上传图片后更新完整度
      const errors = { ...this.data.errors }
      delete errors['images']
      this.setData({ errors })
      this._updateCompleteness()
    } catch (e) {}
  },

  removeImage(e) {
    const idx = e.currentTarget.dataset.index
    const images = [...this.data.images]
    images.splice(idx, 1)
    this.setData({ images })
    this._updateCompleteness()
  },

  previewImage(e) {
    const idx = e.currentTarget.dataset.index
    wx.previewImage({ urls: this.data.images, current: this.data.images[idx] })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
    // 清除该字段错误，并更新完整度
    const errors = { ...this.data.errors }
    delete errors[field]
    this.setData({ errors })
    this._updateCompleteness()
  },

  // 地区选择（特产产地）
  onRegionChange(e) {
    const val = e.detail.value
    if (!val || !val[0]) return
    const prov = getProvinceByName(val[0])
    this.setData({
      region: val,
      'form.province': prov ? prov.code : '',
      'form.city': val[1] || '',
      'form.district': val[2] || ''
    })
    const errors = { ...this.data.errors }
    delete errors['province']
    this.setData({ errors })
    this._updateCompleteness()
  },

  // 地区选择（想换地区）
  onWantRegionChange(e) {
    const val = e.detail.value
    if (!val || !val[0]) return
    const prov = getProvinceByName(val[0])
    this.setData({
      wantRegion: val,
      'form.wantProvince': prov ? prov.code : '',
      'form.wantCity': val[1] || '',
      'form.wantDistrict': val[2] || ''
    })
    this._updateCompleteness()
  },

  selectCategory(e) {
    this.setData({ 'form.category': e.currentTarget.dataset.id })
    const errors = { ...this.data.errors }
    delete errors['category']
    this.setData({ errors })
    this._updateCompleteness()
  },

  selectValueRange(e) {
    this.setData({ 'form.valueRange': e.currentTarget.dataset.id })
    const errors = { ...this.data.errors }
    delete errors['valueRange']
    this.setData({ errors })
    this._updateCompleteness()
  },

  // 选择性别
  selectGender(e) {
    this.setData({ 'form.gender': e.currentTarget.dataset.gender })
    const errors = { ...this.data.errors }
    delete errors['gender']
    this.setData({ errors })
    this._updateCompleteness()
  },

  selectWantCategory(e) {
    this.setData({ 'form.wantCategory': e.currentTarget.dataset.id })
    this._updateCompleteness()
  },

  // 描述标签多选
  toggleDescTag(e) {
    const id = e.currentTarget.dataset.id
    const tags = [...this.data.form.descTags]
    const selected = { ...this.data.descTagsSelected }
    const idx = tags.indexOf(id)
    if (idx > -1) {
      tags.splice(idx, 1)
      selected[id] = false
    } else {
      tags.push(id)
      selected[id] = true
    }
    this.setData({
      'form.descTags': tags,
      descTagsSelected: selected
    })
    this._updateCompleteness()
  },

  // 切换神秘特产
  toggleMystery(e) {
    const isMystery = e.detail.value
    this.setData({
      'form.isMystery': isMystery,
      'form.name': isMystery ? '' : this.data.form.name,
      'form.descTags': isMystery ? [] : this.data.form.descTags,
      descTagsSelected: isMystery ? {} : this.data.descTagsSelected,
      errors: {}
    })
    this._updateCompleteness()
  },

  // ── 计算表单完整度 ──
  _updateCompleteness() {
    const { form, images } = this.data
    let total = 0
    let done = 0

    if (form.isMystery) {
      // 神秘特产：产地 + 性别
      total = 2
      if (form.province) done++
      if (form.gender) done++
    } else {
      // 普通特产：图片 + 名称 + 描述 + 产地 + 品类 + 估值 + 性别
      total = 7
      if (images.length > 0) done++
      if (form.name && form.name.trim().length >= 2) done++
      if (form.description && form.description.trim().length >= 10) done++
      if (form.province) done++
      if (form.category) done++
      if (form.valueRange) done++
      if (form.gender) done++
    }

    const completeness = total > 0 ? Math.round((done / total) * 100) : 0
    this.setData({
      completeness,
      completenessText: `${done} / ${total}`
    })
  },

  // 切换代购开关（需实名认证）
  async toggleDaigou(e) {
    const newVal = e.detail.value
    if (newVal) {
      // 开启代购前检查实名认证状态
      try {
        const res = await callCloud('daigouMgr', { action: 'getVerifyStatus' })
        const status = res && res.verify && res.verify.status
        if (status !== 'approved') {
          // 未认证，先将开关恢复关闭，再跳转认证页
          this.setData({ 'form.daigouEnabled': false })
          wx.navigateTo({ url: '/pages/daigou-verify/index' })
          return
        }
      } catch (err) {
        console.error('getVerifyStatus error', err)
        // 网络异常时不阻止开启（用户可在提交时二次校验）
      }
    }
    this.setData({ 'form.daigouEnabled': !!newVal })
  },

  // 代购价格/原价输入
  onDaigouInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  // 库存±1
  changeStock(e) {
    const delta = parseInt(e.currentTarget.dataset.delta) || 0
    const cur = this.data.form.daigouStock || 1
    const next = Math.max(1, Math.min(999, cur + delta))
    this.setData({ 'form.daigouStock': next })
  },

  // 表单校验 —— 收集所有错误，标记并滚动到第一个错误
  validate() {
    const { images, form } = this.data
    const errors = {}
    let firstErrorId = ''

    if (form.isMystery) {
      if (!form.province) { errors['province'] = '请选择特产产地，让大家都知道它来自哪里'; if (!firstErrorId) firstErrorId = 'section-province' }
      if (!form.gender)   { errors['gender']   = '请选择你的性别，方便对方了解';  if (!firstErrorId) firstErrorId = 'section-gender' }
    } else {
      if (images.length === 0)               { errors['images']      = '请至少上传一张特产图片，展示特产的真实样子';    if (!firstErrorId) firstErrorId = 'section-images' }
      if (!form.name || !form.name.trim())   { errors['name']        = '请填写特产名称，让大家知道是什么特产';            if (!firstErrorId) firstErrorId = 'section-name' }
      else if (form.name.trim().length > 30) { errors['name']        = '特产名称不能超过30个字';                          if (!firstErrorId) firstErrorId = 'section-name' }
      if (!form.description || form.description.trim().length < 10) {
                                               errors['description']  = '请详细描述特产特点（至少10字），如口感、包装等'; if (!firstErrorId) firstErrorId = 'section-description' }
      else if (form.description.trim().length > 500) { errors['description'] = '特产描述不能超过500个字';                 if (!firstErrorId) firstErrorId = 'section-description' }
      if (!form.province)                    { errors['province']    = '请选择特产产地，让大家知道特产来自哪里';            if (!firstErrorId) firstErrorId = 'section-province' }
      if (!form.category)                    { errors['category']    = '请选择品类，方便大家快速找到';               if (!firstErrorId) firstErrorId = 'section-category' }
      if (!form.valueRange)                  { errors['valueRange']  = '请选择估值区间，帮助大家了解价值';            if (!firstErrorId) firstErrorId = 'section-valueRange' }
      if (!form.gender)                      { errors['gender']      = '请选择你的性别，方便对方了解';            if (!firstErrorId) firstErrorId = 'section-gender' }

      if (form.daigouEnabled) {
        const price = parseFloat(form.daigouPrice)
        if (!price || price <= 0)            { errors['daigouPrice'] = '请填写有效的代购价格（1-9999元）';      if (!firstErrorId) firstErrorId = 'section-daigou' }
        else if (price > 9999)               { errors['daigouPrice'] = '代购价格不能超过9999元';    if (!firstErrorId) firstErrorId = 'section-daigou' }
        const originalPrice = parseFloat(form.daigouOriginalPrice)
        if (form.daigouOriginalPrice && originalPrice && originalPrice <= price) {
                                               errors['daigouOriginalPrice'] = '划线原价应高于代购价格，展示优惠效果'; if (!firstErrorId) firstErrorId = 'section-daigou'
        }
      }
    }

    this.setData({ errors })

    if (firstErrorId) {
      // 滚动到第一个错误区块
      wx.pageScrollTo({
        selector: `#${firstErrorId}`,
        duration: 300,
        offsetTop: -20
      })
      // 同时 toast 提示
      const firstMsg = Object.values(errors)[0]
      toast(firstMsg)
      return false
    }

    return true
  },

  // 提交发布 / 更新
  async submit() {
    if (!this.validate()) return
    if (this.data.submitting) return
    
    // 立即设置同步锁，防止 setData 异步延迟导致的重复提交
    if (this._isSubmitting) return
    this._isSubmitting = true

    // 发布前检查积分
    if (!this.data.isEdit) {
      const app = getApp()
      const isMystery = this.data.form.isMystery
      const requiredPoints = isMystery ? 10 : 5
      const currentPoints = app.globalData.points || 0
      
      console.log('[publish] 发布前积分检查:', {
        currentPoints,
        requiredPoints,
        isMystery
      })
      
      if (currentPoints < requiredPoints) {
        wx.showModal({
          title: '积分不足',
          content: `发布${isMystery ? '神秘特产' : '特产'}需要${requiredPoints}积分，当前积分${currentPoints}。可通过互换特产或邀请好友获得积分。`,
          showCancel: false,
          confirmText: '知道了'
        })
        return
      }
    }

    this.setData({ submitting: true })
    const isEdit = this.data.isEdit

    try {
      const uploadedIds = []

      if (this.data.images.length > 0) {
        showLoading('上传图片中...')

        const needUploadImages = []

        for (let i = 0; i < this.data.images.length; i++) {
          const filePath = this.data.images[i]

          if (filePath.startsWith('cloud://')) {
            uploadedIds.push(filePath)
            continue
          }

          if ((filePath.startsWith('https://') || filePath.startsWith('http://')) && !filePath.includes('tmp')) {
            uploadedIds.push(filePath)
            continue
          }

          needUploadImages.push(filePath)
        }

        if (needUploadImages.length > 0) {
          try {
            const uploadPromises = needUploadImages.map((filePath, index) => 
              uploadImage(filePath, 'products')
            )
            const results = await Promise.all(uploadPromises)
            uploadedIds.push(...results)
          } catch (uploadErr) {
            throw new Error('图片上传失败，请重试')
          }
        }
      }

      showLoading(isEdit ? '保存中...' : '发布中...')

      const payload = {
        action: isEdit ? 'update' : 'create',
        data: {
          ...this.data.form,
          images: uploadedIds,
          daigou: this.data.form.daigouEnabled ? {
            enabled: true,
            price: parseFloat(this.data.form.daigouPrice) || 0,
            originalPrice: parseFloat(this.data.form.daigouOriginalPrice) || 0,
            stock: parseInt(this.data.form.daigouStock) || 1
          } : null
        }
      }
      if (isEdit) {
        payload.productId = this.data.editId
      }

      const res = await callCloud('productMgr', payload)

      hideLoading()

      if (!res.success) {
        if (res.message && res.message.includes('积分不足')) {
          wx.showModal({
            title: '积分不足',
            content: res.message + '，可通过互换特产或邀请好友获得积分',
            showCancel: false,
            confirmText: '知道了'
          })
          return
        } else if (res.message) {
          wx.showModal({
            title: isEdit ? '保存失败' : '发布失败',
            content: res.message || '请检查网络连接后重试',
            showCancel: false,
            confirmText: '知道了'
          })
          return
        }
      }

      if (res && res.success) {
        // 根据审核类型显示不同的提示
        let toastMsg = res.message || (isEdit ? '保存成功！' : '发布成功！')
        const isPending = !res.auditPass
        const auditType = res.auditType
        
        // 根据审核类型设置提示图标
        let icon = 'success'
        if (auditType === 'rejected') {
          icon = 'none'
        } else if (auditType === 'manual') {
          icon = 'none'
        }
        
        toast(toastMsg, icon)

        setTimeout(() => {
          if (isEdit) {
            wx.navigateBack()
          } else {
            const productId = res.productId
            const isMystery = this.data.form.isMystery
            
            if (isPending) {
              wx.reLaunch({ url: '/pages/my-products/index' })
              return
            }
            
            this.setData({
              images: [],
              form: {
                name: '', description: '', province: '', city: '', district: '',
                category: '', valueRange: '', descTags: [],
                wantProvince: '', wantCity: '', wantDistrict: '',
                wantCategory: '', isMystery: false, gender: '',
                daigouEnabled: false, daigouPrice: '', daigouOriginalPrice: '', daigouStock: 1
              },
              region: [],
              wantRegion: [],
              descTagsSelected: {},
              errors: {},
              completeness: 0,
              completenessText: '0 / 7'
            })
            if (productId) {
              if (isMystery) {
                wx.reLaunch({ url: '/pages/mystery/index' })
              } else {
                wx.navigateTo({
                  url: `/pages/detail/index?id=${productId}`,
                  fail: () => { wx.reLaunch({ url: '/pages/index/index' }) }
                })
              }
            } else {
              wx.reLaunch({ url: '/pages/index/index' })
            }
          }
        }, 1500)
      } else {
        throw new Error(res?.message || (isEdit ? '保存失败' : '发布失败'))
      }
    } catch (e) {
      hideLoading()
      console.error('[publish] 提交失败:', e)
      
      let errorMsg = e.message || (isEdit ? '保存失败，请重试' : '发布失败，请重试')
      
      if (errorMsg.includes('网络') || errorMsg.includes('timeout')) {
        errorMsg = '网络连接异常，请检查网络后重试'
      } else if (errorMsg.includes('上传')) {
        errorMsg = '图片上传失败，请检查图片格式后重试'
      }
      
      wx.showModal({
        title: isEdit ? '保存失败' : '发布失败',
        content: errorMsg,
        showCancel: false,
        confirmText: '知道了'
      })
    } finally {
      this.setData({ submitting: false })
      this._isSubmitting = false
    }
  }
})
