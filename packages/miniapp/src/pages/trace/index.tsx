import { useRef, useState } from 'react';
import { Button, View, Text, ScrollView, Canvas } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { getToken } from '../../store/auth';
import { listBatches, type Batch } from '../../api/farm';
import { listTraceEvents, type TraceEvent } from '../../api/trace';
import TraceTimeline from '../../components/TraceTimeline';
import {
  beginTraceRequest,
  canRenderTraceResult,
  completeTraceRequest,
  createTraceViewState,
  failTraceRequest,
} from './state';
import './index.scss';

export default function Trace() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [traceState, setTraceState] = useState(createTraceViewState);
  const [batchError, setBatchError] = useState<string | null>(null);
  const epochRef = useRef(0);

  useDidShow(() => {
    if (!getToken()) {
      Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    void initBatches();
  });

  async function initBatches() {
    setBatchError(null);
    try {
      const bs = await listBatches();
      setBatches(bs);
      if (bs[0] && !traceState.selectedBatchId) {
        void loadEvents(bs[0].id);
      }
    } catch (e: any) {
      setBatchError(e?.message || '加载批次失败');
    }
  }

  async function loadEvents(batchId: string) {
    const epoch = ++epochRef.current;
    const token = { batchId, epoch };
    setTraceState((current) => beginTraceRequest(current, batchId, epoch).state);
    try {
      const events = await listTraceEvents(batchId);
      setTraceState((current) => completeTraceRequest(current, token, events));
    } catch (e: any) {
      setTraceState((current) => failTraceRequest(current, token, e?.message || '加载溯源失败'));
    }
  }

  const selected = batches.find((b) => b.id === traceState.selectedBatchId);
  const resultVisible = !!selected && canRenderTraceResult(traceState, selected.id);
  const visibleEvents: TraceEvent[] = resultVisible ? traceState.events : [];

  async function genPoster() {
    if (!selected) {
      Taro.showToast({ title: '请先选择批次', icon: 'none' });
      return;
    }
    if (!resultVisible) {
      Taro.showToast({ title: '溯源记录尚未加载完成', icon: 'none' });
      return;
    }
    const ctx = Taro.createCanvasContext('poster');
    ctx.setFillStyle('#065f46');
    ctx.fillRect(0, 0, 300, 200);
    ctx.setFillStyle('#ffffff');
    ctx.setFontSize(18);
    ctx.fillText(`${selected.cropName}溯源记录`, 20, 40);
    ctx.setFontSize(14);
    ctx.fillText(`批次：${selected.batchNo}`, 20, 80);
    ctx.fillText(`品种：${selected.cropName}`, 20, 110);
    ctx.fillText(`溯源节点：${visibleEvents.length} 个`, 20, 140);
    ctx.draw(false, () => {
      Taro.canvasToTempFilePath({
        canvasId: 'poster',
        success: (r) => {
          Taro.saveImageToPhotosAlbum({
            filePath: r.tempFilePath,
            success: () => Taro.showToast({ title: '已保存到相册', icon: 'success' }),
            fail: () => Taro.showToast({ title: '保存失败，请授权相册', icon: 'none' }),
          });
        },
        fail: () => Taro.showToast({ title: '海报生成失败', icon: 'none' }),
      });
    });
  }

  return (
    <View className="trace">
      <View className="trace__header">
        <Text className="trace__eyebrow">批次可信履历</Text>
        <Text className="trace__title">近期溯源</Text>
        <Text className="trace__subtitle">按批次查看农事、质检与流通节点</Text>
      </View>

      <View className="trace__body">
        <ScrollView scrollX className="trace__chips">
          {batches.length === 0 && <Text className="trace__empty">暂无批次</Text>}
          {batches.map((b) => (
            <Button
              key={b.id}
              className={`nc-button-reset trace__chip ${traceState.selectedBatchId === b.id ? 'trace__chip--on' : ''}`}
              aria-pressed={traceState.selectedBatchId === b.id}
              onClick={() => void loadEvents(b.id)}
            >
              <Text className="trace__chip-no">{b.batchNo}</Text>
              <Text className="trace__chip-crop">{b.cropName}</Text>
            </Button>
          ))}
        </ScrollView>

        <View className="trace__summary">
          <View>
            <Text className="trace__summary-label">当前批次</Text>
            <Text className="trace__summary-title">{selected ? selected.batchNo : '未选择批次'}</Text>
            <Text className="trace__summary-sub">{selected ? selected.cropName : '请先选择批次查看链路'}</Text>
          </View>
          <View className="trace__summary-count">
            <Text className="trace__summary-num">{resultVisible ? visibleEvents.length : '—'}</Text>
            <Text className="trace__summary-unit">节点</Text>
          </View>
        </View>

        {batchError && <Text className="trace__hint trace__hint--err">{batchError}</Text>}
        {traceState.status === 'loading' && <Text className="trace__hint">加载中…</Text>}
        {traceState.status === 'error' && <Text className="trace__hint trace__hint--err">{traceState.error}</Text>}
        {resultVisible && <TraceTimeline events={visibleEvents} />}

        {resultVisible && <View className="trace__chain">
          <View className="trace__chain-head">
            <Text className="trace__chain-title">当前公开记录</Text>
            <Text className="trace__chain-badge">来自真实接口</Text>
          </View>
          <View className="trace__chain-grid">
            <Text className="trace__chain-row">批次记录 {selected ? selected.batchNo : '未选择批次'}</Text>
            <Text className="trace__chain-row">溯源节点 {visibleEvents.length} 个</Text>
            <Text className="trace__chain-row">记录状态 {visibleEvents.length > 0 ? '已有公开节点' : '暂无公开节点'}</Text>
          </View>
        </View>}

        <Button
          className="nc-button-reset trace__poster-btn"
          disabled={!resultVisible}
          onClick={() => void genPoster()}
        >
          <Text className="trace__poster-text">生成溯源海报</Text>
        </Button>
        <Canvas canvasId="poster" className="trace__canvas" />
      </View>
    </View>
  );
}
