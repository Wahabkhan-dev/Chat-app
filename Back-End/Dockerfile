FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p uploads

ENV NODE_ENV=production
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s CMD node -e "const http=require('http'); const req=http.get('http://127.0.0.1:3001/api/health', res=>process.exit(res.statusCode===200?0:1)); req.on('error', ()=>process.exit(1));"

CMD ["node", "server.js"]
