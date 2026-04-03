// cloudfunctions/getIP/index.js
// 获取云函数出口 IP
exports.main = async (event, context) => {
  const https = require('https')
  
  return new Promise((resolve) => {
    https.get('https://api.ipify.org?format=json', (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          resolve({ 
            success: true, 
            ip: result.ip,
            message: `当前云函数出口 IP: ${result.ip}`
          })
        } catch (e) {
          resolve({ success: false, error: '解析失败', raw: data })
        }
      })
    }).on('error', (e) => {
      resolve({ success: false, error: e.message })
    })
  })
}
