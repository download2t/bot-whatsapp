# Manual de Operação e Deploy — BOTZAP (mydevsystem.site)

Este projeto roda em **VPS Linux** (Hostinger, Ubuntu), porque precisa manter processos ativos
para a API, o frontend buildado e o bridge do WhatsApp — não funciona em hospedagem
compartilhada.

*Última revisão: 04/08/2026 — servidor confirmado rodando .NET 10 SDK (mesma versão do
ambiente de desenvolvimento).*

## 1. O que roda no servidor

- **API**: `ApiBotWhatsapp.Api` em ASP.NET Core, escutando em `127.0.0.1:5207`
- **Frontend**: React + Vite, build estático servido pelo Nginx
- **Bridge**: `whatsapp-bridge` em Node.js (`whatsapp-web.js`), escutando em `127.0.0.1:3001`
- **Reverse proxy**: Nginx na frente da API e do frontend

## 2. Estrutura de arquivos e configurações (vital)

Para o sistema funcionar, estes arquivos precisam existir exatamente nestas localizações. Se o
servidor for migrado ou reinstalado, recrie-os com exatidão.

### 2.1 Variáveis de ambiente da API (C#)

Caminho: `/opt/mydevsystem/publish/api/.env`

```env
ConnectionStrings__DefaultConnection=Data Source=/opt/mydevsystem/data/app.db
Cors__AllowedOrigins__0=https://mydevsystem.site
Cors__AllowedOrigins__1=https://www.mydevsystem.site
Jwt__Issuer=ApiBotWhatsapp
Jwt__Audience=ApiBotWhatsappClient
Jwt__ExpiresMinutes=120
Jwt__SigningKey=8f3d2a1c7b9e4f0d6a5c1e8f2d4b6a9c3e1f7a2d4c6b8e0f1a3d5c7b9e1f4a6
WhatsApp__BridgeBaseUrl=http://127.0.0.1:3001
WhatsApp__TimeZoneId=America/Sao_Paulo
WhatsApp__WebhookToken=MeuTokenSecretoBridge123
```

O caminho do banco (`ConnectionStrings__DefaultConnection`) deve apontar para um volume
persistente, fora da pasta de publish (que é apagada e recriada a cada deploy).

### 2.2 Variáveis de ambiente do Bridge (Node.js)

Caminho: `/opt/mydevsystem/whatsapp-bridge/.env`

```env
BRIDGE_PORT=3001
BACKEND_WEBHOOK_URL=http://127.0.0.1:5207/api/webhooks/whatsapp
BACKEND_WEBHOOK_TOKEN=MeuTokenSecretoBridge123
```

`BACKEND_WEBHOOK_TOKEN` precisa ser **idêntico** a `WhatsApp__WebhookToken` da API.

### 2.3 Configuração do Nginx (proxy reverso)

Caminho: `/etc/nginx/sites-enabled/mydevsystem.site.conf`

```nginx
server {
    listen 80;
    server_name mydevsystem.site www.mydevsystem.site;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name mydevsystem.site www.mydevsystem.site;
    ssl_certificate /etc/letsencrypt/live/mydevsystem.site/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mydevsystem.site/privkey.pem;

    root /var/www/mydevsystem/ui;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Rota específica do WhatsApp para evitar conflitos
    location /api/whatsapp/ {
        rewrite ^/api/whatsapp/(.*)$ /api/whatsapp/$1 break;
        proxy_pass http://127.0.0.1:5207;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Rota padrão para a API
    location /api/ {
        proxy_pass http://127.0.0.1:5207;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Mídias enviadas/recebidas (fotos, vídeos, documentos do chat) — a API serve isso
    # como estático a partir de wwwroot/uploads/. Sem esta rota, imagens não aparecem no
    # navegador (só o nome do arquivo).
    location /uploads/ {
        proxy_pass http://127.0.0.1:5207;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 2.4 Serviços systemd

`/etc/systemd/system/mydev_api.service`:

```ini
[Unit]
Description=API Bot Whatsapp - .NET Core

[Service]
User=root
WorkingDirectory=/opt/mydevsystem/publish/api
ExecStart=/usr/bin/dotnet ApiBotWhatsapp.Api.dll --urls http://127.0.0.1:5207
Restart=always
RestartSec=10
TimeoutStopSec=20
SyslogIdentifier=mydev-api
Environment=ASPNETCORE_ENVIRONMENT=Production

[Install]
WantedBy=multi-user.target
```

`mydev_bridge.service` segue o mesmo padrão, com `WorkingDirectory` apontando para
`/opt/mydevsystem/whatsapp-bridge` e `ExecStart` chamando `node index.js` (ou via `npm start`).

> **`TimeoutStopSec=20`**: sem isso, o padrão do systemd é esperar até 90s por um `systemctl stop`
> antes de forçar o encerramento — e como o bridge sobe o Chromium via Puppeteer, às vezes esses
> processos não morrem rápido com SIGTERM, o que fazia o passo "Parando serviços" do `deploy.sh`
> travar por até 90s. O bridge (`index.js`) já trata SIGTERM chamando a mesma rotina que
> força-mata o Chromium se ele travar (ver `closeClientSafely` no código), então isso é só uma
> segunda camada de proteção — vale colocar em `mydev_bridge.service` também.

## 3. Preparar um servidor novo (do zero)

1. Acesse por SSH, atualize os pacotes e instale dependências base:
   ```bash
   sudo apt update && sudo apt upgrade -y
   sudo apt install -y nginx git curl unzip
   ```
2. Instale o SDK .NET 10 e o Node.js (versão compatível com `whatsapp-web.js`).
3. Clone o repositório em `/opt/mydevsystem`.
4. Crie os arquivos `.env` da API e do bridge (seção 2.1/2.2).
5. Crie a pasta de dados persistente (`/opt/mydevsystem/data/`) e garanta que o usuário do
   serviço (`mydev_api`) tenha permissão de leitura/escrita nela.
6. Configure o Nginx (seção 2.3) e obtenha o certificado SSL com Let's Encrypt.
7. Crie os serviços systemd (seção 2.4).
8. Rode o deploy padrão (seção 4) pela primeira vez.
9. Suba na ordem: banco/dados persistentes → API → Bridge → Frontend/Nginx.
10. Valide: `GET /health` na API e no bridge, login no painel, conexão do WhatsApp via QR.

## 4. Deploy padrão (cheat sheet)

Siga esta ordem sempre que atualizar código, com ou sem mudança de banco.

```bash
cd /opt/mydevsystem

