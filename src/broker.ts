/**
 * BROKER — Simulação do Firebase Cloud Messaging (FCM)
 * ------------------------------------------------------
 * Reproduz, em escala didática, o papel do FCM na arquitetura real:
 *
 *  1. Expõe uma API HTTP (POST /v1/messages:send) para o back-end,
 *     equivalente ao endpoint que o Firebase Admin SDK consome.
 *  2. Valida credenciais de segurança (server key) — como o FCM valida
 *     a conta de serviço da empresa.
 *  3. Mantém CONEXÕES PERSISTENTES (WebSocket) com os dispositivos,
 *     assim como o FCM real mantém uma conexão TCP de longa duração
 *     com cada aparelho Android/iOS.
 *  4. Gerencia registro de tokens e inscrição em tópicos (pub/sub).
 *  5. Faz o FAN-OUT: uma única mensagem publicada em um tópico é
 *     replicada para todos os soquetes inscritos nele.
 *
 * NENHUM serviço externo é utilizado. Tudo roda localmente.
 */

import http from "node:http";
import crypto from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

const HTTP_PORT = 8081; // porta da API para o back-end (papel do endpoint FCM)
const WS_PORT = 8082;   // porta de escuta dos dispositivos (conexão persistente)
const SERVER_KEY = "demo-server-key-123"; // credencial fake do back-end

const log = (msg: string) =>
  console.log(`[BROKER ${new Date().toISOString().slice(11, 19)}] ${msg}`);

// ---------------------------------------------------------------------------
// Estado do broker: dispositivos registrados e tópicos (pub/sub)
// ---------------------------------------------------------------------------
interface Device {
  token: string;
  socket: WebSocket;
  topics: Set<string>;
}

const devices = new Map<string, Device>(); // token -> Device

// ---------------------------------------------------------------------------
// Camada de escuta dos dispositivos (conexão persistente via WebSocket)
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", (socket, req) => {
  // Registro de interface: gera o "endereço lógico" (token) do dispositivo,
  // equivalente ao que messaging().getToken() retorna no app real.
  const token = crypto.randomBytes(16).toString("hex");
  const device: Device = { token, socket, topics: new Set() };
  devices.set(token, device);

  log(`Dispositivo conectado de ${req.socket.remoteAddress} — token emitido: ${token.slice(0, 12)}…`);
  socket.send(JSON.stringify({ type: "token", token }));

  socket.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "subscribe") {
      // Inscrição em tópico — equivalente ao subscribeToTopic("all")
      device.topics.add(msg.topic);
      log(`Token ${token.slice(0, 12)}… inscrito no tópico "${msg.topic}"`);
      socket.send(JSON.stringify({ type: "subscribed", topic: msg.topic }));
    }
  });

  socket.on("close", () => {
    devices.delete(token);
    log(`Dispositivo ${token.slice(0, 12)}… desconectado`);
  });
});

// ---------------------------------------------------------------------------
// API HTTP para o back-end (papel do endpoint do FCM)
// ---------------------------------------------------------------------------
const httpServer = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/v1/messages:send") {
    res.writeHead(404).end();
    return;
  }

  // Validação de credenciais — como o FCM valida a requisição do Admin SDK
  const auth = req.headers.authorization ?? "";
  if (auth !== `Bearer ${SERVER_KEY}`) {
    log("Requisição REJEITADA: credencial inválida");
    res.writeHead(401).end(JSON.stringify({ error: "invalid server key" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const { topic, notification, data } = JSON.parse(body);
    log(`Mensagem recebida do back-end para o tópico "${topic}": "${notification.title}"`);

    // FAN-OUT: replica a mensagem para todos os soquetes inscritos no tópico.
    // No FCM real, este passo atravessa a infraestrutura global do Google.
    let delivered = 0;
    for (const device of devices.values()) {
      if (device.topics.has(topic) && device.socket.readyState === WebSocket.OPEN) {
        device.socket.send(
          JSON.stringify({ type: "push", messageId: crypto.randomUUID(), notification, data })
        );
        delivered++;
      }
    }
    log(`Fan-out concluído: ${delivered} dispositivo(s) alcançado(s) no tópico "${topic}"`);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, delivered }));
  });
});

httpServer.listen(HTTP_PORT, () => {
  log(`API HTTP (back-end) escutando em http://localhost:${HTTP_PORT}`);
  log(`Escuta de dispositivos (WebSocket) em ws://localhost:${WS_PORT}`);
});
