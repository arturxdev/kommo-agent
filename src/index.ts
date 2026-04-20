import "dotenv/config";
import crypto from "crypto";
import express from "express";
import { enqueueMessage, waitAndDrain } from "./queue/debounce";
import { processMessage } from "./media";
import { runAgent, FALLBACK_MESSAGE } from "./agent";
import { sendMessages } from "./kommo";
import { notifier } from './notifications/index'
import { ConsoleChannel } from './notifications/channels/consoleChannel'
import { FileChannel } from './notifications/channels/fileChannel'
import { runWithRequestContext } from './observability/context'

const app = express();
const PORT = process.env.PORT ?? 3001;

notifier.addChannel(new ConsoleChannel())
notifier.addChannel(new FileChannel())

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/webhook/kommo", async (req, res) => {
  console.log(JSON.stringify(req.body))
  const message = req.body?.message?.add?.[0];
  const entityId: string | undefined = message?.entity_id;
  const requestId = crypto.randomUUID().slice(0, 8);

  await runWithRequestContext(
    { requestId, entityId, startedAt: Date.now() },
    async () => {
  if (!entityId) {
    await notifier.notify({ level: 'warning', fn: 'webhook/kommo', message: `Webhook sin entityId: ${JSON.stringify(req.body)}` })
    res.sendStatus(200);
    return;
  }

  const attachmentType: string | undefined = message?.attachment?.type;
  const isVoice = attachmentType === "voice" || attachmentType === "audio";

  const incomingMessage = isVoice
    ? {
        type: "audio" as const,
        url: message?.attachment?.link as string | undefined,
        file_name: message?.attachment?.file_name as string | undefined,
        timestamp: Date.now(),
        contact_id: message?.contact_id,
        chat_id: message?.chat_id,
        author: message?.author?.name ?? "Desconocido",
      }
    : {
        type: "text" as const,
        text: (message?.text ?? "") as string,
        timestamp: Date.now(),
        contact_id: message?.contact_id,
        chat_id: message?.chat_id,
        author: message?.author?.name ?? "Desconocido",
      };

  const logPreview = isVoice
    ? `[audio] ${message?.attachment?.file_name ?? ""}`
    : `texto: "${message?.text ?? ""}"`;
  await notifier.notify({ level: 'info', fn: 'webhook/kommo', entityId, requestId, message: `Mensaje recibido de: ${incomingMessage.author} | ${logPreview}` })

  if (incomingMessage.type === "text" && incomingMessage.text.trim() === "") {
    await notifier.notify({ level: 'warning', fn: 'webhook/kommo', entityId, requestId, message: `Descartando mensaje de texto vacío` });
    res.sendStatus(200);
    return;
  }

  if (incomingMessage.type === "audio" && !incomingMessage.url) {
    await notifier.notify({ level: 'warning', fn: 'webhook/kommo', entityId, requestId, message: `Descartando audio sin URL` });
    res.sendStatus(200);
    return;
  }

  let myToken: string;
  try {
    myToken = await enqueueMessage(entityId, incomingMessage);
  } catch (err) {
    await notifier.notify({
      level: 'error',
      fn: 'webhook/enqueue',
      entityId,
      requestId,
      message: `Falló encolado en Redis: ${err instanceof Error ? err.message : String(err)}`,
      error: err,
    });
    res.sendStatus(500);
    return;
  }

  res.sendStatus(200);

  let delivered = 0;
  try {
    const messages = await waitAndDrain(entityId, myToken);
    if (!messages) return;

    const processed = await Promise.all(
      messages.map(async (m, idx) => {
        try {
          return await processMessage(m as { type: string; text?: string; url?: string; file_name?: string });
        } catch (err) {
          await notifier.notify({
            level: 'error',
            fn: 'processMessage',
            entityId,
            requestId,
            message: `Falló procesamiento de mensaje ${idx}: ${err instanceof Error ? err.message : String(err)}`,
            error: err,
            extra: { index: idx },
          });
          return null;
        }
      })
    );

    const validInputs = processed.filter(
      (s): s is string => typeof s === "string" && s.trim().length > 0
    );

    if (validInputs.length === 0) {
      throw new Error("No hay inputs procesables en el batch");
    }

    const responses = await runAgent(entityId, validInputs, requestId);
    delivered = await sendMessages(entityId, responses);

    if (delivered === 0) {
      throw new Error("Ningún chunk llegó a Kommo");
    }

    await notifier.notify({ level: 'info', fn: 'webhook/pipeline', entityId, requestId, message: `${delivered} chunks enviados de ${responses.length} respuestas` });
  } catch (err) {
    await notifier.notify({
      level: 'error',
      fn: 'webhook/pipeline',
      entityId,
      requestId,
      message: err instanceof Error ? err.message : String(err),
      error: err,
    });

    if (delivered === 0) {
      try {
        const fallbackSent = await sendMessages(entityId, [FALLBACK_MESSAGE]);
        if (fallbackSent === 0) {
          await notifier.notify({
            level: 'error',
            fn: 'webhook/fallback-unreachable',
            entityId,
            requestId,
            message: `Ni el fallback pudo entregarse a Kommo`,
          });
        } else {
          await notifier.notify({ level: 'warning', fn: 'webhook/fallback', entityId, requestId, message: `Fallback enviado al usuario` });
        }
      } catch (fallbackErr) {
        await notifier.notify({
          level: 'error',
          fn: 'webhook/fallback-exception',
          entityId,
          requestId,
          message: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
          error: fallbackErr,
        });
      }
    }
  }
    }
  );
});

app.listen(PORT, async () => {
  await notifier.notify({ level: 'info', fn: 'server', message: `Servidor corriendo en puerto ${PORT} v2` });
});

process.on('uncaughtException', async (err) => {
  await notifier.notify({ level: 'error', fn: 'uncaughtException', message: err.message, error: err })
  process.exit(1)
})

process.on('unhandledRejection', async (reason) => {
  await notifier.notify({ level: 'error', fn: 'unhandledRejection', message: String(reason), error: reason as Error })
})
