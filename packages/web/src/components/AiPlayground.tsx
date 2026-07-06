import { useState } from 'react';
import { Image as ImageIcon, MessageSquare, Send, Stethoscope } from 'lucide-react';
import { aiChat, aiDiagnose } from '../api/ai';
import { fluentButton, fluentInput } from '../ui/fluent';

const errMsg = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

export default function AiPlayground() {
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);

  const onSend = async () => {
    const text = message.trim();
    if (!text) return;
    setChatLoading(true);
    setChatError(null);
    setAnswer(null);
    try {
      setAnswer((await aiChat(text)).answer);
    } catch (err) {
      setChatError(errMsg(err, '对话失败'));
    } finally {
      setChatLoading(false);
    }
  };

  const onPickImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setDiagnosisError(null);
    setDiagnosis(null);
    if (!file) {
      setImageBase64(null);
      setImageName(null);
      return;
    }
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result);
      setImageBase64(raw.split(',')[1] ?? raw);
    };
    reader.onerror = () => setDiagnosisError('图片读取失败');
    reader.readAsDataURL(file);
  };

  const onDiagnose = async () => {
    if (!imageBase64) {
      setDiagnosisError('请先选择图片');
      return;
    }
    setDiagnosisLoading(true);
    setDiagnosisError(null);
    setDiagnosis(null);
    try {
      setDiagnosis((await aiDiagnose({ imageBase64, note: note.trim() || undefined })).result);
    } catch (err) {
      setDiagnosisError(errMsg(err, '诊断失败'));
    } finally {
      setDiagnosisLoading(false);
    }
  };

  const labelClass = 'mb-1.5 block text-sm font-semibold text-[#323130]';

  return (
    <section className="border border-[#E1DFDD] bg-white">
      <header className="border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#005A9E]">
          <MessageSquare className="h-4 w-4" />
          AI 在线试用
        </div>
        <h3 className="mt-1 text-base font-semibold text-[#242424]">AI 在线试用</h3>
        <p className="mt-1 text-sm text-[#605E5C]">使用当前启用的服务商进行文本对话与作物病害图像诊断。</p>
      </header>

      <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
        <section className="border border-[#E1DFDD] p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#242424]">
            <MessageSquare className="h-4 w-4 text-[#0078D4]" />
            文本对话
          </h4>
          <label className={labelClass}>提问内容</label>
          <textarea
            className={`${fluentInput} h-auto min-h-24 w-full resize-none py-2`}
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="例如：番茄叶片发黄是什么原因？"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void onSend()}
              disabled={chatLoading || !message.trim()}
              className={fluentButton('primary')}
            >
              <Send className="h-4 w-4" />
              {chatLoading ? '发送中...' : '发送'}
            </button>
            <span className="text-xs text-[#605E5C]">语音输入暂未开放，请先使用文本提问。</span>
          </div>
          {chatError && <div className="mt-3 text-sm font-semibold text-[#A4262C]">{chatError}</div>}
          {answer && <div className="mt-3 whitespace-pre-wrap border border-[#E1DFDD] bg-[#FAFAFA] p-3 text-sm text-[#242424]">{answer}</div>}
        </section>

        <section className="border border-[#E1DFDD] p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#242424]">
            <Stethoscope className="h-4 w-4 text-[#0078D4]" />
            病害诊断
            <span className="text-xs font-normal text-[#605E5C]">（需配置视觉模型）</span>
          </h4>
          <label className={labelClass}>选择图片</label>
          <input
            type="file"
            accept="image/*"
            onChange={onPickImage}
            className="block w-full text-sm text-[#605E5C] file:mr-3 file:border file:border-[#C8C6C4] file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[#242424] hover:file:bg-[#F3F2F1]"
          />
          {imageName && (
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-[#605E5C]">
              <ImageIcon className="h-3 w-3" />
              {imageName}
            </p>
          )}
          <div className="mt-3">
            <label className={labelClass}>备注（可选）</label>
            <input
              className={`${fluentInput} w-full`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="例如：症状已持续 3 天"
            />
          </div>
          <button
            type="button"
            onClick={() => void onDiagnose()}
            disabled={diagnosisLoading}
            className={`${fluentButton('primary')} mt-3`}
          >
            <Stethoscope className="h-4 w-4" />
            {diagnosisLoading ? '诊断中...' : '开始诊断'}
          </button>
          {diagnosisError && <div className="mt-3 text-sm font-semibold text-[#A4262C]">{diagnosisError}</div>}
          {diagnosis && <div className="mt-3 whitespace-pre-wrap border border-[#E1DFDD] bg-[#FAFAFA] p-3 text-sm text-[#242424]">{diagnosis}</div>}
        </section>
      </div>
    </section>
  );
}
