# api_bot_whatsapp

Central de atendimento WhatsApp de **uma única empresa, com cada usuário operando seu próprio WhatsApp isolado**. Três frentes, cada uma em sua pasta:

1. **`ApiBotWhatsapp.Api`** — ASP.NET Core (net10.0) + EF Core + SQLite. Backend/API principal.
2. **`whatsapp-bridge`** — Node.js + Express + `whatsapp-web.js`. Mantém as sessões do WhatsApp Web e troca eventos com a API via webhook/HTTP.
3. **`frontend`** — React 18 + TypeScript + Vite. Painel operacional.

Também existe `DesktopController` (WinForms), um utilitário local para subir/parar os três serviços com um clique — não faz parte do fluxo de produção.

## Isolamento por usuário (importante)

Cada `User` do painel tem **seu próprio WhatsApp conectado, seus próprios `Contato`/`Turma`/`ScheduleRule`/`MessageLog`/`Pais`/`BulkCampaign`**, sem nenhuma visibilidade cruzada — **nem Admin vê os dados de WhatsApp de outro usuário**. Isso é reforçado em toda a stack:

- **Banco**: `Contato`, `Turma`, `ScheduleRule`, `MessageLog`, `Pais`, `BulkCampaign` têm `OwnerUserId`. Todo controller filtra/seta esse campo via `this.GetCurrentUserId()` (extension method em `Utils/ControllerExtensions.cs`, lê a claim `NameIdentifier` do JWT). Sem exceção para Admin.
- **Sessão WhatsApp**: 1 conexão por usuário. O id de sessão no bridge é sempre `user-{userId}`, calculado no servidor (`WhatsAppController`) — nunca vem do cliente. `pickSenderSession` no bridge não tem fallback para "qualquer sessão conectada"; se a sessão do usuário não estiver pronta, retorna 409. Isso existe especificamente para não vazar mensagem de um usuário pelo número de outro.
- **Webhook**: o bridge extrai `OwnerUserId` do próprio id de sessão (`extractOwnerUserId`) e manda no payload. Sem `OwnerUserId` resolvível, a API loga e recusa processar — nunca tenta adivinhar dono por número de telefone.
- **Contas de usuário** (`UsersController`, `/api/users`) são gerenciamento **admin-only** (criar/editar/excluir username, senha, `IsAdmin`) — isso é uma coisa totalmente separada dos dados de WhatsApp de cada um. Não existe mais o conceito de "Gestor" (role via `User.Title`); `Title` agora é só um campo de texto livre ("Cargo"), sem efeito em permissões.

## Fluxo principal

```
WhatsApp Web -> whatsapp-bridge -> POST /api/webhooks/whatsapp (API, com OwnerUserId) -> AutoReplyService -> resposta via bridge
```

1. O bridge recebe a mensagem do WhatsApp Web e envia webhook para a API (header `X-Webhook-Token` deve bater com `WhatsApp:WebhookToken`), incluindo `MessageId` (dedupe) e `OwnerUserId` (dono da sessão).
2. A API grava a mensagem em `MessageLogs` (histórico é sempre gravado, mesmo quando a auto-resposta é bloqueada).
3. `AutoReplyService` decide se responde automaticamente — ver regras abaixo.
4. Se elegível, a resposta é enviada de volta pelo bridge (`POST /messages/send`, sessionId = `user-{OwnerUserId}`).

## Regras de auto-resposta (`AutoReplyService`)

Ordem de checagem:

