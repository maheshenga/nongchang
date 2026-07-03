import { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { getToken } from '../../store/auth';
import { listBatches, type Batch, type FarmRecord } from '../../api/farm';
import { listQuickTemplates } from '../../api/quickTemplate';
import { getBillingSummary } from '../../api/billing';
import { request } from '../../api/request';
import { sortByRecentDesc } from '../../utils/stats';
import Icon from '../../components/Icon';
import RecordForm, { type RecordFormHandle } from '../../components/RecordForm';
import AiPanel from '../../components/AiPanel';
import WorkBatches from './components/WorkBatches';
import WorkRecords from './components/WorkRecords';
import WorkQuickActions from './components/WorkQuickActions';
import WorkSkeleton from './components/WorkSkeleton';
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
  const balanceLow = !!summary && (summary.aiBalance < LOW_BALANCE || summary.codeBalance < LOW_BALANCE);

  const handleOpenForm = useCallback((tpl: QuickTemplateView | null) => {
    if (!tpl) return;
    formRef.current?.applyTemplate(tpl);
  }, []);

  return (
    <View className="work">
      <View className="work__header">
        <View className="work__header-row">
          <View>
            <Text className="work__eyebrow">FIELD OPS</Text>
            <Text className="work__title">芍药工作台</Text>
            <Text className="work__subtitle">{subtitle}</Text>
          </View>
          <View className={`work__net ${isOffline ? 'work__net--off' : ''}`}>
            <Icon name="wifi" color="#fff" size={22} />
            <Text className="work__net-text">{isOffline ? '离线' : '在线'}</Text>
          </View>
        </View>
        {summary && (
          <View className={`work__balance ${balanceLow ? 'work__balance--low' : ''}`}>
            <View className="work__balance-item">
              <Text className="work__balance-num">{summary.aiBalance}</Text>
              <Text className="work__balance-label">AI 算力</Text>
            </View>
            <View className="work__balance-line" />
            <View className="work__balance-item">
              <Text className="work__balance-num">{summary.codeBalance}</Text>
              <Text className="work__balance-label">二维码</Text>
            </View>
            <Text className="work__balance-state">{balanceLow ? '余额偏低' : '额度正常'}</Text>
          </View>
        )}
      </View>

      <View className="work__body">
        {loading && batches.length === 0 ? (
          <WorkSkeleton />
        ) : (
          <>
            <WorkBatches batches={batches} />
            <WorkRecords records={records} err={err} />
            <WorkQuickActions
              templates={templates}
              aiBalance={summary?.aiBalance ?? null}
              onOpenAi={setAiMode}
              onOpenForm={handleOpenForm}
            />
          </>
        )}

        <RecordForm ref={formRef} batches={batches} onSaved={() => void load()} />
      </View>

      <AiPanel mode={aiMode} onClose={() => setAiMode(null)} />
    </View>
  );
}
