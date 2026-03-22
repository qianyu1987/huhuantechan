// pages/publish/index.js
const { PROVINCES, PRODUCT_CATEGORIES_V2, VALUE_RANGES_V2, DESC_TAGS } = require('../../utils/constants')
const { callCloud, uploadImage, toast, showLoading, hideLoading, getProvinceByName, getProvinceByCode, processImageUrl } = require('../../utils/util')

Page({
  data: {
    images: [],
    form: {
      name: '',
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
      isMystery: false
    },
    region: [],
    wantRegion: [],
    descTagsSelected: {},
    categories: PRODUCT_CATEGORIES_V2,
    valueRanges: VALUE_RANGES_V2,
    descTags: DESC_TAGS,
    submitting: false,
    isEdit: false,
    editId: ''
  },

  onLoad(options) {
    if (!getApp().isFeatureEnabled('tab_publish')) {
      wx.reLaunch({ url: '/pages/index/index' })
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
          isMystery: p.isMystery || false
        },
        region,
        wantRegion,
        descTagsSelected
      })
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
    } catch (e) {}
  },

  removeImage(e) {
    const idx = e.currentTarget.dataset.index
    const images = [...this.data.images]
    images.splice(idx, 1)
    this.setData({ images })
  },

  previewImage(e) {
    const idx = e.currentTarget.dataset.index
    wx.previewImage({ urls: this.data.images, current: this.data.images[idx] })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
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
  },

  selectCategory(e) {
    this.setData({ 'form.category': e.currentTarget.dataset.id })
  },

  selectValueRange(e) {
    this.setData({ 'form.valueRange': e.currentTarget.dataset.id })
  },

  selectWantCategory(e) {
    this.setData({ 'form.wantCategory': e.currentTarget.dataset.id })
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
  },

  // 切换神秘特产
  toggleMystery(e) {
    const isMystery = e.detail.value
    this.setData({
      'form.isMystery': isMystery,
      'form.name': isMystery ? '' : this.data.form.name,
      'form.descTags': isMystery ? [] : this.data.form.descTags,
      descTagsSelected: isMystery ? {} : this.data.descTagsSelected
    })
  },

  // 表单校验
  validate() {
    const { images, form } = this.data

    if (form.isMystery) {
      if (!form.province) { toast('请选择特产产地'); return false }
      return true
    }

    if (images.length === 0) { toast('请至少上传一张图片'); return false }
    if (!form.name.trim()) { toast('请填写特产名称'); return false }
    if (!form.province) { toast('请选择特产产地'); return false }
    if (!form.category) { toast('请选择品类'); return false }
    if (!form.valueRange) { toast('请选择估值区间'); return false }
    return true
  },

  // 提交发布 / 更新
  async submit() {
    if (!this.validate()) return
    if (this.data.submitting) return

    this.setData({ submitting: true })
    const isEdit = this.data.isEdit

    try {
      const uploadedIds = []

      if (this.data.images.length > 0) {
        showLoading('上传图片中...')

        for (let i = 0; i < this.data.images.length; i++) {
          const filePath = this.data.images[i]

          if (filePath.startsWith('cloud://')) {
            uploadedIds.push(filePath)
            continue
          }

          // 编辑模式回显的已上传远程图片保留
          if ((filePath.startsWith('https://') || filePath.startsWith('http://')) && !filePath.includes('tmp')) {
            uploadedIds.push(filePath)
            continue
          }

          try {
            showLoading(`上传图片 ${i + 1}/${this.data.images.length}...`)
            const fileID = await uploadImage(filePath, 'products')
            uploadedIds.push(fileID)
          } catch (uploadErr) {
            throw new Error(`第 ${i + 1} 张图片上传失败，请重试`)
          }
        }
      }

      showLoading(isEdit ? '保存中...' : '发布中...')

      const payload = {
        action: isEdit ? 'update' : 'create',
        data: {
          ...this.data.form,
          images: uploadedIds
        }
      }
      if (isEdit) {
        payload.productId = this.data.editId
      }

      const res = await callCloud('productMgr', payload)

      if (res && res.success) {
        hideLoading()
        toast(isEdit ? '保存成功！' : '发布成功！', 'success')

        setTimeout(() => {
          if (isEdit) {
            wx.navigateBack()
          } else {
            const productId = res.productId
            const isMystery = this.data.form.isMystery
            this.setData({
              images: [],
              form: {
                name: '', province: '', city: '', district: '',
                category: '', valueRange: '', descTags: [],
                wantProvince: '', wantCity: '', wantDistrict: '',
                wantCategory: '', isMystery: false
              },
              region: [],
              wantRegion: [],
              descTagsSelected: {}
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
      toast(e.message || (isEdit ? '保存失败，请重试' : '发布失败，请重试'))
    } finally {
      this.setData({ submitting: false })
    }
  }
})
