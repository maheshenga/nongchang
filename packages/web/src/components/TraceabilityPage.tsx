import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Copy,
  FileText,
  FlaskConical,
  Hexagon,
  Leaf,
  MapPin,
  Search,
  ShieldCheck,
  Sprout,
  Store,
  Sun,
  Truck,
} from 'lucide-react';
import type { PublicTraceResult, TraceEventType } from '@nongchang/shared';
import { fetchPublicTrace, TraceLookupError } from '../api/trace';
import type { Field } from '../api/fields';
import { fluentButton, fluentInput, fluentStatusTag } from '../ui/fluent';
import { EmptyState, LoadingState } from '../ui/state';
import TiandituMap from './TiandituMap';

const ICON_BY_TYPE: Record<TraceEventType, typeof Sprout> = {
  origin: Sprout,
  farm: Leaf,
  harvest: Sun,
  warehouse: Hexagon,
  logistics: Truck,
  retail: Store,
};

function fmtTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function TraceLookupForm({ initialCode = '' }: { initialCode?: string }) {
  const [value, setValue] = useState(initialCode);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = value.trim();
    if (!normalized) return;
    window.location.hash = `#/trace/${encodeURIComponent(normalized)}`;
  };
  return (
    <form onSubmit={submit} className="border border-[#E1DFDD] bg-[#FAFAFA] p-4">
      <label htmlFor="trace-lookup-again" className="block text-sm font-semibold text-[#242424]">重新输入溯源码</label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          id="trace-lookup-again"
          value={value}
          onChange={event => setValue(event.target.value)}
          className={`${fluentInput} min-w-0 flex-1`}
        />
        <button type="submit" disabled={!value.trim()} className={fluentButton('primary')}>
          <Search className="h-4 w-4" />查询其他溯源码
        </button>
      </div>
    </form>
  );
}

