// cloudfunctions/getWxacode/index.js
// 生成小程序码用于海报分享
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  try {
    const result = await cloud.openapi.wxacode.getUnlimited({
      scene: event.scene || 'ai-face',
      page: event.page || 'pages/ai-face/index',
      width: 280,
      autoColor: false,
      lineColor: { r: 156, g: 175, b: 136 },
      isHyaline: true
    })

    const upload = await cloud.uploadFile({
      cloudPath: `wxacode/${Date.now()}.png`,
      fileContent: result.buffer
    })

    return { success: true, fileID: upload.fileID }
  } catch (e) {
    console.error('[getWxacode] 生成失败:', e)
    return { success: false, error: e.message }
  }
}
