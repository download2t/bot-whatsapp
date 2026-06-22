# Passo a passo de deploy na Hostinger

Este projeto deve ser publicado em **VPS Linux** da Hostinger, não em hospedagem compartilhada, porque ele precisa manter processos ativos para a API, o frontend buildado e o bridge do WhatsApp.

## 1. O que vai rodar no servidor

- **API**: `ApiBotWhatsapp.Api` em ASP.NET Core
- **Frontend**: React + Vite em arquivos estáticos gerados com build
- **Bridge**: `whatsapp-bridge` em Node.js com `whatsapp-web.js`
- **Reverse proxy**: Nginx na frente da API e do frontend

## 2. Tipo de hospedagem recomendado

Use uma **VPS Ubuntu 22.04 ou 24.04** na Hostinger.

Recomendação prática:

- 2 vCPU ou mais
- 4 GB de RAM ou mais
- SSD com espaço suficiente para logs, banco SQLite e sessões do WhatsApp

## 3. Preparar o servidor

1. Acesse o servidor por SSH.
2. Atualize os pacotes do sistema.
3. Instale dependências base:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx git curl unzip
```

4. Instale o Docker e o Docker Compose, se for usar containerização.

## 4. Publicar o código

1. Envie o projeto para o servidor com `git clone` ou upload.
2. Organize a estrutura em um diretório, por exemplo:

```text
/opt/api_bot_whatsapp
```

3. Mantenha estes diretórios separados:

- `ApiBotWhatsapp.Api`
- `frontend`
- `whatsapp-bridge`

## 5. Configurar a API

Na pasta `ApiBotWhatsapp.Api`, crie o arquivo `.env` com as variáveis de produção.

Exemplo:

```env
ConnectionStrings__DefaultConnection=Data Source=/opt/api_bot_whatsapp/data/app.db
Jwt__SigningKey=chave_forte_e_longa
Jwt__Issuer=ApiBotWhatsapp
Jwt__Audience=ApiBotWhatsappFrontend
Jwt__ExpiresMinutes=120
WhatsApp__BridgeBaseUrl=http://127.0.0.1:3001
WhatsApp__TimeZoneId=America/Sao_Paulo
WhatsApp__WebhookToken=token_compartilhado_com_bridge
WhatsApp__DefaultConnectedNumber=
Cors__AllowedOrigins=https://seu-dominio.com
```

Observações:

- a API usa **SQLite** por padrão
- o caminho do banco deve apontar para um volume persistente
- o CORS precisa liberar o domínio público do frontend

## 6. Configurar o bridge do WhatsApp

Na pasta `whatsapp-bridge`, crie outro `.env`:

```env
BRIDGE_PORT=3001
BACKEND_WEBHOOK_URL=http://127.0.0.1:5207/api/webhooks/whatsapp
BACKEND_WEBHOOK_TOKEN=token_compartilhado_com_bridge
BACKEND_COMPANY_CODE=EMPRESA-TESTE
```

Observações:

- `BACKEND_WEBHOOK_TOKEN` deve ser igual ao token configurado na API
- o bridge precisa ficar sempre ligado
- o login do WhatsApp Web será salvo em `.wwebjs_auth`

## 7. Build do frontend

Na pasta `frontend`:

```bash
npm install
npm run build
```

O resultado sai em `dist/`.

Depois disso, copie o conteúdo de `dist/` para uma pasta servida pelo Nginx, por exemplo:

```text
/var/www/api_bot_whatsapp
```

## 8. Build e execução da API

Se for publicar como processo .NET:

```bash
cd ApiBotWhatsapp.Api
dotnet publish -c Release -o /opt/api_bot_whatsapp/publish/api
```

Depois crie um serviço para manter a API ativa.

Se for usar Docker, crie um container com a aplicação publicada e exponha a porta interna da API.

## 9. Execução do bridge

Na pasta `whatsapp-bridge`:

```bash
npm install
npm start
```

Se estiver em produção, mantenha o processo com `systemd`, `pm2` ou Docker.

## 10. Configurar o Nginx

Use o Nginx como entrada pública do sistema.

Sugestão de rotas:

- `https://seu-dominio.com/` -> frontend estático
- `https://seu-dominio.com/api/` -> API ASP.NET Core

Exemplo de ideia:

- frontend servido em `/var/www/api_bot_whatsapp`
- API escutando em `127.0.0.1:5207`
- bridge escutando em `127.0.0.1:3001`

## 11. SSL e domínio

1. Aponte o domínio para o IP da VPS.
2. No painel da Hostinger, adicione o domínio.
3. Configure certificado SSL com Let’s Encrypt.
4. Forçe HTTPS no Nginx.

## 12. Ordem de subida

Suba nesta ordem:

1. Banco e arquivos persistentes
2. API
3. Bridge
4. Frontend estático e Nginx

## 13. Verificações rápidas

Teste estes pontos:

- `https://seu-dominio.com/health`
- `https://seu-dominio.com/swagger` durante a validação inicial
- `http://127.0.0.1:3001/health`
- login do WhatsApp Web no bridge
- recebimento de webhook do WhatsApp na API

## 14. Cuidados importantes

- não use hospedagem compartilhada para este projeto
- não apague a pasta `.wwebjs_auth` se quiser manter a sessão do WhatsApp
- faça backup do banco SQLite com frequência
- mantenha os tokens da API e do bridge iguais
- valide as origens do CORS antes de publicar

## 15. Resumo da arquitetura recomendada

O desenho mais estável na Hostinger é:

```text
Usuário -> Nginx -> Frontend estático
Usuário -> Nginx -> API ASP.NET Core
Bridge WhatsApp -> API via webhook local
```

Se quiser simplificar ainda mais, eu posso te entregar a próxima versão deste arquivo com:

- `docker-compose.yml`
- configuração do `nginx.conf`
- exemplos de `.env`
- comandos de deploy e atualização