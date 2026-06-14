import { Image } from '@tarojs/components';
import './index.scss';

// 极简 SVG 图标集（data-uri，替代 weapp 不支持的 lucide-react）。
// 用法：<Icon name="leaf" size={24} color="#fff" />
const PATHS: Record<string, string> = {
  work: 'M3 7h18v13H3z M8 7V5a4 4 0 0 1 8 0v2',
  trace: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M16 16h2v2h-2z',
  me: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 20a8 8 0 0 1 16 0',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z M5 11a7 7 0 0 0 14 0 M12 18v3',
  camera: 'M3 7h4l2-2h6l2 2h4v12H3z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  sparkles: 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z',
  wifi: 'M5 12a10 10 0 0 1 14 0 M8.5 15.5a5 5 0 0 1 7 0 M12 19h.01',
  send: 'M3 11l18-8-8 18-2-7-8-3z',
  leaf: 'M5 21c0-9 7-16 16-16 0 9-7 16-16 16z',
};

interface Props { name: keyof typeof PATHS | string; size?: number; color?: string }

export default function Icon({ name, size = 24, color = '#059669' }: Props) {
  const d = PATHS[name] ?? PATHS.work;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return <Image className="nc-icon" src={uri} style={{ width: `${size}px`, height: `${size}px` }} />;
}
