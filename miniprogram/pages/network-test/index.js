// pages/network-test/index.js - 网络诊断页面
const { callCloud } = require('../../utils/util')

Page({
  data: {
    logs: [],
    testing: false,
    cloudInited: false,
    openid: null,
    envId: null
  },

  onLoad() {
    this.addLog('==== 网络诊断开始 ====', 'info')
    this.checkCloudInit()
  },

  addLog(msg, type = 'log') {
    const time = new Date().toLocaleTimeString()
    this.setData({
      logs: [...this.data.logs, { time, msg, type }]
    })
  },

  async checkCloudInit() {
    this.addLog('检查云开发初始化状态...')
    
    // 检查 wx.cloud 是否存在
    if (!wx.cloud) {
      this.addLog('❌ wx.cloud 不存在', 'error')
      return
    }
    
    this.addLog('✅ wx.cloud 存在', 'success')
    
    // 检查是否已初始化
    try {
      const app = getApp()
      const envId = app.globalData.envId
      this.setData({ envId })
      this.addLog(`环境ID: ${envId}`, 'info')
      
      // 尝试调用云函数
      await this.testCloudFunction()
    } catch (e) {
      this.addLog(`初始化检查失败: ${e.message}`, 'error')
    }
  },

  async testCloudFunction() {
    this.setData({ testing: true })
    this.addLog('--- 测试云函数调用 ---', 'info')
    
    try {
      // 测试 userInit
      this.addLog('调用 userInit (action: init)...')
      const res = await callCloud('userInit', { action: 'init' })
      
      if (res && res.userInfo) {
        this.addLog('✅ userInit 调用成功', 'success')
        this.addLog(`用户: ${res.userInfo.nickName || '未设置昵称'}`)
        this.setData({
          openid: res.userInfo.openid || res.userInfo._openid,
          cloudInited: true
        })
      } else {
        this.addLog('❌ userInit 返回数据异常', 'error')
        this.addLog(`返回: ${JSON.stringify(res).substring(0, 100)}`)
      }
    } catch (e) {
      this.addLog(`❌ 云函数调用失败: ${e.message || e.errMsg}`, 'error')
      this.addLog(`错误码: ${e.errCode}`, 'error')
      this.setData({ cloudInited: false })
    } finally {
      this.setData({ testing: false })
    }
  },

  async testAdmin() {
    this.addLog('--- 测试管理员状态 ---', 'info')
    
    try {
      const res = await callCloud('adminMgr', { action: 'getAdminStatus' })
      this.addLog(`管理员状态: ${JSON.stringify(res)}`)
      
      if (res && res.isSuperAdmin) {
        this.addLog('✅ 当前用户是管理员', 'success')
      } else {
        this.addLog('ℹ️ 当前用户不是管理员', 'info')
      }
    } catch (e) {
      this.addLog(`❌ 检查管理员状态失败: ${e.message}`, 'error')
    }
  },

  clearLogs() {
    this.setData({ logs: [] })
    this.addLog('日志已清空', 'info')
  },

  copyLogs() {
    const text = this.data.logs.map(l => `[${l.time}] ${l.msg}`).join('\n')
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' })
      }
    })
  }
})
