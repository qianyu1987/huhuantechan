# 默认特产图片占位图

由于无法直接生成图片文件，请手动添加一张默认占位图：

**操作步骤：**
1. 准备一张 200x200 像素的 PNG 图片作为默认占位图
2. 命名为 `default-product.png`
3. 放到 `miniprogram/images/` 目录下

**或者使用在线占位图服务：**
将首页代码中的默认图片路径改为：
```javascript
coverUrl: processedImages[0] || 'https://via.placeholder.com/200x200?text=No+Image'
```

**建议：**
- 设计一个简洁的"暂无图片"占位图
- 或者使用小程序内置的图标代替
