// cloudfunctions/syncOfficialArticles/index.js
// 同步公众号文章到数据库
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 公众号配置
const OFFICIAL_ACCOUNT = {
  ghId: 'gh_73867e27d425',
  appId: 'wxf7de00498684ac9a',
  appSecret: 'd344e86bf5a357d77c3dd37d173f0f74',
  name: '正义小钱哥'
}

// HTTP 请求封装
function httpRequest(options) {
  return new Promise((resolve, reject) => {
    const https = require('https')
    const url = require('url')
    
    const parsedUrl = url.parse(options.url)
    const reqOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      method: options.method || 'GET',
      headers: options.headers || {}
    }
    
    const req = https.request(reqOptions, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => { resolve({ statusCode: res.statusCode, body: data }) })
    })
    
    req.on('error', (err) => { reject(err) })
    
    if (options.body) { req.write(options.body) }
    req.end()
  })
}

exports.main = async (event, context) => {
  const { action } = event
  
  try {
    switch(action) {
      case 'test':
        return await testConnection()
      case 'sync':
        return await syncArticles()
      case 'getList':
        return await getArticleList(event)
      case 'getDetail':
        return await getArticleDetail(event)
      case 'addArticle':
        return await addArticle(event)
      case 'deleteArticle':
        return await deleteArticle(event)
      default:
        return { success: false, message: '未知操作' }
    }
  } catch (error) {
    console.error('公众号文章操作失败:', error)
    return { success: false, error: error.message }
  }
}

// 添加文章
async function addArticle(event) {
  const { title, summary, coverUrl, sourceUrl } = event
  
  if (!title || !summary) {
    return { success: false, message: '标题和摘要不能为空' }
  }
  
  const article = {
    title,
    summary: summary || '',
    coverUrl: coverUrl || '',
    sourceUrl: sourceUrl || '',
    officialAccount: OFFICIAL_ACCOUNT,
    publishTime: new Date(),
    createTime: db.serverDate(),
    viewCount: 0
  }
  
  const res = await db.collection('official_articles').add({ data: article })
  
  return { success: true, message: '文章添加成功', id: res._id }
}

// 删除文章
async function deleteArticle(event) {
  const { id } = event
  if (!id) { return { success: false, message: '文章ID不能为空' } }
  await db.collection('official_articles').doc(id).remove()
  return { success: true, message: '文章删除成功' }
}

// 同步公众号文章
async function syncArticles() {
  try {
    // 尝试从微信公众号 API 获取文章
    const apiResult = await syncFromWechatAPI()
    if (apiResult.success && apiResult.count > 0) {
      return apiResult
    }
    // 如果 API 获取失败，使用示例文章
    console.log('API 获取失败，使用示例文章')
    return await syncSampleArticles()
  } catch (error) {
    console.error('同步文章失败:', error)
    return { success: false, message: error.message }
  }
}

