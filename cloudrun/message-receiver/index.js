/**
 * 微信消息推送接收服务
 * 用于接收微信服务器推送的消息和事件
 */

const express = require('express');
const app = express();

// 解析 JSON 请求体
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康检查接口
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: '消息推送服务运行中',
    timestamp: new Date().toISOString()
  });
});

// 接收微信消息推送 (POST)
app.post('/', (req, res) => {
  console.log('收到微信消息推送:', JSON.stringify(req.body, null, 2));
  console.log('请求头:', JSON.stringify(req.headers, null, 2));

  // 验证消息来源（如果开启公网访问）
  const wxSource = req.headers['x-wx-source'];
  if (wxSource && wxSource !== 'weixin') {
    console.warn('非法请求来源:', wxSource);
    return res.status(403).send('Forbidden');
  }

  // 处理不同类型的消息
  const message = req.body;
  
  try {
    switch (message.MsgType) {
      case 'text':
        // 文本消息
        handleTextMessage(message);
        break;
      case 'image':
        // 图片消息
        handleImageMessage(message);
        break;
      case 'event':
        // 事件消息（关注、取消关注等）
        handleEventMessage(message);
        break;
      default:
        console.log('其他类型消息:', message.MsgType);
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
function handleTextMessage(message) {
  console.log('文本消息:', {
    from: message.FromUserName,
    content: message.Content,
    msgId: message.MsgId,
    createTime: new Date(message.CreateTime * 1000).toLocaleString()
  });

  // TODO: 在这里添加业务逻辑
  // 例如：保存到数据库、发送客服消息回复等
}

// 处理图片消息
function handleImageMessage(message) {
  console.log('图片消息:', {
    from: message.FromUserName,
    picUrl: message.PicUrl,
    mediaId: message.MediaId,
    msgId: message.MsgId
  });
}

// 处理事件消息
function handleEventMessage(message) {
  const event = message.Event;
  console.log('事件消息:', {
    from: message.FromUserName,
    event: event,
    createTime: new Date(message.CreateTime * 1000).toLocaleString()
  });

  switch (event) {
    case 'subscribe':
      console.log('用户关注:', message.FromUserName);
      // TODO: 发送欢迎消息
      break;
    case 'unsubscribe':
      console.log('用户取消关注:', message.FromUserName);
      break;
    case 'CLICK':
      console.log('菜单点击事件:', message.EventKey);
      break;
    default:
      console.log('其他事件:', event);
  }
}

// 测试接口 - 模拟接收消息
app.post('/test', (req, res) => {
  console.log('测试消息:', req.body);
  res.json({ 
    received: true, 
    message: '测试消息已接收',
    data: req.body 
  });
});

// 获取消息日志接口（开发调试用）
app.get('/logs', (req, res) => {
  res.json({
    message: '消息日志功能待实现',
    tip: '可以将消息保存到数据库后查询展示'
  });
});

// 启动服务
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`消息推送接收服务已启动，端口: ${PORT}`);
  console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
