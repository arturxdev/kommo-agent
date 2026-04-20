import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  splitForKommo,
  sendMessages,
  KOMMO_MESSAGE_MAX_CHARS,
} from "./index";
import {
  buildFetchOk,
  buildFetchMockWithFailures,
  buildTextOfLength,
} from "../../tests/factories/kommo.factory";

describe("splitForKommo", () => {
  describe("✅ Happy path", () => {
    it("empty string → array vacío", () => {
      // Arrange
      const input = "";

      // Act
      const result = splitForKommo(input);

      // Assert
      expect(result).toEqual([]);
    });

    it("solo whitespace → array vacío", () => {
      // Arrange
      const input = "   \n\t  ";

      // Act
      const result = splitForKommo(input);

      // Assert
      expect(result).toEqual([]);
    });

    it("texto corto ('hola') → ['hola']", () => {
      // Arrange
      const input = "hola";

      // Act
      const result = splitForKommo(input);

      // Assert
      expect(result).toEqual(["hola"]);
    });

    it("exactamente 256 chars → un solo chunk con esos 256 chars", () => {
      // Arrange
      const input = "a".repeat(KOMMO_MESSAGE_MAX_CHARS);

      // Act
      const result = splitForKommo(input);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(input);
      expect(result[0].length).toBe(KOMMO_MESSAGE_MAX_CHARS);
    });

    it("texto con 2 oraciones (<256) → un solo chunk (no se parte si no hace falta)", () => {
      // Arrange
      const input = "Uno. Dos.";

      // Act
      const result = splitForKommo(input);

      // Assert
      expect(result).toEqual(["Uno. Dos."]);
    });
  });

  describe("🚫 Validations (boundary)", () => {
    it("257 chars con espacio antes del char 256 → 2 chunks cada uno ≤256", () => {
      // Arrange
      const head = "a".repeat(250);
      const tail = "b".repeat(6);
      const input = `${head} ${tail}`; // 250 + 1 + 6 = 257 chars

      // Act
      const result = splitForKommo(input);

      // Assert
      expect(result).toHaveLength(2);
      for (const chunk of result) {
        expect(chunk.length).toBeLessThanOrEqual(KOMMO_MESSAGE_MAX_CHARS);
      }
    });

    it("300 chars con '. ' cerca del char 200 → primer chunk corta en '. '", () => {
      // Arrange
      const firstSentence = "a".repeat(200); // 200 chars
      const secondPart = "b".repeat(98); // llenamos hasta 300 total
      const input = `${firstSentence}. ${secondPart}`;

      // Act
      const result = splitForKommo(input);

      // Assert
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0].endsWith(".")).toBe(true);
      expect(result[0].length).toBeLessThanOrEqual(KOMMO_MESSAGE_MAX_CHARS);
    });

    it("400 chars con espacios pero sin puntuación → corta en último espacio antes de 256", () => {
      // Arrange
      const input = buildTextOfLength(400);

      // Act
      const result = splitForKommo(input);

      // Assert
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0].length).toBeLessThanOrEqual(KOMMO_MESSAGE_MAX_CHARS);
      expect(result[0].endsWith(" ")).toBe(false);
    });

    it("400 chars sin espacios ni puntuación → corte duro a 256 en el primer chunk", () => {
      // Arrange
      const input = "a".repeat(400);

      // Act
      const result = splitForKommo(input);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].length).toBe(KOMMO_MESSAGE_MAX_CHARS);
      expect(result[1].length).toBe(400 - KOMMO_MESSAGE_MAX_CHARS);
    });
  });

  describe("💥 Edge cases", () => {
    it("texto con '\\n' cerca del límite → divide en el '\\n'", () => {
      // Arrange
      const head = "a".repeat(200);
      const tail = "b".repeat(100);
      const input = `${head}\n${tail}`;

      // Act
      const result = splitForKommo(input);

      // Assert
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0]).toBe(head);
    });

    it("texto con trailing/leading whitespace → cada chunk viene trimmed", () => {
      // Arrange
      const input = `   hola   mundo   `;

      // Act
      const result = splitForKommo(input);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("hola   mundo");
    });

    it("texto de 1000 chars → todos los chunks ≤256 y concatenados forman el contenido", () => {
      // Arrange
      const input = buildTextOfLength(1000);

      // Act
      const result = splitForKommo(input);

      // Assert
      expect(result.length).toBeGreaterThan(3);
      for (const chunk of result) {
        expect(chunk.length).toBeLessThanOrEqual(KOMMO_MESSAGE_MAX_CHARS);
      }
      const normalized = input.trim().replace(/\s+/g, " ");
      const rejoined = result.join(" ").replace(/\s+/g, " ");
      expect(rejoined).toBe(normalized);
    });

    it("max=50 custom → respeta el max custom", () => {
      // Arrange
      const input = "a".repeat(120);

      // Act
      const result = splitForKommo(input, 50);

      // Assert
      expect(result).toHaveLength(3);
      expect(result[0].length).toBe(50);
      expect(result[1].length).toBe(50);
      expect(result[2].length).toBe(20);
    });

    it("texto con '? ' y '! ' cerca del límite → elige el corte más cercano al final", () => {
      // Arrange
      const pre = "a".repeat(100);
      const mid = "b".repeat(100);
      const tail = "c".repeat(100);
      const input = `${pre}! ${mid}? ${tail}`;

      // Act
      const result = splitForKommo(input);

      // Assert
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0].endsWith("?")).toBe(true);
    });
  });
});