// 从微信公众号 API 同步文章
async function syncFromWechatAPI() {
  try {
    console.log('=== 开始同步公众号文章 ===')
    console.log('时间:', new Date().toISOString())
    
    // 1. 获取 access_token
    const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${OFFICIAL_ACCOUNT.appId}&secret=${OFFICIAL_ACCOUNT.appSecret}`
    
    console.log('请求 access_token...')
    const tokenRes = await httpRequest({ url: tokenUrl, method: 'GET' })
    
    console.log('Token响应状态:', tokenRes.statusCode)
    
    let tokenData
    try {
      tokenData = JSON.parse(tokenRes.body)
    } catch (e) {
      console.error('解析 token 响应失败:', tokenRes.body)
      return { success: false, count: 0, error: '解析响应失败' }
    }
    
    console.log('Token响应:', JSON.stringify(tokenData, null, 2))
    
    if (tokenData.errcode) {
      console.error('获取 access_token 失败:', tokenData.errmsg)
      return { 
        success: false, 
        count: 0, 
        error: `获取access_token失败: ${tokenData.errmsg} (错误码: ${tokenData.errcode})`
      }
    }
    
    if (!tokenData.access_token) {
      console.error('没有获取到 access_token')
      return { success: false, count: 0, error: '获取access_token失败' }
    }
    
    console.log('✓ 获取 access_token 成功')
    const accessToken = tokenData.access_token
    
    // 2. 获取永久素材列表
    console.log('请求素材列表...')
    const mediaUrl = `https://api.weixin.qq.com/cgi-bin/material/batchget_material?access_token=${accessToken}`
    
    const requestBody = JSON.stringify({ type: 'news', offset: 0, count: 20 })
    console.log('请求体:', requestBody)
    
    const mediaRes = await httpRequest({
      url: mediaUrl,
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      },
      body: requestBody
    })
    
    console.log('素材响应状态:', mediaRes.statusCode)
    
    let mediaData
    try {
      mediaData = JSON.parse(mediaRes.body)
    } catch (e) {
      console.error('解析素材响应失败:', mediaRes.body)
      return { success: false, count: 0, error: '解析素材响应失败' }
    }
    
    console.log('素材响应:', JSON.stringify(mediaData, null, 2))
    
    if (mediaData.errcode) {
      console.error('获取素材失败:', mediaData.errmsg)
      return { 
        success: false, 
        count: 0, 
        error: `获取素材失败: ${mediaData.errmsg} (错误码: ${mediaData.errcode})`
      }
    }
    
    if (!mediaData.item) {
      console.error('素材列表为空:', mediaData)
      return { success: false, count: 0, error: '素材列表为空' }
    }
    
    if (mediaData.item.length === 0) {
      console.log('公众号没有图文素材')
      return { success: false, count: 0, error: '公众号没有图文素材' }
    }
    
    console.log(`✓ 获取到 ${mediaData.item.length} 个素材`)
    
    // 3. 处理文章
    let addedCount = 0
    let updatedCount = 0
    
    for (const item of mediaData.item) {
      console.log('处理素材:', JSON.stringify(item, null, 2))
      
      const newsItem = item.content && item.content.news_item ? item.content.news_item[0] : null
      if (!newsItem) {
        console.log('跳过无效素材: 没有 news_item')
        continue
      }
      
      console.log('文章信息:', {
        title: newsItem.title,
        url: newsItem.url,
        digest: newsItem.digest
      })
      
      const article = {
        title: newsItem.title,
        summary: newsItem.digest || newsItem.title,
        coverUrl: newsItem.thumb_url || '',
        sourceUrl: newsItem.url,
        publishTime: new Date(item.update_time * 1000),
        mediaId: item.media_id
      }
      
      const exist = await db.collection('official_articles').where({ mediaId: article.mediaId }).get()
      
      if (exist.data.length === 0) {
        await db.collection('official_articles').add({
          data: { ...article, officialAccount: OFFICIAL_ACCOUNT, createTime: db.serverDate(), viewCount: 0, isTop: false }
        })
        addedCount++
        console.log('✓ 新增:', article.title)
      } else {
        await db.collection('official_articles').doc(exist.data[0]._id).update({
          data: { title: article.title, summary: article.summary, coverUrl: article.coverUrl, updateTime: db.serverDate() }
        })
        updatedCount++
        console.log('✓ 更新:', article.title)
      }
    }
    
    console.log('=== 同步完成 ===')
    return { success: true, message: `同步完成，新增 ${addedCount} 篇，更新 ${updatedCount} 篇`, count: addedCount + updatedCount }
  } catch (error) {
    console.error('从API同步失败:', error)
    return { success: false, count: 0, error: error.message }
  }
}

