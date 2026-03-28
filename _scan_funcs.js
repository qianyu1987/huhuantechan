const fs = require('fs')
const path = require('path')

const base = 'C:/Users/31849/WorkBuddy/20260320155547/specialty-swap/cloudfunctions/'
const dirs = fs.readdirSync(base)

const results = {}
dirs.forEach(d => {
  const f = path.join(base, d, 'index.js')
  if (fs.existsSync(f)) {
    const c = fs.readFileSync(f, 'utf8')
    const actions = []
    // 匹配 action === 'xxx' 或 case 'xxx'
    const re = /action\s*===\s*['"](\w+)['"]|case\s+['"](\w+)['"]/g
    let m
    while ((m = re.exec(c)) !== null) {
      actions.push(m[1] || m[2])
    }
    results[d] = { actions: [...new Set(actions)].slice(0, 20), size: c.length }
  }
})

// 筛选出有业务逻辑的（size > 1000）
const important = Object.entries(results)
  .filter(([, v]) => v.size > 1000 && v.actions.length > 0)
  .sort((a, b) => b[1].size - a[1].size)

console.log('=== 核心云函数列表（按代码量排序）===')
important.forEach(([name, info]) => {
  console.log(`\n📦 ${name} (${Math.round(info.size/1024)}KB)`)
  console.log('   actions:', info.actions.join(', '))
})
