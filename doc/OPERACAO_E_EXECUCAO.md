# Operacao, Deploy e Configuracao

## Componentes do projeto

- `ApiBotWhatsapp.Api`: API principal em ASP.NET Core + SQLite
- `frontend`: painel React + TypeScript + Vite
- `whatsapp-bridge`: bridge Node.js com `whatsapp-web.js`
- `DesktopController`: utilitario para subir e monitorar os tres servicos

## Fluxo operacional

1. O bridge recebe mensagens do WhatsApp Web.
2. O bridge envia o evento para a API em `/api/webhooks/whatsapp`.
3. A API valida token, empresa, numero e regras de agenda.
4. Se a mensagem for recente e elegivel, a auto resposta e enviada via bridge.
5. O historico de mensagens e persistido na API.

## Persistencia de sessao do bridge

O bridge foi ajustado para persistir as sessoes locais do WhatsApp Web.

- a autenticacao fica salva em `.wwebjs_auth`
- ao iniciar o bridge, ele tenta restaurar sessoes persistidas no disco
- a desconexao padrao nao remove a autenticacao local

Resultado:

- conexoes nao precisam ser refeitas toda vez que o bridge reinicia
- o menu e a tela de conexoes conseguem refletir mais de uma sessao ativa

## Conexoes WhatsApp

### Tela de conexoes

- lista somente sessoes conectadas
- mostra todos os numeros conectados
- exibe numero e status lado a lado
- permite desconectar uma sessao especifica

### Menu superior

O menu superior passou a exibir:

- todas as sessoes conectadas
- cada numero formatado em linha unica
- badge de status ao lado

## Configuracao de ambiente

### API

Arquivo: `ApiBotWhatsapp.Api/.env`

Variaveis importantes:

- `ConnectionStrings__DefaultConnection`
- `Jwt__SigningKey`
- `Jwt__Issuer`
- `Jwt__Audience`
- `Jwt__ExpiresMinutes`
- `WhatsApp__BridgeBaseUrl`
- `WhatsApp__TimeZoneId`
- `WhatsApp__WebhookToken`
- `WhatsApp__DefaultConnectedNumber`

### Bridge

Arquivo: `whatsapp-bridge/.env`

Variaveis importantes:

- `BRIDGE_PORT`
- `BACKEND_WEBHOOK_URL`
- `BACKEND_WEBHOOK_TOKEN`
- `BACKEND_COMPANY_CODE`

Observacao importante:

- `BACKEND_WEBHOOK_TOKEN` precisa ser igual a `WhatsApp__WebhookToken` da API
- `BACKEND_WEBHOOK_URL` normalmente aponta para `http://localhost:5207/api/webhooks/whatsapp`
- `WhatsApp__BridgeBaseUrl` precisa apontar para `http://localhost:3001`

## Portas usadas

- API: `5207`
- Frontend: `5173`
- Bridge: `3001`

## Como iniciar

Ordem recomendada:

1. API
2. Frontend
3. Bridge

### API

```powershell
Set-Location .\ApiBotWhatsapp.Api
 dotnet run
```

### Frontend

```powershell
Set-Location .\frontend
 npm run dev
```

### Bridge

```powershell
Set-Location .\whatsapp-bridge
 npm start
```

## Validacao rapida

Endpoints uteis:

- `http://localhost:5207/health`
- `http://localhost:5207/swagger`
- `http://localhost:3001/health`
- `http://localhost:3001/session/list`
- `http://localhost:3001/session/status`

## Observacoes de operacao

- se a API estiver desligada e o bridge reenviar um evento antigo, mensagens com mais de 5 minutos sao ignoradas para auto resposta
- o historico continua sendo gravado mesmo quando a auto resposta e bloqueada
- se a mesma empresa tiver mais de uma regra para o mesmo numero, o backend seleciona a que estiver ativa no horario atual

## Principais pontos ajustados nesta iteracao

- persistencia de conexoes WhatsApp no bridge
- exibicao de todas as sessoes conectadas no menu superior
- exibicao lado a lado de numero e status
- trava de 5 minutos para impedir envio retroativo
- melhoria no fluxo de resolucao de empresa para nao descartar mensagens por mismatch de codigo
