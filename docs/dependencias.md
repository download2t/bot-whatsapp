# Instalacao e Execucao em Outro PC

## 1. Objetivo

Este guia mostra:

1. Quais dependencias instalar.
2. Qual ordem de execucao usar.
3. Quais comandos rodar.
4. Como validar se tudo subiu corretamente.

## 2. Dependencias obrigatorias

Instale:

1. Git
2. Node.js LTS (recomendado 22.x)
3. .NET SDK 10
4. Google Chrome (necessario para sessao do whatsapp-web.js)

## 3. Clonar projeto

1. Abra terminal.
2. Execute:

```powershell
git clone https://github.com/download2t/bot-whatsapp.git
cd bot-whatsapp
```

## 4. Configuracao de ambiente

## 4.1 API

Crie o arquivo .env da API a partir do exemplo:

```powershell
Copy-Item .\ApiBotWhatsapp.Api\.env.example .\ApiBotWhatsapp.Api\.env
```

Ajuste no arquivo:

1. Jwt__SigningKey
2. WhatsApp__WebhookToken
3. WhatsApp__BridgeBaseUrl (normalmente http://localhost:3001)

## 4.2 Bridge

Crie o arquivo .env do bridge a partir do exemplo:

```powershell
Copy-Item .\whatsapp-bridge\.env.example .\whatsapp-bridge\.env
```

Ajuste no arquivo:

1. BACKEND_WEBHOOK_URL (normalmente http://localhost:5207/api/webhooks/whatsapp)
2. BACKEND_WEBHOOK_TOKEN (deve ser igual ao WhatsApp__WebhookToken da API)

## 5. Instalar dependencias do projeto

## 5.1 API

```powershell
cd .\ApiBotWhatsapp.Api
dotnet restore
```

## 5.2 Frontend

```powershell
cd ..\frontend
npm install
```

## 5.3 Bridge

```powershell
cd ..\whatsapp-bridge
npm install
```

## 6. Ordem recomendada para iniciar

Use esta ordem:

1. API
2. Frontend
3. Bridge

Comandos:

## 6.1 API

```powershell
cd .\ApiBotWhatsapp.Api
dotnet run
```

## 6.2 Frontend

```powershell
cd ..\frontend
npm run dev
```

## 6.3 Bridge

```powershell
cd ..\whatsapp-bridge
npm start
```

## 7. Validacao rapida

Com tudo iniciado, valide:

1. API health: http://localhost:5207/health
2. Swagger: http://localhost:5207/swagger (Development)
3. Frontend: http://localhost:5173
4. Bridge health: http://localhost:3001/health
5. Status da sessao WhatsApp: http://localhost:3001/session/status

## 8. Usando o Desktop Controller

Se preferir iniciar por interface:

1. Abra o Desktop Controller.
2. Configure para cada servico:
   1. Pasta
   2. Comando
3. Clique em Salvar configuracoes.
4. Inicie cada servico manualmente (um por vez).

Comandos padrao por servico:

1. API: dotnet run
2. Frontend: npm run dev
3. Bridge: npm start

O controller salva configuracao e estado em:

1. .dev-runner/service-settings.json
2. .dev-runner/controller.json
3. .dev-runner/logs/

## 9. Build de producao (opcional)

## 9.1 Frontend build

```powershell
cd .\frontend
npm run build
```

## 9.2 Publicar Desktop Controller (exe)

```powershell
cd ..\DesktopController
dotnet publish -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true
```

Exe gerado em:

1. DesktopController/bin/Release/net10.0-windows/win-x64/publish/ApiBotWhatsapp.Controller.exe

## 10. Solucao de problemas comuns

1. Porta ocupada: finalize processo na porta 5207, 5173 ou 3001.
2. Erro 401 no webhook: token do bridge diferente do token da API.
3. Frontend sem comunicar com API: conferir URL da API e CORS.
4. Bridge sem conectar: verificar Chrome instalado e leitura do QR.
5. Erro de modulo Node: rodar npm install na pasta correta (frontend e whatsapp-bridge).
