import { useState } from 'react';
import { View, Text, Textarea, Input, Button, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { aiChat, aiDiagnose, normalizeAiError } from '../../api/ai';
import { uploadImage } from '../../api/farm';
import './index.scss';

type Mode = 'chat' | 'diagnose' | null;

interface Props {
  mode: Mode;
  onClose: () => void;
}

export default function AiPanel({ mode, onClose }: Props) {
  // 对话
  const [msg, setMsg] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  // 诊断
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  if (!mode) return null;

  async function send() {
    const text = msg.trim();
    if (!text) return;
    setChatLoading(true);
    setAnswer(null);
    try {
      setAnswer(await aiChat(text));
    } catch (e) {
      Taro.showToast({ title: normalizeAiError(e), icon: 'none' });
    } finally {
      setChatLoading(false);
    }
  }

  async function pickImage() {
    let tempPath: string;
    try {
      const r = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['camera', 'album'] });
      tempPath = r.tempFilePaths[0];
    } catch {
      return; // 用户取消选图，静默忽略
    }
    try {
      setImageUrl(await uploadImage(tempPath));
    } catch (e: any) {
      Taro.showToast({ title: e.message || '上传失败', icon: 'none' });
    }
  }

  async function diagnose() {
    if (!imageUrl) {
      Taro.showToast({ title: '请先选择图片', icon: 'none' });
      return;
    }
    setDiagLoading(true);
    setResult(null);
    try {
      setResult(await aiDiagnose(imageUrl, note));
    } catch (e) {
      Taro.showToast({ title: normalizeAiError(e), icon: 'none' });
    } finally {
      setDiagLoading(false);
    }
  }

  return (
    <View className="ai-panel">
      <View className="ai-panel__mask" onClick={onClose} />
      <View className="ai-panel__sheet">
        <View className="ai-panel__head">
          <Text className="ai-panel__title">{mode === 'chat' ? 'AI 助手' : 'AI 病害诊断'}</Text>
          <Text className="ai-panel__close" onClick={onClose}>关闭</Text>
        </View>

        {mode === 'chat' && (
          <View>
            <Textarea className="ai-panel__textarea" value={msg} onInput={(e) => setMsg(e.detail.value)} placeholder="例如：番茄叶片发黄是什么原因？" />
            <Button className="ai-panel__btn" loading={chatLoading} onClick={send}>
              {chatLoading ? '分析中…' : '发送'}
            </Button>
            {answer && <View className="ai-panel__result"><Text>{answer}</Text></View>}
          </View>
        )}

        {mode === 'diagnose' && (
          <View>
            <View className="ai-panel__pick" onClick={pickImage}>
              {imageUrl ? (
                <Image className="ai-panel__preview" src={imageUrl} mode="aspectFill" />
              ) : (
                <Text className="ai-panel__pick-text">点击拍照 / 选择图片</Text>
              )}
            </View>
            <Input className="ai-panel__input" value={note} onInput={(e) => setNote(e.detail.value)} placeholder="备注（可选，如：症状已持续3天）" />
            <Button className="ai-panel__btn" loading={diagLoading} onClick={diagnose}>
              {diagLoading ? '识别中…' : '开始诊断'}
            </Button>
            {result && <View className="ai-panel__result"><Text>{result}</Text></View>}
          </View>
        )}
      </View>
    </View>
  );
}
