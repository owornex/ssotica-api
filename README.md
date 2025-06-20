# API SSótica

API para consultar informações de parcelas do sistema SSÓtica.

## Funcionalidades

- Consulta dados de parcelas de clientes no sistema SSÓtica.
- Retorna a parcela em aberto ou em atraso com vencimento mais próximo.

## Tecnologias

- Node.js
- Express.js
- Playwright (para web scraping)
- Docker

## Variáveis de Ambiente

A aplicação utiliza as seguintes variáveis de ambiente, que podem ser configuradas em um arquivo `.env`:

-   `PORT`: Porta em que a API interna do Node.js vai rodar (o Dockerfile expõe a porta 3189, que é o padrão da aplicação).
-   `SSOTICA_EMAIL`: Email para login no sistema SSÓtica (obrigatório).
-   `SSOTICA_PASSWORD`: Senha para login no sistema SSÓtica (obrigatório).
-   `SSOTICA_BASE_URL`: URL base do sistema SSÓtica. (Padrão: `https://app.ssotica.com.br`)
-   `SSOTICA_CONTAS_A_RECEBER_PATH`: Caminho para a página de contas a receber. (Padrão: `/financeiro/contas-a-receber/LwlRRM/listar`)
-   `SSOTICA_SEARCH_TYPE_VALUE`: Valor para o tipo de busca no sistema. (Padrão: `nome_apelido`)
-   `STATUS_FILTER_ABERTO`: Palavra-chave para identificar status de parcela "em aberto". (Padrão: `aberto`)
-   `STATUS_FILTER_ATRASO`: Palavra-chave para identificar status de parcela "em atraso". (Padrão: `atraso`)
-   `WAIT_FOR_RESULTS_TIMEOUT`: Timeout em milissegundos para aguardar os resultados da busca. (Padrão: `10000`)

A variável `NODE_ENV=production` já está configurada diretamente na imagem Docker, otimizando a execução para produção.

### Exemplo de arquivo `.env`

Crie um arquivo chamado `.env` na raiz do projeto com o seguinte conteúdo, substituindo os valores conforme necessário:

```env
# Porta em que a API vai rodar (se diferente do padrão 3189 usado no index.js e Dockerfile EXPOSE)
# PORT=3189

# Credenciais para o sistema SSÓtica (OBRIGATÓRIO)
SSOTICA_EMAIL=seu_email_aqui
SSOTICA_PASSWORD=sua_senha_aqui

# Configurações opcionais (a aplicação usará valores padrão se não definidas aqui)
# SSOTICA_BASE_URL=https://app.ssotica.com.br
# SSOTICA_CONTAS_A_RECEBER_PATH=/financeiro/contas-a-receber/LwlRRM/listar
# SSOTICA_SEARCH_TYPE_VALUE=nome_apelido
# STATUS_FILTER_ABERTO=aberto
# STATUS_FILTER_ATRASO=atraso
# WAIT_FOR_RESULTS_TIMEOUT=10000
```

## Executando com Docker

Para construir e executar esta aplicação usando Docker, siga os passos abaixo.

### 1. Construir a Imagem Docker

Navegue até o diretório raiz do projeto (onde o `Dockerfile` está localizado) e execute o seguinte comando para construir a imagem:

```bash
docker build -t ssotica-api .
```

Isso criará uma imagem Docker chamada `ssotica-api` com base nas instruções do `Dockerfile`.

### 2. Executar o Container Docker

Após construir a imagem, você pode executar um container a partir dela. Certifique-se de ter um arquivo `.env` configurado na raiz do projeto, conforme o exemplo acima.

```bash
docker run -d \
    -p 3189:3189 \
    --env-file .env \
    --name ssotica-container \
    ssotica-api
```

Explicação do comando `docker run`:
-   `-d`: Roda o container em modo "detached" (em segundo plano).
-   `-p 3189:3189`: Mapeia a porta 3189 do host para a porta 3189 do container (onde a aplicação está rodando, conforme exposto no Dockerfile e no `index.js`).
-   `--env-file .env`: Carrega as variáveis de ambiente definidas no seu arquivo `.env` para dentro do container. Este é o método recomendado para passar configurações e segredos para a sua aplicação.
-   `--name ssotica-container`: Define um nome para o seu container, facilitando o gerenciamento.
-   `ssotica-api`: Especifica a imagem Docker a ser usada para criar o container.

Após executar este comando, a API deverá estar acessível em `http://localhost:3189`.

## Endpoint da API

### POST `/api/consultar`

Consulta as parcelas de um cliente.

**Corpo da Requisição (JSON):**

```json
{
  "nome": "Nome Completo do Cliente Exemplo"
}
```

**Resposta de Sucesso (JSON):**

Retorna os dados da parcela em aberto ou em atraso com o vencimento mais próximo para o cliente.

```json
{
  "cliente": "Nome Completo do Cliente Exemplo",
  "parcela_atual": {
    "descricao": "Descrição da Parcela",
    "venda": "12345",
    "valor": "R$ 100,00",
    "vencimento": "DD/MM/YYYY",
    "status": "Em Aberto"
  }
}
```

**Respostas de Erro:**
-   `400 Bad Request`: Se o campo `nome` não for fornecido no corpo da requisição.
-   `404 Not Found`: Se nenhuma parcela for encontrada para o cliente, ou se nenhuma parcela corresponder aos critérios de filtro (status e data válida).
-   `500 Internal Server Error`: Para erros inesperados no servidor, falhas de login no sistema externo, ou problemas na extração de dados.
-   `503 Service Unavailable`: Se o navegador interno (Playwright) não estiver inicializado corretamente.

---
*Nota: Este README foi atualizado para refletir as configurações e práticas mais recentes da aplicação.*
