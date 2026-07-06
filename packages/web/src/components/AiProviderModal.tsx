import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { AiProviderView, CreateAiProviderInput, UpdateAiProviderInput } from '@nongchang/shared';
import { createAiProvider, updateAiProvider } from '../api/ai-provider';
import { fluentButton, fluentInput } from '../ui/fluent';

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
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-provider-modal-title"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
        className="fluent-scrollbar max-h-[90vh] w-full max-w-lg overflow-y-auto border border-[#E1DFDD] bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
          <h3 id="ai-provider-modal-title" className="text-base font-semibold text-[#242424]">
            {isEdit ? '编辑 AI 服务商' : '新增 AI 服务商'}
          </h3>
          <button type="button" onClick={onClose} aria-label="关闭" className={fluentButton('icon')}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <label htmlFor="ai-name" className="mb-1.5 block text-sm font-semibold text-[#323130]">名称</label>
            <input id="ai-name" value={name} onChange={(event) => setName(event.target.value)} required className={`${fluentInput} w-full`} />
          </div>

          <div>
            <label htmlFor="ai-base-url" className="mb-1.5 block text-sm font-semibold text-[#323130]">Base URL</label>
            <input
              id="ai-base-url"
              type="url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              required
              placeholder="https://api.example.com/v1"
              className={`${fluentInput} w-full font-mono`}
            />
          </div>

          <div>
            <label htmlFor="ai-api-key" className="mb-1.5 block text-sm font-semibold text-[#323130]">API Key</label>
            <input
              id="ai-api-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              required={!isEdit}
              placeholder={isEdit ? '留空表示不修改 API Key' : 'API Key'}
              autoComplete="new-password"
              className={`${fluentInput} w-full font-mono`}
            />
          </div>

          <div>
            <label htmlFor="ai-text-model" className="mb-1.5 block text-sm font-semibold text-[#323130]">文本模型</label>
            <input
              id="ai-text-model"
              value={textModel}
              onChange={(event) => setTextModel(event.target.value)}
              required
              placeholder="gpt-4o-mini"
              className={`${fluentInput} w-full font-mono`}
            />
          </div>

          <div>
            <label htmlFor="ai-vision-model" className="mb-1.5 block text-sm font-semibold text-[#323130]">视觉模型（可选）</label>
            <input
              id="ai-vision-model"
              value={visionModel}
              onChange={(event) => setVisionModel(event.target.value)}
              placeholder="留空表示不配置"
              className={`${fluentInput} w-full font-mono`}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-[#323130]">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="h-4 w-4 rounded border-[#C8C6C4] text-[#0078D4] focus:ring-[#0078D4]/40"
            />
            启用该服务商（同租户仅允许一个启用）
          </label>

          {error && (
            <div className="border border-[#F1C6CA] bg-[#FDE7E9] px-3 py-2 text-sm font-semibold text-[#A4262C]">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
          <button type="button" onClick={onClose} className={fluentButton('secondary')}>取消</button>
          <button type="submit" disabled={submitting} className={fluentButton('primary')}>
            {submitting ? '提交中...' : isEdit ? '保存' : '创建'}
          </button>
        </div>
      </form>
    </div>
  );
}
