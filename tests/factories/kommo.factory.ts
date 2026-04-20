import { vi } from "vitest";

export function buildFetchOk(body: unknown = {}): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as Response;
}

export function buildFetchError(status: number, message = "error"): Response {
  return {
    ok: false,
    status,
    text: async () => message,
    json: async () => ({ error: message }),
  } as Response;
}

export function buildFetchMockWithFailures(
  failedCalls: number[] = [],
): ReturnType<typeof vi.fn> {
  let callIndex = 0;
  return vi.fn().mockImplementation(async () => {
    const idx = callIndex++;
    if (failedCalls.includes(idx)) return buildFetchError(400, "Kommo rejected");
    return buildFetchOk({});
  });
}

export function buildTextOfLength(n: number): string {
  const word = "palabra ";
  let out = "";
  while (out.length + word.length <= n) out += word;
  if (out.length < n) out += "x".repeat(n - out.length);
  return out.slice(0, n);
}
