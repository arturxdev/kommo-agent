export type AudioFormat =
  | "ogg"
  | "wav"
  | "mp3"
  | "mp4"
  | "flac"
  | "webm"
  | "unknown";

export interface AudioSniffResult {
  magic: string;
  format: AudioFormat;
  isKnownAudio: boolean;
}

export function sniffAudio(buffer: Buffer): AudioSniffResult {
  const magic = buffer.subarray(0, 4).toString("hex");
  const format = detectFormat(buffer);
  return { magic, format, isKnownAudio: format !== "unknown" };
}

function detectFormat(buffer: Buffer): AudioFormat {
  if (buffer.length < 4) return "unknown";

  const b0 = buffer[0];
  const b1 = buffer[1];
  const b2 = buffer[2];
  const b3 = buffer[3];

  if (b0 === 0x4f && b1 === 0x67 && b2 === 0x67 && b3 === 0x53) return "ogg";
  if (b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46) return "wav";
  if (b0 === 0x66 && b1 === 0x4c && b2 === 0x61 && b3 === 0x43) return "flac";
  if (b0 === 0x1a && b1 === 0x45 && b2 === 0xdf && b3 === 0xa3) return "webm";
  if (b0 === 0x49 && b1 === 0x44 && b2 === 0x33) return "mp3";
  if (b0 === 0xff && (b1 === 0xfb || b1 === 0xf3 || b1 === 0xf2)) return "mp3";

  if (
    buffer.length >= 8 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    return "mp4";
  }

  return "unknown";
}
