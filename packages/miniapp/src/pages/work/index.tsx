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
import DataState from '../../components/DataState';
import {
  errorResource,
  idleResource,
  loadingResource,
  successResource,
  type AsyncResource,
} from '../../components/DataState/model';
import {
  findIntentBatch,
  takePendingRecordIntent,
  type PendingRecordIntent,
} from './record-intent';
import './index.scss';

type AiMode = 'chat' | 'diagnose' | null;

const LOW_BALANCE = 100;

export default function Work() {
  const [batchResource, setBatchResource] = useState<AsyncResource<Batch[]>>(() => idleResource([]));
  const [recordResource, setRecordResource] = useState<AsyncResource<FarmRecord[]>>(() => idleResource([]));
  const [templateResource, setTemplateResource] = useState<AsyncResource<QuickTemplateView[]>>(() => idleResource([]));
  const [billingResource, setBillingResource] = useState<AsyncResource<{ aiBalance: number; codeBalance: number } | null>>(() => idleResource(null));
  const [isOffline, setIsOffline] = useState(false);
  const [aiMode, setAiMode] = useState<AiMode>(null);
  const [pendingRecordIntent, setPendingRecordIntent] = useState<PendingRecordIntent | null>(null);
  const formRef = useRef<RecordFormHandle>(null);
  // 上次成功加载时间戳:切 tab 回来若在节流窗口内则跳过全量重载。
  const lastLoadRef = useRef(0);
  const LOAD_TTL = 30000;

  useDidShow(() => {
    if (!getToken()) {
      Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    const intent = takePendingRecordIntent();
    if (intent) setPendingRecordIntent(intent);
    if (Date.now() - lastLoadRef.current < LOAD_TTL) return;
    void refreshWork();
  });

  const batches = batchResource.data;
  const records = recordResource.data;
  const templates = templateResource.data;
  const summary = billingResource.data;

  useEffect(() => {
    if (!pendingRecordIntent) return;
    const intent = pendingRecordIntent;
    if (findIntentBatch(intent, batches)) {
      formRef.current?.openForBatch(intent.batchId);
      setPendingRecordIntent(null);
      return;
    }
    if (batchResource.status === 'success' || batchResource.status === 'error') {
      setPendingRecordIntent(null);
      Taro.showToast({ title: `批次 ${intent.batchNo} 当前不可用，请手动选择`, icon: 'none' });
    }
  }, [batchResource.status, batches, pendingRecordIntent]);

  // 真实网络状态:初始查询 + 订阅变化,只读展示(离线仅提示,不伪造请求行为)。
  useEffect(() => {
    Taro.getNetworkType()
      .then((r) => setIsOffline(r.networkType === 'none'))
      .catch(() => setIsOffline(false));
    const onChange = (r: { isConnected: boolean }) => setIsOffline(!r.isConnected);
    Taro.onNetworkStatusChange(onChange);
    return () => Taro.offNetworkStatusChange(onChange);
  }, []);

  async function loadBatches() {
    setBatchResource(loadingResource);
    try {
      setBatchResource(successResource(await listBatches()));
    } catch (e: any) {
      setBatchResource((current) => errorResource(current, e?.message || '批次加载失败'));
    }
  }

  async function loadRecords() {
    setRecordResource(loadingResource);
    try {
      const page = await request<{ items: FarmRecord[] }>({ url: '/farm-records' });
      setRecordResource(successResource(sortByRecentDesc(page.items).slice(0, 5)));
    } catch (e: any) {
      setRecordResource((current) => errorResource(current, e?.message || '农事记录加载失败'));
    }
  }

  async function loadTemplates() {
    setTemplateResource(loadingResource);
    try {
      setTemplateResource(successResource(await listQuickTemplates()));
    } catch (e: any) {
      setTemplateResource((current) => errorResource(current, e?.message || '快捷模板加载失败'));
    }
  }

  async function loadBilling() {
    setBillingResource(loadingResource);
    try {
      const value = await getBillingSummary();
      setBillingResource(successResource({ aiBalance: value.aiBalance, codeBalance: value.codeBalance }));
    } catch (e: any) {
      setBillingResource((current) => errorResource(current, e?.message || '额度加载失败'));
    }
  }

  async function refreshWork() {
    await Promise.allSettled([loadBatches(), loadRecords(), loadTemplates(), loadBilling()]);
    lastLoadRef.current = Date.now();
  }

  const subtitle = batches[0]?.cropName
    ? `基地 · ${batches[0].cropName}种植组`
    : '基地生产组';
  const balanceLow = !!summary && (summary.aiBalance < LOW_BALANCE || summary.codeBalance < LOW_BALANCE);
  const initialLoading = batchResource.status === 'loading'
    && recordResource.status === 'loading'
    && batches.length === 0
    && records.length === 0;

  const handleOpenForm = useCallback((tpl: QuickTemplateView) => {
    formRef.current?.applyTemplate(tpl);
  }, []);

  return (
    <View className="work">
      <View className="work__header">
        <View className="work__header-row">
          <View>
            <Text className="work__eyebrow">FIELD OPS</Text>
            <Text className="work__title">田间工作台</Text>
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
        {isOffline && (
          <View className="work__offline" role="status">
            <Text className="work__offline-text">离线：草稿会保存在本机，提交、上传、语音转写与 AI 需要网络</Text>
          </View>
        )}
        <DataState
          status={billingResource.status}
          error={billingResource.error}
          hasData={summary !== null}
          loadingLabel="加载额度中…"
          errorTitle="额度加载失败"
          onRetry={() => void loadBilling()}
          compact
        />
        {initialLoading ? (
          <WorkSkeleton />
        ) : (
          <>
            <WorkBatches
              batches={batches}
              status={batchResource.status}
              error={batchResource.error}
              onRetry={() => void loadBatches()}
            />
            <WorkRecords
              records={records}
              status={recordResource.status}
              error={recordResource.error}
              onRetry={() => void loadRecords()}
            />
            <WorkQuickActions
              templates={templates}
              aiBalance={summary?.aiBalance ?? null}
              isOffline={isOffline}
              onOpenAi={setAiMode}
              onOpenManual={() => formRef.current?.openManual()}
              onOpenLocation={() => formRef.current?.openLocation()}
              onApplyTemplate={handleOpenForm}
              templateStatus={templateResource.status}
              templateError={templateResource.error}
              onRetryTemplates={() => void loadTemplates()}
            />
          </>
        )}

        <RecordForm ref={formRef} batches={batches} isOffline={isOffline} onSaved={() => void refreshWork()} />
      </View>

      <AiPanel mode={aiMode} onClose={() => setAiMode(null)} />
    </View>
  );
}
