import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Eye, FileText, Loader2, Pencil, Save, Send } from 'lucide-react';
import {
  legalDocumentPayloadSchema,
  type LegalDocumentPayload,
  type LegalPublicationSummary,
} from '@nongchang/shared';
import {
  getLegalSettings,
  publishLegalSettings,
  saveLegalSettings,
} from '../api/legal';
import { useApi } from '../hooks/useApi';
import { confirmDialog } from '../hooks/useDialog';
import { fluentButton, fluentFocus, fluentInput, fluentStatusTag } from '../ui/fluent';
import { ErrorState, LoadingState } from '../ui/state';
import LegalDraftPreview from './legal/LegalDraftPreview';

const EMPTY_DRAFT: LegalDocumentPayload = {
  operatorName: '',
  contactAddress: '',
  privacyContact: '',
  contactPhone: null,
  contactEmail: null,
  privacyVersion: '',
  agreementVersion: '',
  effectiveDate: '',
  privacyPolicyText: '',
  userAgreementText: '',
};

const labelClass = 'mb-1 block text-xs font-semibold text-[#605E5C]';
const helpClass = 'mt-1 text-xs leading-5 text-[#605E5C]';
const textareaClass = `!h-64 w-full resize-y rounded-[4px] border border-[#C8C6C4] bg-white px-3 py-2 text-sm leading-6 text-[#242424] placeholder:text-[#8A8886] focus:border-[#0078D4] ${fluentFocus}`;