1. **Idempotência**: se `MessageId` já existe em `MessageLogs`, ignora — protege contra o `whatsapp-web.js` reemitir `message_create` pro mesmo evento (ex.: reconexão de sessão), o que antes podia gerar auto-resposta duplicada.
2. **Gate de Contato cadastrado**: só recebe auto-resposta quem está cadastrado em `Contatos` do MESMO dono (`OwnerUserId`, `IsActive = true`, em qualquer `Turma`). Quem não é um contato conhecido nunca recebe automação. Não existe whitelist/blocklist.
3. **Anti-retroativo**: mensagens com mais de 5 minutos de atraso são gravadas no histórico mas não geram resposta.
4. **Regra de horário ativa** (`ScheduleRule` do mesmo dono): normal (dentro das janelas) ou invertida (`IsOutOfBusinessHours = true`). Janelas por dia da semana em `ScheduleWindowsJson`.
5. **Mensagem por dia da semana e por país**: uma `ScheduleRule` pode ter várias mensagens (`MessagesJson`, lista de `{ text, days[], paisId? }`). O país do remetente é resolvido pelo DDI do número **real** do WhatsApp (não pelo `Contato.PhoneNumber` cadastrado, que pode não ter DDI) contra os `Pais` cadastrados pelo dono, testando o DDI mais longo primeiro. A mensagem usada é a vinculada àquele país pro dia atual; se não houver uma específica, cai pra mensagem sem país (`paisId: null`, "padrão") daquele dia. Se nada cobrir o dia (nem específica nem padrão), não responde — mesmo com regra ativa.
6. **Throttle** (`ThrottleMinutes`) e **limite diário** (`MaxDailyMessagesPerUser`) por contato, escopados por `OwnerUserId`.

## Auth

- JWT (`Jwt:*` no `.env`). Seed automático: usuário `admin` / senha `admin123` (`IsAdmin = true`).
- `User.IsAdmin` (bool) é o único sinal de permissão real hoje — controla acesso a `/api/users*` (gestão de contas). Todo o resto (Contatos, Turmas, Regras, Mensagens, WhatsApp) é igual para qualquer usuário autenticado, só que escopado aos próprios dados.
- Endpoints anônimos: `GET /health`, `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/webhooks/whatsapp` (protegido por token de header, não por JWT).

## Domínio

- **`ScheduleRule`** — regra de auto-resposta do dono (`OwnerUserId`): janelas de horário (`ScheduleWindowsJson`, sempre no fuso único do dono — `WhatsApp:TimeZoneId` — não varia por país) + mensagens por dia da semana e opcionalmente por país (`MessagesJson`, `{ text, days[], paisId }`). Não tem mais número WhatsApp associado — é sempre o número conectado do próprio dono.
- **`Pais`** — cadastro do dono (`/api/paises`, tela `/paises`): nome + DDI (só dígitos, ex. `55` Brasil, `258` Moçambique). Serve só pra identificar automaticamente de qual país é o remetente de uma mensagem recebida e escolher a mensagem certa em `ScheduleRule` (ver auto-resposta acima) — não define fuso horário nem afeta horário de funcionamento. Excluir um país é bloqueado se alguma mensagem de regra ainda estiver vinculada a ele.
- **`Turma`** / **`Contato`** — listas de contatos do dono, usadas tanto para disparo em massa quanto como gate de elegibilidade da auto-resposta.
- **`BulkCampaign`** / **`BulkCampaignItem`** — uma campanha de envio em massa e o status de cada destinatário nela (ver Mensageria abaixo).
- **`MessageLog`** — histórico de tudo (incoming/outgoing, automático ou manual), com `MessageId` (dedupe) e `OwnerUserId`.
- **`User`** — conta do painel (login). Não confundir com `Contato`, que é quem recebe mensagens no WhatsApp.

## Mensageria (texto + mídia + emoji)

