// 初始化现金奖励配置
cloud.init({ env: 'cloud1-3g4sjhqr5e28e54e' })
const db = cloud.database()
const _ = db.command

async function initCashRewardConfigs() {
  console.log('开始初始化现金奖励配置...')
  
  const configs = [
    {
      configKey: 'invite_cash_reward_inviter',
      configValue: '5.00',
      desc: '邀请人现金奖励（元）',
      type: 'cash_reward',
      createTime: db.serverDate()
    },
    {
      configKey: 'invite_cash_reward_invitee',
      configValue: '2.00',
      desc: '被邀请人现金奖励（元）',
      type: 'cash_reward',
      createTime: db.serverDate()
    },
    {
      configKey: 'first_swap_cash_reward',
      configValue: '10.00',
      desc: '首次互换现金奖励（元）',
      type: 'cash_reward',
      createTime: db.serverDate()
    }
  ]
  
  try {
    for (const config of configs) {
      // 检查配置是否已存在
      const checkRes = await db.collection('system_config').where({
        configKey: config.configKey
      }).get()
      
      if (checkRes.data && checkRes.data.length > 0) {
        console.log(`配置 ${config.configKey} 已存在，跳过`)
      } else {
        await db.collection('system_config').add({
          data: config
        })
        console.log(`配置 ${config.configKey} 创建成功`)
      }
    }
    
    console.log('现金奖励配置初始化完成')
  } catch (e) {
    console.error('初始化现金奖励配置失败:', e)
  }
}

// 执行初始化
initCashRewardConfigs()