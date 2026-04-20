# sendMessages

## Signature

```ts
sendMessages(entityId: string, messages: string[]): Promise<number>
```

Retorna la cantidad de **chunks** efectivamente entregados a Kommo (no la cantidad de mensajes input).

## Comportamiento

1. Aplica `splitForKommo` a cada mensaje del array (via `flatMap`) para obtener una lista plana de chunks ≤256 chars.
2. Para cada chunk, llama secuencialmente:
   - `setResponseField(entityId, chunk)` → PATCH `/v4/leads/{entityId}`
   - `launchSalesbot(entityId)` → POST `/v2/salesbot/run`
3. Si un chunk falla (throw en cualquiera de las 2 llamadas HTTP): notifica con `level: "error"` y continúa con el siguiente.
4. Cuenta solo los chunks donde **ambas** llamadas tuvieron éxito.
5. Espera `DELAY_BETWEEN_MESSAGES` ms entre chunks (no después del último).

## HTTP calls esperadas (efecto observable)

- `PATCH https://{KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads/{entityId}` con body `{ custom_fields_values: [{ field_id, values: [{ value: chunk }] }] }`
- `POST https://{KOMMO_SUBDOMAIN}.kommo.com/api/v2/salesbot/run` con body `[{ bot_id, entity_id, entity_type: "leads" }]`

## Tests

### ✅ Happy path

- [ ] 1 mensaje corto ("hola") → retorna 1, fetch llamado 2 veces (setField + salesbot) en ese orden
- [ ] 1 mensaje de exactamente 256 chars → retorna 1, fetch llamado 2 veces
- [ ] 2 mensajes cortos → retorna 2, fetch llamado 4 veces
- [ ] 1 mensaje de 500 chars → retorna 2 (se parte en 2 chunks), fetch llamado 4 veces

### 🚫 Validations

- [ ] array vacío `[]` → retorna 0, fetch nunca se llama
- [ ] array con un string vacío `[""]` → retorna 0 (splitForKommo devuelve `[]`), fetch nunca se llama

### 💥 Edge cases

- [ ] 3 chunks, Kommo responde 400 en el `setResponseField` del chunk 2 → retorna 2 (chunks 1 y 3 OK)
- [ ] 3 chunks, Kommo responde 400 en el `launchSalesbot` del chunk 2 → retorna 2 (chunk 2 NO se cuenta)
- [ ] todos los chunks fallan (todas las fetch devuelven 500) → retorna 0
- [ ] chunk 1 OK, chunk 2 falla, chunk 3 OK → fetch del chunk 3 se ejecuta (no se cortocircuita)
