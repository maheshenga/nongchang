import { Images, Loader2, Upload } from 'lucide-react';
import { fluentButton } from '../ui/fluent';
import { ErrorState } from '../ui/state';

export interface BatchDiagnosisResult {
  name: string;
  result: string;
}

export default function AiBatchDiagnosisSection({
  files,
  running,
  error,
  results,
  onFilesChange,
  onRun,
  onClearError,
}: {
  files: File[];
  running: boolean;
  error: string;
  results: BatchDiagnosisResult[];
  onFilesChange: (files: File[]) => void;
  onRun: () => void;
  onClearError: () => void;
}) {
  return (
    <section className="border border-[#E1DFDD] bg-white p-5">
      <div className="mb-4 flex items-center gap-2 text-[#242424]">
        <Images className="h-5 w-5 text-[#0078D4]" />
        <h2 className="font-semibold">AI 批量诊断</h2>
      </div>
      <p className="mb-3 text-sm text-[#605E5C]">一次选择多张作物照片，AI 逐张识别病害。若额度不足将停止并提示已诊断数量。</p>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-[#C8C6C4] bg-[#FAFAFA] px-4 py-6 text-sm text-[#605E5C] hover:border-[#0078D4]">
        <Upload className="h-6 w-6 text-[#8A8886]" />
        <span>{files.length > 0 ? `已选择 ${files.length} 张` : '点击选择多张图片（每张 ≤5MB）'}</span>
        <input
          aria-label="选择批量诊断图片"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => onFilesChange(Array.from(event.target.files ?? []))}
          disabled={running}
          className="hidden"
        />
      </label>
      <button
        type="button"
        onClick={onRun}
        disabled={running || files.length === 0}
        className={`${fluentButton('primary')} mt-3`}
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Images className="h-4 w-4" />}
        {running ? '诊断中...' : '批量诊断'}
      </button>
      {error && (
        <ErrorState
          title="批量诊断已停止"
          message={error}
          retryLabel="关闭"
          onRetry={onClearError}
          className="mt-3"
        />
      )}
      {results.length > 0 && (
        <div className="mt-4 space-y-3">
          {results.map((item, index) => (
            <div key={`${item.name}-${index}`} className="border border-[#E1DFDD] bg-[#FAFAFA] p-4 text-sm text-[#242424]">
              <div className="mb-1 font-semibold text-[#242424]">{item.name}</div>
              <div className="whitespace-pre-wrap">{item.result}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
