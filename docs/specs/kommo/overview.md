# Módulo Kommo

## Modelo

- `KOMMO_MESSAGE_MAX_CHARS = 256` — límite duro impuesto por la API de Kommo en `setResponseField`.
- Un "mensaje" generado por el agente puede ser >256 chars; se parte en "chunks" ≤256.
- Cada chunk requiere 2 llamadas HTTP secuenciales: `setResponseField` + `launchSalesbot`.

## Invariantes

- Ningún chunk enviado a Kommo supera `KOMMO_MESSAGE_MAX_CHARS`.
- `sendMessages` nunca lanza; retorna la cantidad de chunks efectivamente entregados.
- Los chunks se envían en orden, con delay `DELAY_BETWEEN_MESSAGES` ms entre ellos.

## Operaciones

- `splitForKommo(text, max)` — función pura, divide un string en chunks ≤`max` respetando límites naturales de oración/palabra.
- `sendMessages(entityId, messages)` — integra con Kommo API; retorna count.

## Lo que NO hace

- No reintenta chunks fallidos (fail-forward).
- No valida el contenido del mensaje más allá de la longitud.
- No persiste estado local.

## Operaciones documentadas

- [split-for-kommo](./split-for-kommo.md)
- [send-messages](./send-messages.md)
- [stage-filter](./stage-filter.md)
