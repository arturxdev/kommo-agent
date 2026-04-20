import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
  entityId?: string;
  startedAt: number;
}

const store = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return store.getStore();
}

export function runWithRequestContext<T>(
  ctx: RequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return store.run(ctx, fn);
}
