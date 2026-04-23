# Filtro por etapa del lead (webhook gate)

## Contexto

El webhook `POST /webhook/kommo` recibe mensajes de **todos** los leads de Kommo (independientemente de su etapa). Muchos leads ya no están en una etapa en la que el agente deba responder. Este filtro limita las respuestas a leads cuyo `status_id` esté en una allowlist configurable.

## Signature (conceptual — no hay función aislada)

Gate dentro del handler del webhook en `src/index.ts`:

```ts
const allowedStatusIds = (process.env.KOMMO_ALLOWED_STATUS_IDS ?? "94318692")
  .split(",").map((s) => Number(s.trim())).filter(Number.isFinite);

const lead = await getLeadData(entityId); // puede fallar
if (lead && !allowedStatusIds.includes(lead.status_id)) {
  // ack 200, no encolar
}
```

## Comportamiento

1. Al recibir un mensaje, después de validar `entityId` y descartar mensajes vacíos / audio sin URL, se consulta el lead vía `getLeadData(entityId)`.
2. Si `status_id` está en `KOMMO_ALLOWED_STATUS_IDS` → flujo normal (enqueue + procesar + responder).
3. Si `status_id` **NO** está en la allowlist → responde `200` a Kommo, loguea `fn: 'webhook/stage-filter'` nivel `info`, y **no** encola ni responde al usuario.
4. Si `getLeadData` falla (red, 5xx, etc) → **fail-open**: se procesa el mensaje de todas formas, log warning con `fn: 'webhook/stage-check'`.

## Config

- `KOMMO_ALLOWED_STATUS_IDS` — CSV de números. Default `"94318692"` (etapa "Contacto inicial", pipeline 12207252).

## Invariantes

- Nunca se responde al usuario si `status_id` está fuera de la allowlist y `getLeadData` fue exitoso.
- `getLeadData` se llama **una vez** por mensaje entrante (no cacheado).
- El gate ocurre **antes** de `enqueueMessage`, así Redis no acumula mensajes descartados.

## Lo que NO hace

- No cachea el `status_id` en Redis (cada mensaje hace un GET a Kommo).
- No filtra por `pipeline_id` (el `status_id` es único a nivel cuenta).
- No intenta recuperar de un `getLeadData` fallido con reintentos — un solo intento, si falla fail-open.

## Tests

### ✅ Happy path

- [ ] webhook con lead en `status_id=94318692` (default allowlist) → `enqueueMessage` llamado, `res.sendStatus(200)`
- [ ] `KOMMO_ALLOWED_STATUS_IDS="94318692,99999"` + lead `status_id=99999` → `enqueueMessage` llamado
- [ ] webhook con lead permitido + texto válido → el pipeline completo se ejecuta (runAgent + sendMessages)

### 🚫 Filtered

- [ ] webhook con lead `status_id=12345` (no en allowlist) → `enqueueMessage` **NUNCA** llamado, `res.sendStatus(200)`
- [ ] webhook con lead filtrado → notifier recibe `level: 'info'` con `fn: 'webhook/stage-filter'` y mensaje "Skipped:"
- [ ] webhook con lead filtrado → `sendMessages` **NUNCA** llamado (no hay respuesta al usuario)

### 💥 Edge cases

- [ ] `getLeadData` lanza error → fail-open: `enqueueMessage` **SÍ** se llama, notifier loguea `level: 'warning'` con `fn: 'webhook/stage-check'`
- [ ] `KOMMO_ALLOWED_STATUS_IDS` no seteado → usa default `"94318692"`
- [ ] `KOMMO_ALLOWED_STATUS_IDS=""` (string vacío) → allowlist vacía `[]` → todo lead se filtra (siempre que `getLeadData` no falle)
- [ ] `KOMMO_ALLOWED_STATUS_IDS="abc,94318692,xyz"` → valores inválidos ignorados, allowlist queda `[94318692]`
- [ ] validaciones previas (entityId faltante, texto vacío, audio sin URL) **anteceden** al gate — no se llama `getLeadData` en esos casos
