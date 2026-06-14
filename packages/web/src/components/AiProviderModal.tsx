import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { AiProviderView, CreateAiProviderInput, UpdateAiProviderInput } from '@nongchang/shared';
import { createAiProvider, updateAiProvider } from '../api/ai-provider';

interface Props {
  provider: AiProviderView | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function AiProviderModal({ provider, onClose, onSaved }: Props) {
  const isEdit = provider !== null;
  const [name, setName] = useState(provider?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [textModel, setTextModel] = useState(provider?.textModel ?? '');
  const [visionModel, setVisionModel] = useState(provider?.visionModel ?? '');
  const [enabled, setEnabled] = useState(provider?.enabled ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const vision = visionModel.trim() === '' ? undefined : visionModel.trim();
      if (isEdit && provider) {
        const dto: UpdateAiProviderInput = {
          name,
          baseUrl,
          textModel,
          visionModel: vision,
          enabled,
        };
        // apiKey 仅在用户填写时提交，留空表示不修改
        if (apiKey.trim() !== '') dto.apiKey = apiKey;
        await updateAiProvider(provider.id, dto);
      } else {
        const dto: CreateAiProviderInput = {
          name,
          baseUrl,
          apiKey,
          textModel,
          visionModel: vision,
          enabled,
        };
        await createAiProvider(dto);
      }
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-provider-modal-title"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h3 id="ai-provider-modal-title" className="font-bold text-slate-800 text-lg">
            {isEdit ? '编辑 AI 服务商' : '新增 AI 服务商'}
          </h3>
          <button type="button" onClick={onClose} aria-label="关闭" className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label htmlFor="ai-name" className="block text-xs font-bold text-slate-500">名称</label>
          <input id="ai-name" value={name} onChange={(e) => setName(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
        </div>

        <div>
          <label htmlFor="ai-base-url" className="block text-xs font-bold text-slate-500">Base URL</label>
          <input id="ai-base-url" type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required placeholder="https://api.example.com/v1"
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
        </div>

        <div>
          <label htmlFor="ai-api-key" className="block text-xs font-bold text-slate-500">API Key</label>
          <input id="ai-api-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            required={!isEdit}
            placeholder={isEdit ? 'API Key（留空不修改）' : 'API Key'}
            autoComplete="new-password"
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
        </div>

        <div>
          <label htmlFor="ai-text-model" className="block text-xs font-bold text-slate-500">文本模型</label>
          <input id="ai-text-model" value={textModel} onChange={(e) => setTextModel(e.target.value)} required placeholder="gpt-4o-mini"
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
        </div>

        <div>
          <label htmlFor="ai-vision-model" className="block text-xs font-bold text-slate-500">视觉模型（可选）</label>
          <input id="ai-vision-model" value={visionModel} onChange={(e) => setVisionModel(e.target.value)} placeholder="留空表示不配置"
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
          启用该服务商（同租户仅允许一个启用）
        </label>

        {err && <p className="text-rose-500 text-xs">{err}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">取消</button>
          <button type="submit" disabled={submitting}
            className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-emerald-700 transition-colors">
            {submitting ? '提交中…' : isEdit ? '保存' : '创建'}
          </button>
        </div>
      </form>
    </div>
  );
}
