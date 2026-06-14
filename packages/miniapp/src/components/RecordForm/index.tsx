import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, Text, Textarea, Input, Button, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { createFarmRecord, uploadImage, listSupplies, findBatchByCode, type Batch } from '../../api/farm';
import { transcribeVoice, normalizeAiError } from '../../api/ai';
import { FARM_ACTIONS } from '../../constants/actions';
import { FarmRecordSource } from '@nongchang/shared';
import type { SupplyItem, QuickTemplateView } from '@nongchang/shared';
import Icon from '../Icon';
import './index.scss';

interface Props {
  batches: Batch[];
  onSaved: () => void;
}

export interface RecordFormHandle {
  applyTemplate: (t: QuickTemplateView) => void;
}

const RecordForm = forwardRef<RecordFormHandle, Props>(function RecordForm({ batches, onSaved }, ref) {
  const [batchId, setBatchId] = useState('');
  const [action, setAction] = useState('');
  const [note, setNote] = useState('');
  const [cost, setCost] = useState('');
  const [labor, setLabor] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [supplies, setSupplies] = useState<SupplyItem[]>([]);
  const [supplyId, setSupplyId] = useState('');
  const [supplyAmount, setSupplyAmount] = useState('');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  // 扫码定位到、但 props.batches 未包含的批次(范围内补充)。
  const [scannedBatches, setScannedBatches] = useState<Batch[]>([]);
  const recorderRef = useRef<ReturnType<typeof Taro.getRecorderManager> | null>(null);

  // 父组件(工作台)点击快捷模板时回填表单。
  useImperativeHandle(ref, () => ({
    applyTemplate(t: QuickTemplateView) {
      setAction(t.action);
      setNote(t.note ?? '');
      setCost(t.cost != null ? String(t.cost) : '');
      setLabor(t.labor != null ? String(t.labor) : '');
      Taro.showToast({ title: `已套用:${t.name}`, icon: 'none' });
    },
  }));

  useEffect(() => {
    if (!batchId && batches[0]) setBatchId(batches[0].id);
  }, [batches, batchId]);


  useEffect(() => {
    listSupplies().then(setSupplies).catch(() => setSupplies([]));
  }, []);

  // 录音管理器:停止后把音频上传后端转写,结果追加到「农事实录」。
  useEffect(() => {
    const rec = Taro.getRecorderManager();
    recorderRef.current = rec;
    rec.onStart(() => setRecording(true));
    rec.onError(() => {
      setRecording(false);
      Taro.showToast({ title: '录音失败', icon: 'none' });
    });
    rec.onStop(async (res: { tempFilePath: string }) => {
      setRecording(false);
      if (!res?.tempFilePath) return;
      setTranscribing(true);
      try {
        const text = await transcribeVoice(res.tempFilePath);
        if (text) setNote((prev) => (prev ? prev + ' ' + text : text));
        else Taro.showToast({ title: '未识别到语音', icon: 'none' });
      } catch (e) {
        Taro.showToast({ title: normalizeAiError(e), icon: 'none' });
      } finally {
        setTranscribing(false);
      }
    });
  }, []);

  function toggleVoice() {
    if (transcribing) return;
    const rec = recorderRef.current;
    if (!rec) return;
    if (recording) {
      rec.stop();
    } else {
      rec.start({ format: 'PCM', sampleRate: 16000, numberOfChannels: 1, duration: 60000 });
    }
  }

  // props 批次 + 扫码补充批次,去重。
  const allBatches = [...batches, ...scannedBatches.filter((s) => !batches.some((b) => b.id === s.id))];
  const selectedBatch = allBatches.find((b) => b.id === batchId);

  async function scan() {
    let result: string;
    try {
      const r = await Taro.scanCode({});
      result = r.result;
    } catch {
      return; // 用户取消扫码,忽略
    }
    // 兼容包装上印的溯源页 URL(形如 .../#/trace/CODE),提取末段溯源码。
    const code = result.includes('/trace/') ? result.split('/trace/').pop()!.split(/[?#]/)[0] : result.trim();
    if (!code) {
      Taro.showToast({ title: '无法识别该码', icon: 'none' });
      return;
    }
    try {
      const batch = await findBatchByCode(code);
      setScannedBatches((prev) => (prev.some((b) => b.id === batch.id) ? prev : [...prev, batch]));
      setBatchId(batch.id);
      Taro.showToast({ title: `已定位批次:${batch.batchNo}`, icon: 'none' });
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '未找到对应批次', icon: 'none' });
    }
  }

  async function chooseAndUpload() {
    let tempPath: string;
    try {
      const r = await Taro.chooseImage({ count: 1, sizeType: ['compressed'] });
      tempPath = r.tempFilePaths[0];
    } catch {
      return; // 用户取消选图，静默忽略
    }
    try {
      const url = await uploadImage(tempPath);
      setImages((prev) => [...prev, url]);
    } catch (e: any) {
      Taro.showToast({ title: e.message || '上传失败', icon: 'none' });
    }
  }

  async function submit() {
    if (!selectedBatch) {
      Taro.showToast({ title: '请选择批次', icon: 'none' });
      return;
    }
    if (!action) {
      Taro.showToast({ title: '请选择农事动作', icon: 'none' });
      return;
    }
    const detail: Record<string, unknown> = {};
    if (note) detail.note = note;
    if (cost) detail.cost = Number(cost) || 0;
    if (labor) detail.labor = Number(labor) || 0;
    setSubmitting(true);
    try {
      await createFarmRecord({
        batchId: selectedBatch.id,
        fieldId: selectedBatch.fieldId,
        action,
        detail: Object.keys(detail).length ? detail : undefined,
        images: images.length ? images : undefined,
        recordedAt: new Date().toISOString(),
        source: FarmRecordSource.MINIAPP,
        ...(supplyId ? { supplyId, supplyAmount: Number(supplyAmount) || 0 } : {}),
      });
      Taro.showToast({ title: '已提交', icon: 'success' });
      setNote(''); setCost(''); setLabor(''); setImages([]);
      setSupplyId(''); setSupplyAmount(''); setAction('');
      onSaved();
    } catch (e: any) {
      Taro.showToast({ title: e.message || '提交失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="rec-form">
      <Text className="rec-form__title">上报流程 · 记一笔</Text>

      <Text className="rec-form__label">选择批次</Text>
      <View className="rec-form__chips">
        {allBatches.length === 0 && <Text className="rec-form__empty">暂无批次</Text>}
        {allBatches.map((b) => (
          <View
            key={b.id}
            className={`rec-form__chip ${batchId === b.id ? 'rec-form__chip--on' : ''}`}
            onClick={() => setBatchId(b.id)}
          >
            <Text>{b.batchNo}</Text>
          </View>
        ))}
      </View>
      <View className="rec-form__scan" onClick={scan}>
        <Icon name="trace" size={20} /><Text className="rec-form__scan-text">扫描批次码</Text>
      </View>

      <View className="rec-form__row">
        <View className="rec-form__col">
          <Text className="rec-form__label">物料成本(元)</Text>
          <Input className="rec-form__input" type="number" value={cost} onInput={(e) => setCost(e.detail.value)} placeholder="0" />
        </View>
        <View className="rec-form__col">
          <Text className="rec-form__label">耗用工时(天)</Text>
          <Input className="rec-form__input" type="number" value={labor} onInput={(e) => setLabor(e.detail.value)} placeholder="0" />
        </View>
      </View>

      <Text className="rec-form__label">农事实录</Text>
      <Textarea className="rec-form__textarea" value={note} onInput={(e) => setNote(e.detail.value)} placeholder="记录本次农事操作…" />
      <View className="rec-form__tags">
        {FARM_ACTIONS.map((a) => (
          <View key={a} className={`rec-form__tag ${action === a ? 'rec-form__tag--on' : ''}`} onClick={() => setAction(a)}>
            <Text>{a}</Text>
          </View>
        ))}
      </View>
      <View className={`rec-form__voice ${recording ? 'rec-form__voice--on' : ''}`} onClick={toggleVoice}>
        <Icon name="mic" size={20} color={recording ? '#ef4444' : '#94a3b8'} />
        <Text className="rec-form__voice-text">
          {transcribing ? '识别中…' : recording ? '点击结束录音' : '语音录入'}
        </Text>
      </View>

      <Text className="rec-form__label">现场图片证明</Text>
      <View className="rec-form__imgs">
        {images.map((url) => (
          <Image key={url} className="rec-form__img" src={url} mode="aspectFill" />
        ))}
        <View className="rec-form__add" onClick={chooseAndUpload}>
          <Icon name="camera" size={28} />
        </View>
      </View>

      <Button className="rec-form__submit" loading={submitting} onClick={submit}>
        提交上报并上链
      </Button>
    </View>
  );
});

export default RecordForm;
