import { useState } from 'react';
import { MessageSquare, Mic, Send, Stethoscope, Image as ImageIcon } from 'lucide-react';
import { aiChat, aiDiagnose } from '../api/ai';

const errMsg = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : fallback;

export default function AiPlayground() {
  // A. 文本对话
  const [msg, setMsg] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatErr, setChatErr] = useState<string | null>(null);

  // B. 病害诊断
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagErr, setDiagErr] = useState<string | null>(null);

  const onSend = async () => {
    const text = msg.trim();
    if (!text) return;
    setChatLoading(true);
    setChatErr(null);
    setAnswer(null);
    try {
      setAnswer((await aiChat(text)).answer);
    } catch (e) {
      setChatErr(errMsg(e, '对话失败'));
    } finally {
      setChatLoading(false);
    }
  };

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setDiagErr(null);
    setResult(null);
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
    reader.onerror = () => setDiagErr('图片读取失败');
    reader.readAsDataURL(file);
  };

  const onDiagnose = async () => {
    if (!imageBase64) {
      setDiagErr('请先选择图片');
      return;
    }
    setDiagLoading(true);
    setDiagErr(null);
    setResult(null);
    try {
      setResult(
        (await aiDiagnose({ imageBase64, note: note.trim() || undefined })).result,
      );
    } catch (e) {
      setDiagErr(errMsg(e, '诊断失败'));
    } finally {
      setDiagLoading(false);
    }
  };

  const inputCls =
    'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition';
  const labelCls = 'block text-xs font-bold text-slate-600 mb-1.5';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-200 bg-slate-50/50">
        <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
          <div className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg">
            <MessageSquare className="w-4 h-4" />
          </div>
          AI 在线试用
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          使用当前启用的服务商进行文本对话与作物病害图像诊断。
        </p>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* A. 文本对话 */}
        <section className="border border-slate-200 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-600" /> 文本对话
          </h4>
          <div>
            <label className={labelCls}>提问内容</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={3}
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder="例如：番茄叶片发黄是什么原因？"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void onSend()}
              disabled={chatLoading || !msg.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" /> {chatLoading ? '发送中…' : '发送'}
            </button>
            <button
              type="button"
              onClick={() => window.alert('语音输入即将开放')}
              className="bg-slate-100 hover:bg-slate-200 text-slate-500 px-4 py-2 rounded-lg text-sm font-bold transition-colors inline-flex items-center gap-1.5"
              title="语音输入即将开放"
            >
              <Mic className="w-3.5 h-3.5" /> 语音
            </button>
          </div>
          {chatErr && <div className="text-sm text-rose-500 font-bold">{chatErr}</div>}
          {answer && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-800 whitespace-pre-wrap">
              {answer}
            </div>
          )}
        </section>

        {/* B. 病害诊断 */}
        <section className="border border-slate-200 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-emerald-600" /> 病害诊断
            <span className="text-xs font-normal text-slate-400">（需配置视觉模型）</span>
          </h4>
          <div>
            <label className={labelCls}>选择图片</label>
            <input
              type="file"
              accept="image/*"
              onChange={onPickImage}
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 file:cursor-pointer cursor-pointer"
            />
            {imageName && (
              <p className="text-xs text-slate-500 mt-1.5 inline-flex items-center gap-1">
                <ImageIcon className="w-3 h-3" /> {imageName}
              </p>
            )}
          </div>
          <div>
            <label className={labelCls}>备注（可选）</label>
            <input
              className={inputCls}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：症状已持续 3 天"
            />
          </div>
          <button
            type="button"
            onClick={() => void onDiagnose()}
            disabled={diagLoading}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm inline-flex items-center gap-1.5"
          >
            <Stethoscope className="w-3.5 h-3.5" /> {diagLoading ? '诊断中…' : '开始诊断'}
          </button>
          {diagErr && <div className="text-sm text-rose-500 font-bold">{diagErr}</div>}
          {result && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-800 whitespace-pre-wrap">
              {result}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
