import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, Text, Textarea, Input, Button, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { createFarmRecord, uploadImage, listSupplies, findBatchByCode, type Batch } from '../../api/farm';
import { transcribeVoice, normalizeAiError, aiAdvice } from '../../api/ai';
import { FARM_ACTIONS } from '../../constants/actions';
import { FarmRecordSource } from '@nongchang/shared';
import type { QuickTemplateView, SupplyItem } from '@nongchang/shared';
import { buildRecordReceipt, isMeaningfulRecordDraft, parseRecordDraft, RECORD_DRAFT_KEY, type RecordDraft, type RecordReceiptView } from './draft';
import { buildFarmRecordPayload, getSupplyAmountError, getSupplySelectionUpdate } from './payload';
import RecordReceipt from './RecordReceipt';
import RecordSubmissionReview from './RecordSubmissionReview';
import Icon from '../Icon';
import './index.scss';

type DraftAlertApi = {
  enableAlertBeforeUnload?: (options: { message: string }) => unknown;
  disableAlertBeforeUnload?: () => unknown;
};

const draftAlertApi = Taro as typeof Taro & DraftAlertApi;

interface Props {
  batches: Batch[];
  isOffline: boolean;
  onSaved: () => void;
}

export interface RecordFormHandle {
  applyTemplate: (t: QuickTemplateView) => void;
  openManual: () => void;
  openLocation: () => void;
}

