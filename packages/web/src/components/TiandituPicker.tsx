import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { loadTianditu } from '../lib/tianditu';

interface Props {
  lng: number | null;
  lat: number | null;
  onPick: (lng: number, lat: number) => void;
}

// 天地图点选器:点击地图落点回填经纬度(WGS84,与 DB 一致)。无 key / 加载失败时回退提示,可继续用手填兜底。
export default function TiandituPicker({ lng, lat, onPick }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');

  // 初始化地图 + 点击落点(仅一次)
  useEffect(() => {
    let disposed = false;
    loadTianditu()
      .then((T) => {
        if (disposed || !containerRef.current) return;
        const center = lng != null && lat != null
          ? new T.LngLat(lng, lat)
          : new T.LngLat(116.40769, 39.89945);
        const map = new T.Map(containerRef.current, { projection: 'EPSG:900913' });
        map.centerAndZoom(center, lng != null ? 14 : 5);
        map.setMapType?.(T.TMAP_HYBRID_MAP ?? undefined);
        mapRef.current = map;

        if (lng != null && lat != null) {
          const m = new T.Marker(new T.LngLat(lng, lat));
          map.addOverLay(m);
          markerRef.current = m;
        }

        map.addEventListener('click', (e: { lnglat: { getLng: () => number; getLat: () => number } }) => {
          const clickedLng = e.lnglat.getLng();
          const clickedLat = e.lnglat.getLat();
          if (markerRef.current) map.removeOverLay(markerRef.current);
          const m = new T.Marker(new T.LngLat(clickedLng, clickedLat));
          map.addOverLay(m);
          markerRef.current = m;
          onPickRef.current(Number(clickedLng.toFixed(6)), Number(clickedLat.toFixed(6)));
        });

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
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'error') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-4 gap-2 bg-slate-50">
        <div className="p-2 bg-slate-100 rounded-full"><MapPin className="w-5 h-5 text-slate-400" /></div>
        <p className="text-xs text-slate-500">
          {errMsg.includes('未配置') ? '未配置天地图,请直接手填经纬度' : `底图加载失败,请手填经纬度`}
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div ref={containerRef} className="absolute inset-0" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 bg-slate-50/60">底图加载中…</div>
      )}
      {status === 'ready' && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-white/95 shadow rounded px-3 py-1 text-[11px] text-slate-500 border border-slate-200 pointer-events-none">
          点击地图选择地块位置
        </div>
      )}
    </div>
  );
}