- `POST /api/messages/bulk` — dispara uma campanha de envio em massa (por `TurmaId` ou lista de `ContactIds`, escopados ao dono): grava a campanha (`BulkCampaign`) e um item por destinatário (`BulkCampaignItem`, status `Pending`) no banco e devolve `202` com o id. O envio roda em background via `BulkCampaignRunner` (singleton, com seu próprio `IServiceScopeFactory`) — **independente da requisição HTTP que disparou**, então fechar a aba não interrompe o envio nem perde o histórico.
- `GET /api/messages/bulk` — lista campanhas do dono (auditoria, tela `/messages/bulk/historico`). `GET /api/messages/bulk/{id}` — campanha + itens; é o mesmo endpoint usado tanto pro acompanhamento ao vivo (a tela `/messages/bulk/{id}` faz polling nele enquanto `status = Running`) quanto pra reabrir uma campanha antiga já finalizada. `POST /api/messages/bulk/{id}/cancel` — para os itens ainda `Pending` de qualquer campanha em andamento, de qualquer tela/sessão, mesmo que não tenha sido quem iniciou o envio.
- Tela `/messages/bulk` só monta e dispara a campanha (redireciona pra `/messages/bulk/{id}` depois de criada). Reenviar pendentes/falhos de uma campanha antiga usa `?retryFrom={id}` nessa mesma tela, que pré-seleciona só quem não teve status `Sent` (mas continua editável manualmente).
- Se a API cair/reiniciar com uma campanha `Running`, ela sobe marcada como `Interrupted` no boot (`Program.cs`, depois do `MigrateAsync()`) em vez de ficar presa em "rodando" pra sempre — o `CancellationTokenSource` em memória do `BulkCampaignRunner` não sobrevive a um restart do processo.
- `POST /api/messages/bulk/send` — envio individual (usado pelo chat em `/messages`), sem campanha, síncrono.
- Bulk e individual aceitam `mediaBase64` + `mediaMimeType` + `mediaFileName` opcionais (imagem, vídeo ou documento — limite de 20MB) além do texto. O frontend converte o arquivo para base64 no browser (`components/MediaAttachment.tsx`) e envia dentro do mesmo corpo JSON — não é upload multipart.
- Emoji: `components/EmojiPicker.tsx` é um picker próprio, sem dependência externa (paleta curada), usado no chat individual e no disparo em massa.
- No bridge, o envio de mídia usa `MessageMedia` do `whatsapp-web.js` (`client.sendMessage(target, media, { caption })`). O remetente é sempre resolvido por id de sessão (`user-{userId}`), nunca por número de telefone. O alvo do envio é resolvido via `client.getContactById()` (não `{phone}@c.us` construído manualmente) — necessário porque contas rastreadas via LID (ver abaixo) quebram o envio direto por JID de telefone.
- **Mídia fica salva de verdade**: `Services/MediaStorageService.cs` grava o base64 em `wwwroot/uploads/{OwnerUserId}/...` (servido como estático via `app.UseStaticFiles()`) e `MessageLog` guarda `MediaUrl`/`MediaMimeType`/`MediaFileName` — tanto para mensagens enviadas (`BulkMessagesController.SendMessage`) quanto recebidas (bridge baixa via `message.downloadMedia()` e manda `MediaBase64` no payload do webhook; `AutoReplyService` salva). Pasta `wwwroot/uploads/` é gitignored.
- **Confirmação de leitura (ack)**: bridge escuta `client.on("message_ack", ...)` e repassa pra `POST /api/webhooks/whatsapp/ack` (mesmo token de webhook), que atualiza `MessageLog.AckStatus` (`sent`/`delivered`/`read`/`played`) casando por `MessageId` (o id retornado pelo bridge no envio, `WhatsAppBridgeClient.SendMessageAsync` agora retorna `MessageId` além de `Success`/`Status`). O frontend (`Messages.tsx`) mostra os checkmarks a partir desse campo.
- Copiar uma conversa selecionada no `/messages` reproduz o formato de export do WhatsApp Web (`[HH:mm, DD/MM/YYYY] Nome: mensagem`, uma por linha) via um handler `onCopy` que sobrescreve o clipboard — não é a seleção de texto padrão do navegador.
- `/documentacao` (`pages/Documentacao.tsx`) — escolhe uma pessoa, marca quais dias da conversa quer (checkbox por data, calculado a partir das mensagens já existentes) e gera o mesmo texto no formato WhatsApp acima, só das datas marcadas, com botão de copiar. Não grava nada no banco — é 100% derivado do `MessageLogs` já existente via `/api/messages/search`. A formatação (`formatExportLine`/`dateKey`/etc.) fica em `lib/whatsappExport.ts`, compartilhada com o `onCopy` de `/messages`.

## Rodando localmente

Ordem recomendada: API → Frontend → Bridge.

