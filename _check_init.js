const fs = require('fs')

const minePath = 'C:/Users/31849/WorkBuddy/20260320155547/specialty-swap/miniprogram/pages/mine/index.js'
const mine = fs.readFileSync(minePath, 'utf8')
const lines = mine.split('\n')

// 看第 240-270 行（init action 返回值处理）
console.log('=== mine/index.js 第 230-280 行 ===')
lines.slice(229, 280).forEach((l, i) => {
  console.log(`  ${230+i}: ${l}`)
})

// 看 userInit 云函数 init action 返回值（第 1385-1410 行）
const cfPath = 'C:/Users/31849/WorkBuddy/20260320155547/specialty-swap/cloudfunctions/userInit/index.js'
const cf = fs.readFileSync(cfPath, 'utf8')
const cfLines = cf.split('\n')

console.log('\n=== userInit init action 返回值（第 1380-1420 行）===')
cfLines.slice(1379, 1420).forEach((l, i) => {
  console.log(`  ${1380+i}: ${l}`)
})

// 找 init action 的入口
const initIdx = cfLines.findIndex(l => l.includes("action === 'init'"))
console.log(`\n=== init action 入口：第 ${initIdx+1} 行 ===`)
cfLines.slice(initIdx, initIdx + 80).forEach((l, i) => {
  console.log(`  ${initIdx+1+i}: ${l}`)
})
