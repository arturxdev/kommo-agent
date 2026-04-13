import OpenAI, { toFile } from "openai";
import { notifier } from "../notifications/index";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function processMessage(message: {
  type: string;
  text?: string;
  url?: string;
}): Promise<string> {
  await notifier.notify({ level: 'info', fn: 'media', message: `Procesando tipo: ${message.type}` });

  if (message.type === "text") {
    return message.text ?? "";
  }

  if (message.type === "audio") {
    await notifier.notify({ level: 'info', fn: 'media/audio', message: `Descargando audio desde: ${message.url}` });

    const response = await fetch(message.url!).catch(() => {
      throw new Error("[Media] No se pudo descargar el audio");
    });

    if (!response.ok) {
      throw new Error("[Media] No se pudo descargar el audio");
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    let transcription;
    try {
      transcription = await openai.audio.transcriptions.create({
        file: await toFile(buffer, "audio.m4a", { type: "audio/mp4" }),
        model: "gpt-4o-mini-transcribe",
      });
    } catch (err) {
      throw new Error(
        `[Media] Error en transcripción: ${(err as Error).message}`
      );
    }

    await notifier.notify({ level: 'info', fn: 'media/audio', message: `Transcripcion: "${transcription.text.slice(0, 60)}..."` });
    return transcription.text;
  }

  return `[Mensaje de tipo no soportado: ${message.type}]`;
}
