import { buildXfyunIatAuthUrl } from './xfyun-iat';

export interface XfyunIatCredentials {
  appId: string;
  apiKey: string;
  apiSecret: string;
}

// 讯飞 IAT 返回分片结构(节选用到的字段)
interface IatWord { w: string }
interface IatWs { cw: IatWord[] }
interface IatResultData {
  code: number;
  message?: string;
  data?: { status: number; result?: { ws: IatWs[] } };
}

// 最小 WebSocket 接口,便于测试注入 mock
export interface MinimalWebSocket {
  on(event: 'open', cb: () => void): void;
  on(event: 'message', cb: (raw: string | Buffer) => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  on(event: 'close', cb: () => void): void;
  send(data: string): void;
  close(): void;
}

export type WebSocketFactory = (url: string) => MinimalWebSocket;

const FRAME_BYTES = 1280; // 讯飞建议每帧 1280 字节(约 40ms 16k PCM)
const TIMEOUT_MS = 20_000;

// 默认工厂:用 Node 原生 WebSocket(Node v22+),包装成 MinimalWebSocket
const defaultFactory: WebSocketFactory = (url) => {
  const ws = new WebSocket(url) as any;
  return {
    on(event: string, cb: any) {
      if (event === 'message') {
        ws.addEventListener('message', (ev: any) => cb(ev.data));
      } else if (event === 'error') {
        ws.addEventListener('error', () => cb(new Error('ws error')));
      } else {
        ws.addEventListener(event, () => cb());
      }
    },
    send: (data: string) => ws.send(data),
    close: () => ws.close(),
  };
};

function decodeFrame(raw: string | Buffer): IatResultData {
  const text = typeof raw === 'string' ? raw : raw.toString('utf8');
  return JSON.parse(text) as IatResultData;
}

/**
 * 调用讯飞 IAT WebSocket,把 PCM 音频转写成文字。
 * 分帧发送:首帧带参数+status0,中间帧 status1,末帧 status2。
 */
export function transcribeWithXfyun(
  creds: XfyunIatCredentials,
  audio: Buffer,
  factory: WebSocketFactory = defaultFactory,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const url = buildXfyunIatAuthUrl({ apiKey: creds.apiKey, apiSecret: creds.apiSecret });
    const ws = factory(url);
    let result = '';
    let settled = false;

    const timer = setTimeout(() => finish(new Error('转写超时')), TIMEOUT_MS);

    function finish(err: Error | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      if (err) reject(err);
      else resolve(result.trim());
    }

    const commonArgs = {
      common: { app_id: creds.appId },
      business: { language: 'zh_cn', domain: 'iat', accent: 'mandarin', vad_eos: 3000 },
    };

    ws.on('open', () => {
      try {
        const frames = Math.max(1, Math.ceil(audio.length / FRAME_BYTES));
        for (let i = 0; i < frames; i++) {
          const chunk = audio.subarray(i * FRAME_BYTES, (i + 1) * FRAME_BYTES);
          const status = i === 0 ? 0 : i === frames - 1 ? 2 : 1;
          const frame: Record<string, unknown> = {
            data: {
              status,
              format: 'audio/L16;rate=16000',
              encoding: 'raw',
              audio: chunk.toString('base64'),
            },
          };
          if (i === 0) Object.assign(frame, commonArgs);
          ws.send(JSON.stringify(frame));
        }
        // 单帧场景仍需补发结束帧
        if (frames === 1) {
          ws.send(JSON.stringify({ data: { status: 2, format: 'audio/L16;rate=16000', encoding: 'raw', audio: '' } }));
        }
      } catch (e) {
        finish(e instanceof Error ? e : new Error('发送音频失败'));
      }
    });

    ws.on('message', (raw) => {
      let parsed: IatResultData;
      try { parsed = decodeFrame(raw); } catch { return; }
      if (parsed.code !== 0) {
        finish(new Error(`讯飞转写错误(${parsed.code})`));
        return;
      }
      const wsArr = parsed.data?.result?.ws;
      if (wsArr) {
        for (const seg of wsArr) {
          for (const word of seg.cw) result += word.w;
        }
      }
      if (parsed.data?.status === 2) finish(null);
    });

    ws.on('error', () => finish(new Error('讯飞连接失败')));
    ws.on('close', () => finish(null));
  });
}
