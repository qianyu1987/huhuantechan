const fs = require('fs')

// 检查 userInit 云函数中 publishCount 相关逻辑
const cfPath = 'C:/Users/31849/WorkBuddy/20260320155547/specialty-swap/cloudfunctions/userInit/index.js'
const cf = fs.readFileSync(cfPath, 'utf8')
const cfLines = cf.split('\n')

console.log('=== userInit 云函数中的 publishCount 相关代码 ===')
cfLines.forEach((l, i) => {
  if (l.includes('publish') || l.includes('stats') || l.includes('getStats') || l.includes('count')) {
    console.log(`  ${i+1}: ${l}`)
  }
})

// 检查 mine 页面 JS
const minePath = 'C:/Users/31849/WorkBuddy/20260320155547/specialty-swap/miniprogram/pages/mine/index.js'
const mine = fs.readFileSync(minePath, 'utf8')
const mineLines = mine.split('\n')

console.log('\n=== mine/index.js 中的 publishCount / stats 相关代码 ===')
mineLines.forEach((l, i) => {
  if (l.includes('publish') || l.includes('stats') || l.includes('count')) {
    console.log(`  ${i+1}: ${l}`)
  }
})

// 检查 mine wxml 中显示发布数量的地方
const wxmlPath = 'C:/Users/31849/WorkBuddy/20260320155547/specialty-swap/miniprogram/pages/mine/index.wxml'
const wxml = fs.readFileSync(wxmlPath, 'utf8')
console.log('\n=== mine/index.wxml 中的 publishCount 相关 ===')
wxml.split('\n').forEach((l, i) => {
  if (l.includes('publish') || l.includes('发布') || l.includes('count') || l.includes('stats')) {
    console.log(`  ${i+1}: ${l}`)
  }
})
