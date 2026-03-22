// components/tab-bar/tab-bar.js
const ALL_TABS = [
  { page: 'index', text: '发现', icon: 'icon-home' },
  { page: 'match', text: '推荐', icon: 'icon-swap', flag: 'tab_match' },
  { page: 'publish', text: '发布', icon: 'icon-publish', isSpecial: true, flag: 'tab_publish' },
  { page: 'order', text: '记录', icon: 'icon-order', flag: 'tab_order' },
  { page: 'mine', text: '我的', icon: 'icon-mine' }
]

Component({
  properties: {
    active: {
      type: String,
      value: 'index'
    }
  },

  data: {
    safeAreaBottom: 0,
    tabs: ALL_TABS
  },

  lifetimes: {
    attached() {
      const windowInfo = wx.getWindowInfo();
      this.setData({
        safeAreaBottom: windowInfo.safeArea ? (windowInfo.screenHeight - windowInfo.safeArea.bottom) : 0
      });

      // 根据功能开关过滤标签
      const app = getApp()
      const flags = app && app.globalData.featureFlags
      if (flags) {
        const filtered = ALL_TABS.filter(tab => {
          if (!tab.flag) return true
          return flags[tab.flag] !== false
        })
        this.setData({ tabs: filtered })
      }
    }
  },

  methods: {
    switchTab(e) {
      const page = e.currentTarget.dataset.page;
      if (page === this.data.active) return;
      
      const url = `/pages/${page}/index`;
      // 使用 reLaunch 关闭所有页面并打开新页面，模拟 tabBar 切换效果
      wx.reLaunch({ url });
    }
  }
});
