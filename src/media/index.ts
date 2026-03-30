import OpenAI, { toFile } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function processMessage(message: {
  type: string;
  text?: string;
  url?: string;
}): Promise<string> {
  console.log(`[Media] Procesando tipo: ${message.type}`);

  if (message.type === "text") {
    return message.text ?? "";
  }

  if (message.type === "audio") {
    console.log(`[Media] Descargando audio desde: ${message.url}`);

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
        file: await toFile(buffer, "audio.ogg", { type: "audio/ogg" }),
        model: "whisper-1",
      });
    } catch (err) {
      throw new Error(
        `[Media] Error en transcripción: ${(err as Error).message}`
      );
    }

    console.log(`[Media] Transcripción: "${transcription.text.slice(0, 60)}..."`);
    return transcription.text;
  }

  return `[Mensaje de tipo no soportado: ${message.type}]`;
}
