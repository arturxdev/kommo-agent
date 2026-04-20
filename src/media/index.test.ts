import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildTextMessage,
  buildAudioMessage,
  buildAudioFetchResponse,
} from "../../tests/factories/media.factory";

const { createTranscriptionMock, toFileMock } = vi.hoisted(() => ({
  createTranscriptionMock: vi.fn(),
  toFileMock: vi.fn(),
}));

vi.mock("openai", () => {
  class OpenAIMock {
    audio = { transcriptions: { create: createTranscriptionMock } };
  }
  return {
    default: OpenAIMock,
    toFile: toFileMock,
  };
});

import { processMessage, AUDIO_MAX_BYTES } from "./index";

describe("processMessage", () => {
  beforeEach(() => {
    createTranscriptionMock.mockReset();
    toFileMock.mockReset();
    toFileMock.mockResolvedValue({});
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("✅ Happy path", () => {
    it("type=text con text='hola' → retorna 'hola'", async () => {
      // Arrange
      const message = buildTextMessage({ text: "hola" });

      // Act
      const result = await processMessage(message);

      // Assert
      expect(result).toBe("hola");
    });

    it("type=audio con URL válida y transcripción OK → retorna transcription.text exacto", async () => {
      // Arrange
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(buildAudioFetchResponse()));
      createTranscriptionMock.mockResolvedValue({ text: "buenas tardes" });

      // Act
      const result = await processMessage(buildAudioMessage());

      // Assert
      expect(result).toBe("buenas tardes");
    });

    it("type=audio con transcripción larga → retorna el texto completo sin truncar", async () => {
      // Arrange
      const longText = "lorem ipsum ".repeat(100);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(buildAudioFetchResponse()));
      createTranscriptionMock.mockResolvedValue({ text: longText });

      // Act
      const result = await processMessage(buildAudioMessage());

      // Assert
      expect(result).toBe(longText);
    });

    it("type=audio con file_name='file.ogg' → toFile recibe audio/ogg y audio.ogg", async () => {
      // Arrange
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(buildAudioFetchResponse()));
      createTranscriptionMock.mockResolvedValue({ text: "hola" });

      // Act
      await processMessage(buildAudioMessage({ file_name: "file.ogg" }));

      // Assert
      expect(toFileMock).toHaveBeenCalledTimes(1);
      const args = toFileMock.mock.calls[0];
      expect(args[1]).toBe("audio.ogg");
      expect(args[2]).toEqual({ type: "audio/ogg" });
    });

    it("type=audio con file_name='rec.m4a' → toFile recibe audio/mp4 y audio.m4a", async () => {
      // Arrange
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(buildAudioFetchResponse()));
      createTranscriptionMock.mockResolvedValue({ text: "hola" });

      // Act
      await processMessage(buildAudioMessage({ file_name: "rec.m4a" }));

      // Assert
      const args = toFileMock.mock.calls[0];
      expect(args[1]).toBe("audio.m4a");
      expect(args[2]).toEqual({ type: "audio/mp4" });
    });

    it("type=audio sin file_name → toFile recibe fallback audio/ogg (WABA)", async () => {
      // Arrange
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(buildAudioFetchResponse()));
      createTranscriptionMock.mockResolvedValue({ text: "hola" });

      // Act
      await processMessage({ type: "audio", url: "https://x.com/a" });

      // Assert
      const args = toFileMock.mock.calls[0];
      expect(args[1]).toBe("audio.ogg");
      expect(args[2]).toEqual({ type: "audio/ogg" });
    });
  });

  describe("🚫 Validations", () => {
    it("type=text con text=undefined → retorna ''", async () => {
      // Arrange
      const message = { type: "text" as const };

      // Act
      const result = await processMessage(message);

      // Assert
      expect(result).toBe("");
    });

    it("type=text con text='' → retorna ''", async () => {
      // Arrange
      const message = buildTextMessage({ text: "" });

      // Act
      const result = await processMessage(message);

      // Assert
      expect(result).toBe("");
    });
  });

  describe("💥 Edge cases (audio)", () => {
    it("type=audio con fetch que rechaza (network error) → retorna '[audio no transcribible]'", async () => {
      // Arrange
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

      // Act
      const result = await processMessage(buildAudioMessage());

      // Assert
      expect(result).toBe("[audio no transcribible]");
    });

    it("type=audio con fetch 404 (response.ok=false) → retorna '[audio no transcribible]'", async () => {
      // Arrange
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          buildAudioFetchResponse({ ok: false, status: 404, body: "not found" }),
        ),
      );

      // Act
      const result = await processMessage(buildAudioMessage());

      // Assert
      expect(result).toBe("[audio no transcribible]");
      expect(createTranscriptionMock).not.toHaveBeenCalled();
    });

    it("type=audio con fetch OK pero OpenAI lanza 400 → retorna '[audio no transcribible]'", async () => {
      // Arrange
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(buildAudioFetchResponse()));
      createTranscriptionMock.mockRejectedValue(
        new Error("Audio file might be corrupted"),
      );

      // Act
      const result = await processMessage(buildAudioMessage());

      // Assert
      expect(result).toBe("[audio no transcribible]");
    });

    it("type=audio con fetch OK pero OpenAI lanza network error → retorna '[audio no transcribible]'", async () => {
      // Arrange
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(buildAudioFetchResponse()));
      createTranscriptionMock.mockRejectedValue(new Error("ECONNRESET"));

      // Act
      const result = await processMessage(buildAudioMessage());

      // Assert
      expect(result).toBe("[audio no transcribible]");
    });

    it("type=audio con Content-Length > 25MB → retorna sentinel sin descargar buffer", async () => {
      // Arrange
      const arrayBufferMock = vi.fn();
      const fetchMock = vi.fn().mockResolvedValue({
        ...buildAudioFetchResponse({ contentLength: AUDIO_MAX_BYTES + 1 }),
        arrayBuffer: arrayBufferMock,
      });
      vi.stubGlobal("fetch", fetchMock);

      // Act
      const result = await processMessage(buildAudioMessage());

      // Assert
      expect(result).toBe("[audio no transcribible]");
      expect(arrayBufferMock).not.toHaveBeenCalled();
      expect(createTranscriptionMock).not.toHaveBeenCalled();
    });

    it("type=audio con Content-Length ausente → descarga normal y sigue el flujo", async () => {
      // Arrange
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(buildAudioFetchResponse({ contentLength: null })),
      );
      createTranscriptionMock.mockResolvedValue({ text: "ok" });

      // Act
      const result = await processMessage(buildAudioMessage());

      // Assert
      expect(result).toBe("ok");
    });

    it("type=audio con buffer real > 25MB (header mintió) → retorna sentinel", async () => {
      // Arrange
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          buildAudioFetchResponse({
            contentLength: 100,
            byteLength: AUDIO_MAX_BYTES + 1,
          }),
        ),
      );

      // Act
      const result = await processMessage(buildAudioMessage());

      // Assert
      expect(result).toBe("[audio no transcribible]");
      expect(createTranscriptionMock).not.toHaveBeenCalled();
    });
  });

  describe("💥 Edge cases (tipo desconocido)", () => {
    it("type='sticker' → retorna '[Mensaje de tipo no soportado: sticker]'", async () => {
      // Arrange
      const message = { type: "sticker" };

      // Act
      const result = await processMessage(message);

      // Assert
      expect(result).toBe("[Mensaje de tipo no soportado: sticker]");
    });

    it("type='' (string vacío) → retorna '[Mensaje de tipo no soportado: ]'", async () => {
      // Arrange
      const message = { type: "" };

      // Act
      const result = await processMessage(message);

      // Assert
      expect(result).toBe("[Mensaje de tipo no soportado: ]");
    });
  });
});
