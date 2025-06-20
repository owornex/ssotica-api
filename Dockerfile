# 1. Imagem Base (tentar v1.44.0-jammy, senão usar a mais recente estável com -jammy)
# Nota: Mantendo v1.44.0-jammy conforme solicitado. Se houver problemas de compatibilidade,
# a tag pode precisar ser atualizada para uma versão mais recente como v1.53.1-jammy ou v1-jammy.
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

# 2. Variável de Ambiente NODE_ENV
ENV NODE_ENV production

# 4. Otimização da Ordem e Instalação do Playwright (parcial: COPY package*.json)
COPY package*.json ./

# 3. Instalação de Dependências Node (usando npm ci)
# 4. Otimização da Ordem e Instalação do Playwright (parcial: RUN npm ci e RUN npx playwright install)
RUN npm ci --omit=dev
RUN npx playwright install --with-deps

# 4. Otimização da Ordem (parcial: COPY . .)
COPY . .

# 5. Usuário Não-Root
# Cria grupo e usuário 'node', define permissões e muda para o usuário 'node'
RUN groupadd --gid 1001 node && \
    useradd --uid 1001 --gid 1001 --shell /bin/bash --create-home node
RUN chown -R node:node /app
USER node

EXPOSE 3189

# 6. Comando CMD (permanece o mesmo)
CMD ["node", "index.js"]
