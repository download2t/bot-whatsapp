# Api Bot WhatsApp - Documentacao Funcional e Tecnica

## 1. Visao Geral

O sistema e composto por 4 blocos principais:

1. `ApiBotWhatsapp.Api` (ASP.NET Core + SQLite)
2. `frontend` (React + Vite + TypeScript)
3. `whatsapp-bridge` (Node.js + whatsapp-web.js)
4. `DesktopController` (WinForms) para operacao local dos servicos

Fluxo principal:

1. Uma mensagem chega no WhatsApp Web (bridge).
2. O bridge envia webhook para a API (`/api/webhooks/whatsapp`).
3. A API valida token do webhook, aplica regras de negocio e whitelist.
4. Se elegivel, a API envia resposta automatica via bridge.
5. Todo o fluxo e registrado em `MessageLogs`.

---

## 2. Arquitetura e Componentes

## 2.1 API (`ApiBotWhatsapp.Api`)

Responsabilidades:

1. Autenticacao JWT.
2. CRUD de usuarios, regras de agenda e whitelist.
3. Consulta/exportacao de mensagens.
4. Orquestracao de auto resposta.
5. Integracao com bridge WhatsApp.

Tecnologias:

1. ASP.NET Core `net10.0`
2. Entity Framework Core + SQLite
3. JWT Bearer
4. Swagger (ambiente Development)

## 2.2 Frontend (`frontend`)

Responsabilidades:

1. Login e gestao de sessao JWT.
2. Painel operacional (dashboard, mensagens, regras, whitelist, usuarios, conexao WhatsApp).
3. Consumo dos endpoints da API.

Tecnologias:

1. React 18
2. TypeScript
3. React Router
4. Vite

## 2.3 Bridge (`whatsapp-bridge`)

Responsabilidades:

1. Manter sessao WhatsApp Web.
2. Expor estado da conexao (status, QR, pairing code).
3. Encaminhar mensagens recebidas para webhook da API.
4. Enviar mensagens originadas pela API.

Tecnologias:

1. Node.js
2. Express
3. whatsapp-web.js
4. Axios

## 2.4 Desktop Controller (`DesktopController`)

Responsabilidades:

1. Configuracao manual de caminho e comando por servico (API, Frontend, Bridge).
2. Start/Stop individual por servico.
3. Persistencia de configuracao e PIDs.
4. Exibicao de status por servico: ativo/parado, porta e tempo ativo.
5. Log local e abertura/copia de log.

---

## 3. Acesso e Autenticacao

## 3.1 Credenciais iniciais

No primeiro bootstrap do banco, e criado um usuario padrao:

1. Usuario: `admin`
2. Senha: `admin123`

Origem: rotina de seed (`SeedData`).

## 3.2 JWT

1. Login em `POST /api/auth/login` retorna `token` e `expiresAtUtc`.
2. Frontend grava em `localStorage` (`bot_jwt`, `bot_user`).
3. API usa fallback policy autenticada para todos os endpoints, exceto os explicitamente anonimos.

Endpoints anonimos:

1. `GET /health`
2. `POST /api/auth/login`
3. `POST /api/auth/register`
4. `POST /api/webhooks/whatsapp` (com validacao por header token)

## 3.3 Header de webhook

Para webhook WhatsApp:

1. Header obrigatorio: `X-Webhook-Token`
2. Deve coincidir com `WhatsApp:WebhookToken`

---

## 4. Modelo de Dados (resumo)

## 4.1 `User`

Campos principais:

1. `Id`
2. `Username` (unico na aplicacao)
3. `PasswordHash`
4. `Email`, `Phone`, `Cpf`, `FullName`, `Title`, `Notes`
5. `CreatedAtUtc`, `UpdatedAtUtc`

## 4.2 `ScheduleRule`

Campos principais:

1. `Name`
2. `StartTime`, `EndTime` (`HH:mm`)
3. `Message`
4. `IsEnabled`
5. `ThrottleMinutes`
6. `IsOutOfBusinessHours`
7. `MaxDailyMessagesPerUser`

## 4.3 `WhitelistNumber`

Campos principais:

1. `Name`
2. `PhoneNumber` (normalizado em digitos)
3. `CreatedAtUtc`

## 4.4 `MessageLog`

Campos principais:

1. `Direction` (`Incoming`/`Outgoing`)
2. `PhoneNumber`
3. `Content`
4. `IsAutomatic`
5. `Status`
6. `TimestampUtc`

---

## 5. API - Endpoints e Funcionalidades

## 5.1 Health

1. `GET /health`
2. Retorna estado basico da API.

## 5.2 Auth (`/api/auth`)

1. `POST /register`
   1. Cria usuario.
   2. Valida usuario/senha obrigatorios.
