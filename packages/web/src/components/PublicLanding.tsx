import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, ClipboardList, FileText, Layers, Mail, Search, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { fluentButton, fluentInput, fluentStatusTag } from '../ui/fluent';
import { PRODUCT_NAME } from '../ui/branding';

export interface PublicLandingProps {
  onLogin: () => void;
  onTraceLookup?: (code: string) => void;
  salesContact?: string | null;
}

type PublicLandingImportMeta = ImportMeta & {
  env?: {
    VITE_PUBLIC_SALES_CONTACT?: string;
  };
};

type SalesContactEnv = {
  VITE_PUBLIC_SALES_CONTACT?: string | null;
};

const capabilities = [
  {
    title: '多角色 SaaS 组织',
    desc: '平台、租户、代理商、商户和会员使用同一套权限边界。',
    icon: Users,
  },
  {
    title: '生产与批次留档',
    desc: '地块、批次、农事、物流和资质文件形成可回溯记录。',
    icon: Layers,
  },
  {
    title: '公开溯源查询',
    desc: '消费者可通过溯源码查看公开批次旅程与凭证。',
    icon: ShieldCheck,
  },
];

const openingMaterials = [
  '机构编码与主体名称',
  '管理员姓名与联系方式',
  '角色范围与商户/代理商关系',
  '计费、AI、地图或 OSS 集成需求',
];

export function resolveSalesContact(env: SalesContactEnv | undefined = (import.meta as PublicLandingImportMeta).env): string | null {
  const raw = env?.VITE_PUBLIC_SALES_CONTACT;
  const value = raw == null ? '' : String(raw).trim();
  return value && value !== 'undefined' ? value : null;
}

export default function PublicLanding({ onLogin, onTraceLookup, salesContact = resolveSalesContact() }: PublicLandingProps) {
  const [traceCode, setTraceCode] = useState('');
  const submitTraceLookup = (event: FormEvent) => {
    event.preventDefault();
    const normalized = traceCode.trim();
    if (!normalized) return;
    if (onTraceLookup) onTraceLookup(normalized);
    else window.location.hash = `#/trace/${encodeURIComponent(normalized)}`;
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#242424]">
      <header className="border-b border-[#E1DFDD] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[4px] bg-[#0078D4] text-white">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <span className="truncate text-sm font-semibold">{PRODUCT_NAME}</span>
          </div>
          <button type="button" onClick={onLogin} className={fluentButton('primary')}>
            登录
          </button>
        </div>
      </header>

      <main>
        <section className="border-b border-[#E1DFDD] bg-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-[#242424] sm:text-5xl">
                农业溯源 SaaS 平台
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#605E5C]">
                把租户、代理商、商户、批次、农事记录和公开溯源查询放进一个可审计的控制台。
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button type="button" onClick={onLogin} className={fluentButton('primary')}>
                  进入控制台
                  <ArrowRight className="h-4 w-4" />
                </button>
                <a href="#opening" className={fluentButton('secondary')}>
                  申请开通
                </a>
                <a href="#pricing" className={fluentButton('secondary')}>
                  查看开通方式
                </a>
              </div>
              <form onSubmit={submitTraceLookup} aria-label="公开溯源查询" className="mt-7 max-w-xl border border-[#E1DFDD] bg-[#FAFAFA] p-4">
                <label htmlFor="public-trace-code" className="block text-sm font-semibold text-[#242424]">溯源码</label>
                <p className="mt-1 text-xs leading-5 text-[#605E5C]">输入包装或标签上的完整溯源码，查询已公开的批次记录。</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="public-trace-code"
                    value={traceCode}
                    onChange={event => setTraceCode(event.target.value)}
                    placeholder="例如 ORC-ABC123"
                    className={`${fluentInput} min-w-0 flex-1`}
                  />
                  <button type="submit" disabled={!traceCode.trim()} className={fluentButton('primary')}>
                    <Search className="h-4 w-4" />查询溯源
                  </button>
                </div>
              </form>
            </div>

            <div className="border border-[#E1DFDD] bg-[#FAFAFA] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[#242424]">产品工作流</span>
                <span className={fluentStatusTag('active')}>SaaS 控制台</span>
              </div>
              <div className="space-y-3">
                {['租户开通', '商户建档', '批次与农事留档', '公开溯源查询'].map((item) => (
                  <div key={item} className="flex items-center gap-3 border border-[#E1DFDD] bg-white px-3 py-3 text-sm font-semibold">
                    <CheckCircle2 className="h-4 w-4 text-[#107C10]" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-4 px-5 py-10 md:grid-cols-3">
          {capabilities.map(({ title, desc, icon: Icon }) => (
            <article key={title} className="border border-[#E1DFDD] bg-white p-5">
              <Icon className="h-5 w-5 text-[#0078D4]" />
              <h2 className="mt-4 text-lg font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#605E5C]">{desc}</p>
            </article>
          ))}
        </section>

        <section id="opening" className="border-y border-[#E1DFDD] bg-[#FAFAFA]">
          <div className="mx-auto grid max-w-6xl gap-6 px-5 py-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase text-[#605E5C]">
                <ClipboardList className="h-4 w-4 text-[#0078D4]" />
                Assisted opening
              </div>
              <h2 className="text-2xl font-semibold">申请开通前准备</h2>
              <p className="mt-3 text-sm leading-6 text-[#605E5C]">
                租户由平台运营人员审核资料后创建，开通前需要人工审核与配置。
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-[1fr_0.9fr]">
              <div className="border border-[#E1DFDD] bg-white p-5">
                <h3 className="text-base font-semibold text-[#242424]">开通材料</h3>
                <div className="mt-4 grid gap-3">
                  {openingMaterials.map((item) => (
                    <div key={item} className="flex items-center gap-3 text-sm text-[#323130]">
                      <CheckCircle2 className="h-4 w-4 text-[#107C10]" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="border border-[#E1DFDD] bg-white p-5">
                <Mail className="h-5 w-5 text-[#0078D4]" />
                <h3 className="mt-3 text-base font-semibold text-[#242424]">联系开通</h3>
                <p className="mt-2 text-sm leading-6 text-[#605E5C]">
                  {salesContact ? '请通过以下联系方式提交开通资料。' : '请联系平台运营人员获取开通方式。'}
                </p>
                {salesContact && (
                  <div className="mt-3 border border-[#C8C6C4] bg-[#F5F5F5] px-3 py-2 text-sm font-semibold text-[#323130]">
                    {salesContact}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="border-y border-[#E1DFDD] bg-white">
          <div className="mx-auto grid max-w-6xl gap-6 px-5 py-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <h2 className="text-2xl font-semibold">按角色开通</h2>
              <p className="mt-3 text-sm leading-6 text-[#605E5C]">
                适合平台运营、代理商管理和商户生产协作，额度和支付能力按租户配置启用。
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="border border-[#E1DFDD] bg-[#FAFAFA] p-5">
                <FileText className="h-5 w-5 text-[#0078D4]" />
                <h3 className="mt-3 text-base font-semibold">基础溯源</h3>
                <p className="mt-2 text-sm leading-6 text-[#605E5C]">批次、农事记录、公开查询和资质文件管理。</p>
              </div>
              <div className="border border-[#E1DFDD] bg-[#FAFAFA] p-5">
                <Sparkles className="h-5 w-5 text-[#0078D4]" />
                <h3 className="mt-3 text-base font-semibold">扩展集成</h3>
                <p className="mt-2 text-sm leading-6 text-[#605E5C]">AI、支付、地图、OSS 等集成在租户配置完成后启用。</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
