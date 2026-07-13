import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { loadTianditu } from '../lib/tianditu';
import type { Field } from '../api/fields';
import { fluentButton } from '../ui/fluent';

export type MapRecovery = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

interface Props {
  fields: Field[];
  activeFieldId: string | null;
  onSelect: (id: string) => void;
  apiKey?: string; // 显式 key(公开溯源页用);不传则走已登录的租户配置接口
  recovery?: MapRecovery;
}

// 用天地图真实底图按经纬度展示地块标注。无 key / 加载失败时回退到「去配置」提示。
export default function TiandituMap({ fields, activeFieldId, onSelect, apiKey, recovery }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');

  // 有经纬度的地块才能上图
  const located = useMemo(() => fields.filter((f) => f.lng != null && f.lat != null), [fields]);

  // 初始化地图(仅一次)
  useEffect(() => {
    let disposed = false;
    const markers = markersRef.current;
    loadTianditu(apiKey)
      .then((T) => {
        if (disposed || !containerRef.current) return;
        const center = located[0]
          ? new T.LngLat(located[0].lng as number, located[0].lat as number)
          : new T.LngLat(116.40769, 39.89945); // 默认北京
        const map = new T.Map(containerRef.current, { projection: 'EPSG:900913' });
        map.centerAndZoom(center, located[0] ? 13 : 5);
        map.setMapType?.(T.TMAP_HYBRID_MAP ?? undefined);
        mapRef.current = map;
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (disposed) return;
        setErrMsg(e instanceof Error ? e.message : '天地图加载失败');
        setStatus('error');
      });
    return () => {
      disposed = true;
      mapRef.current = null;
      markers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 同步标注
  useEffect(() => {
    const T = window.T;
    const map = mapRef.current;
    if (status !== 'ready' || !T || !map) return;

    // 清旧标注
    markersRef.current.forEach((m) => map.removeOverLay(m));
    markersRef.current.clear();

    located.forEach((f) => {
      const marker = new T.Marker(new T.LngLat(f.lng as number, f.lat as number));
      marker.addEventListener('click', () => onSelect(f.id));
      const label = new T.Label({
        text: f.name,
        position: new T.LngLat(f.lng as number, f.lat as number),
        offset: new T.Point(12, -28),
      });
      map.addOverLay(marker);
      map.addOverLay(label);
      markersRef.current.set(f.id, marker);
    });

    const active = located.find((f) => f.id === activeFieldId) ?? located[0];
    if (active) map.panTo(new T.LngLat(active.lng as number, active.lat as number));
  }, [status, located, activeFieldId, onSelect]);

  if (status === 'error') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 gap-3">
        <div className="p-3 bg-slate-100 rounded-full"><MapPin className="w-6 h-6 text-slate-400" /></div>
        <p className="max-w-xs text-sm text-[#605E5C]">
          {recovery?.message ?? (errMsg.includes('未配置') ? '尚未配置天地图密钥,无法加载真实底图。' : `底图加载失败:${errMsg}`)}
        </p>
        {recovery?.actionLabel && recovery.onAction ? (
          <button type="button" onClick={recovery.onAction} className={fluentButton('primary')}>
            {recovery.actionLabel}
          </button>
        ) : !recovery ? (
          <p className="text-xs text-[#605E5C]">请在「系统设置 → 第三方集成」中配置并启用天地图 key。</p>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 bg-slate-50/60">
          底图加载中…
        </div>
      )}
      {status === 'ready' && located.length === 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/95 shadow rounded-lg px-4 py-2 text-xs text-slate-500 border border-slate-200">
          暂无含经纬度的地块,新建地块时填写经纬度即可上图。
        </div>
      )}
    </>
  );
}
