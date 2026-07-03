/**
 * CLIENT — Simulação do aplicativo móvel (Expo/React Native)
 * -----------------------------------------------------------
 * Reproduz o comportamento do app no estágio:
 *
 *  1. Conecta-se ao broker e recebe seu token de registro —
 *     equivalente a messaging().getToken().
 *  2. Inscreve-se no tópico "all" — equivalente a subscribeToTopic("all").
 *  3. Mantém a CONEXÃO PERSISTENTE aberta, escutando passivamente —
 *     o modelo push que elimina a necessidade de polling.
 *  4. Ao receber um payload, executa findNotifications(remoteMessage):
 *     valida, "armazena" e dispara um evento interno no barramento —
 *     equivalente ao AppEventEmitter.emit("notification") que atualiza
 *     a interface em tempo real.
 */

import { EventEmitter } from "node:events";
import WebSocket from "ws";

const BROKER_WS = "ws://localhost:8082";
const TOPIC = "all";

const log = (msg: string) =>
  console.log(`[CLIENT ${new Date().toISOString().slice(11, 19)}] ${msg}`);

// Barramento de eventos interno do app (papel do AppEventEmitter)
const AppEventEmitter = new EventEmitter();

// "Armazenamento local" das notificações recebidas (papel do estado do app)
const notificationStore: unknown[] = [];

interface RemoteMessage {
  messageId: string;
  notification: { title: string; body: string };
  data: Record<string, string>;
}

/**
 * Equivalente à função findNotifications(remoteMessage) do estágio:
 * intercepta o payload, valida, armazena e sinaliza a camada de apresentação.
 */
async function findNotifications(remoteMessage: RemoteMessage): Promise<void> {
  notificationStore.push(remoteMessage);
  log(`Payload interceptado (messageId ${remoteMessage.messageId.slice(0, 8)}…) e armazenado`);
  // Sincronismo de interface via barramento de eventos — sem polling
  AppEventEmitter.emit("notification", remoteMessage);
}

// A "camada de apresentação" reage ao evento e atualiza a UI
AppEventEmitter.on("notification", (msg: RemoteMessage) => {
  log(`📱 UI ATUALIZADA — Toast exibido: "${msg.notification.title}"`);
  log(`   └─ ${msg.notification.body}`);
  log(`   └─ dados: ${JSON.stringify(msg.data)} | total armazenado: ${notificationStore.length}`);
});

// ---------------------------------------------------------------------------
// Ciclo de vida da conexão de rede do dispositivo
// ---------------------------------------------------------------------------
log("Iniciando aplicativo (simulação do dispositivo móvel)…");
const socket = new WebSocket(BROKER_WS);

socket.on("open", () => {
  log("Conexão persistente estabelecida com o broker (soquete aberto)");
});

socket.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());

  switch (msg.type) {
    case "token":
      // Registro concluído — token é o "endereço lógico" do dispositivo
      log(`Token de registro recebido: ${msg.token.slice(0, 12)}… (getToken)`);
      socket.send(JSON.stringify({ type: "subscribe", topic: TOPIC }));
      break;

    case "subscribed":
      log(`Inscrito no tópico "${msg.topic}" (subscribeToTopic) — escutando…`);
      break;

    case "push":
      // Listener onMessage: recepção passiva via conexão persistente
      log("Notificação recebida via push (onMessage)");
      void findNotifications(msg as RemoteMessage);
      break;
  }
});

socket.on("close", () => log("Conexão com o broker encerrada"));
socket.on("error", (err) => log(`Erro de rede: ${err.message}`));
