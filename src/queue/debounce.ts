import Redis from "ioredis";
import "dotenv/config";
import { notifier } from "../notifications/index";

const DEBOUNCE_MS = (parseInt(process.env.DEBOUNCE_SECONDS ?? "10")) * 1000;
notifier.notify({ level: 'info', fn: 'debounce', message: `Tiempo de espera: ${DEBOUNCE_MS / 1000}s` });

export const redis = new Redis(process.env.REDIS_URL!);

export async function enqueueMessage(
  entityId: string,
  message: object
): Promise<string> {
  await redis.rpush(entityId, JSON.stringify(message));

  const myToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await notifier.notify({ level: 'info', fn: 'debounce/enqueue', entityId, message: `Mensaje encolado | token: ${myToken} | total en cola: ${await redis.llen(entityId)}` });

  await redis.set(`token:${entityId}`, myToken, "EX", 60);
  return myToken;
}

export async function waitAndDrain(
  entityId: string,
  myToken: string
): Promise<object[] | null> {
  await notifier.notify({ level: 'info', fn: 'debounce/wait', entityId, message: `Esperando ${DEBOUNCE_MS / 1000}s... token: ${myToken}` });
  await new Promise<void>((r) => setTimeout(r, DEBOUNCE_MS));

  const currentToken = await redis.get(`token:${entityId}`);
  await notifier.notify({ level: 'info', fn: 'debounce/wait', entityId, message: `Revisando token | mio: ${myToken} | actual: ${currentToken}` });

  if (currentToken !== myToken) {
    await notifier.notify({ level: 'info', fn: 'debounce/wait', entityId, message: `Cediendo — llego un mensaje mas reciente` });
    return null;
  }

  const raw = await redis.lrange(entityId, 0, -1);
  if (raw.length === 0) return null;

  await redis.del(entityId);
  await redis.del(`token:${entityId}`);

  const messages = raw.map((item) => JSON.parse(item) as object);
  await notifier.notify({ level: 'info', fn: 'debounce/wait', entityId, message: `Procesando batch de ${raw.length} mensajes` });
  await notifier.notify({ level: 'info', fn: 'debounce/wait', entityId, message: `Mensajes: ${JSON.stringify(messages)}` });

  return messages;
}

export async function handleIncoming(
  entityId: string,
  message: object
): Promise<object[] | null> {
  const token = await enqueueMessage(entityId, message);
  return waitAndDrain(entityId, token);
}

export async function clearQueue(entityId: string): Promise<void> {
  await redis.del(entityId);
  await redis.del(`token:${entityId}`);
}
