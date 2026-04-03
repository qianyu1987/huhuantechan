// 数据库索引创建脚本
// 在小程序云开发控制台运行

// ai_face_records 集合索引
db.collection('ai_face_records').createIndex({
  _openid: 1,
  date: -1
})

// wallet_logs 集合索引
db.collection('wallet_logs').createIndex({
  _openid: 1,
  createTime: -1
})

// ai_face_config 集合索引
db.collection('ai_face_config').createIndex({
  _openid: 1
})
