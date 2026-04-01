FROM node:18-alpine

WORKDIR /app

# 复制 package.json 并安装依赖
COPY package*.json ./
RUN npm ci --omit=dev

# 复制应用代码
COPY . .

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["node", "index.js"]
