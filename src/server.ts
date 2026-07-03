/**
 * SERVER — Simulação do back-end Node.js/TypeScript da empresa
 * -------------------------------------------------------------
 * Reproduz a rotina automatizada do estágio:
 *
 *  1. Um agendador baseado em expressões cron atua como gatilho
 *     determinístico (na PROD: daemon cron do Linux, ex. "0 * * * *"
 *     para execução a cada hora cheia; aqui: a cada 15 segundos
 *     para a demo ser observável).
 *  2. A cada disparo, a rotina lê o "estado crítico de geração de
 *     energia" (dados fictícios) e decide se há alerta.
 *  3. Havendo alerta, envia uma requisição HTTP autenticada ao broker —
 *     o papel que o Firebase Admin SDK cumpre ao chamar os endpoints
 *     do FCM via HTTPS/TLS.
 */

import cron from "node-cron";

const BROKER_API = "http://localhost:8081/v1/messages:send";
const SERVER_KEY = "demo-server-key-123"; // mesma credencial validada pelo broker
const CRON_EXPR = "*/15 * * * * *"; // demo: a cada 15s (PROD seria "0 * * * *")

const log = (msg: string) =>
  console.log(`[SERVER ${new Date().toISOString().slice(11, 19)}] ${msg}`);

// ---------------------------------------------------------------------------
// Rotina de negócio: leitura fictícia do estado de geração de energia
// ---------------------------------------------------------------------------
interface EnergyReading {
  plantId: string;
  outputMW: number;
  status: "NORMAL" | "CRITICO";
}

function readEnergyState(): EnergyReading {
  const outputMW = Number((Math.random() * 100).toFixed(1));
  return {
    plantId: "USINA-CE-01",
    outputMW,
    status: outputMW < 40 ? "CRITICO" : "NORMAL",
  };
}

// ---------------------------------------------------------------------------
// Envio da notificação (papel do Firebase Admin SDK -> endpoint FCM)
// ---------------------------------------------------------------------------
async function sendPush(reading: EnergyReading): Promise<void> {
  const payload = {
    topic: "all",
    notification: {
      title: `⚠️ Alerta operacional — ${reading.plantId}`,
      body: `Geração em nível crítico: ${reading.outputMW} MW`,
    },
    data: {
      plantId: reading.plantId,
      outputMW: String(reading.outputMW),
      timestamp: new Date().toISOString(),
    },
  };

  log(`Enviando requisição autenticada ao broker (HTTP POST /v1/messages:send)…`);
  const res = await fetch(BROKER_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVER_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await res.json();
  log(`Broker respondeu ${res.status} — entregue a ${result.delivered} dispositivo(s)`);
}

// ---------------------------------------------------------------------------
// Gatilho temporal: expressão cron
// ---------------------------------------------------------------------------
log(`Back-end iniciado. Agendamento cron ativo: "${CRON_EXPR}"`);

cron.schedule(CRON_EXPR, async () => {
  log("⏰ Gatilho cron disparado — executando rotina de verificação");
  const reading = readEnergyState();
  log(`Leitura: ${reading.plantId} gerando ${reading.outputMW} MW [${reading.status}]`);

  if (reading.status === "CRITICO") {
    await sendPush(reading).catch((err) => log(`Falha no envio: ${err.message}`));
  } else {
    log("Estado normal — nenhum alerta necessário");
  }
});
