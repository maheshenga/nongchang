import { useState } from 'react';
import { AlertTriangle, CheckCircle, Download, Printer, QrCode, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { showToast } from '../../hooks/useToast';
import { fluentButton, fluentInput, fluentSelect, fluentStatusTag } from '../../ui/fluent';
import { ModalSurface } from '../../ui/ModalSurface';
import type { ViewBatch } from '../BatchAdmin.model';
import type { PendingAction } from './BatchAnalysisDialogs';

const MAX_CODES = 10_000;

export interface BatchLabelWorkspaceProps {
  batch: ViewBatch;
  codeBalance: number | null;
  billingAvailable: boolean;
  generating: boolean;
  onGenerate(count: number): Promise<string[]>;
  requestConfirmation(action: PendingAction): void;
  onOpenBilling(): void;
  onClose(): void;
}

export function BatchLabelWorkspace({
  batch,
  codeBalance,
  billingAvailable,
  generating,
  onGenerate,
  requestConfirmation,
  onOpenBilling,
  onClose,
}: BatchLabelWorkspaceProps) {
  const [amount, setAmount] = useState(100);
  const [paperSize, setPaperSize] = useState('4x6');
  const [labelPadding, setLabelPadding] = useState(16);
  const [labelGap, setLabelGap] = useState(4);
  const [showLogo, setShowLogo] = useState(true);
  const [printPreview, setPrintPreview] = useState(false);
  const [sheetMargin, setSheetMargin] = useState(16);
  const [sheetGap, setSheetGap] = useState(12);
  const [qrSize, setQrSize] = useState(80);
  const [showProduct, setShowProduct] = useState(true);
  const [showSerial, setShowSerial] = useState(true);
  const [codes, setCodes] = useState<string[]>([]);

  const valid = Number.isInteger(amount) && amount >= 1 && amount <= MAX_CODES;
  const remaining = codeBalance === null ? null : codeBalance - amount;
  const quotaExceeded = remaining !== null && remaining < 0;
  const traceUrl = (code: string) => `${window.location.origin}${window.location.pathname}#/trace/${code}`;
  const codeAt = (index: number) => codes[index] ?? `${batch.code}-预览${index + 1}`;

  const requestGeneration = () => requestConfirmation({
    type: 'generate',
    title: '批量生成并导出溯源标签矩阵',
    description: `将通过真实溯源码接口为批次 ${batch.code}（${batch.type}，${batch.house}）生成 ${amount} 枚唯一溯源码（标签规格：${paperSize}）。每生成 1 枚扣减 1 个二维码额度，请确认数量。`,
    affectedCount: amount,
    batchId: batch.id,
    onConfirm: async () => {
      const generated = await onGenerate(amount);
      if (generated.length) {
        setCodes(generated);
        setPrintPreview(true);
      }
    },
  });

  const footer = (
    <>
      {billingAvailable && quotaExceeded && (
        <button type="button" onClick={onOpenBilling} className={fluentButton('secondary')}>
          前往计费中心
        </button>
      )}
      <button type="button" onClick={onClose} disabled={generating} className={fluentButton('secondary')}>
        暂缓生成
      </button>
      <button
        type="button"
        onClick={requestGeneration}
        disabled={!valid || quotaExceeded || generating}
        className={fluentButton('primary')}
      >
        {generating ? '生成中…' : '生成真实溯源码'}
      </button>
    </>
  );

  return (
    <>
      <ModalSurface
        title="溯源码标签配置"
        description="确认批次、额度和标签版式后，再生成会实际扣减额度的溯源码。"
        onClose={onClose}
        closeDisabled={generating}
        maxWidthClassName="max-w-6xl"
        footer={footer}
      >
        <div className="grid min-h-0 md:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)]">
          <div className="space-y-5 border-b border-[#E1DFDD] bg-[#FAFAFA] p-5 md:border-b-0 md:border-r">
            <section className="border border-[#E1DFDD] bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#242424]">
                <QrCode className="h-5 w-5 text-[#0078D4]" />
                当前生成目标
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <BatchFact label="批次号" value={batch.code} />
                <BatchFact label="作物" value={batch.type} />
                <BatchFact label="地块" value={batch.house} />
              </div>
            </section>

            <section className="border border-[#E1DFDD] bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#242424]">二维码额度</h3>
                  <p className="mt-1 text-xs leading-5 text-[#605E5C]">每生成 1 枚溯源码扣减 1 个二维码额度</p>
                </div>
                <span className={fluentStatusTag(quotaExceeded ? 'danger' : remaining === null ? 'neutral' : 'success')}>
                  {quotaExceeded ? '额度不足' : remaining === null ? '等待后端校验' : '额度可用'}
                </span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <QuotaFact text={`当前额度 ${codeBalance === null ? '暂不可用' : codeBalance}`} />
                <QuotaFact text={`本次申请 ${amount}`} />
                <QuotaFact
                  danger={quotaExceeded}
                  text={`预计剩余 ${remaining === null ? '暂不可用' : `${remaining}${quotaExceeded ? '（额度不足）' : ''}`}`}
                />
              </div>
              {quotaExceeded && (
                <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#A4262C]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  当前申请数量超过可用额度，请减少数量或前往计费中心补充额度。
                </p>
              )}
              {codeBalance === null && (
                <p className="mt-3 text-xs leading-5 text-[#605E5C]">
                  暂未取得额度汇总，提交后仍由后端执行最终额度校验，不会在页面中推测余额。
                </p>
              )}
            </section>

            <section className="grid gap-4 border border-[#E1DFDD] bg-white p-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-[#605E5C]">
                物理标签规格
                <select
                  value={paperSize}
                  onChange={event => setPaperSize(event.target.value)}
                  className={`${fluentSelect} mt-2 w-full`}
                >
                  <option value="4x6">标准物流特大外箱贴（4x6）</option>
                  <option value="2x1">单株植物迷你贴（2x1）</option>
                  <option value="A4">A4 不干胶阵列</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-[#605E5C]">
                预设批量总数
                <input
                  type="number"
                  min={1}
                  max={MAX_CODES}
                  value={amount}
                  onChange={event => setAmount(Math.floor(Number(event.target.value)))}
                  className={`${fluentInput} mt-2 w-full font-mono`}
                />
              </label>
              {!valid && (
                <p className="flex items-center gap-2 text-xs font-semibold text-[#A4262C] sm:col-span-2">
                  <AlertTriangle className="h-4 w-4" />
                  生成数量须为 1 到 {MAX_CODES} 的整数
                </p>
              )}
              <label className="text-xs font-semibold text-[#605E5C]">
                标签间距
                <input
                  type="number"
                  value={labelGap}
                  onChange={event => setLabelGap(Number(event.target.value))}
                  className={`${fluentInput} mt-2 w-full`}
                />
              </label>
              <label className="text-xs font-semibold text-[#605E5C]">
                安全边距
                <input
                  type="number"
                  value={labelPadding}
                  onChange={event => setLabelPadding(Number(event.target.value))}
                  className={`${fluentInput} mt-2 w-full`}
                />
              </label>
              <label className="flex items-center gap-3 text-xs font-semibold text-[#242424] sm:col-span-2">
                <input type="checkbox" checked={showLogo} onChange={event => setShowLogo(event.target.checked)} />
                显示平台溯源标识
              </label>
            </section>
          </div>

          <div className="flex min-h-[360px] items-center justify-center overflow-auto bg-[#F3F2F1] p-5">
            <div
              style={{ padding: labelPadding, gap: labelGap }}
              className={`flex max-w-full bg-white shadow-lg ${paperSize === '2x1'
                ? 'h-28 w-[240px] flex-row items-center'
                : paperSize === 'A4'
                  ? 'grid min-h-[480px] w-[350px] grid-cols-2'
                  : 'min-h-[420px] w-[280px] flex-col'}`}
            >
              {paperSize === 'A4'
                ? Array.from({ length: 8 }, (_, index) => (
                    <Label
                      key={index}
                      code={codeAt(index)}
                      url={traceUrl(codeAt(index))}
                      size={38}
                      product={batch.type}
                      showLogo={showLogo}
                    />
                  ))
                : (
                    <Label
                      code={codeAt(0)}
                      url={traceUrl(codeAt(0))}
                      size={paperSize === '2x1' ? 60 : 140}
                      product={batch.type}
                      showLogo={showLogo}
                    />
                  )}
            </div>
          </div>
        </div>
      </ModalSurface>

      {printPreview && (
        <ModalSurface
          title="标签打印预览"
          description={`批次 ${batch.code} 已生成 ${codes.length} 枚真实溯源码。`}
          onClose={() => setPrintPreview(false)}
          maxWidthClassName="max-w-6xl"
          footer={(
            <>
              <button type="button" onClick={() => setPrintPreview(false)} className={fluentButton('secondary')}>
                返回设置
              </button>
              <button type="button" onClick={() => window.print()} className={fluentButton('primary')}>
                <Printer className="h-4 w-4" />
                打印 / 另存 PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  showToast(`已为批次 ${batch.code} 生成 ${codes.length} 枚唯一溯源码并导出标签。`);
                  onClose();
                }}
                className={fluentButton('secondary')}
              >
                <Download className="h-4 w-4" />
                完成
              </button>
            </>
          )}
        >
          <div className="grid min-h-0 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-6 border-b border-[#E1DFDD] bg-white p-5 lg:border-b-0 lg:border-r">
              <Range label="纸张边距" value={sheetMargin} min={0} max={40} onChange={setSheetMargin} />
              <Range label="标签行间距" value={sheetGap} min={0} max={32} onChange={setSheetGap} />
              <Range label="二维码尺寸" value={qrSize} min={40} max={120} onChange={setQrSize} />
              <label className="flex gap-3 text-sm font-semibold text-[#242424]">
                <input type="checkbox" checked={showProduct} onChange={event => setShowProduct(event.target.checked)} />
                显示作物名称
              </label>
              <label className="flex gap-3 text-sm font-semibold text-[#242424]">
                <input type="checkbox" checked={showSerial} onChange={event => setShowSerial(event.target.checked)} />
                显示流水号
              </label>
            </div>
            <div className="overflow-auto bg-[#EDEBE9] p-4 sm:p-8">
              <div
                style={{ padding: sheetMargin, gap: sheetGap }}
                className="mx-auto grid min-h-[842px] w-[595px] grid-cols-3 bg-white"
              >
                {Array.from({ length: Math.min(21, amount) }, (_, index) => (
                  <div key={index} className="relative flex flex-col items-center justify-center border-2 border-dashed border-[#C8C6C4] p-2">
                    {showLogo && <CheckCircle className="absolute left-1 top-1 h-3 w-3 text-[#107C10]" />}
                    {showSerial && <span className="absolute right-1 top-1 text-[8px]">{index + 1}/{amount}</span>}
                    <QRCodeSVG value={traceUrl(codeAt(index))} size={qrSize} level="M" />
                    {showProduct && <div className="mt-2 text-[10px] font-semibold">{batch.type}</div>}
                    {showSerial && <div className="font-mono text-[8px]">{codeAt(index)}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ModalSurface>
      )}
    </>
  );
}

function BatchFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-[#0078D4] bg-[#F5F9FF] px-3 py-2">
      <div className="text-[11px] font-semibold text-[#605E5C]">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-[#242424]" title={value}>{value}</div>
    </div>
  );
}

function QuotaFact({ text, danger = false }: { text: string; danger?: boolean }) {
  return (
    <p className={`border px-3 py-2 text-sm font-semibold ${danger
      ? 'border-[#F1B8BD] bg-[#FDE7E9] text-[#A4262C]'
      : 'border-[#E1DFDD] bg-[#FAFAFA] text-[#242424]'}`}
    >
      {text}
    </p>
  );
}

function Label({ code, url, size, product, showLogo }: {
  code: string;
  url: string;
  size: number;
  product: string;
  showLogo: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center border border-dashed border-[#C8C6C4] p-2">
      {showLogo && (
        <div className="mb-2 flex items-center gap-1 text-[9px] font-semibold text-[#107C10]">
          <ShieldCheck className="h-3 w-3" />
          溯源标签预览
        </div>
      )}
      <QRCodeSVG value={url} size={size} level="H" />
      <div className="mt-2 text-xs font-semibold">作物：{product}</div>
      <div className="font-mono text-[9px] text-[#605E5C]">{code}</div>
    </div>
  );
}

function Range({ label, value, min, max, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange(value: number): void;
}) {
  return (
    <label className="block text-xs font-semibold text-[#605E5C]">
      {label}: {value}px
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-[#0078D4]"
      />
    </label>
  );
}
