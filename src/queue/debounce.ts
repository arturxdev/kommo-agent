import Redis from "ioredis";
import "dotenv/config";

const DEBOUNCE_MS = (parseInt(process.env.DEBOUNCE_SECONDS ?? "10")) * 1000;
console.log(`[Debounce] Tiempo de espera: ${DEBOUNCE_MS / 1000}s`);

export const redis = new Redis(process.env.REDIS_URL!);

export async function handleIncoming(
  entityId: string,
  message: object
): Promise<object[] | null> {
  // 1. Push message to list
  await redis.rpush(entityId, JSON.stringify(message));

  // 2. Generate unique token
  const myToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  console.log(`[${entityId}] 📨 Mensaje recibido | token: ${myToken} | total en cola: ${await redis.llen(entityId)}`);

  // 3. Store token with 60s expiry
  await redis.set(`token:${entityId}`, myToken, "EX", 60);
  console.log(`[${entityId}] ⏱️  Esperando ${DEBOUNCE_MS / 1000}s...`);

  // 4. Wait DEBOUNCE_MS
  await new Promise<void>((r) => setTimeout(r, DEBOUNCE_MS));

  // 5. Read current token
  const currentToken = await redis.get(`token:${entityId}`);
  console.log(`[${entityId}] 🔍 Revisando token | mío: ${myToken} | actual: ${currentToken}`);

  // 6. If token mismatch, another call took ownership
  if (currentToken !== myToken) {
    console.log(`[${entityId}] ✋ Cediendo — llegó un mensaje más reciente`);
    return null;
  }

  // 7. Retrieve messages, clean up, return parsed array
  const raw = await redis.lrange(entityId, 0, -1);
  if (raw.length === 0) return null;

  await redis.del(entityId);
  await redis.del(`token:${entityId}`);

  const messages = raw.map((item) => JSON.parse(item) as object);
  console.log(`[${entityId}] ✅ Procesando batch de ${raw.length} mensajes`);
  console.log(`[${entityId}] 📦 Mensajes:`, messages);

  return messages;
}

export async function clearQueue(entityId: string): Promise<void> {
  await redis.del(entityId);
  await redis.del(`token:${entityId}`);
}
