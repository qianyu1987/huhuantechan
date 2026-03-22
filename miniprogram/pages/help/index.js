// pages/help/index.js - 分享指南
Page({
  data: {
    steps: [
      { title: '完善资料', desc: '设置你的家乡省份和联系方式，让其他用户了解你' },
      { title: '发布特产', desc: '拍摄并上传你想要分享的特产照片，填写详细信息' },
      { title: '发现特产', desc: '在发现页面浏览其他用户发布的特产，找到心仪的' },
      { title: '发起分享', desc: '选择对方的特产，填写你的特产信息，提交分享请求' },
      { title: '等待确认', desc: '对方确认后，你们就正式开始了' },
      { title: '发货收货', desc: '双方填写快递信息并发货，收到后确认收货' },
      { title: '互相评价', desc: '完成后，双方进行评价，积累信用分' }
    ],
    faqs: [
      { question: '如何提高信用分？', answer: '完成分享、评价对方、每日签到、完善个人资料都可以获得信用分。保持良好的记录是提高信用分的最佳方式。', expanded: false },
      { question: '收到的特产有问题怎么办？', answer: '如果收到的特产与描述不符，可以申请纠纷处理。平台会介入调解，保护双方权益。', expanded: false },
      { question: '可以取消正在进行的分享吗？', answer: '可以在对方确认前取消，但会扣除一定的信用分。建议双方充分沟通后再发起。', expanded: false },
      { question: '特产需要邮费吗？', answer: '双方的邮费由各自承担。建议提前沟通好邮费分担方式。', expanded: false },
      { question: '如何联系对方？', answer: '可以通过小程序内消息功能联系对方，也可以在订单详情页面查看对方的联系方式。', expanded: false }
    ]
  },

  onLoad() {},

  goBack() {
    wx.navigateBack()
  },

  toggleFaq(e) {
    const index = e.currentTarget.dataset.index
    const { faqs } = this.data
    faqs[index].expanded = !faqs[index].expanded
    this.setData({ faqs })
  }
})
