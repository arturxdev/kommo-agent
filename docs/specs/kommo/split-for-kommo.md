# splitForKommo

## Signature

```ts
splitForKommo(text: string, max = KOMMO_MESSAGE_MAX_CHARS): string[]
```

## Comportamiento

Parte un texto en fragmentos de longitud `≤max`, prefiriendo los cortes en este orden:

1. **Fin de oración**: `. `, `! `, `? `, `\n` — solo si el corte queda a ≥`max/2` del inicio del chunk actual (evita chunks demasiado cortos).
2. **Fin de palabra**: último espacio dentro de la ventana `[0, max]` — solo si queda a ≥`max/2`.
3. **Corte duro** en `max` si ninguna opción natural existe.

Cada chunk retornado está `trim()`eado (sin whitespace al inicio/fin).

## Tests

### ✅ Happy path

- [ ] empty string → array vacío `[]`
- [ ] solo whitespace (`"   "`) → array vacío `[]`
- [ ] texto corto (`"hola"`) → `["hola"]`
- [ ] exactamente 256 chars → un solo chunk con esos 256 chars
- [ ] texto con 2 oraciones `"Uno. Dos."` (<256) → `["Uno. Dos."]` (no se parte si no hace falta)

### 🚫 Validations (boundary)

- [ ] 257 chars con espacio antes del char 256 → 2 chunks, cada uno ≤256
- [ ] 300 chars con `". "` cerca del char 200 → primer chunk corta en `". "` (fin de oración)
- [ ] 400 chars con espacios pero sin puntuación → primer chunk corta en el último espacio antes de 256
- [ ] 400 chars sin espacios ni puntuación → corte duro a 256 exactos en el primer chunk

### 💥 Edge cases

- [ ] texto con `\n` como separador cerca del límite → divide en el `\n`
- [ ] texto con trailing/leading whitespace → cada chunk retornado viene trimmed
- [ ] texto de 1000 chars → N chunks, todos ≤256, concatenados vuelven a formar el contenido normalizado
- [ ] `max = 50` custom → respeta el `max` custom
- [ ] texto con `"? "` y `"! "` cerca del límite → elige el corte más cercano al final de la ventana
