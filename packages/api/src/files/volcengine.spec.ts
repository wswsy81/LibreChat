import { gzipSync } from 'node:zlib';
import {
  buildVolcengineAudioRequest,
  buildVolcengineCorpusContext,
  buildVolcengineFullRequest,
  extractVolcengineTranscript,
  isPcm16Mono16kWav,
  normalizeAudioToVolcengineWav,
  normalizeVolcengineKeyterms,
  parseVolcengineResponse,
  splitVolcengineAudio,
  VOLCENGINE_STT_DEFAULT_URL,
} from './volcengine';

function makeStandardWav(pcm = Buffer.alloc(6400)): Buffer {
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + pcm.length, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);
  return wav;
}

function makeServerResponse(
  payload: object,
  { sequence = 3, isLast = true, code = 0 } = {},
): Buffer {
  const compressed = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  const isError = code !== 0;
  const header = Buffer.from([
    0x11,
    ((isError ? 0b1111 : 0b1001) << 4) | (isLast ? 0b0011 : 0b0001),
    0x11,
    0x00,
  ]);
  const metadataBytes = isError ? 12 : 8;
  const frame = Buffer.alloc(header.length + metadataBytes + compressed.length);
  header.copy(frame, 0);
  frame.writeInt32BE(sequence, 4);
  if (isError) {
    frame.writeInt32BE(code, 8);
    frame.writeUInt32BE(compressed.length, 12);
    compressed.copy(frame, 16);
  } else {
    frame.writeUInt32BE(compressed.length, 8);
    compressed.copy(frame, 12);
  }
  return frame;
}

describe('Volcengine STT hints', () => {
  it('deduplicates, trims, filters, and caps static keyterms', () => {
    const input = [
      ' 未来线 ',
      '未来线',
      '',
      null,
      '人生设计室',
      'x'.repeat(41),
      ...Array.from({ length: 30 }, (_, index) => `词${index}`),
    ];

    const result = normalizeVolcengineKeyterms(input);

    expect(result[0]).toBe('未来线');
    expect(result[1]).toBe('人生设计室');
    expect(result).toHaveLength(20);
    expect(result).not.toContain('x'.repeat(41));
  });

  it('serializes only normalized hotwords into corpus.context', () => {
    expect(
      JSON.parse(buildVolcengineCorpusContext(['未来线', ' 未来线 ', '人生设计室']) as string),
    ).toEqual({
      hotwords: [{ word: '未来线' }, { word: '人生设计室' }],
    });
    expect(buildVolcengineCorpusContext([])).toBeUndefined();
  });
});

describe('Volcengine STT audio normalization', () => {
  it('recognizes and reuses a 16kHz mono PCM WAV buffer', async () => {
    const wav = makeStandardWav();
    expect(isPcm16Mono16kWav(wav)).toBe(true);
    await expect(normalizeAudioToVolcengineWav(wav)).resolves.toBe(wav);
  });

  it('rejects empty audio before invoking ffmpeg', async () => {
    await expect(normalizeAudioToVolcengineWav(Buffer.alloc(0))).rejects.toThrow(
      'Audio buffer is empty',
    );
  });

  it('splits WAV data into 200ms wire segments', () => {
    const wav = makeStandardWav(Buffer.alloc(12_800));
    const segments = splitVolcengineAudio(wav, 200);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toHaveLength(6400);
    expect(Buffer.concat(segments)).toEqual(wav);
  });
});

describe('Volcengine binary protocol', () => {
  it('defaults completed recordings to the nostream endpoint', () => {
    expect(VOLCENGINE_STT_DEFAULT_URL).toMatch(/\/bigmodel_nostream$/);
  });

  it('builds a gzip JSON full request with a positive sequence', () => {
    const frame = buildVolcengineFullRequest(1, { request: { model_name: 'bigmodel' } });
    expect(frame[0]).toBe(0x11);
    expect(frame[1]).toBe(0x11);
    expect(frame[2]).toBe(0x11);
    expect(frame.readInt32BE(4)).toBe(1);
    expect(frame.readUInt32BE(8)).toBe(frame.length - 12);
  });

  it('marks the last audio packet with a negative sequence', () => {
    const frame = buildVolcengineAudioRequest(7, Buffer.from('audio'), true);
    expect(frame[1]).toBe(0x23);
    expect(frame[2]).toBe(0x01);
    expect(frame.readInt32BE(4)).toBe(-7);
  });

  it('parses a final gzip JSON response and extracts result text', () => {
    const frame = makeServerResponse({ result: { text: '未来线语音输入测试。' } });
    const response = parseVolcengineResponse(frame);
    expect(response).toEqual({
      code: 0,
      isLast: true,
      sequence: 3,
      payload: { result: { text: '未来线语音输入测试。' } },
    });
    expect(extractVolcengineTranscript(response.payload)).toBe('未来线语音输入测试。');
  });

  it('parses provider error responses', () => {
    const frame = makeServerResponse({ message: 'invalid key' }, { code: 45000000 });
    const response = parseVolcengineResponse(frame);
    expect(response.code).toBe(45000000);
    expect(response.payload).toEqual({ message: 'invalid key' });
  });

  it('rejects a truncated response sequence', () => {
    expect(() => parseVolcengineResponse(Buffer.from([0x11, 0x91, 0x11, 0x00]))).toThrow(
      'Invalid ASR response sequence',
    );
  });

  it('falls back to concatenating utterance text', () => {
    expect(
      extractVolcengineTranscript({
        result: { utterances: [{ text: '未来线' }, { text: '语音输入' }] },
      }),
    ).toBe('未来线语音输入');
  });
});
