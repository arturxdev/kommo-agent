# RequestContext (AsyncLocalStorage)

## Problema
El `requestId` se generaba en el handler del webhook pero se perdía cuando el pipeline invocaba funciones que no lo aceptaban como parámetro (`enqueueMessage`, `waitAndDrain`, `processMessage`, `sendMessages`, tools del agente, Postgres, Pinecone). Imposible correlacionar logs de una misma request.

## Solución
Un `AsyncLocalStorage` global con un `RequestContext` que el handler del webhook inicializa y que `notifier.notify` lee automáticamente para enriquecer cada notificación.

## Signature

```ts
// src/observability/context.ts
export interface RequestContext {
  requestId: string;
  entityId?: string;
  startedAt: number;  // Date.now() al entrar al handler
}

export function getRequestContext(): RequestContext | undefined;
export function runWithRequestContext<T>(
  ctx: RequestContext,
  fn: () => Promise<T>,
): Promise<T>;
```

## Uso

### En el handler del webhook (`src/index.ts`)
```ts
await runWithRequestContext(
  { requestId, entityId, startedAt: Date.now() },
  async () => {
    /* todo el pipeline aquí */
  },
);
```

### En `notifier.notify`
Auto-enriquece cada notificación con `requestId`, `entityId` y `extra.elapsed_ms`, **sin pisar** valores explícitos del caller.

## Reglas

- **Precedencia**: el valor explícito en `notify({ requestId: "x" })` SIEMPRE gana sobre el contexto.
- **Nullish coalescing** (`??`): solo se rellenan campos `undefined`. Un string vacío NO se reemplaza.
- **elapsed_ms**: se agrega a `extra` solo si hay contexto; nunca pisa un `extra.elapsed_ms` ya presente… en la implementación actual, el spread `{ ...extra, elapsed_ms }` lo sobreescribe. Esto es intencional: el contexto manda para métricas.

## Tests

### ✅ Happy path
- [ ] `getRequestContext()` fuera de un run → undefined
- [ ] Dentro de `runWithRequestContext` → el ctx es visible
- [ ] El contexto sobrevive a `await` encadenados
- [ ] El contexto sobrevive a `setTimeout`
- [ ] Después de salir del run → vuelve a undefined

### 🚫 Aislamiento
- [ ] Dos `runWithRequestContext` concurrentes NO se mezclan (cada uno ve el suyo)

### ✅ Enriquecimiento (notifier)
- [ ] sin contexto → canal recibe sin requestId
- [ ] con contexto y sin requestId explícito → hereda del contexto
- [ ] con contexto → canal recibe `extra.elapsed_ms` calculado

### 🚫 Precedencia (notifier)
- [ ] requestId explícito → NO se pisa con el del contexto
- [ ] entityId explícito → NO se pisa con el del contexto

### 💥 Edge cases
- [ ] sin contexto → extra conserva campos originales, SIN elapsed_ms
- [ ] contexto con requestId="" (vacío) → no se reemplaza (el nullish `??` solo cubre null/undefined)
