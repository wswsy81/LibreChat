import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import WebSocket, { type RawData } from 'ws';

export const VOLCENGINE_STT_DEFAULT_URL =
  'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream';
export const VOLCENGINE_STT_DEFAULT_RESOURCE_ID = 'volc.seedasr.sauc.duration';

const DEFAULT_SEGMENT_DURATION_MS = 200;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_SAMPLE_RATE = 16_000;
const MAX_KEYTERMS = 20;
const MAX_KEYTERM_LENGTH = 40;
const MAX_TRANSCODED_AUDIO_BYTES = 64 * 1024 * 1024;

const MessageType = {
  CLIENT_FULL_REQUEST: 0b0001,
  CLIENT_AUDIO_ONLY_REQUEST: 0b0010,
  SERVER_FULL_RESPONSE: 0b1001,
  SERVER_ERROR_RESPONSE: 0b1111,
} as const;

const MessageFlags = {
  POS_SEQUENCE: 0b0001,
  NEG_WITH_SEQUENCE: 0b0011,
} as const;

interface VolcengineUtterance {
  text?: string;
}

export interface VolcengineResponsePayload {
  message?: string;
  error?: string;
  text?: string;
  result?: {
    text?: string;
    utterances?: VolcengineUtterance[];
  };
}

export interface VolcengineResponse {
  code: number;
  isLast: boolean;
  sequence: number;
  payload: VolcengineResponsePayload | null;
}

export interface VolcengineTranscriptionOptions {
  audioBuffer: Buffer;
  apiKey: string;
  url?: string;
  resourceId?: string;
  model?: string;
  segmentDurationMs?: number;
  timeoutMs?: number;
  keyterms?: string[];
  ffmpegPath?: string;
}

export function normalizeVolcengineKeyterms(
  keyterms?: readonly (string | null | undefined)[],
): string[] {
  if (!keyterms) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of keyterms) {
    if (typeof value !== 'string') {
      continue;
    }
    const term = value.trim();
    if (!term || term.length > MAX_KEYTERM_LENGTH || seen.has(term)) {
      continue;
    }
    seen.add(term);
    normalized.push(term);
    if (normalized.length >= MAX_KEYTERMS) {
      break;
    }
  }
  return normalized;
}

export function buildVolcengineCorpusContext(
  keyterms?: readonly (string | null | undefined)[],
): string | undefined {
  const normalized = normalizeVolcengineKeyterms(keyterms);
  if (normalized.length === 0) {
    return undefined;
  }
  return JSON.stringify({
    hotwords: normalized.map((word) => ({ word })),
  });
}

export function isPcm16Mono16kWav(wav: Buffer): boolean {
  if (wav.length < 44) {
    return false;
  }
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    return false;
  }
  return (
    wav.readUInt16LE(20) === 1 &&
    wav.readUInt16LE(22) === 1 &&
    wav.readUInt32LE(24) === DEFAULT_SAMPLE_RATE &&
    wav.readUInt16LE(34) === 16
  );
}

