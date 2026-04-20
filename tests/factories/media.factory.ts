export function buildTextMessage(overrides: Partial<{ text: string }> = {}) {
  return { type: "text" as const, text: "mensaje de prueba", ...overrides };
}

export function buildAudioMessage(
  overrides: Partial<{ url: string; file_name: string }> = {},
) {
  return {
    type: "audio" as const,
    url: "https://example.com/audio.ogg",
    file_name: "audio.ogg",
    ...overrides,
  };
}

/** Construye una respuesta de fetch para descargar audio con headers. */
export function buildAudioFetchResponse(opts: {
  ok?: boolean;
  status?: number;
  contentType?: string;
  contentLength?: number | null;
  byteLength?: number;
  body?: string;
} = {}) {
  const {
    ok = true,
    status = 200,
    contentType = "audio/ogg",
    contentLength = 1024,
    byteLength = 1024,
    body = "",
  } = opts;
  return {
    ok,
    status,
    headers: {
      get(name: string) {
        const normalized = name.toLowerCase();
        if (normalized === "content-type") return contentType;
        if (normalized === "content-length") return contentLength === null ? null : String(contentLength);
        return null;
      },
    },
    arrayBuffer: async () => new ArrayBuffer(byteLength),
    text: async () => body,
  } as unknown as Response;
}
