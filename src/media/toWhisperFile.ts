import type { AudioFormat } from "./sniffAudio";

export interface WhisperFileHint {
  filename: string;
  contentType: string;
}

const EXT_MAP: Record<string, WhisperFileHint> = {
  ogg: { filename: "audio.ogg", contentType: "audio/ogg" },
  oga: { filename: "audio.oga", contentType: "audio/ogg" },
  opus: { filename: "audio.ogg", contentType: "audio/ogg" },
  m4a: { filename: "audio.m4a", contentType: "audio/mp4" },
  mp4: { filename: "audio.mp4", contentType: "audio/mp4" },
  mp3: { filename: "audio.mp3", contentType: "audio/mpeg" },
  mpga: { filename: "audio.mp3", contentType: "audio/mpeg" },
  wav: { filename: "audio.wav", contentType: "audio/wav" },
  webm: { filename: "audio.webm", contentType: "audio/webm" },
  flac: { filename: "audio.flac", contentType: "audio/flac" },
};

const FORMAT_MAP: Record<Exclude<AudioFormat, "unknown">, WhisperFileHint> = {
  ogg: EXT_MAP.ogg,
  mp4: EXT_MAP.mp4,
  mp3: EXT_MAP.mp3,
  wav: EXT_MAP.wav,
  webm: EXT_MAP.webm,
  flac: EXT_MAP.flac,
};

/**
 * Deriva filename + mime a partir del formato detectado por magic bytes.
 * Es la fuente de verdad: Kommo a veces manda file_name: "file.ogg" aunque
 * el archivo real sea MP4/M4A (audios de iOS). Confiar en el magic evita
 * que Whisper rechace por extension mentida.
 */
export function pickWhisperFileFromFormat(format: AudioFormat): WhisperFileHint | undefined {
  if (format === "unknown") return undefined;
  return FORMAT_MAP[format];
}

/**
 * Deriva filename + mime type adecuados para enviar a OpenAI Whisper
 * a partir del file_name que viene en el webhook de Kommo.
 *
 * Whisper detecta el formato principalmente por extensión del filename.
 * Si le pasamos un .m4a para un archivo OGG, puede fallar con
 * "Audio file might be corrupted".
 *
 * Fallback: audio/ogg (la mayoría de audios de WABA/WhatsApp son OGG/Opus).
 */
export function pickWhisperFile(fileName?: string): WhisperFileHint {
  if (!fileName) return EXT_MAP.ogg;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MAP[ext] ?? EXT_MAP.ogg;
}
