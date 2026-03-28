const fs = require('fs')
const cf = fs.readFileSync('C:/Users/31849/WorkBuddy/20260320155547/specialty-swap/cloudfunctions/userInit/index.js', 'utf8')
const cfLines = cf.split('\n')

// 找 fixMyStats 里 products count 查询
cfLines.forEach((l, i) => {
  if (l.includes('products') && (l.includes('_openid') || l.includes('openid'))) {
    console.log(`  ${i+1}: ${l}`)
    // 显示上下各3行
    cfLines.slice(Math.max(0,i-3), i+8).forEach((ll, ii) => {
      console.log(`    ctx ${Math.max(1,i-2)+ii}: ${ll}`)
    })
    console.log('---')
  }
})
