// pages/address/index.js
const { callCloud, toast, showLoading, hideLoading } = require('../../utils/util')

Page({
  data: {
    addresses: [],
    isEditing: false,
    editForm: {
      _id: '',
      contactName: '',
      contactPhone: '',
      province: '',
      city: '',
      district: '',
      detailAddress: '',
      isDefault: false
    },
    region: [],
    isLoading: false,
    fromSelect: false // 是否从选择地址页面进入
  },

  onLoad(options) {
    // 检查是否是从选择地址页面进入
    if (options.from === 'select') {
      this.setData({ fromSelect: true })
    }
    this.loadAddresses()
  },

  onShow() {
    this.loadAddresses()
  },

  // 加载地址列表
  async loadAddresses() {
    this.setData({ isLoading: true })
    try {
      const res = await callCloud('userInit', { action: 'getAddressList' })
      
      if (res && res.success) {
        this.setData({
          addresses: res.addresses || []
        })
      }
    } catch (e) {
      console.error('加载地址失败', e)
    } finally {
      this.setData({ isLoading: false })
    }
  },

  // 选择地址（用于从其他页面选择）
  selectAddress(e) {
    if (!this.data.fromSelect) return
    
    const id = e.currentTarget.dataset.id
    const address = this.data.addresses.find(a => a._id === id)
    if (address) {
      const pages = getCurrentPages()
      const prevPage = pages[pages.length - 2]
      if (prevPage) {
        prevPage.setData({ selectedAddress: address })
        wx.navigateBack()
      }
    }
  },

  // 使用微信收货地址
  async chooseWechatAddress() {
    if (this.data.addresses.length >= 5) {
      toast('最多只能保存5个地址')
      return
    }
    
    try {
      const res = await wx.chooseAddress({
        success: (result) => {
          if (!result) {
            toast('未获取到地址')
            return
          }
          
          const address = {
            contactName: result.userName || '',
            contactPhone: result.telNumber || '',
            province: result.provinceName || '',
            city: result.cityName || '',
            district: result.districtName || '',
            detailAddress: result.detailInfo || '',
            isDefault: this.data.addresses.length === 0 // 第一个设为默认
          }
          
          // 验证必填字段
          if (!address.contactName || !address.contactPhone || !address.detailAddress) {
            toast('地址信息不完整，请补充')
            this.setData({
              isEditing: true,
              editForm: { ...address, _id: '' },
              region: [address.province, address.city, address.district]
            })
            return
          }
          
          // 直接保存
          this.saveAddress(address)
        },
        fail: (err) => {
          console.error('chooseAddress fail:', err)
          if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
            toast('获取地址失败')
          }
        }
      })
    } catch (e) {
      console.error('chooseAddress error:', e)
      toast('获取地址失败')
    }
  },

  // 添加新地址
  addAddress() {
    if (this.data.addresses.length >= 5) {
      toast('最多只能保存5个地址')
      return
    }
    
    this.setData({
      isEditing: true,
      editForm: {
        _id: '',
        contactName: '',
        contactPhone: '',
        province: '',
        city: '',
        district: '',
        detailAddress: '',
        isDefault: this.data.addresses.length === 0
      },
      region: []
    })
  },

  // 编辑地址
  editAddress(e) {
    const item = e.currentTarget.dataset.item
    this.setData({
      isEditing: true,
      editForm: { ...item },
      region: [item.province, item.city, item.district]
    })
  },

  // 取消编辑
  cancelEdit() {
    this.setData({
      isEditing: false,
      editForm: {
        _id: '',
        contactName: '',
        contactPhone: '',
        province: '',
        city: '',
        district: '',
        detailAddress: '',
        isDefault: false
      },
      region: []
    })
  },

  // 输入框变化
  onInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`editForm.${field}`]: value
    })
  },

  // 手机号输入
  onPhoneInput(e) {
    const value = e.detail.value.replace(/\D/g, '').slice(0, 11)
    this.setData({
      'editForm.contactPhone': value
    })
  },

  // 省市区选择变化
  onRegionChange(e) {
    const [province, city, district] = e.detail.value
    this.setData({
      region: e.detail.value,
      'editForm.province': province,
      'editForm.city': city,
      'editForm.district': district
    })
  },

  // 默认地址开关变化
  onDefaultChange(e) {
    this.setData({
      'editForm.isDefault': e.detail.value
    })
  },

  // 保存地址
  async submitEdit() {
    const form = this.data.editForm

    if (!form.contactName || !form.contactPhone) {
      toast('请填写收货人和电话')
      return
    }

    if (!form.detailAddress) {
      toast('请填写详细地址')
      return
    }

    if (!/^\d{11}$/.test(form.contactPhone)) {
      toast('请填写正确的手机号')
      return
    }

    // 检查数量限制
    if (!form._id && this.data.addresses.length >= 5) {
      toast('最多只能保存5个地址')
      return
    }

    await this.saveAddress(form)
  },

  // 保存地址到服务器
  async saveAddress(address) {
    try {
      showLoading('保存中...')
      
      const res = await callCloud('userInit', {
        action: 'saveAddress',
        address: address
      })
      
      hideLoading()
      
      if (res && res.success) {
        toast('保存成功', 'success')
        this.setData({ isEditing: false })
        await this.loadAddresses()
      } else {
        toast(res?.message || res?.error || '保存失败')
      }
    } catch (e) {
      hideLoading()
      console.error('保存地址失败', e)
      toast('保存失败')
    }
  },

  // 删除地址
  async deleteAddress(e) {
    const id = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个收货地址吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            showLoading('删除中...')
            await callCloud('userInit', { 
              action: 'deleteAddress',
              addressId: id
            })
            hideLoading()
            toast('已删除', 'success')
            await this.loadAddresses()
          } catch (e) {
            hideLoading()
            toast('删除失败')
          }
        }
      }
    })
  },

  // 设为默认地址
  async setDefaultAddress(e) {
    const id = e.currentTarget.dataset.id
    
    try {
      showLoading('设置中...')
      await callCloud('userInit', {
        action: 'setDefaultAddress',
        addressId: id
      })
      hideLoading()
      toast('已设为默认', 'success')
      await this.loadAddresses()
    } catch (e) {
      hideLoading()
      toast('设置失败')
    }
  }
})
