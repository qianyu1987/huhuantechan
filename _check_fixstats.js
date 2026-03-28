const fs = require('fs')
const cf = fs.readFileSync('C:/Users/31849/WorkBuddy/20260320155547/specialty-swap/cloudfunctions/userInit/index.js', 'utf8')
const cfLines = cf.split('\n')

// 找 fixMyStats action
const idx = cfLines.findIndex(l => l.includes("action === 'fixMyStats'"))
console.log(`=== fixMyStats action（第 ${idx+1} 行起）===`)
cfLines.slice(idx, idx + 80).forEach((l, i) => {
  console.log(`  ${idx+1+i}: ${l}`)
})

// 找 init action 的完整返回值
const initIdx = cfLines.findIndex(l => l.includes("action === 'init'"))
// 从 init 开始，找第一个 return 语句（正式用户的返回）
let found = 0
cfLines.slice(initIdx).forEach((l, i) => {
  if (l.includes('return {') && found < 5) {
    found++
    console.log(`\n=== init 里的第${found}个 return（第 ${initIdx+i+1} 行）===`)
    cfLines.slice(initIdx+i, initIdx+i+25).forEach((ll, ii) => {
      console.log(`  ${initIdx+i+1+ii}: ${ll}`)
    })
  }
})