# 1. Baixar o código novo
git stash
git pull

# 2. Parar os serviços (libera arquivos e banco)
sudo systemctl stop mydev_api mydev_bridge

# 3. Backup do banco ANTES de migrar — sem exceção
cp /opt/mydevsystem/data/app.db /opt/mydevsystem/data/app.db.backup-$(date +%Y%m%d-%H%M%S)

# 4. Atualizar o banco (Entity Framework)
cd /opt/mydevsystem/ApiBotWhatsapp.Api
ASPNETCORE_ENVIRONMENT=Production \
Jwt__SigningKey=8f3d2a1c7b9e4f0d6a5c1e8f2d4b6a9c3e1f7a2d4c6b8e0f1a3d5c7b9e1f4a6 \
ConnectionStrings__DefaultConnection="Data Source=/opt/mydevsystem/data/app.db" \
dotnet ef database update
# Confira no output quais migrations foram aplicadas — deve listar só as novas desde o
# último deploy.

# 5. Compilar e publicar a API
dotnet publish -c Release -o /opt/mydevsystem/publish/api

# 6. Buildar o Frontend
cd /opt/mydevsystem/frontend
npm install
npm run build
sudo rm -rf /var/www/mydevsystem/ui/*
sudo cp -r dist/* /var/www/mydevsystem/ui/
sudo chown -R www-data:www-data /var/www/mydevsystem/ui

# 7. Atualizar o Bridge
cd /opt/mydevsystem/whatsapp-bridge
npm install

# 8. Reiniciar tudo
sudo systemctl start mydev_api mydev_bridge
sudo systemctl restart nginx
```

### Verificação pós-deploy

- `curl https://mydevsystem.site/health`
- Login no painel funciona
- `sudo systemctl status mydev_api mydev_bridge` — ambos `active (running)`
- Testar a funcionalidade nova específica do deploy
- Instruir os usuários a dar **Ctrl + F5** (hard reload) para pegar o novo `.js` do frontend

## 5. Resolução de problemas

**Erro: "The current .NET SDK does not support targeting .NET X.X"**
Causa: o `.csproj` veio do GitHub com uma versão de SDK superior à instalada no servidor. Não
deveria mais acontecer — o servidor está no .NET 10, igual ao ambiente de desenvolvimento. Se
voltar a acontecer (ex.: servidor reinstalado do zero e sem o SDK certo), o workaround
histórico era baixar a versão alvo do projeto — mas prefira sempre instalar o SDK correto no
servidor em vez de rebaixar o projeto:

```bash
cd /opt/mydevsystem/ApiBotWhatsapp.Api
sed -i 's/net10.0/net8.0/g' ApiBotWhatsapp.Api.csproj
sed -i 's/10.0.3/8.0.6/g' ApiBotWhatsapp.Api.csproj
dotnet tool update --global dotnet-ef --version 8.0.6
dotnet clean
```

**Erro: "Could not execute because the specified command or file was not found (dotnet-ef)"**
Causa: a ferramenta do EF Core não está instalada no servidor, ou está numa versão muito
diferente do pacote `Microsoft.EntityFrameworkCore.Design` do projeto. Isso já causou um bug
real antes (uma migration com o corpo do `Up()`/`Down()` vazio, sem nenhum erro visível) —
mantenha sempre as duas versões alinhadas:

```bash
dotnet tool update --global dotnet-ef --version 10.0.3
```

**Consultar logs de erro (emergência):**

- API C#: `sudo journalctl -u mydev_api.service -f`
- Bridge Node: `sudo journalctl -u mydev_bridge.service -f`
- Portas ocupadas: `sudo ss -tulpn` (API = 5207, Bridge = 3001)

## 6. Notas operacionais

- **Banco**: `app.db` fica em `/opt/mydevsystem/data/`. O usuário do serviço `mydev_api`
  precisa de permissão de leitura e escrita nessa pasta.
- **Backup**: sempre antes de migrar (passo 3 do cheat sheet) — é o caminho de volta se algo
  sair errado.
- **Sessão do WhatsApp**: não apague `whatsapp-bridge/.wwebjs_auth/` — é onde fica salvo o
  login do WhatsApp Web. Apagar força reconexão via QR code para todos os usuários.
- **Cache do navegador**: depois de um deploy de frontend, oriente os usuários a dar Ctrl+F5.
- **Tokens**: `WhatsApp__WebhookToken` (API) e `BACKEND_WEBHOOK_TOKEN` (Bridge) sempre
  precisam ser idênticos.
- **CORS**: qualquer domínio novo que sirva o frontend precisa ser adicionado em
  `Cors__AllowedOrigins__N` no `.env` da API.
