# Inicialização do projeto

## 1. Pré-requisitos

- .NET SDK 10.0
- Node.js LTS, recomendado 20+

## 2. Clonar o repositório

```powershell
git clone <url-do-repositorio>
cd api_bot_whatsapp
```

## 3. Configurar variáveis de ambiente

### API

Criar ou ajustar o arquivo [ApiBotWhatsapp.Api/.env](../ApiBotWhatsapp.Api/.env).

### Bridge

Criar ou ajustar o arquivo [whatsapp-bridge/.env](../whatsapp-bridge/.env).

## 4. Variáveis importantes

- `BACKEND_WEBHOOK_TOKEN` no bridge deve ser igual a `WhatsApp__WebhookToken` na API
- `BACKEND_WEBHOOK_URL` normalmente aponta para `http://localhost:5207/api/webhooks/whatsapp`
- `WhatsApp__BridgeBaseUrl` na API deve apontar para `http://localhost:3001`

## 5. Instalar dependências

### API

```powershell
cd ApiBotWhatsapp.Api
dotnet restore
cd ..
```

### Frontend

```powershell
cd frontend
npm install
cd ..
```

### Bridge

```powershell
cd whatsapp-bridge
npm install
cd ..
```

## 6. Subir os serviços

Ordem recomendada:

1. API
2. Frontend
3. Bridge

### API

```powershell
cd ApiBotWhatsapp.Api
dotnet run
```

### Frontend

```powershell
cd frontend
npm run dev
```

### Bridge

```powershell
cd whatsapp-bridge
npm start
```

## 7. Validar o ambiente

- API health: http://localhost:5207/health
- Swagger API: http://localhost:5207/swagger
- Bridge health: http://localhost:3001/health
- Sessões bridge: http://localhost:3001/session/list
- Status bridge: http://localhost:3001/session/status

## 8. Gerar o executável do DesktopController

### Build rápido

```powershell
cd DesktopController
dotnet build -c Release
```

### Publicação para uso local

```powershell
cd DesktopController
dotnet publish -c Release -o .\publish
```

O executável fica em:

```text
DesktopController\publish\ApiBotWhatsapp.Controller.exe
```

## 9. Se o bridge travar ao restaurar a sessão

Isso costuma acontecer quando:

- a autenticação em `.wwebjs_auth` está corrompida ou inválida
- o WhatsApp Web bloqueou a sessão
- é necessário fazer novo login com QR code

### Passo recomendado

```powershell
cd whatsapp-bridge
Remove-Item ".wwebjs_auth" -Recurse -Force
npm start
```

Se a pasta não existir, o comando pode falhar com "path not found". Nesse caso, apenas rode `npm start` novamente para gerar uma nova sessão.