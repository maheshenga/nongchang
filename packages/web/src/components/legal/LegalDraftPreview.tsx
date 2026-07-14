import type { LegalDocumentPayload, LegalPublicationSummary } from '@nongchang/shared';
import { fluentStatusTag } from '../../ui/fluent';

type LegalDraftPreviewProps = {
  draft: LegalDocumentPayload;
  currentPublication: LegalPublicationSummary | null;
};

export default function LegalDraftPreview({ draft, currentPublication }: LegalDraftPreviewProps) {
  const metadataMatchesCurrentPublication = Boolean(
    currentPublication
    && currentPublication.privacyVersion === draft.privacyVersion
    && currentPublication.agreementVersion === draft.agreementVersion
    && currentPublication.effectiveDate === draft.effectiveDate,
  );

  return (
    <section role="region" aria-label="法律草稿预览" className="space-y-5 border border-[#E1DFDD] bg-white p-4 md:p-6">
      <div className="flex flex-col gap-3 border-b border-[#E1DFDD] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[#242424]">法律协议草稿</h3>
          <p className="mt-1 text-sm text-[#605E5C]">以下内容将以纯文本形式向用户展示。</p>
        </div>
        <span className={fluentStatusTag(metadataMatchesCurrentPublication ? 'success' : 'warning')}>
          {metadataMatchesCurrentPublication ? '草稿版本信息与当前发布一致' : '未发布草稿'}
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-4 bg-[#FAFAFA] p-4 text-sm md:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold text-[#605E5C]">运营主体</dt>
          <dd className="mt-1 font-semibold text-[#242424]">{draft.operatorName || '未填写'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-[#605E5C]">协议版本</dt>
          <dd className="mt-1 font-semibold text-[#242424]">{draft.privacyVersion} / {draft.agreementVersion}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-[#605E5C]">生效日期</dt>
          <dd className="mt-1 font-semibold text-[#242424]">{draft.effectiveDate || '未填写'}</dd>
        </div>
      </dl>

      {currentPublication && (
        <p className="border-l-2 border-[#0078D4] bg-[#F3F9FD] px-3 py-2 text-sm text-[#323130]">
          当前已发布：{currentPublication.privacyVersion} / {currentPublication.agreementVersion}
        </p>
      )}

      <article aria-labelledby="legal-preview-privacy-heading">
        <h3 id="legal-preview-privacy-heading" className="text-base font-semibold text-[#242424]">隐私政策</h3>
        <div className="mt-3 whitespace-pre-wrap break-words border border-[#E1DFDD] bg-[#FAFAFA] p-4 text-sm leading-7 text-[#323130]">
          {draft.privacyPolicyText || '尚未填写隐私政策正文'}
        </div>
      </article>

      <article aria-labelledby="legal-preview-agreement-heading">
        <h3 id="legal-preview-agreement-heading" className="text-base font-semibold text-[#242424]">用户协议</h3>
        <div className="mt-3 whitespace-pre-wrap break-words border border-[#E1DFDD] bg-[#FAFAFA] p-4 text-sm leading-7 text-[#323130]">
          {draft.userAgreementText || '尚未填写用户协议正文'}
        </div>
      </article>
    </section>
  );
}
