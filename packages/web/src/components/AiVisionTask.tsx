import { useState, type ChangeEvent } from 'react';
import { Camera, Loader2, Upload } from 'lucide-react';
import { aiDiagnose } from '../api/ai';
import { uploadImage } from '../api/uploads';
import { fluentButton, fluentInput } from '../ui/fluent';
import { ErrorState } from '../ui/state';
import { aiErrorMessage, AiResultBlock } from './AiAssistant.shared';

export default function AiVisionTask({ onResult }: { onResult(title: string, result: string): void }) {
  const [imageUrl, setImageUrl] = useState('');
  const [imageName, setImageName] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onPickImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    setImageUrl('');
    try {
      const response = await uploadImage(file, 'ai-diagnose');
      setImageUrl(response.url);
      setImageName(file.name);
    } catch (caught) {
      setError(aiErrorMessage(caught));
    } finally {
      setUploading(false);
    }
  }

  async function handleDiagnose() {
    if (!imageUrl) return;
    setLoading(true);
    setError('');
    try {
      const response = await aiDiagnose({ imageUrl, note: note.trim() || undefined });
      setResult(response.result);
      onResult(imageName || '单图诊断', response.result);
    } catch (caught) {
      setError(aiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="border border-[#E1DFDD] bg-white p-5">
      <div className="mb-4 flex items-center gap-2 text-[#242424]">
        <Camera className="h-5 w-5 text-[#0078D4]" />
        <h2 className="font-semibold">AI 视觉诊断</h2>
      </div>
      <p className="mb-3 text-sm text-[#605E5C]">上传作物照片，使用真实视觉模型识别问题并返回处理建议。</p>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-[#C8C6C4] bg-[#FAFAFA] px-4 py-6 text-sm text-[#605E5C] hover:border-[#0078D4]">
        {uploading ? <Loader2 className="h-6 w-6 animate-spin text-[#0078D4]" /> : <Upload className="h-6 w-6 text-[#8A8886]" />}
        <span>{uploading ? '上传中...' : imageName || '点击选择图片（≤5MB）'}</span>
        <input aria-label="选择诊断图片" type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickImage} disabled={uploading} className="hidden" />
      </label>
      {imageUrl && <img src={imageUrl} alt={imageName} className="mt-3 max-h-48 w-full object-contain" />}
      <input value={note} onChange={event => setNote(event.target.value)} placeholder="补充说明（可选）" className={`${fluentInput} mt-3 w-full`} />
      <button type="button" onClick={() => void handleDiagnose()} disabled={loading || !imageUrl} className={`${fluentButton('primary')} mt-3`}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {loading ? '诊断中...' : '开始诊断'}
      </button>
      {error && <ErrorState message={error} retryLabel="关闭" onRetry={() => setError('')} className="mt-3" />}
      {result && <AiResultBlock result={result} />}
    </section>
  );
}
