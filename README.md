# Simulação — Arquitetura de Notificações Push (Cron → Broker → Mobile)

> Material complementar do **Relatório de Estágio Supervisionado II** (Bacharelado em Sistemas de Informação, IFCE — Campus Crato). Esta é uma **simulação educacional** da arquitetura descrita no relatório. Nenhum código, credencial ou dado do ambiente de produção é utilizado: o papel do Firebase Cloud Messaging (FCM) é reproduzido localmente por um broker próprio, e os dados de geração de energia são fictícios.

## Arquitetura

```
┌──────────────┐  HTTP POST (autenticado)  ┌──────────────┐  push via conexão   ┌──────────────┐
│   server/    │ ────────────────────────► │   broker/    │ ──────────────────► │   client/    │
│ Node.js + TS │   /v1/messages:send       │  "FCM local" │  persistente (WS)   │ "dispositivo"│
│ gatilho cron │                           │ pub/sub por  │   tópico "all"      │  listeners + │
│              │                           │ tópicos +    │                     │  event bus   │
└──────────────┘                           │ fan-out      │                     └──────────────┘
                                           └──────────────┘
```

Cada processo reproduz um papel da arquitetura real do estágio:

| Componente | Papel na simulação | Equivalente em produção |
|---|---|---|
| `src/server.ts` | Rotina agendada por expressão cron que lê o estado de geração de energia e envia alertas | Back-end Node.js/TypeScript + daemon cron do Linux + Firebase Admin SDK |
| `src/broker.ts` | Message broker: valida credenciais, registra tokens, gerencia tópicos (pub/sub) e faz o fan-out | Firebase Cloud Messaging (FCM) |
| `src/client.ts` | Dispositivo móvel: obtém token, inscreve-se no tópico `all`, mantém conexão persistente e reage via barramento de eventos | App Expo/React Native com `@react-native-firebase/messaging` |

## Conceitos de redes demonstrados

- **Modelo cliente-servidor** com intermediação por broker de mensagens;
- **Conexão persistente** (WebSocket sobre TCP): o dispositivo mantém um soquete aberto em escuta passiva — o mesmo princípio da conexão de longa duração que o FCM mantém com dispositivos Android/iOS;
- **Push vs. polling**: a notificação chega no instante do evento, sem requisições cíclicas do cliente;
- **Pub/sub com fan-out**: uma única publicação no tópico `all` é replicada para todos os inscritos, dispensando envios unicast individuais;
- **Autenticação de requisições**: o broker rejeita com `401` qualquer envio sem a server key correta;
- **Gatilho determinístico por tempo**: expressão cron (`*/15 * * * * *` na demo; `0 * * * *` em produção).

## Como executar

Requisitos: Node.js 18+.

```bash
npm install

# em 3 terminais separados, nesta ordem:
npm run broker   # terminal 1 — sobe o "FCM local" (portas 8081 e 8082)
npm run client   # terminal 2 — registra o dispositivo e fica escutando
npm run server   # terminal 3 — inicia o cron; a cada 15s pode disparar um alerta
```

Quando uma leitura fictícia fica abaixo de 40 MW, o servidor envia o alerta e a notificação atravessa todo o fluxo até o "dispositivo" — observável nos logs dos três terminais no mesmo segundo.

### Testando a camada de segurança

```bash
curl -i -X POST http://localhost:8081/v1/messages:send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer chave-errada" \
  -d '{"topic":"all","notification":{"title":"x","body":"x"},"data":{}}'
# → HTTP 401 {"error":"invalid server key"}
```

## Aviso

Projeto de fins exclusivamente didáticos, sem qualquer vínculo com infraestrutura, código ou dados de produção.
