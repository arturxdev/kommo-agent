import { vi } from "vitest";

vi.mock("./src/notifications/index", () => ({
  notifier: {
    notify: vi.fn().mockResolvedValue(undefined),
    addChannel: vi.fn(),
  },
}));

process.env.KOMMO_SUBDOMAIN = "testsub";
process.env.KOMMO_TOKEN = "test-token";
process.env.RESPUESTA_FIELD_ID = "999";
process.env.TEXT_BOT_ID = "888";
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.DELAY_BETWEEN_MESSAGES = "0";
