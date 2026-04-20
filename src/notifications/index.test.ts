import { describe, it, expect, vi, beforeEach } from "vitest";
import { runWithRequestContext } from "../observability/context";
import type { Notification, NotificationChannel } from "./index";

// Bypass del mock global definido en vitest.setup.ts para este archivo
const realModule = await vi.importActual<typeof import("./index")>("./index");
const notifier = realModule.notifier;

class CaptureChannel implements NotificationChannel {
  public received: Notification[] = [];
  async send(n: Notification): Promise<void> {
    this.received.push(n);
  }
}

describe("notifier (enriquecimiento desde RequestContext)", () => {
  let channel: CaptureChannel;

  beforeEach(() => {
    // Resetear canales del singleton entre tests
    (notifier as unknown as { channels: NotificationChannel[] }).channels = [];
    channel = new CaptureChannel();
    notifier.addChannel(channel);
  });

  describe("✅ Happy path", () => {
    it("sin contexto → el canal recibe la notificación sin requestId", async () => {
      // Arrange + Act
      await notifier.notify({ level: "info", fn: "test", message: "hola" });

      // Assert
      expect(channel.received).toHaveLength(1);
      expect(channel.received[0].requestId).toBeUndefined();
      expect(channel.received[0].entityId).toBeUndefined();
    });

    it("con contexto y sin requestId explícito → hereda el requestId del contexto", async () => {
      // Arrange + Act
      await runWithRequestContext(
        { requestId: "abc123", entityId: "ent-42", startedAt: Date.now() },
        async () => {
          await notifier.notify({ level: "info", fn: "test", message: "hola" });
        },
      );

      // Assert
      expect(channel.received[0].requestId).toBe("abc123");
      expect(channel.received[0].entityId).toBe("ent-42");
    });
  });

  describe("🚫 Precedencia", () => {
    it("requestId explícito → NO se pisa con el del contexto", async () => {
      // Arrange + Act
      await runWithRequestContext(
        { requestId: "ctx-id", startedAt: Date.now() },
        async () => {
          await notifier.notify({
            level: "info",
            fn: "test",
            message: "x",
            requestId: "explicit-id",
          });
        },
      );

      // Assert
      expect(channel.received[0].requestId).toBe("explicit-id");
    });

    it("entityId explícito → NO se pisa con el del contexto", async () => {
      // Arrange + Act
      await runWithRequestContext(
        { requestId: "r", entityId: "ctx-ent", startedAt: Date.now() },
        async () => {
          await notifier.notify({
            level: "info",
            fn: "test",
            message: "x",
            entityId: "explicit-ent",
          });
        },
      );

      // Assert
      expect(channel.received[0].entityId).toBe("explicit-ent");
    });
  });

  describe("💥 Edge cases", () => {
    it("con contexto → el canal recibe extra.elapsed_ms calculado desde startedAt", async () => {
      // Arrange
      const startedAt = Date.now() - 100;

      // Act
      await runWithRequestContext({ requestId: "r", startedAt }, async () => {
        await notifier.notify({ level: "info", fn: "test", message: "x" });
      });

      // Assert
      const extra = channel.received[0].extra as { elapsed_ms?: number };
      expect(typeof extra.elapsed_ms).toBe("number");
      expect(extra.elapsed_ms).toBeGreaterThanOrEqual(100);
    });

    it("sin contexto → extra NO tiene elapsed_ms pero conserva los campos originales", async () => {
      // Arrange + Act
      await notifier.notify({
        level: "info",
        fn: "test",
        message: "x",
        extra: { userKey: "value" },
      });

      // Assert
      const extra = channel.received[0].extra as {
        elapsed_ms?: number;
        userKey?: string;
      };
      expect(extra.elapsed_ms).toBeUndefined();
      expect(extra.userKey).toBe("value");
    });

    it("contexto con entityId pero sin requestId explícito y sin requestId en ctx → requestId queda undefined", async () => {
      // Arrange + Act
      await runWithRequestContext(
        { requestId: "", entityId: "e", startedAt: Date.now() },
        async () => {
          await notifier.notify({ level: "info", fn: "test", message: "x" });
        },
      );

      // Assert: requestId del ctx es string vacío; el enriquecimiento usa `??` (nullish), así que el "" prevalece.
      expect(channel.received[0].requestId).toBe("");
      expect(channel.received[0].entityId).toBe("e");
    });
  });
});
