import { useState } from 'react';
import { AlertTriangle, CheckCircle, Download, Layers, Printer, QrCode, ShieldCheck, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { showToast } from '../../hooks/useToast';
import type { ViewBatch } from '../BatchAdmin.model';
import type { PendingAction } from './BatchAnalysisDialogs';

const MAX_CODES = 10_000;

interface Props {
  batch: ViewBatch;
  generating: boolean;
  onGenerate(count: number): Promise<string[]>;
  requestConfirmation(action: PendingAction): void;
  onClose(): void;
}

export function BatchLabelWorkspace({ batch, generating, onGenerate, requestConfirmation, onClose }: Props) {
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
  const traceUrl = (code: string) => `${window.location.origin}${window.location.pathname}#/trace/${code}`;
  const codeAt = (index: number) => codes[index] ?? `${batch.code}-预览${index + 1}`;

  const requestGeneration = () => requestConfirmation({
    type: 'generate',
    title: '批量生成并导出溯源标签矩阵',
    description: `将通过真实溯源码接口为批次 [${batch.id}] 生成 ${amount} 枚唯一溯源码 (标签规格: ${paperSize})。生成后会消耗可用二维码额度,请确认数量。`,
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

  return <>
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"><div className="flex max-h-[800px] h-[90vh] w-full max-w-4xl overflow-hidden rounded-[6px] bg-white shadow-lg md:h-auto">
      <div className="flex w-[55%] flex-col overflow-y-auto border-r border-slate-100 bg-slate-50/80 p-8"><h3 className="mb-8 flex items-center gap-3 text-xl font-bold text-slate-800"><QrCode className="h-6 w-6 text-blue-600" />专属溯源标签批量引擎</h3>
        <div className="space-y-5"><div className="rounded-[6px] border border-slate-200 bg-white p-4"><div className="text-[10px] font-bold uppercase text-slate-400">当前批次</div><div className="font-mono text-sm font-black text-blue-600">{batch.code} · {batch.type}</div></div>
          <label className="block text-xs font-bold text-slate-600">物理标签规格<select value={paperSize} onChange={event => setPaperSize(event.target.value)} className="mt-2 w-full rounded-[6px] border border-slate-200 bg-white px-4 py-3 text-sm font-bold"><option value="4x6">标准物流特大外箱贴 (4x6)</option><option value="2x1">盆栽单株植物迷你标 (2x1)</option><option value="A4">A4 激光不干胶阵列</option></select></label>
          <label className="block text-xs font-bold text-slate-600">预设批量总数<input type="number" min={1} max={MAX_CODES} value={amount} onChange={event => setAmount(Math.floor(Number(event.target.value)))} className="mt-2 w-full rounded-[6px] border border-slate-200 px-4 py-3 font-mono text-lg font-black" /></label>
          {!valid && <p className="flex items-center gap-2 text-xs font-bold text-rose-500"><AlertTriangle className="h-4 w-4" />生成数量须为 1 ~ {MAX_CODES} 的整数</p>}
          <div className="grid grid-cols-2 gap-4 rounded-[6px] border border-slate-200 bg-white p-5"><label className="text-xs font-bold text-slate-500">标签间距<input type="number" value={labelGap} onChange={event => setLabelGap(Number(event.target.value))} className="mt-2 w-full rounded border p-2" /></label><label className="text-xs font-bold text-slate-500">安全边距<input type="number" value={labelPadding} onChange={event => setLabelPadding(Number(event.target.value))} className="mt-2 w-full rounded border p-2" /></label><label className="col-span-2 flex items-center gap-3 text-xs font-bold"><input type="checkbox" checked={showLogo} onChange={event => setShowLogo(event.target.checked)} />显示平台标识栏</label></div>
        </div>
        <div className="mt-auto flex gap-4 pt-8"><button onClick={onClose} className="rounded-[6px] border border-slate-200 bg-white px-6 py-3 text-sm font-bold">暂缓生成</button><button onClick={requestGeneration} disabled={!valid || generating} className="flex-1 rounded-[6px] bg-blue-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{generating ? '生成中…' : '生成真实溯源码'}</button></div>
      </div>
      <div className="flex w-[45%] items-center justify-center bg-slate-100 p-8"><div style={{ padding: labelPadding, gap: labelGap }} className={`flex bg-white shadow-lg ${paperSize === '2x1' ? 'h-28 w-[240px] flex-row items-center' : paperSize === 'A4' ? 'grid h-[480px] w-[350px] grid-cols-2' : 'min-h-[420px] w-[280px] flex-col'}`}>
        {paperSize === 'A4' ? Array.from({ length: 8 }, (_, index) => <Label key={index} code={codeAt(index)} url={traceUrl(codeAt(index))} size={38} product={batch.type} showLogo={showLogo} />) : <Label code={codeAt(0)} url={traceUrl(codeAt(0))} size={paperSize === '2x1' ? 60 : 140} product={batch.type} showLogo={showLogo} />}
      </div></div>
    </div></div>
    {printPreview && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"><div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-[6px] bg-slate-50 shadow-lg">
      <div className="flex items-center justify-between border-b bg-white p-6"><h3 className="flex items-center gap-3 text-lg font-bold"><Printer className="h-5 w-5" />可视化标签排版及导出引擎</h3><button onClick={() => setPrintPreview(false)}><X className="h-5 w-5" /></button></div>
      <div className="flex flex-1 overflow-hidden"><div className="w-80 space-y-6 overflow-y-auto border-r bg-white p-6"><Range label="纸张边距" value={sheetMargin} min={0} max={40} onChange={setSheetMargin} /><Range label="标签行间距" value={sheetGap} min={0} max={32} onChange={setSheetGap} /><Range label="二维码尺寸" value={qrSize} min={40} max={120} onChange={setQrSize} /><label className="flex gap-3 text-sm font-bold"><input type="checkbox" checked={showProduct} onChange={event => setShowProduct(event.target.checked)} />显示商品品名</label><label className="flex gap-3 text-sm font-bold"><input type="checkbox" checked={showSerial} onChange={event => setShowSerial(event.target.checked)} />显示流水号</label></div>
        <div className="flex-1 overflow-y-auto bg-slate-200 p-8"><div style={{ padding: sheetMargin, gap: sheetGap }} className="mx-auto grid min-h-[842px] w-[595px] grid-cols-3 bg-white">{Array.from({ length: Math.min(21, amount) }, (_, index) => <div key={index} className="relative flex flex-col items-center justify-center rounded border-2 border-dashed border-slate-300 p-2">{showLogo && <CheckCircle className="absolute left-1 top-1 h-3 w-3 text-[#107C10]" />}{showSerial && <span className="absolute right-1 top-1 text-[8px]">{index + 1}/{amount}</span>}<QRCodeSVG value={traceUrl(codeAt(index))} size={qrSize} level="M" />{showProduct && <div className="mt-2 text-[10px] font-bold">{batch.type}</div>}{showSerial && <div className="font-mono text-[8px]">{codeAt(index)}</div>}</div>)}</div></div>
      </div>
      <div className="flex justify-end gap-3 border-t bg-white p-4"><button onClick={() => setPrintPreview(false)} className="px-5 py-2">返回设置</button><button onClick={() => window.print()} className="flex items-center gap-2 rounded bg-indigo-600 px-6 py-2 font-bold text-white"><Printer className="h-4 w-4" />打印 / 另存 PDF</button><button onClick={() => { showToast(`已为批次生成 ${codes.length} 个唯一溯源码并导出标签。`); onClose(); }} className="flex items-center gap-2 rounded bg-[#107C10] px-6 py-2 font-bold text-white"><Download className="h-4 w-4" />完成</button></div>
    </div></div>}
  </>;
}

function Label({ code, url, size, product, showLogo }: { code: string; url: string; size: number; product: string; showLogo: boolean }) {
  return <div className="flex flex-1 flex-col items-center justify-center border border-dashed border-slate-300 p-2">{showLogo && <div className="mb-2 flex items-center gap-1 text-[9px] font-black text-[#107C10]"><ShieldCheck className="h-3 w-3" />溯源标签预览</div>}<QRCodeSVG value={url} size={size} level="H" /><div className="mt-2 text-xs font-bold">{product}</div><div className="font-mono text-[9px] text-slate-500">{code}</div></div>;
}

function Range({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange(value: number): void }) {
  return <label className="block text-xs font-bold text-slate-700">{label}: {value}px<input type="range" min={min} max={max} value={value} onChange={event => onChange(Number(event.target.value))} className="mt-2 w-full accent-indigo-600" /></label>;
}