const RecordForm = forwardRef<RecordFormHandle, Props>(function RecordForm({ batches, isOffline, onSaved }, ref) {
  const [batchId, setBatchId] = useState('');
  const [action, setAction] = useState('');
  const [note, setNote] = useState('');
  const [cost, setCost] = useState('');
  const [labor, setLabor] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [supplies, setSupplies] = useState<SupplyItem[]>([]);
  const [suppliesStatus, setSuppliesStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [supplyId, setSupplyId] = useState('');
  const [supplyAmount, setSupplyAmount] = useState('');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [advising, setAdvising] = useState(false);
  // 作业地点经纬度(可选):提交时写入 location 字段供溯源核验。
  const [location, setLocation] = useState('');
  const [locating, setLocating] = useState(false);
  const [noteFocused, setNoteFocused] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [reviewPayload, setReviewPayload] = useState<ReturnType<typeof buildFarmRecordPayload> | null>(null);
  const [receipt, setReceipt] = useState<RecordReceiptView | null>(null);
  // 扫码定位到、但 props.batches 未包含的批次(范围内补充)。
  const [scannedBatches, setScannedBatches] = useState<Batch[]>([]);
  const recorderRef = useRef<ReturnType<typeof Taro.getRecorderManager> | null>(null);
  const offlineRef = useRef(isOffline);

  useEffect(() => {
    offlineRef.current = isOffline;
  }, [isOffline]);

  useEffect(() => {
    const draft = parseRecordDraft(Taro.getStorageSync(RECORD_DRAFT_KEY));
    if (draft) {
      setBatchId(draft.batchId);
      setAction(draft.action);
      setNote(draft.note);
      setCost(draft.cost);
      setLabor(draft.labor);
      setImages(draft.images);
      setLocation(draft.location);
      setSupplyId(draft.supplyId);
      setSupplyAmount(draft.supplyAmount);
    }
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (!draftReady || receipt) return;
    const draft: RecordDraft = { batchId, action, note, cost, labor, images, location, supplyId, supplyAmount };
    if (isMeaningfulRecordDraft(draft)) Taro.setStorageSync(RECORD_DRAFT_KEY, draft);
    else Taro.removeStorageSync(RECORD_DRAFT_KEY);
  }, [action, batchId, cost, draftReady, images, labor, location, note, receipt, supplyAmount, supplyId]);

  useEffect(() => {
    if (!draftReady) return;
    const draft: RecordDraft = { batchId, action, note, cost, labor, images, location, supplyId, supplyAmount };
    const meaningful = isMeaningfulRecordDraft(draft);
    if (meaningful) draftAlertApi.enableAlertBeforeUnload?.({ message: '当前农事草稿尚未提交，确认离开？' });
    else draftAlertApi.disableAlertBeforeUnload?.();
    return () => { if (meaningful) draftAlertApi.disableAlertBeforeUnload?.(); };
  }, [action, batchId, cost, draftReady, images, labor, location, note, supplyAmount, supplyId]);

  // 父组件(工作台)点击快捷模板时回填表单。
  useImperativeHandle(ref, () => ({
    applyTemplate(t: QuickTemplateView) {
      setReceipt(null);
      setReviewPayload(null);
      setAction(t.action);
      setNote(t.note ?? '');
      setCost(t.cost != null ? String(t.cost) : '');
      setLabor(t.labor != null ? String(t.labor) : '');
      Taro.showToast({ title: `已套用:${t.name}`, icon: 'none' });
      void Taro.pageScrollTo({ selector: '#record-form-actions', duration: 250 });
      setNoteFocused(true);
    },
    openManual() {
      setReceipt(null);
      setReviewPayload(null);
      void Taro.pageScrollTo({ selector: '#record-form-actions', duration: 250 });
      setNoteFocused(true);
    },
    openLocation() {
      setReceipt(null);
      setReviewPayload(null);
      void Taro.pageScrollTo({ selector: '#record-form-location', duration: 250 });
      void captureLocation();
    },
  }));

  useEffect(() => {
    if (!batchId && batches[0]) setBatchId(batches[0].id);
  }, [batches, batchId]);

  useEffect(() => {
    setSuppliesStatus('loading');
    listSupplies()
      .then((rows) => {
        setSupplies(rows);
        setSuppliesStatus('ready');
      })
      .catch(() => {
        setSupplies([]);
        setSuppliesStatus('error');
      });
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
      if (offlineRef.current) {
        Taro.showToast({ title: '离线状态下无法转写语音，请恢复网络后重试', icon: 'none' });
        return;
      }
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
      if (isOffline) {
        Taro.showToast({ title: '离线状态下无法转写语音，请恢复网络后重试', icon: 'none' });
        return;
      }
      rec.start({ format: 'PCM', sampleRate: 16000, numberOfChannels: 1, duration: 60000 });
    }
  }

  // props 批次 + 扫码补充批次,去重。
  const allBatches = [...batches, ...scannedBatches.filter((s) => !batches.some((b) => b.id === s.id))];
  const selectedBatch = allBatches.find((b) => b.id === batchId);
  const selectedSupply = supplies.find((s) => s.id === supplyId);
  const supplyHint =
    suppliesStatus === 'loading'
      ? '物料加载中…'
      : suppliesStatus === 'error'
        ? '物料加载失败,本次可先不关联物料'
        : supplies.length === 0
          ? '暂无可用物料'
          : '';

  function toggleSupply(nextSupplyId: string) {
    const next = getSupplySelectionUpdate(supplyId, nextSupplyId);
    setSupplyId(next.supplyId);
    setSupplyAmount(next.supplyAmount);
  }

  async function getAdvice() {
    if (!selectedBatch) { Taro.showToast({ title: '请先选择批次', icon: 'none' }); return; }
    if (isOffline) { Taro.showToast({ title: '离线状态下无法使用 AI，请恢复网络后重试', icon: 'none' }); return; }
    setAdvising(true);
    try {
      const text = await aiAdvice({ batchId: selectedBatch.id });
      if (text) setNote((prev) => (prev ? prev + '\n【AI建议】' + text : '【AI建议】' + text));
    } catch (e) {
      Taro.showToast({ title: normalizeAiError(e), icon: 'none' });
    } finally {
      setAdvising(false);
    }
  }

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
    if (uploading) return;
    if (isOffline) {
      Taro.showToast({ title: '离线状态下无法上传图片，请恢复网络后重试', icon: 'none' });
      return;
    }
    let tempPath: string;
    try {
      const r = await Taro.chooseImage({ count: 1, sizeType: ['compressed'] });
      tempPath = r.tempFilePaths[0];
    } catch {
      return; // 用户取消选图，静默忽略
    }
    setUploading(true);
    try {
      const url = await uploadImage(tempPath, 'farm-record');
      setImages((prev) => [...prev, url]);
    } catch (e: any) {
      Taro.showToast({ title: e.message || '上传失败', icon: 'none' });
    } finally {
      setUploading(false);
    }
  }

  async function captureLocation() {
    if (locating) return;
    if (location) { setLocation(''); return; } // 再次点击清除
    setLocating(true);
    try {
      // 统一存 WGS84(与 DB/天地图一致);渲染到原生地图时再转 GCJ-02
      const r = await Taro.getLocation({ type: 'wgs84' });
      setLocation(`${r.longitude.toFixed(6)},${r.latitude.toFixed(6)}`);
      Taro.showToast({ title: '已记录当前位置', icon: 'none' });
    } catch {
      Taro.showToast({ title: '定位失败,请检查授权', icon: 'none' });
    } finally {
      setLocating(false);
    }
  }

  function prepareSubmit() {
    if (!selectedBatch) {
      Taro.showToast({ title: '请选择批次', icon: 'none' });
      return;
    }
    if (!action) {
      Taro.showToast({ title: '请选择农事动作', icon: 'none' });
      return;
    }
    const supplyError = getSupplyAmountError(supplyId, supplyAmount);
    if (supplyError) {
      Taro.showToast({ title: supplyError, icon: 'none' });
      return;
    }
    setReviewPayload(buildFarmRecordPayload({
      batch: selectedBatch,
      action,
      note,
      cost,
      labor,
      images,
      location,
      recordedAt: new Date().toISOString(),
      source: FarmRecordSource.MINIAPP,
      supplyId,
      supplyAmount,
    }));
  }

  function resetInputs() {
    setNote('');
    setCost('');
    setLabor('');
    setImages([]);
    setSupplyId('');
    setSupplyAmount('');
    setAction('');
    setLocation('');
  }

  async function confirmSubmit() {
    if (!reviewPayload || !selectedBatch) return;
    if (isOffline) {
      Taro.showToast({ title: '离线状态下无法提交，草稿已保存在本机', icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      const created = await createFarmRecord(reviewPayload);
      setReceipt(buildRecordReceipt(created, selectedBatch, action));
      setReviewPayload(null);
      resetInputs();
      Taro.removeStorageSync(RECORD_DRAFT_KEY);
      draftAlertApi.disableAlertBeforeUnload?.();
      onSaved();
    } catch (e: any) {
      Taro.showToast({ title: e.message || '提交失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  }

  function viewReceipt() {
    if (!receipt) return;
    void Taro.navigateTo({
      url: `/pages/batch/index?id=${encodeURIComponent(receipt.batchId)}&batchNo=${encodeURIComponent(receipt.batchNo)}&cropName=${encodeURIComponent(receipt.cropName)}`,
    });
  }

  function createAnother() {
    setReceipt(null);
    setNoteFocused(true);
    setTimeout(() => { void Taro.pageScrollTo({ selector: '#record-form-actions', duration: 250 }); }, 0);
  }

  if (receipt) {
    return <RecordReceipt receipt={receipt} onView={viewReceipt} onAnother={createAnother} />;
  }

  if (reviewPayload && selectedBatch) {
    return (
      <RecordSubmissionReview
        batch={selectedBatch}
        action={action}
        note={note}
        cost={cost}
        labor={labor}
        evidenceCount={images.length}
        location={location}
        supply={selectedSupply}
        supplyAmount={supplyAmount}
        offline={isOffline}
        submitting={submitting}
        onBack={() => setReviewPayload(null)}
        onConfirm={() => void confirmSubmit()}
      />
    );
  }

  return (
    <View id="record-form" className="rec-form">
      <View className="rec-form__head">
        <View>
          <Text className="rec-form__eyebrow">田间作业</Text>
          <Text className="rec-form__title">快速记一笔</Text>
        </View>
        <Text className="rec-form__badge">{selectedBatch ? selectedBatch.cropName : '待选批次'}</Text>
      </View>

      <View className="rec-form__section">
        <View className="rec-form__section-head">
          <Text className="rec-form__section-title">选择作业批次</Text>
          <Text className="rec-form__section-sub">扫码或直接点选</Text>
        </View>
        <View className="rec-form__chips">
          {allBatches.length === 0 && <Text className="rec-form__empty">暂无批次</Text>}
          {allBatches.map((b) => (
            <View
              key={b.id}
              className={`rec-form__chip ${batchId === b.id ? 'rec-form__chip--on' : ''}`}
              onClick={() => setBatchId(b.id)}
            >
              <Text className="rec-form__chip-main">{b.batchNo}</Text>
              <Text className="rec-form__chip-sub">{b.cropName}</Text>
            </View>
          ))}
        </View>
        <View className="rec-form__action-grid">
          <View className="rec-form__action-row" onClick={scan}>
            <Icon name="trace" size={20} /><Text className="rec-form__action-text">扫描批次码</Text>
          </View>
          <View className="rec-form__action-row" onClick={getAdvice}>
            <Icon name="sparkles" size={20} /><Text className="rec-form__action-text">{advising ? 'AI 分析中…' : 'AI 农事建议'}</Text>
          </View>
        </View>
        <View id="record-form-location" className={`rec-form__action-row rec-form__action-row--wide ${location ? 'rec-form__action-row--on' : ''}`} onClick={captureLocation}>
          <Icon name="trace" size={20} />
          <Text className="rec-form__action-text">
            {locating ? '定位中…' : location ? `已记录位置:${location}(点击清除)` : '记录作业地点'}
          </Text>
        </View>
      </View>

      <View className="rec-form__section">
        <View className="rec-form__section-head">
          <Text className="rec-form__section-title">投入与物料</Text>
          <Text className="rec-form__section-sub">可选填,用于核算</Text>
        </View>
        <View className="rec-form__row">
          <View className="rec-form__col">
            <Text className="rec-form__label">投入成本(元)</Text>
            <Input className="rec-form__input" type="number" value={cost} onInput={(e) => setCost(e.detail.value)} placeholder="0" />
          </View>
          <View className="rec-form__col">
            <Text className="rec-form__label">耗用工时(天)</Text>
            <Input className="rec-form__input" type="number" value={labor} onInput={(e) => setLabor(e.detail.value)} placeholder="0" />
          </View>
        </View>

        <Text className="rec-form__label">关联物料与用量(可选)</Text>
        <View className="rec-form__chips rec-form__chips--supply">
          {supplyHint && <Text className={`rec-form__empty ${suppliesStatus === 'error' ? 'rec-form__empty--err' : ''}`}>{supplyHint}</Text>}
          {supplies.map((s) => (
            <View
              key={s.id}
              className={`rec-form__chip rec-form__supply-chip ${supplyId === s.id ? 'rec-form__chip--on' : ''}`}
              onClick={() => toggleSupply(s.id)}
            >
              <Text className="rec-form__supply-name">{s.name}</Text>
              <Text className="rec-form__supply-meta">余 {s.remaining}{s.unit}</Text>
            </View>
          ))}
        </View>
        <View className="rec-form__supply-row">
          <Input
            className="rec-form__input rec-form__supply-input"
            type="digit"
            disabled={!supplyId}
            value={supplyAmount}
            onInput={(e) => setSupplyAmount(e.detail.value)}
            placeholder={selectedSupply ? `用量(${selectedSupply.unit})` : '先选择物料'}
          />
          {selectedSupply && <Text className="rec-form__supply-unit">{selectedSupply.unit}</Text>}
        </View>
      </View>

      <View id="record-form-actions" className="rec-form__section">
        <View className="rec-form__section-head">
          <Text className="rec-form__section-title">作业实录</Text>
          <Text className="rec-form__section-sub">先选动作再补充说明</Text>
        </View>
        <View className="rec-form__tags">
          {FARM_ACTIONS.map((a) => (
            <View key={a} className={`rec-form__tag ${action === a ? 'rec-form__tag--on' : ''}`} onClick={() => setAction(a)}>
              <Text>{a}</Text>
            </View>
          ))}
        </View>
        <Textarea className="rec-form__textarea" value={note} focus={noteFocused} onBlur={() => setNoteFocused(false)} onInput={(e) => setNote(e.detail.value)} placeholder="记录本次农事操作…" />
        <View className={`rec-form__voice ${recording ? 'rec-form__voice--on' : ''}`} onClick={toggleVoice}>
          <Icon name="mic" size={20} color={recording ? '#ef4444' : '#94a3b8'} />
          <Text className="rec-form__voice-text">
            {transcribing ? '识别中…' : recording ? '点击结束录音' : '语音录入'}
          </Text>
        </View>
      </View>

      <View className="rec-form__section">
        <View className="rec-form__section-head">
          <Text className="rec-form__section-title">现场凭证</Text>
          <Text className="rec-form__section-sub">图片会进入溯源链路</Text>
        </View>
        <View className="rec-form__imgs">
          {images.map((url) => (
            <Image key={url} className="rec-form__img" src={url} mode="aspectFill" />
          ))}
          <View className="rec-form__add" onClick={chooseAndUpload}>
            {uploading ? <Text className="rec-form__add-loading">上传中…</Text> : <Icon name="camera" size={28} />}
          </View>
        </View>
      </View>

      <Button className="rec-form__submit" loading={submitting} onClick={prepareSubmit}>
        核对并提交
      </Button>
    </View>
  );
});

export default RecordForm;