describe("sendMessages", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(buildFetchOk({}));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("✅ Happy path", () => {
    it("1 mensaje corto → retorna 1, fetch llamado 2 veces en orden setField→salesbot", async () => {
      // Arrange
      const entityId = "ent-1";

      // Act
      const sent = await sendMessages(entityId, ["hola"]);

      // Assert
      expect(sent).toBe(1);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[0][0]).toContain(`/v4/leads/${entityId}`);
      expect(fetchSpy.mock.calls[1][0]).toContain("/v2/salesbot/run");
    });

    it("1 mensaje de exactamente 256 chars → retorna 1, fetch llamado 2 veces", async () => {
      // Arrange
      const input = "a".repeat(KOMMO_MESSAGE_MAX_CHARS);

      // Act
      const sent = await sendMessages("ent-1", [input]);

      // Assert
      expect(sent).toBe(1);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("2 mensajes cortos → retorna 2, fetch llamado 4 veces", async () => {
      // Act
      const sent = await sendMessages("ent-1", ["hola", "mundo"]);

      // Assert
      expect(sent).toBe(2);
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it("1 mensaje de 500 chars → retorna 2 (2 chunks), fetch llamado 4 veces", async () => {
      // Arrange
      const input = "a".repeat(500);

      // Act
      const sent = await sendMessages("ent-1", [input]);

      // Assert
      expect(sent).toBe(2);
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });
  });

  describe("🚫 Validations", () => {
    it("array vacío → retorna 0 sin llamar fetch", async () => {
      // Act
      const sent = await sendMessages("ent-1", []);

      // Assert
      expect(sent).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("array con string vacío → retorna 0 sin llamar fetch", async () => {
      // Act
      const sent = await sendMessages("ent-1", [""]);

      // Assert
      expect(sent).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("💥 Edge cases", () => {
    it("3 chunks, 400 en setResponseField del chunk 2 → retorna 2 (chunks 1 y 3 OK)", async () => {
      // Arrange
      const input = "a".repeat(700); // fuerza 3 chunks (256 + 256 + 188)
      fetchSpy = buildFetchMockWithFailures([2]); // call #2 = setField del chunk 2
      vi.stubGlobal("fetch", fetchSpy);

      // Act
      const sent = await sendMessages("ent-1", [input]);

      // Assert
      expect(sent).toBe(2);
      expect(fetchSpy).toHaveBeenCalledTimes(5); // 2 + 1 (falla) + 2 = 5
    });

    it("3 chunks, 400 en launchSalesbot del chunk 2 → retorna 2 (chunk 2 NO se cuenta)", async () => {
      // Arrange
      const input = "a".repeat(700);
      fetchSpy = buildFetchMockWithFailures([3]); // call #3 = salesbot del chunk 2
      vi.stubGlobal("fetch", fetchSpy);

      // Act
      const sent = await sendMessages("ent-1", [input]);

      // Assert
      expect(sent).toBe(2);
      expect(fetchSpy).toHaveBeenCalledTimes(6);
    });

    it("todos los chunks fallan → retorna 0", async () => {
      // Arrange
      const input = "a".repeat(700);
      fetchSpy = buildFetchMockWithFailures([0, 2, 4]); // cada setField falla
      vi.stubGlobal("fetch", fetchSpy);

      // Act
      const sent = await sendMessages("ent-1", [input]);

      // Assert
      expect(sent).toBe(0);
    });

    it("chunk 1 OK, chunk 2 falla, chunk 3 OK → fetch del chunk 3 se ejecuta", async () => {
      // Arrange
      const input = "a".repeat(700);
      fetchSpy = buildFetchMockWithFailures([2]);
      vi.stubGlobal("fetch", fetchSpy);

      // Act
      await sendMessages("ent-1", [input]);

      // Assert
      const urls = fetchSpy.mock.calls.map((c) => c[0] as string);
      const setFieldCalls = urls.filter((u) => u.includes("/v4/leads/")).length;
      const salesbotCalls = urls.filter((u) => u.includes("/v2/salesbot/")).length;
      expect(setFieldCalls).toBe(3);
      expect(salesbotCalls).toBe(2);
    });
  });
});