| Serviço  | Pasta                  | Comando     | Porta  |
|----------|-------------------------|-------------|--------|
| API      | `ApiBotWhatsapp.Api`    | `dotnet run`| `5207` |
| Frontend | `frontend`               | `npm run dev` | `5173` |
| Bridge   | `whatsapp-bridge`        | `npm start` | `3001` |

Healthchecks: `GET /health` (API e bridge), `GET /swagger` (API, só em Development), `GET /session/status` e `GET /session/list` (bridge).

## Banco de dados e migrations

O banco é SQLite (`ConnectionStrings:DefaultConnection`). A API usa **EF Core Migrations de verdade** (`dbContext.Database.MigrateAsync()` no `Program.cs`) — a pasta `Migrations/` é a fonte da verdade do schema, não é opcional/decorativa.

- Mudou um `Model`? Rode `dotnet ef migrations add NomeDaMudanca` dentro de `ApiBotWhatsapp.Api` e confira o arquivo gerado antes de commitar (principalmente se envolver `DropColumn`/`DropTable` ou precisar de backfill de dado via `migrationBuilder.Sql(...)`).
- Localmente, se algo ficar inconsistente, apague `app.db*` e suba a API de novo — `MigrateAsync()` recria tudo do zero.
- **Ferramenta `dotnet-ef`**: mantenha a versão do tool global (`dotnet tool update --global dotnet-ef`) alinhada com a versão do pacote `Microsoft.EntityFrameworkCore.Design` do `.csproj`. Uma sessão anterior teve `dotnet-ef 9.0.7` rodando contra um projeto em EF Core `10.0.3`, e isso mascarou um bug real (a migration `InitialCreate` tinha o corpo todo comentado — ver histórico do arquivo — o que fazia `Up()`/`Down()` não fazerem nada; já corrigido).
- **Produção (VPS)**: o histórico de migrations (`__EFMigrationsHistory`) já foi baselinado uma vez (o banco tinha sido criado originalmente via `EnsureCreated()` + SQL ad-hoc) — deploys novos são o fluxo normal, `dotnet ef database update` só aplica o que for novo. Sempre faça backup do `app.db` antes de migrar produção mesmo assim. Passo a passo completo de deploy em `passo_deploy.md`.

## Variáveis de ambiente essenciais

**API** (`ApiBotWhatsapp.Api/.env`): `ConnectionStrings__DefaultConnection`, `Jwt__SigningKey`/`Jwt__Issuer`/`Jwt__Audience`/`Jwt__ExpiresMinutes`, `WhatsApp__BridgeBaseUrl`, `WhatsApp__TimeZoneId`, `WhatsApp__WebhookToken`, `WhatsApp__DefaultConnectedNumber`, `Cors__AllowedOrigins__0`.

**Bridge** (`whatsapp-bridge/.env`): `BRIDGE_PORT`, `BACKEND_WEBHOOK_URL`, `BACKEND_WEBHOOK_TOKEN` (precisa ser igual a `WhatsApp__WebhookToken` da API).

Não existe mais `BACKEND_COMPANY_CODE` nem qualquer configuração de multi-empresa.

## O que este sistema NÃO tem (removido deliberadamente)

- **Multi-tenant/empresas**: não existe mais `Company`, seleção de empresa no login, nem vínculo usuário↔empresa.
- **Whitelist de bloqueio**: substituída pelo gate "precisa estar em Contatos" (ver auto-resposta acima).
- **Papel "Gestor"**: `User.Title` não controla mais permissão nenhuma, é só texto livre.
- **Múltiplos números de WhatsApp por usuário/regra**: 1 usuário = 1 conexão WhatsApp. `ScheduleRule` não seleciona mais números.
- Documentação antiga em `doc/`/`docs/` (descrevia o mundo multi-tenant) foi removida; este arquivo é a referência atual. `passo_deploy.md` continua sendo o guia de deploy em VPS.

## Deploy

Ver `passo_deploy.md` para o passo a passo de publicação em VPS (Nginx na frente da API + frontend estático, bridge como processo Node sempre ativo). Ver a seção "Banco de dados e migrations" acima antes de rodar `dotnet ef database update` em produção.