2. `POST /login`
   1. Valida credenciais.
   2. Emite JWT.
3. `GET /me`
   1. Retorna perfil do usuario autenticado.
4. `PUT /profile`
   1. Atualiza perfil e username.
   2. Impede username duplicado.
5. `PUT /change-password`
   1. Exige senha atual valida.
   2. Nova senha minima de 6 caracteres.

## 5.3 Users (`/api/users`)

1. `GET /`
   1. Lista usuarios.
2. `GET /{id}`
   1. Detalha usuario.
3. `POST /`
   1. Cria usuario completo.
   2. Senha minima de 6.
4. `PUT /{id}`
   1. Atualiza dados cadastrais.
5. `DELETE /{id}`
   1. Remove usuario.

## 5.4 Messages (`/api/messages`)

1. `GET /`
   1. Ultimos registros (`take` de 1 a 500).
2. `GET /search`
   1. Filtros: telefone, direcao, periodo.
   2. Ordenacao por timestamp/telefone/direcao.
   3. Paginacao.
3. `GET /export`
   1. Exporta CSV com filtros e ordenacao.
4. `GET /dashboard`
   1. KPIs totais e do dia (incoming/outgoing/automatic).

## 5.5 Schedule Rules (`/api/schedule-rules`)

1. `GET /`
   1. Lista regras.
2. `GET /{id}`
   1. Detalha regra.
3. `POST /`
   1. Cria regra.
   2. `StartTime` e `EndTime` em `HH:mm`.
4. `PUT /{id}`
   1. Atualiza regra.
5. `DELETE /{id}`
   1. Remove regra.

## 5.6 Whitelist (`/api/whitelist`)

1. `GET /`
   1. Lista numeros bloqueados para auto resposta.
2. `POST /`
   1. Inclui numero (normaliza para digitos).
   2. Impede duplicidade.
3. `DELETE /{id}`
   1. Remove item da whitelist.

## 5.7 WhatsApp (`/api/whatsapp`)

1. `GET /connections`
   1. Lista estado de conexao (implementacao atual: `default`).
2. `GET /status`
   1. Estado da sessao do bridge.
3. `GET /qr`
   1. QR para pareamento.
4. `POST /connect`
   1. Solicita inicializacao da sessao.
5. `POST /disconnect`
   1. Solicita desconexao.
6. `POST /pairing-code`
   1. Gera codigo de pareamento por telefone.

## 5.8 Webhook WhatsApp (`/api/webhooks/whatsapp`)

1. `POST /api/webhooks/whatsapp`
2. Entrada esperada:
   1. `phoneNumber`
   2. `message`
3. Requer header `X-Webhook-Token` valido.
4. Dispara fluxo de auto resposta.

---

## 6. Regras de Negocio de Auto Resposta

Ordem de processamento (servico `AutoReplyService`):

1. Normaliza telefone para apenas digitos.
2. Registra mensagem `Incoming` em `MessageLogs`.
3. Verifica whitelist:
   1. Se estiver na whitelist, nao responde automaticamente.
4. Busca regras ativas (`IsEnabled`).
5. Avalia regra valida para o horario atual.
6. Aplica throttle (`ThrottleMinutes`):
   1. Se enviou automatico recentemente para o mesmo numero, bloqueia envio.
7. Aplica limite diario (`MaxDailyMessagesPerUser`):
   1. Se atingiu limite no dia, bloqueia envio.
8. Envia mensagem pelo bridge/provider.
9. Registra `Outgoing` automatico com status de despacho.

## 6.1 Regra de horario normal vs fora do expediente

1. `IsOutOfBusinessHours = false`:
   1. Regra ativa dentro do intervalo `[StartTime, EndTime)`.
2. `IsOutOfBusinessHours = true`:
   1. Logica invertida (ativa fora do intervalo).

Tratamento de virada de dia (ex.: 22:00 ate 06:00):

1. Se `StartTime > EndTime`, considera intervalo atravessando meia-noite.

## 6.2 Timezone

1. Usa `WhatsApp:TimeZoneId` quando configurado.
2. Padrao: `E. South America Standard Time`.
3. Timestamps operacionais seguem esse timezone de referencia no processamento de regras/logica diaria.

---

## 7. Mensagens de Status e Erro (API/Bridge)

Exemplos de status retornados no webhook:

1. `Number is in whitelist. Auto reply skipped.`
2. `No active schedule rule for current time.`
3. `Throttle active: X minutes required between messages.`
4. `Daily limit reached: X messages per user.`
5. `Message sent through WhatsApp bridge.`
6. `Bridge unavailable: ...`

Observacoes:

1. Mensagens de erro de provider/bridge podem ser repassadas no campo `Status` do webhook e logs.
2. `message` vazio no webhook e substituido por `[non-text message]`.

