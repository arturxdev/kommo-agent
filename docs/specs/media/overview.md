# Módulo Media

## Modelo

- Input `message`: `{ type: "text" | "audio" | otro, text?: string, url?: string }`
- Output: `string` — **nunca lanza**; en fallas de audio devuelve el sentinel `"[audio no transcribible]"`.

## Operaciones

- `processMessage(message)` — normaliza cualquier input a un string listo para el agente.

## Sentinel

`"[audio no transcribible]"` — permite al agente generar una respuesta tipo "no pude escuchar tu audio" en lugar de abortar el batch cuando el audio no se puede procesar.

## Operaciones documentadas

- [process-message](./process-message.md)