export default function LegalSettings() {
  const { data, loading, error: loadError, reload } = useApi(getLegalSettings, {
    cacheKey: 'legal-settings',
  });
  const [form, setForm] = useState<LegalDocumentPayload>(EMPTY_DRAFT);
  const [dirty, setDirty] = useState(false);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [currentPublication, setCurrentPublication] = useState<LegalPublicationSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setForm(data.draft ?? EMPTY_DRAFT);
    setHasSavedDraft(Boolean(data.draft));
    setCurrentPublication(data.currentPublication);
    setDirty(false);
  }, [data]);

  const update = <K extends keyof LegalDocumentPayload>(
    key: K,
    value: LegalDocumentPayload[K],
  ) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
    setMutationError(null);
    setSuccess(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = legalDocumentPayloadSchema.safeParse(form);
    if (!parsed.success) {
      setMutationError(parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '草稿'}：${issue.message}`)
        .join('；'));
      return;
    }

    setSaving(true);
    setMutationError(null);
    setSuccess(null);
    try {
      const saved = await saveLegalSettings(parsed.data);
      setForm(saved.draft ?? parsed.data);
      setHasSavedDraft(Boolean(saved.draft));
      setCurrentPublication(saved.currentPublication);
      setDirty(false);
      setSuccess('草稿已保存，可发布当前版本');
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : '保存草稿失败');
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    const confirmed = await confirmDialog({
      title: '发布法律协议',
      message: `确认发布 ${form.privacyVersion} / ${form.agreementVersion}？发布后将形成不可变快照，小程序只接受当前版本。`,
      confirmLabel: '确认发布',
    });
    if (!confirmed) return;

    setPublishing(true);
    setMutationError(null);
    setSuccess(null);
    try {
      const published = await publishLegalSettings();
      setCurrentPublication(published);
      setSuccess(`已发布：${published.privacyVersion} / ${published.agreementVersion}`);
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : '发布协议失败');
    } finally {
      setPublishing(false);
    }
  };

  const publishDisabled = loading || dirty || !hasSavedDraft || saving || publishing;

  return (
    <div className="flex h-full flex-col overflow-hidden border border-[#E1DFDD] bg-white">
      <div className="flex flex-col gap-3 border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-[#242424]">
            <FileText className="h-5 w-5 text-[#0078D4]" />
            法律与协议
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#605E5C]">
            维护本机构的小程序运营主体、隐私政策和用户协议。保存仅更新草稿；发布后形成不可变版本并用于登录与注册同意记录。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className={fluentStatusTag(dirty ? 'warning' : hasSavedDraft ? 'success' : 'neutral')}>
            {dirty ? '存在未保存更改' : hasSavedDraft ? '草稿已保存' : '尚未配置草稿'}
          </span>
          <button
            type="button"
            className={fluentButton('secondary')}
            aria-pressed={showPreview}
            onClick={() => setShowPreview((previous) => !previous)}
          >
            {showPreview ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showPreview ? '继续编辑' : '预览草稿'}
          </button>
        </div>
      </div>

      {loading && <LoadingState label="加载法律协议配置" />}
      {loadError && (
        <div className="p-5">
          <ErrorState
            title="法律协议配置加载失败"
            message={loadError}
            onRetry={() => void reload()}
          />
        </div>
      )}

      {!loading && !loadError && (
        <form onSubmit={(event) => void save(event)} className="flex min-h-0 flex-1 flex-col">
          <div className="fluent-scrollbar flex-1 space-y-5 overflow-y-auto p-5">
          {showPreview ? (
            <LegalDraftPreview draft={form} currentPublication={currentPublication} />
          ) : (
            <>
          <section className="border border-[#E1DFDD] bg-[#FAFAFA] px-4 py-3">
            <div className="text-sm font-semibold text-[#242424]">
              {currentPublication
                ? `当前已发布：${currentPublication.privacyVersion} / ${currentPublication.agreementVersion}`
                : '当前尚未发布，小程序登录与注册将保持禁用'}
            </div>
            {currentPublication && (
              <p className={helpClass}>
                生效日期 {currentPublication.effectiveDate}，发布时间 {new Date(currentPublication.publishedAt).toLocaleString('zh-CN')}
              </p>
            )}
          </section>

          {mutationError && (
            <ErrorState title="操作失败" message={mutationError} />
          )}
          {success && (
            <div role="status" className="flex items-center gap-2 border border-[#9FD89F] bg-[#DFF6DD] px-4 py-3 text-sm font-semibold text-[#107C10]">
              <CheckCircle2 className="h-4 w-4" />
              {success}
            </div>
          )}

          <section className="border border-[#E1DFDD] bg-white p-4">
            <h3 className="text-sm font-semibold text-[#242424]">运营主体与联系信息</h3>
            <p className={helpClass}>隐私联系人、电话和邮箱会展示给用户；电话和邮箱至少填写一项。</p>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="运营主体名称" id="legal-operator-name">
                <input id="legal-operator-name" className={`${fluentInput} w-full`} value={form.operatorName} onChange={(event) => update('operatorName', event.target.value)} />
              </Field>
              <Field label="联系地址" id="legal-contact-address">
                <input id="legal-contact-address" className={`${fluentInput} w-full`} value={form.contactAddress} onChange={(event) => update('contactAddress', event.target.value)} />
              </Field>
              <Field label="隐私联系人" id="legal-privacy-contact">
                <input id="legal-privacy-contact" className={`${fluentInput} w-full`} value={form.privacyContact} onChange={(event) => update('privacyContact', event.target.value)} />
              </Field>
              <Field label="联系电话" id="legal-contact-phone">
                <input id="legal-contact-phone" className={`${fluentInput} w-full`} value={form.contactPhone ?? ''} onChange={(event) => update('contactPhone', event.target.value.trim() ? event.target.value : null)} />
              </Field>
              <Field label="联系邮箱" id="legal-contact-email">
                <input id="legal-contact-email" type="email" className={`${fluentInput} w-full`} value={form.contactEmail ?? ''} onChange={(event) => update('contactEmail', event.target.value.trim() ? event.target.value : null)} />
              </Field>
              <Field label="生效日期" id="legal-effective-date">
                <input id="legal-effective-date" type="date" max={new Date().toISOString().slice(0, 10)} className={`${fluentInput} w-full`} value={form.effectiveDate} onChange={(event) => update('effectiveDate', event.target.value)} />
              </Field>
            </div>
          </section>

          <section className="border border-[#E1DFDD] bg-white p-4">
            <h3 className="text-sm font-semibold text-[#242424]">版本与正文</h3>
            <p className={helpClass}>正文按纯文本保存与展示；版本号一经发布不可重复使用。</p>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="隐私政策版本" id="legal-privacy-version">
                <input id="legal-privacy-version" className={`${fluentInput} w-full`} value={form.privacyVersion} onChange={(event) => update('privacyVersion', event.target.value)} />
              </Field>
              <Field label="用户协议版本" id="legal-agreement-version">
                <input id="legal-agreement-version" className={`${fluentInput} w-full`} value={form.agreementVersion} onChange={(event) => update('agreementVersion', event.target.value)} />
              </Field>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Field label="隐私政策正文" id="legal-privacy-policy">
                <textarea id="legal-privacy-policy" className={textareaClass} value={form.privacyPolicyText} onChange={(event) => update('privacyPolicyText', event.target.value)} />
              </Field>
              <Field label="用户协议正文" id="legal-user-agreement">
                <textarea id="legal-user-agreement" className={textareaClass} value={form.userAgreementText} onChange={(event) => update('userAgreementText', event.target.value)} />
              </Field>
            </div>
          </section>
            </>
          )}
          </div>

          <div role="region" aria-label="法律草稿操作" className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-[#E1DFDD] bg-white px-5 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
            <button type="submit" className={fluentButton('primary')} disabled={saving || publishing || !dirty}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? '保存中' : '保存草稿'}
            </button>
            <button
              type="button"
              className={fluentButton('primary')}
              disabled={publishDisabled}
              onClick={() => void publish()}
            >
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {publishing ? '发布中' : '发布当前草稿'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({ label, id, children }: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      {children}
    </div>
  );
}
