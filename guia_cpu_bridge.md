# Guia — VPS lenta / CPU alta (whatsapp-bridge)

Runbook pra quando o sistema ficar lento de novo e a suspeita for o `whatsapp-bridge`. Baseado
no incidente de 05–09/10/2026 (ver histórico de commits do `whatsapp-bridge/index.js` pro fix de
código correspondente).

## 1. Por que isso acontece

Cada sessão do WhatsApp conectada é **uma instância inteira de Chrome rodando 24/7** (não tem
API oficial do WhatsApp disponível pro sistema, então o bridge controla um WhatsApp Web de
verdade via Puppeteer). Isso é inerentemente pesado — não é um bug a cada vez que o servidor
fica lento. Sessões demais, ou sessões mortas sobrando conectadas, é o que estoura o limite.

## 2. Diagnóstico rápido (sempre nessa ordem)

Conecta por SSH (`root@websanma.com`) e roda:

```bash
uptime
ps aux | grep -i chrome | grep -v grep | wc -l
free -h
curl -s http://localhost:3001/session/list
```

Referência do que é normal:

| Métrica | Normal (3 sessões reais) | Alerta |
|---|---|---|
| `load average` (1 min) | abaixo de 4-5 | acima de 8-10 sustentado |
| processos Chrome | ~35-40 | acima de 70-80, ou crescendo sem parar |
| swap usado | baixo, oscila | perto de 2.0Gi/2.0Gi (cheio) |

Se `ps aux \| grep chrome` mostrar **mais de uma instância "principal" de Chrome pro mesmo
`user-data-dir`** (busca por `--headless=new` no comando completo — `ps -eo pid,cmd \| grep
headless=new`), isso é vazamento de verdade (processo órfão), não só sobrecarga normal.

### Checar "CPU roubada" pelo provedor (steal time)

```bash
top -bn1 | head -5
```

Olha o campo `st` na linha `%Cpu(s)`. Se estiver em dois dígitos (ex: `50.0 st`), **o provedor
da VPS está limitando a CPU da máquina** — isso não se resolve reiniciando nada, é throttle de
hospedagem. Se o painel da hospedagem também mostrar aviso de "limite de CPU atingido", é isso.
Nesse caso, pular direto pro passo 4 (reduzir sessões) — reiniciar sozinho não resolve.

## 3. Identificar sessões mortas vs reais

```bash
curl -s http://localhost:3001/session/list
```

- Sessões chamadas `user-{N}` são de usuários de verdade do sistema (têm número de WhatsApp
  vinculado a uma conta).
- Sessões chamadas `session-{N}` (nome genérico, sem vínculo de usuário) **não conseguem nem
  processar mensagem** — o backend rejeita qualquer webhook sem `OwnerUserId` resolvível (ver
  `WhatsAppWebhookController.cs`, linha ~41). Se aparecer uma dessas na lista, é sobra de teste
  — pode remover sem medo de perder alguma conversa real.

Pra confirmar que uma sessão tem uso de verdade antes de remover, pergunte ao dono do número ou
veja se `phoneNumber` na resposta de `/session/list` bate com um WhatsApp que a empresa
realmente usa.

## 4. Remover sessão morta ou travada

**Sempre use `logout-definitivo`, não `disconnect`** — `disconnect` só derruba a conexão (ela
tenta reconectar sozinha); `logout-definitivo` apaga a autenticação local e tira a sessão da
lista persistida, então ela não volta sozinha.

```bash
curl -X POST http://localhost:3001/session/{id}/logout-definitivo
```

Confirma depois:

```bash
curl -s http://localhost:3001/session/list
ps aux | grep -i chrome | grep -v grep | wc -l
```

## 5. Reiniciar o bridge (limpa processos acumulados)

```bash
systemctl restart mydev_bridge
```

Isso já é suficiente na maioria dos casos — o serviço trata `SIGTERM` corretamente (fecha cada
sessão com timeout e força kill se travar). Só usar o `pkill` abaixo se, **depois** do restart,
ainda sobrar processo Chrome órfão sem nenhuma sessão correspondente:

```bash
pkill -9 -f "puppeteer/chrome"
systemctl restart mydev_bridge
```

⚠️ **Nunca reconectar todas as sessões de uma vez só.** Cada reconexão faz uma sincronização
pesada de histórico (maior consumo de CPU de todo o ciclo de vida da sessão). Reconectar 3+ ao
mesmo tempo é o que mais gera pico de load average. Conecta uma, espera aparecer
`"status":"connected"` em `/session/list`, só depois conecta a próxima.

## 6. Reconectar sessão do zero (perdeu autenticação / `qr-required`)

Pelo painel do sistema é o mais simples (gera e mostra o QR visualmente). Via API, se precisar:

```bash
curl -X POST http://localhost:3001/session/{id}/connect
curl -s http://localhost:3001/session/{id}/qr
```

(repara: `/connect` é POST, `/qr` é **GET** — gera erro `Cannot POST` se tentar como POST)

A resposta do `/qr` vem em `qrDataUrl` (base64) — não dá pra escanear direto do terminal, usa o
painel do sistema pra isso sempre que possível.

## 7. Checklist de prevenção

- Não deixar sessão de teste conectada em produção — criar sessão de teste sempre com nome
  temporário e dar `logout-definitivo` assim que não precisar mais.
- Depois de qualquer restart/deploy do bridge, conferir `GET /session/list` pra garantir que só
  sobrou sessão real conectada.
- Se o `load average` ficar cronicamente alto mesmo com só as sessões reais ativas (sem `st`
  alto, sem processo duplicado), é sinal de que o plano da VPS está no limite de verdade — aí a
  saída é upgrade de plano, não tem mais ajuste de código que resolva (rodar Chrome completo por
  sessão é o preço de não ter API oficial do WhatsApp).

## 8. Cola rápida de comandos

```bash
# diagnóstico
uptime && ps aux | grep -i chrome | grep -v grep | wc -l && free -h
curl -s http://localhost:3001/session/list
top -bn1 | head -5   # olhar o "st" (steal)

# limpar sessão morta/travada
curl -X POST http://localhost:3001/session/{id}/logout-definitivo

# restart limpo
systemctl restart mydev_bridge

# só se sobrar Chrome órfão depois do restart
pkill -9 -f "puppeteer/chrome" && systemctl restart mydev_bridge

# reconectar do zero
curl -X POST http://localhost:3001/session/{id}/connect
curl -s http://localhost:3001/session/{id}/qr
```
