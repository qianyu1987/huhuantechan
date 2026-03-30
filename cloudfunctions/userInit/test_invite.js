// 邀请裂变系统测试脚本
const cloud = require('wx-server-sdk')
cloud.init({ env: 'cloud1-3g4sjhqr5e28e54e' })
const db = cloud.database()
const _ = db.command

async function testInviteSystem() {
  console.log('=== 开始测试邀请裂变系统 ===')
  
  try {
    // 1. 测试确保集合存在
    console.log('1. 检查集合是否存在...')
    await ensureInviteRewardsCollection()
    console.log('✓ invite_rewards 集合检查完成')
    
    // 2. 测试获取邀请数据
    console.log('\n2. 测试获取邀请数据...')
    // 这里需要实际的openid，暂时跳过
    
    // 3. 测试防作弊逻辑
    console.log('\n3. 测试防作弊逻辑...')
    await testAntiCheatLogic()
    
    console.log('\n=== 测试完成 ===')
    console.log('请手动测试以下功能：')
    console.log('1. 打开小程序，进入"邀请好友"页面')
    console.log('2. 检查邀请码是否生成')
    console.log('3. 检查小程序码是否生成')
    console.log('4. 分享给测试用户')
    console.log('5. 测试用户通过链接注册')
    console.log('6. 检查奖励是否发放')
    
  } catch (error) {
    console.error('测试失败:', error)
  }
}

async function ensureInviteRewardsCollection() {
  try {
    await db.collection('invite_rewards').count()
    console.log('  invite_rewards 集合已存在')
  } catch (e) {
    if (e.message && e.message.includes('collection not exist')) {
      console.log('  invite_rewards 集合不存在，正在创建...')
      // 创建集合
      await db.collection('invite_rewards').add({
        data: {
          inviterOpenid: 'test_init',
          invitedOpenid: 'test_init_user',
          type: 'signup',
          amount: 0,
          createTime: db.serverDate()
        }
      })
      // 删除测试数据
      const initRes = await db.collection('invite_rewards').where({
        invitedOpenid: 'test_init_user'
      }).get()
      if (initRes.data && initRes.data.length > 0) {
        await db.collection('invite_rewards').doc(initRes.data[0]._id).remove()
      }
      console.log('  ✓ invite_rewards 集合创建成功')
    } else {
      throw e
    }
  }
}

async function testAntiCheatLogic() {
  console.log('  测试每日邀请次数限制...')
  
  // 获取今天的开始时间
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  // 检查查询语法
  try {
    const testRes = await db.collection('invite_rewards').where({
      type: 'signup',
      createTime: _.gte(today)
    }).count()
    
    console.log(`  ✓ 今日已有 ${testRes.total} 条邀请记录`)
    console.log(`  ✓ 防作弊查询语法正确`)
  } catch (error) {
    console.error('  ✗ 防作弊查询失败:', error.message)
  }
}

// 运行测试
testInviteSystem()