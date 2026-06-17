import { useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { getToken } from '../../store/auth';
import { listBatches, type Batch, type FarmRecord } from '../../api/farm';
import { listQuickTemplates } from '../../api/quickTemplate';
import { getBillingSummary } from '../../api/billing';
import { request } from '../../api/request';
import { sortByRecentDesc } from '../../utils/stats';
import Sensors from '../../components/Sensors';
import Icon from '../../components/Icon';
import RecordForm, { type RecordFormHandle } from '../../components/RecordForm';
import AiPanel from '../../components/AiPanel';
import type { QuickTemplateView } from '@nongchang/shared';
import './index.scss';

type AiMode = 'chat' | 'diagnose' | null;

const LOW_BALANCE = 100;

export default function Work() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [records, setRecords] = useState<FarmRecord[]>([]);
  const [templates, setTemplates] = useState<QuickTemplateView[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [aiMode, setAiMode] = useState<AiMode>(null);
  const [summary, setSummary] = useState<{ aiBalance: number; codeBalance: number } | null>(null);
  const formRef = useRef<RecordFormHandle>(null);
  // 上次成功加载时间戳:切 tab 回来若在节流窗口内则跳过全量重载。
  const lastLoadRef = useRef(0);
  const LOAD_TTL = 30000;

  useDidShow(() => {
    if (!getToken()) {
      Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    if (Date.now() - lastLoadRef.current < LOAD_TTL) return;
    void load();
  });

  // 真实网络状态:初始查询 + 订阅变化,只读展示(离线仅提示,不伪造请求行为)。
  useEffect(() => {
    Taro.getNetworkType()
      .then((r) => setIsOffline(r.networkType === 'none'))
      .catch(() => {});
    const onChange = (r: { isConnected: boolean }) => setIsOffline(!r.isConnected);
    Taro.onNetworkStatusChange(onChange);
    return () => Taro.offNetworkStatusChange(onChange);
  }, []);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      // /farm-records 返回分页对象 {items,total,page,pageSize},取 items 列表
      const [bs, recsPage] = await Promise.all([
        listBatches(),
        request<{ items: FarmRecord[] }>({ url: '/farm-records' }),
      ]);
      setBatches(bs);
      setRecords(sortByRecentDesc(recsPage.items).slice(0, 5));
      lastLoadRef.current = Date.now();
    } catch (e: any) {
      setErr(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
    // 模板失败不影响主流程
    listQuickTemplates().then(setTemplates).catch(() => setTemplates([]));
    // 额度失败不影响主流程
    getBillingSummary()
      .then((s) => setSummary({ aiBalance: s.aiBalance, codeBalance: s.codeBalance }))
      .catch(() => {});
  }

  const subtitle = batches[0]?.cropName
    ? `基地 · ${batches[0].cropName}种植组`
    : '基地 A区 · 白芍种植组';

  const comingSoon = (title: string) => Taro.showToast({ title, icon: 'none' });

  function openBatch(b: Batch) {
    const q = `id=${b.id}&cropName=${encodeURIComponent(b.cropName)}&batchNo=${encodeURIComponent(b.batchNo)}`;
    Taro.navigateTo({ url: `/pages/batch/index?${q}` });
  }

  return (
    <View className="work">
      <View className="work__header">
        <View className="work__header-row">
          <View>
            <Text className="work__title">芍药工作台</Text>
            <Text className="work__subtitle">{subtitle}</Text>
          </View>
          <View className="work__net">
            <Icon name="wifi" color="#fff" size={22} />
            <Text className="work__net-text">{isOffline ? '离线' : '在线'}</Text>
          </View>
        </View>
        {summary && (
          <View className="work__balance">
            <Text
              className={`work__balance-text${
                summary.aiBalance < LOW_BALANCE || summary.codeBalance < LOW_BALANCE
                  ? ' work__balance-text--low'
                  : ''
              }`}
            >
              AI 算力:{summary.aiBalance} 次 · 二维码:{summary.codeBalance} 个
              {summary.aiBalance < LOW_BALANCE || summary.codeBalance < LOW_BALANCE
                ? ' · 余额偏低'
                : ''}
            </Text>
          </View>
        )}
      </View>

      <View className="work__body">
        <Sensors />

        <View className="work__card">
          <Text className="work__section-title">我的批次</Text>
          {batches.length === 0 ? (
            <Text className="work__hint">暂无批次</Text>
          ) : (
            <ScrollView scrollX className="work__batches">
              {batches.map((b) => (
                <View className="work__batch" key={b.id} onClick={() => openBatch(b)}>
                  <Text className="work__batch-no">{b.batchNo}</Text>
                  <Text className="work__batch-crop">{b.cropName}</Text>
                  <Text className="work__batch-arrow">查看详情 ›</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

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
          <View
            className={`work__quick-item${summary && summary.aiBalance <= 0 ? ' work__quick-item--disabled' : ''}`}
            onClick={() => {
              if (summary && summary.aiBalance <= 0) {
                Taro.showToast({ title: 'AI 算力不足,请联系管理员', icon: 'none' });
                return;
              }
              setAiMode('chat');
            }}
          >
            <Icon name="sparkles" size={22} /><Text className="work__quick-text">AI 助手</Text>
          </View>
          <View
            className={`work__quick-item${summary && summary.aiBalance <= 0 ? ' work__quick-item--disabled' : ''}`}
            onClick={() => {
              if (summary && summary.aiBalance <= 0) {
                Taro.showToast({ title: 'AI 算力不足,请联系管理员', icon: 'none' });
                return;
              }
              setAiMode('diagnose');
            }}
          >
            <Icon name="camera" size={22} /><Text className="work__quick-text">AI 诊断</Text>
          </View>
          <View className="work__quick-item work__quick-item--reserved" onClick={() => comingSoon('区块链定位即将开放')}>
            <Icon name="trace" size={22} color="#94a3b8" /><Text className="work__quick-text">区块链定位</Text>
          </View>
          {templates.map((t) => (
            <View className="work__quick-item" key={t.id} onClick={() => formRef.current?.applyTemplate(t)}>
              <Text className="work__quick-text">{t.name}</Text>
            </View>
          ))}
        </ScrollView>

        <RecordForm ref={formRef} batches={batches} onSaved={() => void load()} />
      </View>

      <AiPanel mode={aiMode} onClose={() => setAiMode(null)} />
    </View>
  );
}
