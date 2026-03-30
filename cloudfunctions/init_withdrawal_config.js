const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function initWithdrawalConfig() {
  try {
    console.log('开始初始化提现配置...');
    
    // 检查是否已存在提现门槛配置
    const checkRes = await db.collection('system_config').where({
      configKey: 'withdrawal_threshold'
    }).get();
    
    if (checkRes.data && checkRes.data.length > 0) {
      console.log('提现门槛配置已存在:', checkRes.data[0]);
      return;
    }
    
    // 创建提现门槛配置
    const result = await db.collection('system_config').add({
      data: {
        configKey: 'withdrawal_threshold',
        configValue: 30.00,
        description: '提现最低门槛金额（元）',
        createTime: new Date(),
        updateTime: new Date()
      }
    });
    
    console.log('提现门槛配置创建成功:', result);
    
    // 检查其他相关配置
    const otherConfigs = [
      { configKey: 'invite_reward_inviter', configValue: 0.3, description: '邀请人奖励比例' },
      { configKey: 'invite_reward_invitee', configValue: 0.1, description: '被邀请人奖励比例' },
      { configKey: 'invite_cash_reward_inviter', configValue: 5, description: '邀请人现金奖励（元）' },
      { configKey: 'invite_cash_reward_invitee', configValue: 2, description: '被邀请人现金奖励（元）' },
      { configKey: 'first_swap_cash_reward', configValue: 10, description: '首次互换现金奖励（元）' }
    ];
    
    for (const config of otherConfigs) {
      const check = await db.collection('system_config').where({
        configKey: config.configKey
      }).get();
      
      if (!check.data || check.data.length === 0) {
        await db.collection('system_config').add({
          data: {
            ...config,
            createTime: new Date(),
            updateTime: new Date()
          }
        });
        console.log(`配置 ${config.configKey} 创建成功`);
      } else {
        console.log(`配置 ${config.configKey} 已存在`);
      }
    }
    
    console.log('所有配置初始化完成');
  } catch (e) {
    console.error('初始化配置失败:', e);
  }
}

initWithdrawalConfig();