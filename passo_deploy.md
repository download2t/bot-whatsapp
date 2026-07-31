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

## 16. Atualizar produção com as mudanças desta sessão (isolamento por usuário + mídia/ack + LID)

Este é o procedimento **específico** para levar para produção tudo que foi feito nesta sessão:
remoção do multi-tenant, isolamento total por usuário (`OwnerUserId`, 1 WhatsApp por usuário),
correções de LID, mídia persistida em disco, confirmação de leitura (ack) e a página de
Documentar Conversa. Use isto **uma única vez** — depois que essas migrations estiverem
marcadas como aplicadas, os próximos `git pull` + deploy voltam a ser o fluxo normal (a própria
API já roda `Database.MigrateAsync()` no boot, então normalmente nem precisa rodar `dotnet ef`
manualmente).

### 16.1 Contexto importante antes de começar

O banco de produção foi criado historicamente com `EnsureCreated()` + SQL manual, não com
`dotnet ef database update`. Isso significa que a tabela `__EFMigrationsHistory` de lá está
**vazia**, mesmo o banco já tendo o schema das 3 primeiras migrations do projeto
(`InitialCreate`, `AddContactNameMessageLog`, `AddScheduleWindowsJson`). Se você rodar
`dotnet ef database update` direto, o EF tenta aplicar essas 3 migrations de novo do zero e
quebra (colunas/tabelas já existem). Por isso o passo 16.3 abaixo "baselina" o histórico antes
de deixar o EF seguir com as migrations novas de verdade.

As migrations que ainda **não** estão em produção (as que essa sessão criou) são:

1. `20260731131436_RemoveMultiTenantAndWhitelist` — remove `Company`/`UserCompany`/`WhitelistNumber`, adiciona `MessagesJson`/`MessageId`.
2. `20260731132421_AddOwnerUserIsolation` — adiciona `OwnerUserId` em `Turmas`/`ScheduleRules`/`MessageLogs`/`Contatos` (com backfill automático para o usuário `admin`), remove `ScheduleRuleWhatsAppNumbers`.
3. `20260731170322_AddMediaAndAckToMessageLogs` — adiciona `MediaUrl`/`MediaMimeType`/`MediaFileName`/`AckStatus` em `MessageLogs`.

Essas 3 rodam de verdade e alteram dados (a #2 reatribui todos os Contatos/Turmas/Regras/Mensagens
existentes para o usuário `admin` — é o comportamento esperado, combinado nesta sessão).

### 16.2 Backup (obrigatório, sem exceção)

```bash
cd /opt/api_bot_whatsapp/ApiBotWhatsapp.Api   # ajuste para o caminho real do seu deploy
cp app.db "app.db.backup-$(date +%Y%m%d-%H%M%S)"
```

Não prossiga sem esse backup. Se algo sair errado, restaurar esse arquivo é o caminho de volta.

### 16.3 Baselinar o histórico de migrations (uma vez só)

Confirme primeiro que a tabela está mesmo vazia (evita duplicar se alguém já rodou isso antes):

```bash
sqlite3 app.db "SELECT * FROM __EFMigrationsHistory;"
```

Se vier vazio, insira as 3 migrations antigas como já aplicadas (sem executá-las — o schema
delas já existe no banco):

```bash
sqlite3 app.db "INSERT INTO __EFMigrationsHistory (MigrationId, ProductVersion) VALUES
  ('20260506114638_InitialCreate', '10.0.3'),
  ('20260625122146_AddContactNameMessageLog', '10.0.3'),
  ('20260702170000_AddScheduleWindowsJson', '10.0.3');"
```

Se a consulta acima já mostrou essas 3 linhas (ou parte delas), **não repita o INSERT** — pule
direto para o 16.4.

### 16.4 git pull e aplicar as migrations novas

```bash
cd /opt/api_bot_whatsapp
git pull
cd ApiBotWhatsapp.Api
dotnet tool update --global dotnet-ef --version 10.0.3   # se ainda não estiver nessa versão
dotnet ef database update
```

Isso deve rodar só as 3 migrations novas (passo 16.1) — confirme no output que ele lista
exatamente `RemoveMultiTenantAndWhitelist`, `AddOwnerUserIsolation` e
`AddMediaAndAckToMessageLogs`, nada além disso. Se você preferir pular esse comando manual, tudo
bem: a API aplica as mesmas migrations sozinha assim que subir (`Database.MigrateAsync()` no
`Program.cs`) — o passo manual aqui serve só pra você ver o resultado antes de reiniciar o
serviço de verdade.

### 16.5 Recompilar e reiniciar os 3 serviços

```bash
# API
cd /opt/api_bot_whatsapp/ApiBotWhatsapp.Api
dotnet publish -c Release -o /opt/api_bot_whatsapp/publish/api
sudo systemctl restart api-bot-whatsapp   # ou o nome do seu serviço/processo

# Bridge — a versão do whatsapp-web.js foi atualizada (1.34.6 -> 1.34.7) e há endpoints novos
cd /opt/api_bot_whatsapp/whatsapp-bridge
npm install
pm2 restart whatsapp-bridge   # ou systemctl/o que você usa para manter o processo vivo

# Frontend
cd /opt/api_bot_whatsapp/frontend
npm install
npm run build
# copie dist/ para a pasta servida pelo Nginx, como no passo 7
```

### 16.6 Efeitos colaterais esperados (uma vez só, neste deploy específico)

- **Reconectar o WhatsApp**: a sessão atual do bridge usa um id antigo (não o esquema
  `user-{userId}` novo). Depois de subir, entre em `/whatsapp-connections` e reconecte via QR ou
  pareamento por número. Depois disso, o cache de versão do WhatsApp Web (`webVersionCache`) evita
  que isso se repita em deploys futuros.
- **Todos os dados existentes (Contatos, Turmas, Regras, Mensagens) passam a pertencer ao
  usuário `admin`** — é o comportamento combinado para essa migração de isolamento por usuário.
- **Pasta de mídia nova**: `ApiBotWhatsapp.Api/wwwroot/uploads/` é criada automaticamente no
  boot e servida como estático (`/uploads/...`) pela própria API. Se o Nginx só faz proxy de
  `/api/` para a API, confirme que uma rota tipo `/uploads/` também é encaminhada, senão as
  imagens enviadas/recebidas não aparecem no navegador.

### 16.7 Verificação pós-deploy

- `GET /health` na API e no bridge.
- Login funciona e mostra só os dados do usuário logado (teste com 2 contas se tiver).
- Reconectar o WhatsApp em `/whatsapp-connections` e confirmar status "Conectado".
- Mandar uma mensagem de teste de um número cadastrado em Contatos e confirmar no console da
  API os logs `Webhook received:` / `Auto-reply decision:` (adicionados nesta sessão).
- Enviar uma imagem pelo chat em `/messages` e confirmar que ela aparece na conversa (não só o
  nome do arquivo) — valida a pasta `wwwroot/uploads/` e o proxy do Nginx.
- Abrir `/documentacao`, escolher uma pessoa, marcar algumas datas e clicar em "Documentar" —
  confirma que o histórico foi preservado pela migration.