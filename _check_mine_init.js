const fs = require('fs')
const mine = fs.readFileSync('C:/Users/31849/WorkBuddy/20260320155547/specialty-swap/miniprogram/pages/mine/index.js', 'utf8')
const lines = mine.split('\n')

// 找 fixMyStats 和 getStats 调用上下文的完整流程
console.log('=== fixMyStats 和 getStats 调用逻辑（第 200-270 行）===')
lines.slice(199, 270).forEach((l, i) => {
  console.log(`  ${200+i}: ${l}`)
})

// 看 onShow 函数
const onShowIdx = lines.findIndex(l => l.includes('onShow'))
console.log(`\n=== onShow 入口（第 ${onShowIdx+1} 行起）===`)
lines.slice(onShowIdx, onShowIdx + 30).forEach((l, i) => {
  console.log(`  ${onShowIdx+1+i}: ${l}`)
})

// 找 init action 调用的地方
console.log('\n=== init action 调用位置 ===')
lines.forEach((l, i) => {
  if (l.includes("action: 'init'") || l.includes('action: "init"')) {
    console.log(`  ${i+1}: ${l}`)
    // 显示前后各5行
    lines.slice(Math.max(0,i-5), i+15).forEach((ll, ii) => {
      console.log(`    ${Math.max(1,i-4)+ii}: ${ll}`)
    })
  }
})
