// cloudfunctions/testConnect/index.js
// 测试云函数连接
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  return {
    success: true,
    message: '云函数连接成功',
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    env: cloud.DYNAMIC_CURRENT_ENV,
    time: new Date().toISOString()
  }
}
