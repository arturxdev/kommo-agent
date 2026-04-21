import OpenAI, { toFile } from "openai";
import { notifier } from "../notifications/index";
import { pickWhisperFile } from "./toWhisperFile";
import { sniffAudio } from "./sniffAudio";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const AUDIO_MAX_BYTES = 25 * 1024 * 1024; // Whisper API limit

export async function processMessage(message: {
  type: string;
  text?: string;
  url?: string;
  file_name?: string;
}): Promise<string> {
  await notifier.notify({ level: 'info', fn: 'media', message: `Procesando tipo: ${message.type}` });

  if (message.type === "text") {
    return message.text ?? "";
  }

  if (message.type === "audio") {
    await notifier.notify({
      level: 'info',
      fn: 'media/audio',
      message: `Descargando audio`,
      extra: { url: message.url, file_name: message.file_name },
    });

    let buffer: Buffer;
    let sniff: ReturnType<typeof sniffAudio> | undefined;
    let bodyPreview: string | undefined;
    try {
      const response = await fetch(message.url!);
      const status = response.status;
      const contentType = response.headers.get("content-type") ?? "";
      const contentLengthHeader = response.headers.get("content-length");
      const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;

      if (!response.ok) {
        const body = await response.text().catch(() => "<no body>");
        await notifier.notify({
          level: 'error',
          fn: 'media/audio',
          message: `Descarga falló con status ${status}`,
          extra: {
            url: message.url,
            status,
            contentType,
            body: body.slice(0, 500),
          },
        });
        return "[audio no transcribible]";
      }

      if (contentLength !== null && contentLength > AUDIO_MAX_BYTES) {
        await notifier.notify({
          level: 'error',
          fn: 'media/audio',
          message: `Audio excede tamaño máximo (${contentLength} bytes > ${AUDIO_MAX_BYTES})`,
          extra: { url: message.url, contentLength, limit: AUDIO_MAX_BYTES },
        });
        return "[audio no transcribible]";
      }

      buffer = Buffer.from(await response.arrayBuffer());

      if (buffer.byteLength > AUDIO_MAX_BYTES) {
        await notifier.notify({
          level: 'error',
          fn: 'media/audio',
          message: `Audio descargado excede tamaño máximo (${buffer.byteLength} bytes > ${AUDIO_MAX_BYTES})`,
          extra: { url: message.url, byteLength: buffer.byteLength, limit: AUDIO_MAX_BYTES },
        });
        return "[audio no transcribible]";
      }

      sniff = sniffAudio(buffer);
      bodyPreview = sniff.isKnownAudio
        ? undefined
        : buffer.subarray(0, 200).toString('utf8');

      await notifier.notify({
        level: 'info',
        fn: 'media/audio',
        message: `Audio descargado (${buffer.byteLength} bytes, ct=${contentType}, magic=${sniff.magic}, format=${sniff.format}${sniff.isKnownAudio ? '' : ' ⚠NO-AUDIO'})`,
        extra: {
          status,
          contentType,
          byteLength: buffer.byteLength,
          magic: sniff.magic,
          format: sniff.format,
          isKnownAudio: sniff.isKnownAudio,
          bodyPreview,
        },
      });
    } catch (err) {
      await notifier.notify({
        level: 'error',
        fn: 'media/audio',
        message: `No se pudo descargar el audio: ${err instanceof Error ? err.message : String(err)}`,
        error: err,
        extra: { url: message.url },
      });
      return "[audio no transcribible]";
    }

    const hint = pickWhisperFile(message.file_name);
    let transcription;
    try {
      transcription = await openai.audio.transcriptions.create({
        file: await toFile(buffer, hint.filename, { type: hint.contentType }),
        model: "gpt-4o-mini-transcribe",
      });
    } catch (err) {
      await notifier.notify({
        level: 'error',
        fn: 'media/audio',
        message: `Error en transcripción: ${(err as Error).message}`,
        error: err,
        extra: {
          url: message.url,
          file_name: message.file_name,
          whisperFilename: hint.filename,
          whisperContentType: hint.contentType,
          byteLength: buffer.byteLength,
          magic: sniff?.magic,
          format: sniff?.format,
          isKnownAudio: sniff?.isKnownAudio,
          bodyPreview,
        },
      });
      return "[audio no transcribible]";
    }

    await notifier.notify({
      level: 'info',
      fn: 'media/audio',
      message: `Transcripcion: "${transcription.text.slice(0, 60)}..."`,
      extra: { length: transcription.text.length },
    });
    return transcription.text;
  }

  return `[Mensaje de tipo no soportado: ${message.type}]`;
}
