import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  FileText,
  FlaskConical,
  Hexagon,
  Leaf,
  MapPin,
  ShieldCheck,
  Sprout,
  Store,
  Sun,
  Truck,
} from 'lucide-react';
import { fetchPublicTrace, TraceNotFoundError } from '../api/trace';
import type { PublicTraceResult, TraceEventType } from '@nongchang/shared';
import TiandituMap from './TiandituMap';
import type { Field } from '../api/fields';
import { fluentButton, fluentStatusTag } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';

const ICON_BY_TYPE: Record<TraceEventType, typeof Sprout> = {
  origin: Sprout,
  farm: Leaf,
  harvest: Sun,
  warehouse: Hexagon,
  logistics: Truck,
  retail: Store,
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function TraceabilityPage({ code, onBack }: { code: string; onBack?: () => void }) {
  const [activeTab, setActiveTab] = useState<'journey' | 'cert'>('journey');
  const [data, setData] = useState<PublicTraceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setData(null);
    fetchPublicTrace(code)
      .then((res) => { if (alive) setData(res); })
      .catch((e) => { if (alive) setError(e instanceof TraceNotFoundError ? e.message : '溯源查询失败,请稍后重试'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [code]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] px-5 py-10 text-[#242424]">
        <div className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center border border-[#E1DFDD] bg-white">
          <LoadingState label="正在查询溯源记录" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] px-5 py-10 text-[#242424]">
        <div className="mx-auto max-w-xl border border-[#E1DFDD] bg-white">
          <ErrorState title="溯源码无效或暂不可查" message={error ?? `未找到溯源码 ${code}`} className="m-5" />
          {onBack && (
            <div className="border-t border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
              <button type="button" onClick={onBack} className={fluentButton('secondary')}>返回</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (data.frozen) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] px-5 py-10 text-[#242424]">
        <div role="alert" className="mx-auto max-w-xl overflow-hidden border border-[#F1B8BD] bg-white">
          <div className="flex items-start gap-3 bg-[#FDE7E9] px-5 py-5 text-[#A4262C]">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h1 className="text-lg font-semibold">该溯源码已被冻结</h1>
              <p className="mt-2 break-all text-sm leading-6">溯源码 {data.code} 已被风控标记并暂停公开展示，请联系商家核实商品来源。</p>
            </div>
          </div>
          {onBack && (
            <div className="border-t border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
              <button type="button" onClick={onBack} className={fluentButton('secondary')}>返回</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const { batch, events, scanCount } = data;
  const credentials = data.credentials ?? [];
  const origin = batch.region ?? batch.fieldName;
  const originField: Field | null =
    batch.fieldLng != null && batch.fieldLat != null
      ? {
          id: 'origin',
          tenantId: '',
          ownerId: '',
          ownerName: null,
          name: batch.fieldName || '产地',
          area: 0,
          lng: batch.fieldLng,
          lat: batch.fieldLat,
          iotDeviceId: null,
          createdAt: '',
        }
      : null;

  return (
    <div className="min-h-screen bg-[#F5F5F5] pb-10 text-[#242424]">
      <header className="border-b border-[#E1DFDD] bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          {onBack && (
            <button type="button" onClick={onBack} aria-label="返回" className={fluentButton('icon')}>
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[4px] bg-[#E5F1FB] text-[#0078D4]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[#605E5C]">官方溯源记录</span>
              <span className={fluentStatusTag('success')}>溯源记录已匹配</span>
            </div>
            <h1 className="mt-1 truncate text-2xl font-semibold text-[#242424]">{batch.cropName}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-5">
        <section className="border border-[#E1DFDD] bg-white">
          <div className="grid gap-4 border-b border-[#E1DFDD] bg-[#FAFAFA] p-5 sm:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <div className="font-mono text-sm font-semibold text-[#005A9E]">{code}</div>
              <div className="mt-3 grid gap-3 text-sm text-[#605E5C] sm:grid-cols-3">
                <div>
                  <div className="text-xs font-semibold">批次</div>
                  <div className="mt-1 font-mono font-semibold text-[#242424]">{batch.batchNo}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold">产地</div>
                  <div className="mt-1 truncate font-semibold text-[#242424]">{origin}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold">累计扫码</div>
                  <div className="mt-1 font-mono font-semibold text-[#242424]">{scanCount} 次</div>
                </div>
              </div>
            </div>
            <div className="flex items-start justify-start sm:justify-end">
              <span className={fluentStatusTag('active')}>公开查询</span>
            </div>
          </div>

          <div className="flex gap-2 border-b border-[#E1DFDD] bg-white p-3">
            <button
              type="button"
              onClick={() => setActiveTab('journey')}
              aria-pressed={activeTab === 'journey'}
              className={activeTab === 'journey' ? fluentButton('primary') : fluentButton('secondary')}
            >
              旅程
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('cert')}
              aria-pressed={activeTab === 'cert'}
              className={activeTab === 'cert' ? fluentButton('primary') : fluentButton('secondary')}
            >
              凭证
            </button>
          </div>

          {activeTab === 'journey' && (
            <div className="space-y-5 p-5">
              {originField && data.tiandituKey && (
                <section className="border border-[#E1DFDD] bg-white">
                  <div className="flex h-10 items-center gap-2 border-b border-[#E1DFDD] bg-[#FAFAFA] px-4 text-sm font-semibold">
                    <MapPin className="h-4 w-4 text-[#0078D4]" /> 产地位置
                  </div>
                  <div className="h-56 overflow-hidden">
                    <TiandituMap fields={[originField]} activeFieldId="origin" onSelect={() => {}} apiKey={data.tiandituKey} />
                  </div>
                </section>
              )}

              {events.length === 0 ? (
                <EmptyState title="暂无公开生产记录" description="该批次还没有可展示的公开溯源事件。" />
              ) : (
                <div className="space-y-3">
                  {events.map((ev, idx) => {
                    const Icon = ICON_BY_TYPE[ev.type];
                    const payload = (ev.payload ?? {}) as Record<string, unknown>;
                    const desc = typeof payload.desc === 'string' ? payload.desc : undefined;
                    const image = typeof payload.image === 'string' ? payload.image : undefined;
                    const tag = typeof payload.tag === 'string' ? payload.tag : undefined;
                    const env = [payload.weather, payload.data, payload.temp].find((v) => typeof v === 'string') as string | undefined;
                    return (
                      <article key={`${ev.title}-${ev.occurredAt}-${idx}`} className="border border-[#E1DFDD] bg-white p-4">
                        <div className="flex items-start gap-3">
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[4px] bg-[#E5F1FB] text-[#0078D4]">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-base font-semibold text-[#242424]">{ev.title}</h2>
                              {tag && <span className={fluentStatusTag('neutral')}>{tag}</span>}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#605E5C]">
                              <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{fmtTime(ev.occurredAt)}</span>
                              <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{ev.location}</span>
                              <span>{ev.actor}</span>
                            </div>
                            {desc && <p className="mt-3 text-sm leading-6 text-[#605E5C]">{desc}</p>}
                            {image && <img src={image} alt={ev.title} className="mt-3 h-36 w-full object-cover" />}
                            {env && <div className="mt-3 border border-[#C7E0F4] bg-[#EFF6FC] px-3 py-2 text-xs text-[#005A9E]">环境记录: {env}</div>}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'cert' && (
            <div className="space-y-5 p-5">
              <section className="border border-[#E1DFDD] bg-white">
                <div className="flex h-10 items-center gap-2 border-b border-[#E1DFDD] bg-[#FAFAFA] px-4 text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4 text-[#0078D4]" /> 防伪查询信息
                </div>
                <div className="divide-y divide-[#EDEBE9] text-sm">
                  <div className="flex justify-between gap-4 px-4 py-3">
                    <span className="text-[#605E5C]">溯源码</span>
                    <span className="font-mono font-semibold">{code}</span>
                  </div>
                  <div className="flex justify-between gap-4 px-4 py-3">
                    <span className="text-[#605E5C]">累计扫码次数</span>
                    <span className="font-mono font-semibold">{scanCount}</span>
                  </div>
                  <div className="flex justify-between gap-4 px-4 py-3">
                    <span className="text-[#605E5C]">记录状态</span>
                    <span className={fluentStatusTag('success')}>记录可查询</span>
                  </div>
                </div>
              </section>

              {credentials.length === 0 ? (
                <EmptyState title="暂无公开资质或检测文件" description="商家上传认证证书或检测报告后会在这里展示。" />
              ) : (
                <section className="border border-[#E1DFDD] bg-white">
                  <div className="flex h-10 items-center gap-2 border-b border-[#E1DFDD] bg-[#FAFAFA] px-4 text-sm font-semibold">
                    <FileText className="h-4 w-4 text-[#0078D4]" /> 资质与检测文件
                  </div>
                  <div className="divide-y divide-[#EDEBE9]">
                    {credentials.map((c, idx) => (
                      <a
                        key={`${c.title}-${idx}`}
                        href={c.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 px-4 py-3 hover:bg-[#F5F9FF]"
                      >
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[4px] bg-[#E5F1FB] text-[#0078D4]">
                          {c.type === 'certificate' ? <ShieldCheck className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-[#242424]">{c.title}</div>
                          <div className="truncate text-xs text-[#605E5C]">
                            {c.issuer}{c.issuedAt ? ` · ${c.issuedAt.slice(0, 10)}` : ''}
                          </div>
                        </div>
                        <FileText className="h-4 w-4 shrink-0 text-[#605E5C]" />
                      </a>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
