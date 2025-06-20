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
-   `SSOTICA_BASE_URL`: URL base do sistema SSÓtica, incluindo o esquema (http ou https). Este é o ponto de partida para todas as interações com o sistema. (Padrão: `https://app.ssotica.com.br`)
-   `SSOTICA_CONTAS_A_RECEBER_PATH`: Caminho URL específico, após a URL base, para acessar a página de 'Contas a Receber' dentro do sistema SSÓtica. Este caminho pode mudar se a estrutura do site SSÓtica for alterada. (Padrão: `/financeiro/contas-a-receber/LwlRRM/listar`)
-   `SSOTICA_SEARCH_TYPE_VALUE`: Valor interno usado pelo SSÓtica para definir o critério de busca na página de Contas a Receber (ex: buscar por 'nome_apelido', 'codigo_cliente', etc.). Este valor corresponde ao atributo `value` de um elemento `<select>` (dropdown) na página de busca do SSÓtica e pode precisar ser ajustado se a interface do sistema mudar. (Padrão: `nome_apelido`)
-   `STATUS_FILTER_ABERTO`: Texto (ou parte do texto, case-insensitive) que a API procura para identificar uma parcela como 'em aberto' no sistema SSÓtica. Ajuste se a terminologia no SSÓtica for diferente. (Padrão: `aberto`)
-   `STATUS_FILTER_ATRASO`: Texto (ou parte do texto, case-insensitive) que a API procura para identificar uma parcela como 'em atraso' no sistema SSÓtica. Ajuste se a terminologia no SSÓtica for diferente. (Padrão: `atraso`)
-   `WAIT_FOR_RESULTS_TIMEOUT`: Tempo máximo (em milissegundos) que a API aguardará pelo carregamento dos resultados da busca na página do SSÓtica. Se a conexão for lenta ou o SSÓtica demorar para responder, este valor pode precisar ser aumentado. (Padrão: `10000`)

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

### Opção 2: Usando Docker Compose

Docker Compose simplifica o gerenciamento de aplicações Docker, especialmente aquelas com múltiplos containers (embora aqui tenhamos um único serviço principal, ele padroniza a execução e configuração). Com o arquivo `docker-compose.yml` presente na raiz do projeto, você pode gerenciar a aplicação de forma mais declarativa.

1.  **Certifique-se de que o arquivo `.env` está configurado:**
    Assim como na execução manual com `docker run`, o Docker Compose utilizará o arquivo `.env` na raiz do projeto para carregar as variáveis de ambiente necessárias. Consulte a seção "Exemplo de arquivo `.env`" para mais detalhes.

2.  **Iniciar a aplicação:**
    Para construir a imagem (se ainda não construída) e iniciar o container, execute o seguinte comando na raiz do projeto:
    ```bash
    docker-compose up
    ```
    Este comando exibirá os logs da aplicação no terminal.

    Para iniciar a aplicação em modo "detached" (em segundo plano), utilize:
    ```bash
    docker-compose up -d
    ```

3.  **Parar a aplicação:**
    Para parar e remover os containers definidos no `docker-compose.yml`, execute:
    ```bash
    docker-compose down
    ```

Após iniciar com `docker-compose up`, a API também estará acessível em `http://localhost:3189`.

## Endpoint da API

### POST `/api/consultar`

Consulta as parcelas de um cliente.

**Corpo da Requisição (JSON):**

```json
{
  "nome": "Nome completo do cliente para consulta"
}
```

**Resposta de Sucesso (JSON):**

Retorna os dados da parcela em aberto ou em atraso com o vencimento mais próximo para o cliente.

```json
{
  "cliente": "Nome Completo do Cliente Exemplo",
  "parcela_atual": {
    "descricao": "Descrição da natureza da parcela (ex: 'MANUTENCAO DE SISTEMA').",
    "venda": "Número identificador da venda associada à parcela (ex: '12345').",
    "valor": "Valor monetário da parcela (ex: 'R$ 100,00').",
    "vencimento": "Data de vencimento da parcela no formato DD/MM/YYYY.",
    "status": "Situação atual da parcela (ex: 'Em Aberto', 'Em Atraso')."
  }
}
```

**Respostas de Erro:**
-   `400 Bad Request`: "O campo `nome` não foi fornecido no corpo da requisição."
-   `404 Not Found`: "Nenhuma parcela encontrada para o cliente, ou nenhuma parcela em aberto/atraso com data de vencimento válida foi localizada. Isso pode ocorrer se o cliente não existir, não tiver parcelas registradas, ou se todas as parcelas existentes não atenderem aos critérios de status (em aberto/em atraso) e formato de data de vencimento."
-   `500 Internal Server Error`: "Ocorreu um erro inesperado no servidor. Isso pode incluir falhas ao tentar fazer login no sistema SSOtica (ex: credenciais inválidas, instabilidade do SSOtica), problemas durante a navegação ou extração de dados do sistema externo (ex: mudanças na estrutura HTML do site SSOtica, timeouts inesperados), ou outros erros internos da API não diretamente relacionados ao Playwright."
-   `503 Service Unavailable`: "O serviço está temporariamente indisponível porque o navegador interno (Playwright) não foi inicializado corretamente ou não está acessível. Isso geralmente é um problema transitório, de inicialização do servidor da API, ou pode indicar que o processo do Playwright falhou."

## Exemplos de Uso da API

Esta seção demonstra como interagir com o endpoint `/api/consultar` utilizando `curl` e JavaScript `fetch`.

### Exemplo com `curl`

Você pode usar o `curl` para enviar uma requisição POST para a API a partir do seu terminal:

```bash
curl -X POST \
  http://localhost:3189/api/consultar \
  -H 'Content-Type: application/json' \
  -d '{
    "nome": "Nome Exemplo Cliente"
  }'
```

### Exemplo com JavaScript `fetch`

O exemplo abaixo mostra como chamar a API usando a função `fetch` em um ambiente JavaScript (como um navegador ou Node.js).

```javascript
async function consultarCliente(nomeCliente) {
  const url = 'http://localhost:3189/api/consultar';
  const data = { nome: nomeCliente };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      // Tenta extrair uma mensagem de erro do corpo da resposta JSON
      let errorMessage = `Erro HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage += `: ${errorData.message || errorData.error || 'Nenhuma mensagem específica retornada.'}`;
      } catch (e) {
        // Se o corpo não for JSON ou não puder ser lido, usa o texto de status
        errorMessage += `: ${response.statusText}`;
      }
      console.error(errorMessage);
      return null;
    }

    const resultado = await response.json();
    console.log('Dados da parcela:', resultado);
    return resultado;
  } catch (error) {
    // Captura erros de rede ou outros problemas com a requisição fetch em si
    console.error('Erro na requisição fetch:', error);
    return null;
  }
}

// Exemplo de como chamar a função:
// Supondo que a API esteja rodando e acessível em http://localhost:3189
// consultarCliente("Nome Exemplo Cliente")
//   .then(dados => {
//     if (dados) {
//       console.log("Operação bem-sucedida:", dados);
//     } else {
//       console.log("Operação falhou.");
//     }
//   });
```
Lembre-se de que para executar o exemplo JavaScript em um navegador, a API deve estar configurada para permitir requisições de origens diferentes (CORS), se aplicável. Se estiver usando Node.js, nenhuma configuração de CORS é necessária no lado do cliente.

---
*Nota: Este README foi atualizado para refletir as configurações e práticas mais recentes da aplicação.*
