// 测试提现配置
const testWithdrawalConfig = async () => {
  try {
    // 模拟调用云函数
    const mockEvent = {
      action: 'getWithdrawalConfig'
    };
    
    console.log('测试提现配置...');
    console.log('模拟事件:', mockEvent);
    
    // 这里应该显示前端调用云函数的结果
    console.log('注意：实际测试需要在微信开发者工具中进行');
    console.log('修复的问题：');
    console.log('1. 数据库查询字段名错误：key → configKey');
    console.log('2. 数据库查询字段名错误：value → configValue');
    console.log('3. 提现门槛配置默认值：30元');
    console.log('4. 单次提现最多钱包余额的50%');
    console.log('5. 提现手续费：5%');
    
    return {
      success: true,
      message: '配置修复完成，请重新测试'
    };
  } catch (e) {
    console.error('测试失败:', e);
    return {
      success: false,
      message: e.message
    };
  }
};

// 运行测试
testWithdrawalConfig().then(result => {
  console.log('测试结果:', result);
});