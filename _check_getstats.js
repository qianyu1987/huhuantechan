const fs = require('fs')
const cf = fs.readFileSync('C:/Users/31849/WorkBuddy/20260320155547/specialty-swap/cloudfunctions/userInit/index.js', 'utf8')
const cfLines = cf.split('\n')

// 找 getStats action 入口
const gsIdx = cfLines.findIndex(l => l.includes("action === 'getStats'"))
console.log(`=== getStats action（第 ${gsIdx+1} 行起）===`)
cfLines.slice(gsIdx, gsIdx + 70).forEach((l, i) => {
  console.log(`  ${gsIdx+1+i}: ${l}`)
})
