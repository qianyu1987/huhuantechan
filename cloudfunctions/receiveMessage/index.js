/**
 * 接收微信消息推送云函数
 * 用于接收微信服务器推送的消息和事件
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// Token 验证密钥（与微信公众平台配置的一致）
const TOKEN = 'specialty_swap_token_2024';

exports.main = async (event, context) => {
  console.log('收到请求:', JSON.stringify(event, null, 2));
  
  // 获取请求信息
  const { httpMethod, body, headers, queryStringParameters } = event;
  
  // 验证请求来源（可选安全验证）
  const wxSource = headers && headers['x-wx-source'];
  if (wxSource && wxSource !== 'weixin') {
    console.warn('非法请求来源:', wxSource);
    return {
      statusCode: 403,
      body: 'Forbidden'
    };
  }

  // ====== 处理 GET 请求（微信 Token 验证）======
  if (httpMethod === 'GET' || httpMethod === 'get') {
    const { signature, timestamp, nonce, echostr } = queryStringParameters || {};
    
    console.log('收到 Token 验证请求:', { signature, timestamp, nonce, echostr });
    
    if (echostr) {
      // 微信服务器配置验证，直接返回 echostr
      // 注意：云开发环境下，微信会自动处理签名验证，这里直接返回 echostr 即可
      return {
        statusCode: 200,
        body: echostr
      };
    }
    
    return {
      statusCode: 200,
      body: 'success'
    };
  }

  // ====== 处理 POST 请求（消息推送）======
  // 解析消息
  let message = body;
  if (typeof body === 'string') {
    try {
      message = JSON.parse(body);
    } catch (e) {
      console.log('消息不是JSON格式:', body);
    }
  }

  // 处理测试请求（微信配置时发送的验证请求）
  if (message && message.action === 'CheckContainerPath') {
    return {
      statusCode: 200,
      body: 'success'
    };
  }

  // 处理不同类型的消息
  try {
    if (message.MsgType) {
      switch (message.MsgType) {
        case 'text':
          await handleTextMessage(message);
          break;
        case 'image':
          await handleImageMessage(message);
          break;
        case 'event':
          await handleEventMessage(message);
          break;
        default:
          console.log('其他类型消息:', message.MsgType);
      }
    }

    // 返回 success 表示接收成功
    return {
      statusCode: 200,
      body: 'success'
    };
  } catch (error) {
    console.error('处理消息失败:', error);
    // 即使处理失败也返回 success，避免微信重试
    return {
      statusCode: 200,
      body: 'success'
    };
  }
};

// 处理文本消息
async function handleTextMessage(message) {
  console.log('文本消息:', {
    from: message.FromUserName,
    content: message.Content,
    msgId: message.MsgId,
    createTime: new Date(message.CreateTime * 1000).toLocaleString()
  });

  // 保存到数据库（可选）
  const db = cloud.database();
  try {
    await db.collection('message_logs').add({
      data: {
        type: 'text',
        fromUser: message.FromUserName,
        content: message.Content,
        msgId: message.MsgId,
        createTime: db.serverDate()
      }
    });
  } catch (e) {
    console.log('保存消息日志失败:', e);
  }
}

// 处理图片消息
async function handleImageMessage(message) {
  console.log('图片消息:', {
    from: message.FromUserName,
    picUrl: message.PicUrl,
    mediaId: message.MediaId,
    msgId: message.MsgId
  });
}

// 处理事件消息
async function handleEventMessage(message) {
  const event = message.Event;
  console.log('事件消息:', {
    from: message.FromUserName,
    event: event,
    createTime: new Date(message.CreateTime * 1000).toLocaleString()
  });

  const db = cloud.database();

  switch (event) {
    case 'subscribe':
      console.log('用户关注:', message.FromUserName);
      // 保存关注记录
      try {
        await db.collection('user_events').add({
          data: {
            type: 'subscribe',
            openid: message.FromUserName,
            createTime: db.serverDate()
          }
        });
      } catch (e) {}
      break;
      
    case 'unsubscribe':
      console.log('用户取消关注:', message.FromUserName);
      // 保存取消关注记录
      try {
        await db.collection('user_events').add({
          data: {
            type: 'unsubscribe',
            openid: message.FromUserName,
            createTime: db.serverDate()
          }
        });
      } catch (e) {}
      break;
      
    case 'CLICK':
      console.log('菜单点击事件:', message.EventKey);
      break;
      
    default:
      console.log('其他事件:', event);
  }
}
