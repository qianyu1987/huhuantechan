const fs = require('fs')
const c = fs.readFileSync('C:/Users/31849/WorkBuddy/20260320155547/specialty-swap/cloudfunctions/productMgr/index.js', 'utf8')
const idx = c.indexOf("action === 'create'")
console.log(c.substring(idx, idx + 2000))
