import { describe, it, expect } from "vitest";
import { getRequestContext, runWithRequestContext } from "./context";

describe("observability/context", () => {
  describe("✅ Happy path", () => {
    it("fuera de un run → getRequestContext() retorna undefined", () => {
      // Arrange + Act
      const result = getRequestContext();

      // Assert
      expect(result).toBeUndefined();
    });

    it("dentro de runWithRequestContext → el ctx es visible", async () => {
      // Arrange
      const ctx = { requestId: "req-1", entityId: "ent-1", startedAt: Date.now() };

      // Act
      const got = await runWithRequestContext(ctx, async () => getRequestContext());

      // Assert
      expect(got).toEqual(ctx);
    });
  });

  describe("💥 Edge cases", () => {
    it("contexto sobrevive a await encadenados", async () => {
      // Arrange
      const ctx = { requestId: "req-2", startedAt: Date.now() };

      // Act
      const got = await runWithRequestContext(ctx, async () => {
        await Promise.resolve();
        await new Promise((r) => setImmediate(r));
        return getRequestContext()?.requestId;
      });

      // Assert
      expect(got).toBe("req-2");
    });

    it("contexto sobrevive a setTimeout", async () => {
      // Arrange
      const ctx = { requestId: "req-3", startedAt: Date.now() };

      // Act
      const got = await runWithRequestContext(ctx, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getRequestContext()?.requestId;
      });

      // Assert
      expect(got).toBe("req-3");
    });

    it("dos runs concurrentes NO se mezclan", async () => {
      // Arrange
      const ctxA = { requestId: "A", startedAt: Date.now() };
      const ctxB = { requestId: "B", startedAt: Date.now() };

      // Act
      const [a, b] = await Promise.all([
        runWithRequestContext(ctxA, async () => {
          await new Promise((r) => setTimeout(r, 10));
          return getRequestContext()?.requestId;
        }),
        runWithRequestContext(ctxB, async () => {
          await new Promise((r) => setTimeout(r, 5));
          return getRequestContext()?.requestId;
        }),
      ]);

      // Assert
      expect(a).toBe("A");
      expect(b).toBe("B");
    });

    it("después de salir del run → getRequestContext() vuelve a undefined", async () => {
      // Arrange
      const ctx = { requestId: "inner", startedAt: Date.now() };

      // Act
      await runWithRequestContext(ctx, async () => {
        getRequestContext();
      });
      const after = getRequestContext();

      // Assert
      expect(after).toBeUndefined();
    });
  });
});