export default function TraceabilityPage({ code, onBack }: { code: string; onBack?: () => void }) {
  const [activeTab, setActiveTab] = useState<'journey' | 'cert'>('journey');
  const [data, setData] = useState<PublicTraceResult | null>(null);
  const [failure, setFailure] = useState<{ kind: 'not-found' | 'network'; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryVersion, setRetryVersion] = useState(0);
  const [queriedAt, setQueriedAt] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailure(null);
    setData(null);
    setReportOpen(false);
    fetchPublicTrace(code)
      .then((result) => {
        if (!alive) return;
        setData(result);
        setQueriedAt(new Date().toISOString());
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        if (cause instanceof TraceLookupError) setFailure({ kind: cause.kind, message: cause.message });
        else setFailure({ kind: 'network', message: '溯源查询失败，请稍后重试' });
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [code, retryVersion]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] px-5 py-10 text-[#242424]">
        <div className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center border border-[#E1DFDD] bg-white">
          <LoadingState label="正在查询溯源记录" />
        </div>
      </div>
    );
  }

  if (failure || !data) {
    const network = failure?.kind === 'network';
    return (
      <div className="min-h-screen bg-[#F5F5F5] px-5 py-10 text-[#242424]">
        <div className="mx-auto max-w-xl space-y-4 border border-[#E1DFDD] bg-white p-5">
          <div role="alert" className="border border-[#F1B8BD] bg-[#FDE7E9] p-4 text-[#A4262C]">
            <h1 className="text-lg font-semibold">{network ? '网络连接异常' : '未找到该溯源码'}</h1>
            <p className="mt-2 break-words text-sm leading-6">{failure?.message ?? `未找到溯源码 ${code}`}</p>
          </div>
          {network && (
            <button type="button" onClick={() => setRetryVersion(version => version + 1)} className={fluentButton('primary')}>
              重新查询
            </button>
          )}
          <TraceLookupForm initialCode={code} />
          {onBack && <button type="button" onClick={onBack} className={fluentButton('secondary')}>返回首页</button>}
        </div>
      </div>
    );
  }

  if (data.frozen) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] px-5 py-10 text-[#242424]">
        <div className="mx-auto max-w-xl space-y-4 border border-[#E1DFDD] bg-white p-5">
          <div role="alert" className="border border-[#F1B8BD] bg-[#FDE7E9] p-4 text-[#A4262C]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <h1 className="text-lg font-semibold">该溯源码已被冻结</h1>
                <p className="mt-2 break-all text-sm leading-6">溯源码 {data.code} 已被风控标记并暂停公开展示，请联系商品提供方核实来源。</p>
              </div>
            </div>
          </div>
          <TraceLookupForm initialCode={data.code} />
          {onBack && <button type="button" onClick={onBack} className={fluentButton('secondary')}>返回首页</button>}
        </div>
      </div>
    );
  }

  const { batch, events, scanCount } = data;
  const credentials = data.credentials ?? [];
  const origin = batch.region || batch.fieldName || '未公开产地';
  const supportSummary = [
    `溯源码: ${data.code}`,
    `商户: ${batch.merchantName}`,
    `批次: ${batch.batchNo}`,
    `累计扫码: ${scanCount}`,
    `本次查询时间: ${queriedAt ? fmtTime(queriedAt) : '未知'}`,
  ].join('\n');
  const originField: Field | null = batch.fieldLng != null && batch.fieldLat != null
    ? {
        id: 'origin', tenantId: '', ownerId: '', ownerName: null,
        name: batch.fieldName || '产地', area: 0, lng: batch.fieldLng, lat: batch.fieldLat,
        iotDeviceId: null, createdAt: '',
      }
    : null;

  const copySupportSummary = async () => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(supportSummary);
      setCopyStatus('摘要已复制');
    } catch {
      setCopyStatus('请手动复制摘要');
    }
  };

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
              <span className="text-xs font-semibold text-[#605E5C]">公开溯源记录</span>
              <span className={fluentStatusTag('success')}>溯源记录已匹配</span>
            </div>
            <h1 className="mt-1 truncate text-2xl font-semibold text-[#242424]">{batch.cropName}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-5 py-5">
        <section className="border border-[#E1DFDD] bg-white">
          <div className="border-b border-[#E1DFDD] bg-[#FAFAFA] p-5">
            <div className="font-mono text-sm font-semibold text-[#005A9E]">{data.code}</div>
            <div className="mt-3 grid gap-3 text-sm text-[#605E5C] sm:grid-cols-2 lg:grid-cols-4">
              <div><div className="text-xs font-semibold">批次</div><div className="mt-1 font-mono font-semibold text-[#242424]">{batch.batchNo}</div></div>
              <div><div className="text-xs font-semibold">商户</div><div className="mt-1 truncate font-semibold text-[#242424]">{batch.merchantName}</div></div>
              <div><div className="text-xs font-semibold">产地</div><div className="mt-1 truncate font-semibold text-[#242424]">{origin}</div></div>
              <div><div className="text-xs font-semibold">累计扫码</div><div className="mt-1 font-mono font-semibold text-[#242424]">{scanCount} 次</div></div>
            </div>
          </div>

          <div className="grid gap-3 border-b border-[#E1DFDD] bg-white p-4 sm:grid-cols-2">
            <div className="border border-[#E1DFDD] bg-[#FAFAFA] p-3 text-sm">
              <div className="text-xs font-semibold text-[#605E5C]">本次查询时间</div>
              <div className="mt-1 font-semibold text-[#242424]">{queriedAt ? fmtTime(queriedAt) : '未知'}</div>
            </div>
            <div className="border border-[#C7E0F4] bg-[#EFF6FC] p-3 text-xs leading-5 text-[#005A9E]">
              累计扫码次数会随每次公开查询增加；如次数明显异常，请联系商户 {batch.merchantName} 核实商品流转情况。
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-[#E1DFDD] bg-white p-3">
            <button type="button" onClick={() => setActiveTab('journey')} aria-pressed={activeTab === 'journey'} className={activeTab === 'journey' ? fluentButton('primary') : fluentButton('secondary')}>旅程</button>
            <button type="button" onClick={() => setActiveTab('cert')} aria-pressed={activeTab === 'cert'} className={activeTab === 'cert' ? fluentButton('primary') : fluentButton('secondary')}>凭证</button>
            <button type="button" onClick={() => setReportOpen(open => !open)} aria-expanded={reportOpen} className={fluentButton('secondary')}>报告异常</button>
          </div>

          {reportOpen && (
            <div className="space-y-3 border-b border-[#E1DFDD] bg-[#FAFAFA] p-4">
              <p className="text-sm leading-6 text-[#605E5C]">以下摘要仅在本机生成，不会自动发送。复制后可提供给商户或平台支持人员核查。</p>
              <textarea aria-label="异常报告摘要" readOnly value={supportSummary} rows={5} className={`${fluentInput} h-auto w-full py-2 font-mono text-xs`} />
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => void copySupportSummary()} className={fluentButton('secondary')}><Copy className="h-4 w-4" />复制摘要</button>
                {copyStatus && <span role="status" className="text-xs text-[#605E5C]">{copyStatus}</span>}
              </div>
            </div>
          )}

          {activeTab === 'journey' && (
            <div className="space-y-5 p-5">
              {originField && data.tiandituKey && (
                <section className="border border-[#E1DFDD] bg-white">
                  <div className="flex h-10 items-center gap-2 border-b border-[#E1DFDD] bg-[#FAFAFA] px-4 text-sm font-semibold"><MapPin className="h-4 w-4 text-[#0078D4]" />产地位置</div>
                  <div className="h-56 overflow-hidden"><TiandituMap fields={[originField]} activeFieldId="origin" onSelect={() => {}} apiKey={data.tiandituKey} /></div>
                </section>
              )}
              {events.length === 0 ? (
                <EmptyState title="暂无公开生产记录" description="该批次还没有可展示的公开溯源事件。" />
              ) : (
                <div className="space-y-3">
                  {events.map((event, index) => {
                    const Icon = ICON_BY_TYPE[event.type];
                    const payload = (event.payload ?? {}) as Record<string, unknown>;
                    const desc = typeof payload.desc === 'string' ? payload.desc : undefined;
                    const image = typeof payload.image === 'string' ? payload.image : undefined;
                    const tag = typeof payload.tag === 'string' ? payload.tag : undefined;
                    const environment = [payload.weather, payload.data, payload.temp].find(value => typeof value === 'string') as string | undefined;
                    return (
                      <article key={`${event.title}-${event.occurredAt}-${index}`} className="border border-[#E1DFDD] bg-white p-4">
                        <div className="flex items-start gap-3">
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[4px] bg-[#E5F1FB] text-[#0078D4]"><Icon className="h-4 w-4" /></div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold text-[#242424]">{event.title}</h2>{tag && <span className={fluentStatusTag('neutral')}>{tag}</span>}</div>
                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#605E5C]"><span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{fmtTime(event.occurredAt)}</span><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{event.location}</span><span>{event.actor}</span></div>
                            {desc && <p className="mt-3 text-sm leading-6 text-[#605E5C]">{desc}</p>}
                            {image && <img src={image} alt={event.title} className="mt-3 h-36 w-full object-cover" />}
                            {environment && <div className="mt-3 border border-[#C7E0F4] bg-[#EFF6FC] px-3 py-2 text-xs text-[#005A9E]">环境记录: {environment}</div>}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  {data.eventTotal > events.length && <p className="text-xs text-[#605E5C]">当前展示 {events.length} / {data.eventTotal} 条公开事件。</p>}
                </div>
              )}
            </div>
          )}

          {activeTab === 'cert' && (
            <div className="space-y-5 p-5">
              <section className="border border-[#E1DFDD] bg-white">
                <div className="flex h-10 items-center gap-2 border-b border-[#E1DFDD] bg-[#FAFAFA] px-4 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-[#0078D4]" />防伪查询信息</div>
                <div className="divide-y divide-[#EDEBE9] text-sm">
                  <div className="flex justify-between gap-4 px-4 py-3"><span className="text-[#605E5C]">溯源码</span><span className="font-mono font-semibold">{data.code}</span></div>
                  <div className="flex justify-between gap-4 px-4 py-3"><span className="text-[#605E5C]">累计扫码次数</span><span className="font-mono font-semibold">{scanCount}</span></div>
                  <div className="flex justify-between gap-4 px-4 py-3"><span className="text-[#605E5C]">记录状态</span><span className={fluentStatusTag('success')}>公开记录可查询</span></div>
                </div>
              </section>
              {credentials.length === 0 ? (
                <EmptyState title="暂无公开资质或检测文件" description="商家上传认证证书或检测报告后会在这里展示。" />
              ) : (
                <section className="border border-[#E1DFDD] bg-white">
                  <div className="flex h-10 items-center gap-2 border-b border-[#E1DFDD] bg-[#FAFAFA] px-4 text-sm font-semibold"><FileText className="h-4 w-4 text-[#0078D4]" />资质与检测文件</div>
                  <div className="divide-y divide-[#EDEBE9]">
                    {credentials.map((credential, index) => (
                      <a key={`${credential.title}-${index}`} href={credential.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-[#F5F9FF]">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[4px] bg-[#E5F1FB] text-[#0078D4]">{credential.type === 'certificate' ? <ShieldCheck className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" />}</div>
                        <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-[#242424]">{credential.title}</div><div className="truncate text-xs text-[#605E5C]">{credential.issuer}{credential.issuedAt ? ` · ${credential.issuedAt.slice(0, 10)}` : ''}</div></div>
                        <FileText className="h-4 w-4 shrink-0 text-[#605E5C]" />
                      </a>
                    ))}
                  </div>
                  {data.credentialTotal > credentials.length && <p className="border-t border-[#E1DFDD] px-4 py-3 text-xs text-[#605E5C]">当前展示 {credentials.length} / {data.credentialTotal} 份公开文件。</p>}
                </section>
              )}
            </div>
          )}
        </section>

        <TraceLookupForm />
      </main>
    </div>
  );
}
