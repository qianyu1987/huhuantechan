/**
 * 接收微信消息推送 - 云托管版本
 * 使用 Express 框架，适合部署到云托管
 * 支持云调用：发送订阅消息、获取用户信息
 */

const express = require('express');
const cloud = require('wx-server-sdk');
const https = require('https');

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Token 验证密钥（与微信公众平台配置的一致）
const TOKEN = 'specialty_swap_token_2024';

/**
 * 云调用 - 发送订阅消息
 * @param {string} openid - 用户openid
 * @param {string} templateId - 模板ID
 * @param {object} data - 模板数据
 * @param {string} page - 跳转页面（可选）
 */
async function sendSubscribeMessage(openid, templateId, data, page = '') {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      touser: openid,
      template_id: templateId,
      page: page,
      data: data
    });

    const options = {
      hostname: 'api.weixin.qq.com',
      path: '/cgi-bin/message/subscribe/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      const seqId = res.headers['x-openapi-seqid'];
      if (seqId) {
        console.log('订阅消息云调用成功，seqId:', seqId);
      }

      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          console.log('发送订阅消息结果:', result);
          resolve(result);
        } catch (e) {
          resolve(responseData);
        }
      });
    });

    req.on('error', (err) => {
      console.error('发送订阅消息失败:', err);
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 云调用 - 获取用户信息
 * @param {string} openid - 用户openid
 * @param {string} lang - 语言（默认zh_CN）
 */
async function getUserInfo(openid, lang = 'zh_CN') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.weixin.qq.com',
      path: `/cgi-bin/user/info?openid=${openid}&lang=${lang}`,
      method: 'GET'
    };

    const req = https.request(options, (res) => {
      const seqId = res.headers['x-openapi-seqid'];
      if (seqId) {
        console.log('获取用户信息云调用成功，seqId:', seqId);
      }

      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          console.log('获取用户信息结果:', result);
          resolve(result);
        } catch (e) {
          resolve(responseData);
        }
      });
    });

    req.on('error', (err) => {
      console.error('获取用户信息失败:', err);
      reject(err);
    });

    req.end();
  });
}

/**
 * 云调用 - 发送客服消息
 * @param {string} openid - 用户openid
 * @param {string} msgtype - 消息类型（text/image/link...）
 * @param {object} content - 消息内容
 */
async function sendCustomerMessage(openid, msgtype, content) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      touser: openid,
      msgtype: msgtype,
      [msgtype]: content
    });

    const options = {
      hostname: 'api.weixin.qq.com',
      path: '/cgi-bin/message/custom/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      const seqId = res.headers['x-openapi-seqid'];
      if (seqId) {
        console.log('客服消息云调用成功，seqId:', seqId);
      }

      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          console.log('发送客服消息结果:', result);
          resolve(result);
        } catch (e) {
          resolve(responseData);
        }
      });
    });

    req.on('error', (err) => {
      console.error('发送客服消息失败:', err);
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 验证微信服务器签名
 * 仅在安全模式下需要，明文模式可跳过
 */
function checkSignature(signature, timestamp, nonce, token) {
  const crypto = require('crypto');
  const arr = [token, timestamp, nonce].sort();
  const str = arr.join('');
  const hash = crypto.createHash('sha1').update(str).digest('hex');
  return hash === signature;
}

// ====== 健康检查 ======
app.get('/', (req, res) => {
  res.send('Message Receiver Service is running');
});

// ====== 处理 GET 请求（微信 Token 验证）======
app.get('/receiveMessage', (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query;

  console.log('收到 Token 验证请求:', { signature, timestamp, nonce, echostr });

  // 明文模式下直接返回 echostr
  if (echostr) {
    return res.send(echostr);
  }

  res.send('success');
});

// ====== 处理 POST 请求（消息推送）======
app.post('/receiveMessage', async (req, res) => {
  console.log('收到消息推送:', JSON.stringify(req.body, null, 2));

  const message = req.body;

  // 处理测试请求
  if (message && message.action === 'CheckContainerPath') {
    return res.send('success');
  }

  try {
    // 处理不同类型的消息
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
    res.send('success');
  } catch (error) {
    console.error('处理消息失败:', error);
    // 即使处理失败也返回 success，避免微信重试
    res.send('success');
  }
});

// 处理文本消息
async function handleTextMessage(message) {
  console.log('文本消息:', {
    from: message.FromUserName,
    content: message.Content,
    msgId: message.MsgId,
    createTime: new Date(message.CreateTime * 1000).toLocaleString()
  });

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
  const openid = message.FromUserName;

  console.log('事件消息:', {
    from: openid,
    event: event,
    createTime: new Date(message.CreateTime * 1000).toLocaleString()
  });

  const db = cloud.database();

  switch (event) {
    case 'subscribe':
      console.log('用户关注:', openid);
      try {
        // 1. 获取用户信息
        const userInfo = await getUserInfo(openid);
        console.log('获取到用户信息:', userInfo);

        // 2. 保存用户事件
        await db.collection('user_events').add({
          data: {
            type: 'subscribe',
            openid: openid,
            userInfo: userInfo,
            createTime: db.serverDate()
          }
        });

        // 3. 发送欢迎客服消息
        await sendCustomerMessage(openid, 'text', {
          content: `🎉 欢迎${userInfo.nickname || '新朋友'}关注特产互换平台！\n\n在这里你可以：\n✅ 发布家乡特产\n✅ 寻找心仪特产\n✅ 与其他用户互换\n\n点击菜单开始探索吧～`
        });

        console.log('已发送欢迎消息给:', openid);
      } catch (e) {
        console.error('处理关注事件失败:', e);
      }
      break;

    case 'unsubscribe':
      console.log('用户取消关注:', openid);
      try {
        await db.collection('user_events').add({
          data: {
            type: 'unsubscribe',
            openid: openid,
            createTime: db.serverDate()
          }
        });
      } catch (e) {}
      break;

    case 'CLICK':
      console.log('菜单点击事件:', message.EventKey);
      // 可以在这里处理菜单点击，发送相应消息
      if (message.EventKey === 'CONTACT_SERVICE') {
        await sendCustomerMessage(openid, 'text', {
          content: '👋 您好！有什么可以帮助您的吗？\n\n常见问题：\n1. 如何发布特产？\n2. 如何发起互换？\n3. 押金如何退还？\n\n请回复数字获取帮助，或描述您的问题。'
        });
      }
      break;

    default:
      console.log('其他事件:', event);
  }
}

// 启动服务
const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
  console.log(`Message receiver service running on port ${PORT}`);
});

module.exports = app;