export function normalizeAudioToVolcengineWav(
  audioBuffer: Buffer,
  options: { ffmpegPath?: string; timeoutMs?: number } = {},
): Promise<Buffer> {
  if (audioBuffer.length === 0) {
    return Promise.reject(new Error('Audio buffer is empty'));
  }
  if (isPcm16Mono16kWav(audioBuffer)) {
    return Promise.resolve(audioBuffer);
  }

  const ffmpegPath = options.ffmpegPath || process.env.FFMPEG_PATH || 'ffmpeg';
  const timeoutMs = options.timeoutMs || 15_000;

  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-acodec',
        'pcm_s16le',
        '-ac',
        '1',
        '-ar',
        String(DEFAULT_SAMPLE_RATE),
        '-f',
        'wav',
        'pipe:1',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;

    const finish = (error: Error | null, value?: Buffer): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (error) {
        reject(error);
        return;
      }
      if (!value) {
        reject(new Error('Audio conversion completed without output'));
        return;
      }
      resolve(value);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error(`Audio conversion timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('error', (error) => {
      finish(new Error(`Unable to start ffmpeg: ${error.message}`));
    });
    child.stdout.on('data', (chunk: Buffer) => {
      if (settled) {
        return;
      }
      outputBytes += chunk.length;
      if (outputBytes > MAX_TRANSCODED_AUDIO_BYTES) {
        child.kill('SIGKILL');
        finish(new Error('Converted audio exceeds the 64MB safety limit'));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('close', (code) => {
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString('utf8').trim();
        finish(new Error(`ffmpeg conversion failed${detail ? `: ${detail}` : ''}`));
        return;
      }
      const wav = Buffer.concat(stdout);
      if (!isPcm16Mono16kWav(wav)) {
        finish(new Error('ffmpeg did not produce a 16kHz mono PCM WAV file'));
        return;
      }
      finish(null, wav);
    });

    child.stdin.on('error', (error) => {
      finish(new Error(`Unable to send audio to ffmpeg: ${error.message}`));
    });
    child.stdin.end(audioBuffer);
  });
}

function buildHeader(
  messageType: number,
  flags: number,
  serialization = 0b0001,
  compression = 0b0001,
): Buffer {
  return Buffer.from([
    (0b0001 << 4) | 0b0001,
    (messageType << 4) | flags,
    (serialization << 4) | compression,
    0x00,
  ]);
}

export function buildVolcengineFullRequest(sequence: number, payload: object): Buffer {
  const compressed = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  const frame = Buffer.allocUnsafe(12 + compressed.length);
  buildHeader(MessageType.CLIENT_FULL_REQUEST, MessageFlags.POS_SEQUENCE).copy(frame, 0);
  frame.writeInt32BE(sequence, 4);
  frame.writeUInt32BE(compressed.length, 8);
  compressed.copy(frame, 12);
  return frame;
}

export function buildVolcengineAudioRequest(
  sequence: number,
  audio: Buffer,
  isLast: boolean,
): Buffer {
  const flags = isLast ? MessageFlags.NEG_WITH_SEQUENCE : MessageFlags.POS_SEQUENCE;
  const wireSequence = isLast ? -Math.abs(sequence) : sequence;
  const compressed = gzipSync(audio);
  const frame = Buffer.allocUnsafe(12 + compressed.length);
  buildHeader(MessageType.CLIENT_AUDIO_ONLY_REQUEST, flags, 0b0000, 0b0001).copy(frame, 0);
  frame.writeInt32BE(wireSequence, 4);
  frame.writeUInt32BE(compressed.length, 8);
  compressed.copy(frame, 12);
  return frame;
}

export function parseVolcengineResponse(message: Buffer): VolcengineResponse {
  if (message.length < 4) {
    throw new Error('Invalid ASR response header');
  }

  const headerBytes = (message[0] & 0x0f) * 4;
  if (headerBytes < 4 || headerBytes > message.length) {
    throw new Error('Invalid ASR response header length');
  }

  const messageType = message[1] >> 4;
  const flags = message[1] & 0x0f;
  const serialization = message[2] >> 4;
  const compression = message[2] & 0x0f;
  let offset = headerBytes;
  let sequence = 0;
  let code = 0;

  if (flags & 0x01) {
    if (message.length < offset + 4) {
      throw new Error('Invalid ASR response sequence');
    }
    sequence = message.readInt32BE(offset);
    offset += 4;
  }

  if (flags & 0x04) {
    if (message.length < offset + 4) {
      throw new Error('Invalid ASR response event');
    }
    offset += 4;
  }

  const metadataBytes = messageType === MessageType.SERVER_ERROR_RESPONSE ? 8 : 4;
  if (
    (messageType !== MessageType.SERVER_FULL_RESPONSE &&
      messageType !== MessageType.SERVER_ERROR_RESPONSE) ||
    message.length < offset + metadataBytes
  ) {
    throw new Error(`Unsupported or truncated ASR response type: ${messageType}`);
  }

  if (messageType === MessageType.SERVER_ERROR_RESPONSE) {
    code = message.readInt32BE(offset);
    offset += 4;
  }
  const payloadSize = message.readUInt32BE(offset);
  offset += 4;

  if (payloadSize > message.length - offset) {
    throw new Error('ASR response payload is truncated');
  }

  let payloadBuffer = message.subarray(offset, offset + payloadSize);
  if (compression === 0b0001 && payloadBuffer.length > 0) {
    payloadBuffer = gunzipSync(payloadBuffer);
  }

  let payload: VolcengineResponsePayload | null = null;
  if (serialization === 0b0001 && payloadBuffer.length > 0) {
    payload = JSON.parse(payloadBuffer.toString('utf8')) as VolcengineResponsePayload;
  }

  return {
    code,
    isLast: Boolean(flags & 0x02),
    sequence,
    payload,
  };
}

export function extractVolcengineTranscript(payload: VolcengineResponsePayload | null): string {
  const result = payload?.result;
  if (typeof result?.text === 'string') {
    return result.text.trim();
  }
  if (Array.isArray(result?.utterances)) {
    return result.utterances
      .map((utterance) => utterance.text ?? '')
      .join('')
      .trim();
  }
  if (typeof payload?.text === 'string') {
    return payload.text.trim();
  }
  return '';
}

function sendFrame(socket: WebSocket, frame: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.send(frame, { binary: true }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export function splitVolcengineAudio(wavBuffer: Buffer, segmentDurationMs: number): Buffer[] {
  const bytesPerSecond = DEFAULT_SAMPLE_RATE * 2;
  const segmentBytes = Math.max(1, Math.floor((bytesPerSecond * segmentDurationMs) / 1000));
  const segments: Buffer[] = [];
  for (let offset = 0; offset < wavBuffer.length; offset += segmentBytes) {
    segments.push(wavBuffer.subarray(offset, Math.min(offset + segmentBytes, wavBuffer.length)));
  }
  return segments;
}

function asBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

export async function transcribeWithVolcengine(
  options: VolcengineTranscriptionOptions,
): Promise<string> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    throw new Error('Volcengine ASR API key is not configured');
  }

  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const segmentDurationMs = options.segmentDurationMs || DEFAULT_SEGMENT_DURATION_MS;
  const wavBuffer = await normalizeAudioToVolcengineWav(options.audioBuffer, {
    ffmpegPath: options.ffmpegPath,
    timeoutMs: Math.min(timeoutMs, 15_000),
  });
  const segments = splitVolcengineAudio(wavBuffer, segmentDurationMs);
  const requestId = randomUUID();
  const context = buildVolcengineCorpusContext(options.keyterms);
  const payload = {
    user: { uid: requestId },
    audio: {
      format: 'wav',
      codec: 'raw',
      rate: DEFAULT_SAMPLE_RATE,
      bits: 16,
      channel: 1,
    },
    request: {
      model_name: options.model || 'bigmodel',
      enable_itn: true,
      enable_punc: true,
      enable_ddc: true,
      show_utterances: true,
      enable_nonstream: false,
      ...(context ? { corpus: { context } } : {}),
    },
  };

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(options.url || VOLCENGINE_STT_DEFAULT_URL, {
      headers: {
        'X-Api-Key': apiKey,
        'X-Api-Resource-Id': options.resourceId || VOLCENGINE_STT_DEFAULT_RESOURCE_ID,
        'X-Api-Request-Id': requestId,
      },
      handshakeTimeout: Math.min(timeoutMs, 10_000),
      perMessageDeflate: false,
    });

    let settled = false;
    let audioStarted = false;
    let latestTranscript = '';

    const finish = (error: Error | null, transcript?: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (socket.readyState === WebSocket.CONNECTING) {
        socket.terminate();
      } else if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      if (error) {
        reject(error);
        return;
      }
      if (!transcript) {
        reject(new Error('Volcengine ASR completed without a transcript'));
        return;
      }
      resolve(transcript);
    };

    const timer = setTimeout(
      () => finish(new Error(`Volcengine ASR timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );

    const sendAudio = async (): Promise<void> => {
      if (audioStarted) {
        return;
      }
      audioStarted = true;
      let sequence = 2;
      for (let index = 0; index < segments.length; index += 1) {
        await sendFrame(
          socket,
          buildVolcengineAudioRequest(sequence, segments[index], index === segments.length - 1),
        );
        sequence += 1;
      }
    };

    socket.on('open', () => {
      sendFrame(socket, buildVolcengineFullRequest(1, payload)).catch((error: Error) =>
        finish(error),
      );
    });

    socket.on('message', (data: RawData, isBinary: boolean) => {
      if (!isBinary) {
        return;
      }

      let response: VolcengineResponse;
      try {
        response = parseVolcengineResponse(asBuffer(data));
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Invalid Volcengine ASR response'));
        return;
      }

      if (response.code !== 0) {
        const providerMessage = response.payload?.message || response.payload?.error || '';
        finish(
          new Error(
            `Volcengine ASR returned code ${response.code}${providerMessage ? `: ${providerMessage}` : ''}`,
          ),
        );
        return;
      }

      const transcript = extractVolcengineTranscript(response.payload);
      if (transcript) {
        latestTranscript = transcript;
      }

      if (!audioStarted) {
        sendAudio().catch((error: Error) => finish(error));
      }

      if (response.isLast) {
        if (!latestTranscript) {
          finish(new Error('Volcengine ASR returned an empty transcript'));
          return;
        }
        finish(null, latestTranscript);
      }
    });

    socket.on('error', (error) => finish(error));
    socket.on('close', (code, reason) => {
      if (settled) {
        return;
      }
      const detail = reason.toString('utf8').trim();
      finish(
        new Error(
          `Volcengine ASR connection closed before a final result with code ${code}${detail ? `: ${detail}` : ''}`,
        ),
      );
    });
  });
}
