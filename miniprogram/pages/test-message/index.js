/**
 * 测试订阅消息页面
 */

const subscribeMsg = require('../../utils/subscribeMessage');

Page({
  data: {
    openid: '',
    result: ''
  },

  onLoad() {
    // 获取当前用户 openid
    this.getOpenid();
  },

  // 获取用户 openid
  async getOpenid() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'userInit',
        data: { action: 'getOpenid' }
      });
      
      if (result && result.openid) {
        this.setData({ openid: result.openid });
        console.log('当前用户 openid:', result.openid);
      }
    } catch (err) {
      console.error('获取 openid 失败:', err);
    }
  },

  // 测试请求订阅授权
  testSubscribe() {
    subscribeMsg.requestMultiSubscribe(
      ['ACTIVITY_NOTIFY'],
      () => {
        wx.showToast({ title: '订阅授权成功', icon: 'success' });
        this.setData({ result: '订阅授权成功' });
      },
      () => {
        wx.showToast({ title: '订阅授权失败', icon: 'none' });
        this.setData({ result: '订阅授权失败' });
      }
    );
  },

  // 测试发送订阅消息
  async testSendMessage() {
    const { openid } = this.data;
    
    if (!openid) {
      wx.showToast({ title: '请先获取 openid', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '发送中...' });

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'sendSubscribeMsg',
        data: {
          action: 'activity',
          openid: openid,
          params: {
            content: '测试消息：特产互换小程序消息推送功能',
            startTime: new Date().toLocaleString(),
            endTime: '请查看详情',
            page: 'pages/index/index'
          }
        }
      });

      wx.hideLoading();

      if (result && result.success) {
        wx.showToast({ title: '发送成功', icon: 'success' });
        this.setData({ result: '消息发送成功！请检查微信服务通知' });
      } else {
        wx.showToast({ title: result.error || '发送失败', icon: 'none' });
        this.setData({ result: '发送失败: ' + (result.error || '未知错误') });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('发送失败:', err);
      wx.showToast({ title: '发送失败', icon: 'none' });
      this.setData({ result: '发送失败: ' + err.message });
    }
  },

  // 复制 openid
  copyOpenid() {
    const { openid } = this.data;
    if (openid) {
      wx.setClipboardData({
        data: openid,
        success: () => {
          wx.showToast({ title: '已复制 openid', icon: 'success' });
        }
      });
    }
  }
});
