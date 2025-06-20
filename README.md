# API SSótica

API para consultar parcelas do sistema SSótica.

## Como rodar com Docker

### Build:
```
docker build -t ssotica-api .
```

### Run:
```
docker run -d -p 3189:3189 --name ssotica-api \
-e SSOTICA_EMAIL=seuemail@exemplo.com \
-e SSOTICA_PASSWORD=suasenha \
ssotica-api
```

## Endpoint:

### POST `/api/consultar`
**Body:**
```json
{
  "nome": "Nome Completo do Cliente"
}
```

**Resposta:**
```json
{
  "cliente": "Nome",
  "parcelas": [...]
}
```# ssotica-api
# ssotica-api
