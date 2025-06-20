FROM mcr.microsoft.com/playwright:v1.53.1-jammy

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npx playwright install --with-deps

EXPOSE 3189

CMD ["node", "index.js"]
