# Regras de Auto Resposta e Selecao de Horario

## Como a regra funciona

Quando chega uma mensagem no WhatsApp Web, o bridge envia o evento para a API. A API grava a entrada no historico e tenta encontrar uma regra ativa para o numero conectado e para a empresa correspondente.

A selecao segue esta logica:

1. filtra as regras da empresa
2. considera apenas regras habilitadas
3. considera apenas regras associadas ao numero WhatsApp conectado
4. ordena por horario de inicio
5. escolhe a primeira regra que esteja ativa no horario atual

## Quando uma regra e considerada ativa

A regra pode operar em dois modos:

### 1. Horario normal

Se `IsOutOfBusinessHours` estiver desmarcado:

- a regra vale dentro do intervalo definido por `StartTime` e `EndTime`

Exemplo:

- 08:00 ate 12:00
- 12:00 ate 18:00

Se a mensagem chegar as 14:00, a regra valida sera a que cobre 12:00 ate 18:00.

### 2. Fora do expediente

Se `IsOutOfBusinessHours` estiver marcado:

- a regra vale fora do intervalo definido
- a interpretacao do periodo fica invertida

Exemplo:

- StartTime = 08:00
- EndTime = 18:00
- fora do expediente significa que a regra fica ativa antes de 08:00 e depois de 18:00

## Varios horarios para o mesmo numero

Se existir mais de uma regra para o mesmo numero WhatsApp:

- o sistema busca todas
- avalia qual esta ativa no momento da mensagem
- dispara somente a primeira que bater na janela de horario

Exemplo:

- Regra A: 08:00-12:00
- Regra B: 12:00-18:00
- Regra C: 18:00-22:00

Se a mensagem chegar as 14:00, a Regra B e a escolhida.
Se chegar as 23:00, nenhuma das tres dispara, a menos que exista uma regra de fora do expediente cobrindo esse periodo.

## Regras adicionais aplicadas antes do envio

Antes de responder, a API ainda verifica:

- whitelist do telefone do contato
- throttle minimo entre mensagens
- limite diario por usuario
- antiguidade da mensagem recebida

## Throttle

Se `ThrottleMinutes` for maior que zero:

- o sistema verifica quanto tempo passou desde a ultima mensagem automatica enviada para aquele contato e numero WhatsApp
- se ainda nao passou o intervalo minimo, o envio e bloqueado

## Limite diario

Se `MaxDailyMessagesPerUser` estiver definido:

- o sistema conta as mensagens automaticas enviadas naquele dia para o mesmo contato e mesmo numero WhatsApp
- se atingir o limite, nao envia novamente

## Trava de mensagens retroativas

Foi aplicada uma regra de protecao para evitar respostas automáticas com mensagens antigas:

- se o evento recebido tiver mais de 5 minutos de atraso, a mensagem ainda entra no historico
- porem a auto resposta nao e executada

Isso evita casos como:

- a API ficou desligada
- o bridge reenviou uma mensagem antiga quando a API voltou
- o sistema responderia em cima de um evento que ja nao representa uma conversa atual

## Resumo de comportamento esperado

- mensagem nova e recente: responde na hora, se existir regra valida
- mensagem antiga com mais de 5 minutos: registra, mas nao responde
- varias regras para o mesmo numero: vence a que estiver ativa no momento
- fora do expediente: a logica e invertida pela flag da regra
