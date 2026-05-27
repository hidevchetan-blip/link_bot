FROM node:20

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npx playwright install

CMD ["node", "server.js"]