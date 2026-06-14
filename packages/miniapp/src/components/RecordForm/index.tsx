import { useState, useEffect } from 'react';
import { View, Text, Textarea, Input, Button, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { createFarmRecord, uploadImage, listSupplies, type Batch } from '../../api/farm';
import { FARM_ACTIONS } from '../../constants/actions';
import { FarmRecordSource } from '@nongchang/shared';
import type { SupplyItem } from '@nongchang/shared';
import Icon from '../Icon';
import './index.scss';

interface Props {
  batches: Batch[];
  onSaved: () => void;
}

export default function RecordForm({ batches, onSaved }: Props) {
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

  useEffect(() => {
    if (!batchId && batches[0]) setBatchId(batches[0].id);
  }, [batches, batchId]);

  useEffect(() => {
    listSupplies().then(setSupplies).catch(() => setSupplies([]));
  }, []);

  const selectedBatch = batches.find((b) => b.id === batchId);

  async function scan() {
    try {
      const r = await Taro.scanCode({});
      Taro.showToast({ title: `已扫码：${r.result.slice(0, 12)}`, icon: 'none' });
    } catch {
      // 用户取消扫码，忽略
    }
  }

  async function chooseAndUpload() {
    const r = await Taro.chooseImage({ count: 1, sizeType: ['compressed'] });
    try {
      const url = await uploadImage(r.tempFilePaths[0]);
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
        {batches.length === 0 && <Text className="rec-form__empty">暂无批次</Text>}
        {batches.map((b) => (
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
      <View className="rec-form__voice" onClick={() => Taro.showToast({ title: '语音录入即将开放', icon: 'none' })}>
        <Icon name="mic" size={20} color="#94a3b8" /><Text className="rec-form__voice-text">语音录入</Text>
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
}
