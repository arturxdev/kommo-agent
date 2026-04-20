# processMessage

## Signature

```ts
processMessage(message: {
  type: string;
  text?: string;
  url?: string;
  file_name?: string;
}): Promise<string>
```

## Comportamiento

### Text
- `type === "text"` → retorna `message.text` o `""` si no hay text.

### Audio
- `type === "audio"` → descarga desde `message.url`, transcribe con OpenAI Whisper y retorna el texto.
- **Formato de archivo**: se deriva de `message.file_name` (ej: `file.ogg` → `audio/ogg`). Si no hay `file_name` o la extensión es desconocida, se usa fallback `audio/ogg` (WABA típicamente entrega OGG/Opus).
- **Límite de tamaño**: `AUDIO_MAX_BYTES = 25 MB` (límite de Whisper). Si `Content-Length` del response excede el límite, se retorna sentinel sin descargar el buffer. Si el buffer real excede el límite (header mintió), también se retorna sentinel.
- Si la descarga falla (throw en fetch o `response.ok === false`) → retorna `"[audio no transcribible]"` y loggea error con `level: "error"`, `fn: "media/audio"`, `extra: { url, status?, contentType?, body? }`.
- Si la transcripción falla (throw en OpenAI) → retorna `"[audio no transcribible]"` y loggea error con `level: "error"`, `fn: "media/audio"`, `extra: { url, file_name, whisperFilename, whisperContentType }`.

### Otros tipos
- Cualquier otro `type` → retorna `"[Mensaje de tipo no soportado: {type}]"`.

## Tests

### ✅ Happy path

- [ ] type=text con text="hola" → retorna "hola"
- [ ] type=audio con URL válida y transcripción OK → retorna `transcription.text` exacto
- [ ] type=audio con transcripción larga → retorna el texto completo sin truncar
- [ ] type=audio con file_name="file.ogg" → `toFile` recibe `audio.ogg` y mime `audio/ogg`
- [ ] type=audio con file_name="rec.m4a" → `toFile` recibe `audio.m4a` y mime `audio/mp4`
- [ ] type=audio sin file_name → `toFile` recibe fallback `audio.ogg` y `audio/ogg`

### 🚫 Validations

- [ ] type=text con text=undefined → retorna ""
- [ ] type=text con text="" → retorna ""

### 💥 Edge cases (audio)

- [ ] type=audio con fetch que rechaza (network error) → retorna "[audio no transcribible]"
- [ ] type=audio con fetch 404 (response.ok=false) → retorna "[audio no transcribible]"
- [ ] type=audio con fetch OK pero OpenAI lanza 400 → retorna "[audio no transcribible]"
- [ ] type=audio con fetch OK pero OpenAI lanza network error → retorna "[audio no transcribible]"
- [ ] type=audio con Content-Length > 25MB → retorna sentinel sin descargar el buffer (arrayBuffer nunca se llama)
- [ ] type=audio con Content-Length ausente → descarga normal y continúa
- [ ] type=audio con buffer real > 25MB (header mintió) → retorna sentinel

### 💥 Edge cases (tipo desconocido)

- [ ] type="sticker" → retorna "[Mensaje de tipo no soportado: sticker]"
- [ ] type="" (string vacío) → retorna "[Mensaje de tipo no soportado: ]"