---

## 8. Frontend - Acessos e Fluxos

## 8.1 Rotas principais (apos login)

1. `/` Dashboard
2. `/messages` Mensagens
3. `/rules` Lista de regras
4. `/rules/new` Nova regra
5. `/rules/edit/:id` Editar regra
6. `/whitelist` Whitelist
7. `/users` Lista de usuarios
8. `/users/new` Novo usuario
9. `/users/:id/edit` Editar usuario
10. `/profile` Perfil
11. `/change-password` Alterar senha
12. `/whatsapp-connections` Conexoes WhatsApp

## 8.2 Navegacao e sessoes

1. Menu superior com acesso aos modulos operacionais.
2. Menu de perfil com:
   1. Perfil
   2. Alterar senha
   3. Documentacao (Swagger local)
   4. Conexoes WhatsApp
3. Se API retornar `401`, frontend limpa token e volta ao login.

---

## 9. Desktop Controller - Documentacao Completa

## 9.1 Objetivo

Permitir operacao local dos 3 servicos com configuracao manual e persistente.

## 9.2 Funcionalidades

1. Configurar por servico:
   1. Pasta de execucao
   2. Comando
2. Iniciar/parar individualmente:
   1. API
   2. Frontend
   3. Bridge
3. Persistencia automatica dos dados informados.
4. Indicadores em tempo real:
   1. Estado (ativo/parado)
   2. Porta ON/OFF
   3. Tempo ativo
5. Logs:
   1. Janela interna
   2. Copiar log
   3. Abrir log em arquivo

## 9.3 Arquivos de estado gerados

Diretorio base: `/.dev-runner`

1. `service-settings.json`
   1. Guarda `Path` e `Command` de cada servico.
2. `controller.json`
   1. Guarda PIDs e timestamps de inicio por servico.
3. `logs/controller-YYYYMMDD.log`
   1. Log operacional append-only.

## 9.4 Mapeamento de portas monitoradas

1. API: `5207`
2. Frontend: `5173`
3. Bridge: `3001`

## 9.5 Fluxo recomendado de uso

1. Abrir `ApiBotWhatsapp.Controller.exe`.
2. Preencher/validar pasta e comando de cada servico.
3. Clicar `Salvar configuracoes`.
4. Iniciar os servicos individualmente conforme necessidade.
5. Se houver erro, abrir/copy log para diagnostico.

Comandos padrao esperados:

1. API: `dotnet run`
2. Frontend: `npm run dev`
3. Bridge: `npm start`

---

## 10. Configuracao de Ambiente

## 10.1 API (`ApiBotWhatsapp.Api/.env`)

Chaves relevantes:

1. `ConnectionStrings__DefaultConnection`
2. `Cors__AllowedOrigins__0`
3. `Jwt__Issuer`
4. `Jwt__Audience`
5. `Jwt__ExpiresMinutes`
6. `Jwt__SigningKey`
7. `WhatsApp__BridgeBaseUrl`
8. `WhatsApp__TimeZoneId`
9. `WhatsApp__WebhookToken`

## 10.2 Bridge (`whatsapp-bridge/.env`)

Chaves relevantes:

1. `BRIDGE_PORT`
2. `BACKEND_WEBHOOK_URL`
3. `BACKEND_WEBHOOK_TOKEN`

Importante:

1. `BACKEND_WEBHOOK_TOKEN` deve ser igual a `WhatsApp__WebhookToken` da API.

---

## 11. Observabilidade e Operacao

## 11.1 Logs

1. API: logs do ASP.NET no console.
2. Bridge: logs no console Node.
3. Desktop Controller: log em tela + arquivo diario.
4. Mensageria: trilha funcional persistida em `MessageLogs` no banco.

## 11.2 Saude

1. API: `GET /health`
2. Bridge: `GET /health`
3. Conexao WhatsApp: `GET /session/status` via bridge (consumido pela API e frontend)

---

## 12. Seguranca e Boas Praticas

1. Alterar imediatamente credenciais default (`admin/admin123`) em ambiente real.
2. Definir `Jwt__SigningKey` forte (>= 32 bytes para HS256).
3. Restringir CORS para dominios autorizados.
4. Nao versionar arquivos `.env` com segredos reais.
5. Rotacionar token de webhook periodicamente.
6. Proteger a maquina que roda o Desktop Controller (ele controla execucao de servicos locais).

---

## 13. Roadmap sugerido (opcional)

1. Controle de perfis/permissoes (RBAC) por tipo de usuario.
2. Historico de auditoria por acao administrativa.
3. Health-check consolidado no Desktop Controller com diagnostico guiado.
4. Exportacao de documentacao OpenAPI + guia de integracao externo.
5. Empacotamento instalador do controller com atalho e atualizacao.
