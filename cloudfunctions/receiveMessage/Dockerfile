# 使用 Node.js 官方镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json
COPY package*.json ./

# 安装依赖
RUN npm install --production

# 复制应用代码
COPY . .

# 暴露端口（云托管默认使用 80）
EXPOSE 80

# 启动命令
CMD ["node", "app.js"]
