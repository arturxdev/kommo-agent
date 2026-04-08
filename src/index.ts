import "dotenv/config";
import crypto from "crypto";
import express from "express";
import { handleIncoming } from "./queue/debounce";
import { processMessage } from "./media";
import { runAgent } from "./agent";
import { sendMessages } from "./kommo";
import { notifier } from './notifications/index'
import { ConsoleChannel } from './notifications/channels/consoleChannel'
import { FileChannel } from './notifications/channels/fileChannel'

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
  res.sendStatus(200);

  const message = req.body?.message?.add?.[0];
  const entityId: string | undefined = message?.entity_id;
  const text: string = message?.text ?? "";
  const type: string = message?.type === "incoming" ? "text" : (message?.attachment?.type ?? "text");

  const requestId = crypto.randomUUID().slice(0, 8);

  if (!entityId) {
    await notifier.notify({ level: 'warning', fn: 'webhook/kommo', requestId, message: `Webhook sin entityId: ${JSON.stringify(req.body)}` })
    return;
  }

  const incomingMessage = {
    type: "text",
    text,
    timestamp: Date.now(),
    contact_id: message?.contact_id,
    chat_id: message?.chat_id,
    author: message?.author?.name ?? "Desconocido",
  };

  await notifier.notify({ level: 'info', fn: 'webhook/kommo', entityId, requestId, message: `Mensaje recibido de: ${incomingMessage.author} | texto: "${text}"` })

  handleIncoming(entityId, incomingMessage)
    .then(async (messages) => {
      if (!messages) return;

      const processed = await Promise.all(
        messages.map((m) =>
          processMessage(m as { type: string; text?: string; url?: string })
        )
      );

      try {
        const responses = await runAgent(entityId, processed, requestId);
        await sendMessages(entityId, responses);
        await notifier.notify({ level: 'info', fn: 'webhook/pipeline', entityId, requestId, message: `${responses.length} mensajes enviados` });
      } catch (err) {
        await notifier.notify({
          level: 'error',
          fn: 'webhook/pipeline',
          entityId,
          requestId,
          message: err instanceof Error ? err.message : String(err),
          error: err,
        });
      }
    })
    .catch(async (err: unknown) => {
      await notifier.notify({
        level: 'error',
        fn: 'webhook/debounce',
        entityId,
        requestId,
        message: err instanceof Error ? err.message : String(err),
        error: err,
      });
    });
});

app.listen(PORT, async () => {
  await notifier.notify({ level: 'info', fn: 'server', message: `Servidor corriendo en puerto ${PORT}` });
});

process.on('uncaughtException', async (err) => {
  await notifier.notify({ level: 'error', fn: 'uncaughtException', message: err.message, error: err })
  process.exit(1)
})

process.on('unhandledRejection', async (reason) => {
  await notifier.notify({ level: 'error', fn: 'unhandledRejection', message: String(reason), error: reason as Error })
})
