import { useState } from 'react';
import { View, Text, ScrollView, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { getToken } from '../../store/auth';
import { listBatches, type Batch, type FarmRecord } from '../../api/farm';
import { request } from '../../api/request';
import { sortByRecentDesc } from '../../utils/stats';
import Sensors from '../../components/Sensors';
import Icon from '../../components/Icon';
import './index.scss';

const QUICK = ['浇水', '施肥', '除草', '病虫防治'];

export default function Work() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [records, setRecords] = useState<FarmRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  useDidShow(() => {
    if (!getToken()) {
      Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    void load();
  });

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [bs, recs] = await Promise.all([
        listBatches(),
        request<FarmRecord[]>({ url: '/farm-records' }),
      ]);
      setBatches(bs);
      setRecords(sortByRecentDesc(recs).slice(0, 5));
    } catch (e: any) {
      setErr(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  const subtitle = batches[0]?.cropName
    ? `基地 · ${batches[0].cropName}种植组`
    : '基地 A区 · 白芍种植组';

  const comingSoon = (title: string) => Taro.showToast({ title, icon: 'none' });

  return (
    <View className="work">
      <View className="work__header">
        <View className="work__header-row">
          <View>
            <Text className="work__title">芍药工作台</Text>
            <Text className="work__subtitle">{subtitle}</Text>
          </View>
          <View className="work__net" onClick={() => setIsOffline((v) => !v)}>
            <Icon name="wifi" color="#fff" size={22} />
            <Text className="work__net-text">{isOffline ? '离线' : '在线'}</Text>
          </View>
        </View>
      </View>

      <View className="work__body">
        <Sensors />

        <View className="work__card">
          <Text className="work__section-title">近期农事</Text>
          {loading && <Text className="work__hint">加载中…</Text>}
          {err && <Text className="work__hint work__hint--err">{err}</Text>}
          {!loading && !err && records.length === 0 && (
            <Text className="work__hint">暂无农事记录</Text>
          )}
          {records.map((r) => (
            <View className="work__rec" key={r.id}>
              <View className="work__rec-top">
                <Text className="work__rec-action">{r.action}</Text>
                <Text className="work__rec-time">{r.recordedAt?.slice(0, 16).replace('T', ' ')}</Text>
              </View>
              {r.detail?.note ? (
                <Text className="work__rec-note">{String(r.detail.note)}</Text>
              ) : null}
              {r.images && r.images.length > 0 ? (
                <Image className="work__rec-img" src={r.images[0]} mode="aspectFill" />
              ) : null}
            </View>
          ))}
        </View>

        <ScrollView scrollX className="work__quick">
          <View className="work__quick-item" onClick={() => comingSoon('AI 助手即将开放')}>
            <Icon name="sparkles" size={22} /><Text className="work__quick-text">AI 助手</Text>
          </View>
          <View className="work__quick-item" onClick={() => comingSoon('AI 诊断即将开放')}>
            <Icon name="camera" size={22} /><Text className="work__quick-text">AI 诊断</Text>
          </View>
          <View className="work__quick-item work__quick-item--reserved" onClick={() => comingSoon('区块链定位即将开放')}>
            <Icon name="trace" size={22} color="#94a3b8" /><Text className="work__quick-text">区块链定位</Text>
          </View>
          {QUICK.map((q) => (
            <View className="work__quick-item" key={q} onClick={() => comingSoon(`已选模板：${q}`)}>
              <Text className="work__quick-text">{q}</Text>
            </View>
          ))}
        </ScrollView>

        <View id="record-anchor" />
      </View>
    </View>
  );
}
