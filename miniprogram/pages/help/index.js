// pages/help/index.js - 帮助中心
Page({
  data: {
    activeCategory: 'all',
    searchKeyword: '',
    categories: [
      { id: 'all', name: '全部', icon: '📚' },
      { id: 'basic', name: '基础使用', icon: '📖' },
      { id: 'swap', name: '互换流程', icon: '🔄' },
      { id: 'account', name: '账号相关', icon: '👤' },
      { id: 'payment', name: '支付相关', icon: '💰' },
      { id: 'other', name: '其他问题', icon: '❓' }
    ],
    faqList: [
      {
        id: 1,
        category: 'basic',
        question: '特产互换是什么？',
        answer: '特产互换是一个让全国各地用户分享家乡特产的平台。你可以发布自己的家乡特产，与其他省份的用户相互分享，体验不同地域的美食和文化。平台完全免费使用。',
        expanded: false
      },
      {
        id: 2,
        category: 'basic',
        question: '如何注册和使用？',
        answer: '首次进入小程序后，点击"我的"页面完善资料，设置头像、昵称和家乡省份即可开始使用。所有微信用户都可以免费注册使用。',
        expanded: false
      },
      {
        id: 3,
        category: 'basic',
        question: '如何发布特产？',
        answer: '点击底部"发布"按钮，拍摄或上传特产照片，填写名称、品类、价值区间、描述等信息，还可以设置你感兴趣的省份和品类偏好，提交即可发布。',
        expanded: false
      },
      {
        id: 4,
        category: 'swap',
        question: '特产互换的流程是什么？',
        answer: '1. 完善资料，设置家乡省份\n2. 发布你的特产\n3. 在发现页浏览其他特产\n4. 到匹配页选择你的特产，系统智能匹配\n5. 点击"分享"发起请求，等待对方确认\n6. 双方确认后填写快递信息并发货\n7. 收货后确认并互相评价',
        expanded: false
      },
      {
        id: 5,
        category: 'swap',
        question: '邮费由谁承担？',
        answer: '双方的邮费由各自承担。建议选择性价比高的快递服务，发货前可以和对方沟通邮费情况。',
        expanded: false
      },
      {
        id: 6,
        category: 'swap',
        question: '可以取消互换吗？',
        answer: '可以在对方确认前取消。但请注意，确认后取消会扣除信用分。建议双方充分沟通后再发起，避免不必要的取消。',
        expanded: false
      },
      {
        id: 7,
        category: 'swap',
        question: '收到货有问题怎么办？',
        answer: '如果收到的特产与描述不符或有质量问题，可以在订单详情申请纠纷处理。平台会介入调解，根据实际情况保护双方权益。',
        expanded: false
      },
      {
        id: 8,
        category: 'swap',
        question: '什么是神秘特产？',
        answer: '神秘特产是盲盒模式！发布时只显示来自哪个省份，不透露具体内容。只能与其他神秘特产配对，配对后双方同时揭晓内容，充满惊喜感。',
        expanded: false
      },
      {
        id: 9,
        category: 'account',
        question: '如何修改个人资料？',
        answer: '在"我的"页面点击编辑按钮，可以修改头像和昵称。注意：家乡省份一旦设置后不可更改，请谨慎选择。',
        expanded: false
      },
      {
        id: 10,
        category: 'account',
        question: '如何设置收货地址？',
        answer: '在"我的"页面找到快捷服务区的"收货地址"，点击进入后可以添加、编辑或删除收货地址。支持一键导入微信地址。',
        expanded: false
      },
      {
        id: 11,
        category: 'account',
        question: '信用分是什么？有什么用？',
        answer: '信用分是平台用户的信誉评级。完成互换、获得好评可以提高信用分；取消订单、获得差评会降低信用分。信用分影响匹配优先级和平台信任度。',
        expanded: false
      },
      {
        id: 12,
        category: 'account',
        question: '如何邀请好友？',
        answer: '在"我的"页面找到"邀请好友"入口，可以分享你的专属邀请码。好友通过邀请码注册后，你们都可以获得积分奖励。',
        expanded: false
      },
      {
        id: 13,
        category: 'payment',
        question: '如何充值？',
        answer: '在"我的"页面进入"我的钱包"，点击充值按钮，选择充值金额和支付方式完成充值。充值金额可用于支付代购订单。',
        expanded: false
      },
      {
        id: 14,
        category: 'payment',
        question: '如何提现？',
        answer: '在"我的钱包"页面，点击提现按钮，输入提现金额和支付宝账号即可申请提现。提现将在1-3个工作日内到账。',
        expanded: false
      },
      {
        id: 15,
        category: 'payment',
        question: '代购服务是什么？',
        answer: '代购服务允许认证用户帮助其他用户购买指定地区的特产。代购者需要缴纳押金并通过实名认证，每笔订单收取一定比例的服务费。',
        expanded: false
      },
      {
        id: 16,
        category: 'other',
        question: '如何联系客服？',
        answer: '您可以通过以下方式联系我们：\n1. 在"我的"页面点击"智能客服"进行在线咨询\n2. 在设置页面点击"意见反馈"查看客服联系方式\n3. 发送邮件至 support@techan.com',
        expanded: false
      },
      {
        id: 17,
        category: 'other',
        question: '平台收费吗？',
        answer: '平台基本功能完全免费使用！发布特产、匹配互换均不收取任何费用。唯一的费用是邮寄特产时的快递费，由各自承担。代购服务会收取一定比例的服务费。',
        expanded: false
      },
      {
        id: 18,
        category: 'other',
        question: '省份集章是什么？',
        answer: '每成功完成一次与某省用户的特产互换，就能收集该省的印章。集齐更多省份的印章，展示你的足迹，也是一种成就感。全国共34个省级行政区等你收集！',
        expanded: false
      }
    ],
    filteredFaqList: []
  },

  onLoad() {
    this.setData({
      filteredFaqList: this.data.faqList
    })
  },

  goBack() {
    wx.navigateBack()
  },

  // 切换分类
  switchCategory(e) {
    const category = e.currentTarget.dataset.category
    this.setData({ activeCategory: category })
    this.filterFaqList()
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value })
    this.filterFaqList()
  },

  // 筛选FAQ列表
  filterFaqList() {
    const { faqList, activeCategory, searchKeyword } = this.data
    let filtered = faqList

    // 按分类筛选
    if (activeCategory !== 'all') {
      filtered = filtered.filter(item => item.category === activeCategory)
    }

    // 按关键词搜索
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase()
      filtered = filtered.filter(item => 
        item.question.toLowerCase().includes(keyword) ||
        item.answer.toLowerCase().includes(keyword)
      )
    }

    this.setData({ filteredFaqList: filtered })
  },

  // 展开/收起FAQ
  toggleFaq(e) {
    const id = e.currentTarget.dataset.id
    const { filteredFaqList } = this.data
    const index = filteredFaqList.findIndex(item => item.id === id)
    
    if (index !== -1) {
      filteredFaqList[index].expanded = !filteredFaqList[index].expanded
      this.setData({ filteredFaqList })
    }
  },

  // 联系客服
  contactService() {
    wx.showModal({
      title: '联系客服',
      content: '您可以通过以下方式联系我们：\n\n1. 智能客服：我的页面点击"智能客服"\n2. 意见反馈：设置页面查看联系方式\n3. 邮箱：support@techan.com',
      showCancel: false,
      confirmText: '知道了'
    })
  }
})