// 同步示例文章
async function syncSampleArticles() {
  const sampleArticles = [
    {
      title: '🎉 欢迎使用特产互换小程序',
      summary: '在这里，你可以与全国各地的朋友互换家乡特产，体验不同地域的美食和文化。',
      coverUrl: '',
      sourceUrl: 'https://mp.weixin.qq.com/s/welcome'
    },
    {
      title: '📢 平台规则更新公告',
      summary: '为了提升用户体验，我们对平台规则进行了优化。',
      coverUrl: '',
      sourceUrl: 'https://mp.weixin.qq.com/s/rules'
    },
    {
      title: '⭐ 信用体系说明',
      summary: '信用分是平台的重要指标，本文详细介绍信用分规则。',
      coverUrl: '',
      sourceUrl: 'https://mp.weixin.qq.com/s/credit'
    }
  ]
  
  let addedCount = 0
  let updatedCount = 0
  
  for (const article of sampleArticles) {
    const exist = await db.collection('official_articles').where({ sourceUrl: article.sourceUrl }).get()
    
    if (exist.data.length === 0) {
      await db.collection('official_articles').add({
        data: { ...article, officialAccount: OFFICIAL_ACCOUNT, createTime: db.serverDate(), viewCount: 0, isTop: false }
      })
      addedCount++
    } else {
      await db.collection('official_articles').doc(exist.data[0]._id).update({
        data: { title: article.title, summary: article.summary, updateTime: db.serverDate() }
      })
      updatedCount++
    }
  }
  
  return { success: true, message: `示例文章同步完成，新增 ${addedCount} 篇，更新 ${updatedCount} 篇` }
}

// 测试公众号 API 连接
async function testConnection() {
  try {
    console.log('=== 测试公众号 API 连接 ===')
    
    // 1. 测试获取 access_token
    const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${OFFICIAL_ACCOUNT.appId}&secret=${OFFICIAL_ACCOUNT.appSecret}`
    
    console.log('请求 token...')
    const tokenRes = await httpRequest({ url: tokenUrl, method: 'GET' })
    
    let tokenData
    try {
      tokenData = JSON.parse(tokenRes.body)
    } catch (e) {
      return { success: false, stage: 'token_parse', error: '解析失败', body: tokenRes.body }
    }
    
    if (tokenData.errcode) {
      return { success: false, stage: 'token', error: tokenData.errmsg, errcode: tokenData.errcode }
    }
    
    if (!tokenData.access_token) {
      return { success: false, stage: 'token', error: '没有 access_token' }
    }
    
    console.log('✓ Token 获取成功')
    
    // 2. 测试获取素材列表
    const accessToken = tokenData.access_token
    const mediaUrl = `https://api.weixin.qq.com/cgi-bin/material/batchget_material?access_token=${accessToken}`
    
    const requestBody = JSON.stringify({ type: 'news', offset: 0, count: 1 })
    
    const mediaRes = await httpRequest({
      url: mediaUrl,
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      },
      body: requestBody
    })
    
    let mediaData
    try {
      mediaData = JSON.parse(mediaRes.body)
    } catch (e) {
      return { success: false, stage: 'media_parse', error: '解析失败', body: mediaRes.body }
    }
    
    if (mediaData.errcode) {
      return { success: false, stage: 'media', error: mediaData.errmsg, errcode: mediaData.errcode }
    }
    
    return {
      success: true,
      message: '连接测试成功',
      tokenInfo: {
        expires_in: tokenData.expires_in
      },
      mediaInfo: {
        total_count: mediaData.total_count,
        item_count: mediaData.item_count
      }
    }
  } catch (error) {
    console.error('测试连接失败:', error)
    return { success: false, stage: 'exception', error: error.message }
  }
}

// 获取文章列表
async function getArticleList(event) {
  const { page = 1, pageSize = 10 } = event
  
  const res = await db.collection('official_articles')
    .orderBy('publishTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  
  const total = await db.collection('official_articles').count()
  
  return { success: true, list: res.data, total: total.total, page, pageSize }
}

// 获取文章详情
async function getArticleDetail(event) {
  const { id } = event
  if (!id) { return { success: false, message: '文章ID不能为空' } }
  
  const res = await db.collection('official_articles').doc(id).get()
  if (!res.data) { return { success: false, message: '文章不存在' } }
  
  await db.collection('official_articles').doc(id).update({ data: { viewCount: _.inc(1) } })
  
  return { success: true, article: res.data }
}
