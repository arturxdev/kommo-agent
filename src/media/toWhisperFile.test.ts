import { describe, it, expect } from "vitest";
import { pickWhisperFile } from "./toWhisperFile";

describe("pickWhisperFile", () => {
  describe("✅ Happy path", () => {
    it("file_name='file.ogg' → audio/ogg", () => {
      // Arrange + Act
      const result = pickWhisperFile("file.ogg");

      // Assert
      expect(result).toEqual({ filename: "audio.ogg", contentType: "audio/ogg" });
    });

    it("file_name='rec.m4a' → audio/mp4", () => {
      // Arrange + Act
      const result = pickWhisperFile("rec.m4a");

      // Assert
      expect(result).toEqual({ filename: "audio.m4a", contentType: "audio/mp4" });
    });

    it("file_name='song.mp3' → audio/mpeg", () => {
      // Arrange + Act
      const result = pickWhisperFile("song.mp3");

      // Assert
      expect(result).toEqual({ filename: "audio.mp3", contentType: "audio/mpeg" });
    });

    it("file_name='audio.wav' → audio/wav", () => {
      // Arrange + Act
      const result = pickWhisperFile("audio.wav");

      // Assert
      expect(result).toEqual({ filename: "audio.wav", contentType: "audio/wav" });
    });
  });

  describe("💥 Edge cases", () => {
    it("sin file_name → fallback audio/ogg (WABA)", () => {
      // Arrange + Act
      const result = pickWhisperFile();

      // Assert
      expect(result).toEqual({ filename: "audio.ogg", contentType: "audio/ogg" });
    });

    it("file_name=undefined → fallback audio/ogg", () => {
      // Arrange + Act
      const result = pickWhisperFile(undefined);

      // Assert
      expect(result).toEqual({ filename: "audio.ogg", contentType: "audio/ogg" });
    });

    it("extensión desconocida ('x.xyz') → fallback audio/ogg", () => {
      // Arrange + Act
      const result = pickWhisperFile("x.xyz");

      // Assert
      expect(result).toEqual({ filename: "audio.ogg", contentType: "audio/ogg" });
    });

    it("file_name sin extensión → fallback audio/ogg", () => {
      // Arrange + Act
      const result = pickWhisperFile("filewithoutextension");

      // Assert
      expect(result).toEqual({ filename: "audio.ogg", contentType: "audio/ogg" });
    });

    it("extensión en mayúsculas ('file.OGG') → audio/ogg (case-insensitive)", () => {
      // Arrange + Act
      const result = pickWhisperFile("file.OGG");

      // Assert
      expect(result).toEqual({ filename: "audio.ogg", contentType: "audio/ogg" });
    });

    it("file_name con path completo ('dir/sub/rec.m4a') → audio/mp4", () => {
      // Arrange + Act
      const result = pickWhisperFile("dir/sub/rec.m4a");

      // Assert
      expect(result).toEqual({ filename: "audio.m4a", contentType: "audio/mp4" });
    });
  });
});
