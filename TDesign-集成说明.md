# TDesign 组件库集成说明

## 已完成集成

### 1. 基础配置
- ✅ 修改 `app.json` - 移除 `style: v2`，添加 `darkmode: true`
- ✅ 修改 `project.config.json` - 配置 npm 构建
- ✅ 安装 `tdesign-miniprogram` 依赖
- ✅ 配置全局 CSS 变量覆盖 TDesign 主题色

### 2. 首页 (pages/index)
集成组件：
- `t-skeleton` - 骨架屏加载效果
- `t-empty` - 空状态展示
- `t-loading` - 加载更多动画
- `t-button` - 空状态按钮

### 3. 发布页 (pages/publish)
集成组件：
- `t-input` - 输入框
- `t-textarea` - 文本域
- `t-button` - 按钮
- `t-dialog` - 对话框
- `t-toast` - 轻提示
- `t-picker` - 选择器
- `t-upload` - 图片上传

### 4. 我的页 (pages/mine)
集成组件：
- `t-cell` / `t-cell-group` - 列表单元格
- `t-avatar` - 头像
- `t-badge` - 徽标
- `t-tag` - 标签
- `t-collapse` / `t-collapse-panel` - 折叠面板

## 主题定制

TDesign 变量已覆盖为 iOS 26 深色风格：

```css
/* 主色调 */
--td-brand-color: #0A84FF;
--td-error-color: #FF453A;
--td-warning-color: #FF9F0A;
--td-success-color: #30D158;

/* 背景色 */
--td-bg-color-page: #000000;
--td-bg-color-container: #1C1C1E;
--td-bg-color-secondarycontainer: #2C2C2E;

/* 文字色 */
--td-text-color-primary: #FFFFFF;
--td-text-color-secondary: rgba(255, 255, 255, 0.85);
--td-text-color-placeholder: rgba(255, 255, 255, 0.55);
```

## 组件路径说明

由于手动复制了 TDesign 组件，引用路径需要加上 `miniprogram_dist` 前缀：

```json
{
  "usingComponents": {
    "t-button": "tdesign-miniprogram/miniprogram_dist/button/button",
    "t-skeleton": "tdesign-miniprogram/miniprogram_dist/skeleton/skeleton"
  }
}
```

在 `.wxml` 中使用：

```html
<t-button theme="primary" size="large">主要按钮</t-button>
<t-skeleton theme="image" animation="gradient" />
```

## 修复步骤

如果之前遇到 "路径下未找到组件" 错误，已执行以下修复：

1. ✅ 修改 `project.config.json` - 修正 `miniprogramNpmDistDir` 为 `./miniprogram/`
2. ✅ 手动复制 TDesign 组件到 `miniprogram/miniprogram_npm/`
3. ✅ 修正所有页面的组件引用路径，添加 `miniprogram_dist` 前缀
4. ✅ 修正 `app.wxss` 中的样式导入路径

现在可以直接在微信开发者工具中预览查看效果。

## 参考文档

- [TDesign 小程序官方文档](https://tdesign.tencent.com/miniprogram/overview)
