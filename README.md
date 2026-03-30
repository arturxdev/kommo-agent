# kommo-agent

## Scripts

### `clear:history` — Limpiar historial de conversación

Elimina todos los mensajes de la tabla `chat_history` asociados a un contacto específico. Útil para reiniciar el contexto del agente durante pruebas o resets del CRM sin necesidad de acceder directamente a la base de datos.

**Requiere:** variable de entorno `POSTGRES_URL` configurada (archivo `.env`).

**Uso:**

```bash
npm run clear:history -- --contact_id=<ID_DEL_CONTACTO>
```

**Ejemplo:**

```bash
npm run clear:history -- --contact_id=47388380
```

**Salida esperada:**

```
🔍 Buscando historial para contact_id: 47388380
📊 Registros encontrados: 12
🗑️  Eliminando...
✅ Historial eliminado correctamente
```

Si el contacto no tiene historial:

```
🔍 Buscando historial para contact_id: 47388380
📊 Registros encontrados: 0
⚠️  No se encontró historial para contact_id: 47388380
```

**Fuente:** `src/scripts/clearHistory.ts`

---

### `ingest:docs` — Indexar documentos en Pinecone

Procesa un archivo `.txt`, lo divide en chunks, genera embeddings con `text-embedding-3-small` (512 dims) y los sube al índice Pinecone configurado. Permite que el agente consulte documentación interna via RAG.

**Requiere:** variables de entorno `OPENAI_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX` y `PINECONE_NAMESPACE` configuradas (archivo `.env`).

**Uso:**

```bash
npm run ingest:docs -- --file=./docs/<archivo>.txt
```

**Ejemplo:**

```bash
npm run ingest:docs -- --file=./docs/manual.txt
```

**Salida esperada:**

```
📄 Leyendo archivo: ./docs/manual.txt
✂️  Dividiendo en chunks...
   42 chunks generados
🔢 Generando embeddings en batches de 100...
   [42/42] OK
📤 Subiendo 42 vectores a Pinecone...
   [42/42] OK
✅ Ingestión completada: 42 vectores de "manual.txt"
```

**Notas:**
- Solo acepta archivos `.txt`.
- Los chunks tienen tamaño de 500 caracteres con overlap de 50.
- Los vectores se indexan en el namespace definido por `PINECONE_NAMESPACE` (default: `default`).

**Fuente:** `src/scripts/ingestDocs.ts`
