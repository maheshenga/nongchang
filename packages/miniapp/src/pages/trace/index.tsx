import { useState } from 'react';
import { View, Text, ScrollView, Canvas } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { getToken } from '../../store/auth';
import { listBatches, type Batch } from '../../api/farm';
import { listTraceEvents, type TraceEvent } from '../../api/trace';
import TraceTimeline from '../../components/TraceTimeline';
import './index.scss';

export default function Trace() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useDidShow(() => {
    if (!getToken()) {
      Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    void initBatches();
  });

  async function initBatches() {
    try {
      const bs = await listBatches();
      setBatches(bs);
      if (bs[0] && !selectedId) {
        setSelectedId(bs[0].id);
        void loadEvents(bs[0].id);
      }
    } catch (e: any) {
      setErr(e?.message || '加载批次失败');
    }
  }

  async function loadEvents(batchId: string) {
    setSelectedId(batchId);
    setLoading(true);
    setErr(null);
    try {
      setEvents(await listTraceEvents(batchId));
    } catch (e: any) {
      setErr(e?.message || '加载溯源失败');
    } finally {
      setLoading(false);
    }
  }

  const selected = batches.find((b) => b.id === selectedId);

  async function genPoster() {
    if (!selected) {
      Taro.showToast({ title: '请先选择批次', icon: 'none' });
      return;
    }
    const ctx = Taro.createCanvasContext('poster');
    ctx.setFillStyle('#065f46');
    ctx.fillRect(0, 0, 300, 200);
    ctx.setFillStyle('#ffffff');
    ctx.setFontSize(18);
    ctx.fillText('芍药溯源证书', 20, 40);
    ctx.setFontSize(14);
    ctx.fillText(`批次：${selected.batchNo}`, 20, 80);
    ctx.fillText(`品种：${selected.cropName}`, 20, 110);
    ctx.fillText(`溯源节点：${events.length} 个`, 20, 140);
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
        <Text className="trace__title">近期溯源</Text>
        <Text className="trace__subtitle">选择批次查看全程溯源链路</Text>
      </View>

      <View className="trace__body">
        <ScrollView scrollX className="trace__chips">
          {batches.length === 0 && <Text className="trace__empty">暂无批次</Text>}
          {batches.map((b) => (
            <View
              key={b.id}
              className={`trace__chip ${selectedId === b.id ? 'trace__chip--on' : ''}`}
              onClick={() => void loadEvents(b.id)}
            >
              <Text className="trace__chip-no">{b.batchNo}</Text>
              <Text className="trace__chip-crop">{b.cropName}</Text>
            </View>
          ))}
        </ScrollView>

        {loading && <Text className="trace__hint">加载中…</Text>}
        {err && <Text className="trace__hint trace__hint--err">{err}</Text>}
        {!loading && !err && <TraceTimeline events={events} />}

        <View className="trace__chain">
          <View className="trace__chain-head">
            <Text className="trace__chain-title">区块链存证数据</Text>
            <Text className="trace__chain-badge">区块链接入中</Text>
          </View>
          <Text className="trace__chain-row">上链哈希　0x····（接入中）</Text>
          <Text className="trace__chain-row">质检存证　待接入</Text>
          <Text className="trace__chain-row">封箱时间　待接入</Text>
        </View>

        <View className="trace__poster-btn" onClick={genPoster}>
          <Text className="trace__poster-text">生成溯源海报</Text>
        </View>
        <Canvas canvasId="poster" className="trace__canvas" />
      </View>
    </View>
  );
}
