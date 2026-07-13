import { useRef, useState } from 'react';
import { Button, Picker, ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import type {
  BillingSummary,
  CreditResource,
  LedgerReason,
} from '@nongchang/shared';
import { getToken } from '../../store/auth';
import { getBillingSummary, listLedger } from '../../api/billing';
import DataState from '../../components/DataState';
import {
  errorResource,
  idleResource,
  loadingResource,
  successResource,
  type AsyncResource,
} from '../../components/DataState/model';
import {
  createLedgerState,
  failLedgerPage,
  mergeLedgerPage,
  resetLedgerFilters,
  startLedgerPage,
  type LedgerFilters,
} from './pagination';
import './index.scss';

const REASON_LABEL: Record<LedgerReason, string> = {
  RECHARGE: '充值',
  ALLOCATE_IN: '转入',
  ALLOCATE_OUT: '转出',
  CONSUME: '消费',
  REFUND: '退还',
  PURCHASE: '购买',
  RESERVED: '预留',
  CONFIRMED: '确认扣减',
  RELEASED: '释放预留',
};
const RESOURCE_LABEL: Record<CreditResource, string> = { AI: 'AI算力', CODE: '二维码' };
const RESOURCE_OPTIONS: Array<{ label: string; value: CreditResource | '' }> = [
  { label: '全部资源', value: '' },
  { label: 'AI 算力', value: 'AI' },
  { label: '二维码', value: 'CODE' },
];
const REASON_OPTIONS: Array<{ label: string; value: LedgerReason | '' }> = [
  { label: '全部原因', value: '' },
  ...Object.entries(REASON_LABEL).map(([value, label]) => ({ value: value as LedgerReason, label })),
];

function sameFilters(left: LedgerFilters, right: LedgerFilters): boolean {
  return left.resource === right.resource && left.reason === right.reason;
}

export default function Usage() {
  const [summaryResource, setSummaryResource] = useState<AsyncResource<BillingSummary | null>>(() => idleResource(null));
  const [ledgerState, setLedgerState] = useState(createLedgerState);
  const [resourceFilter, setResourceFilter] = useState<CreditResource | ''>('');
  const [reasonFilter, setReasonFilter] = useState<LedgerReason | ''>('');
  const inFlightRef = useRef(new Set<string>());

  useDidShow(() => {
    if (!getToken()) {
      Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    void loadSummary();
    void loadLedgerPage(1, ledgerState.filters);
  });

  async function loadSummary() {
    setSummaryResource(loadingResource);
    try {
      setSummaryResource(successResource(await getBillingSummary()));
    } catch (e: any) {
      setSummaryResource((current) => errorResource(current, e?.message || '额度余额加载失败'));
    }
  }

  async function loadLedgerPage(page: number, filters = ledgerState.filters) {
    if (page > 1 && !ledgerState.hasMore) return;
    const requestKey = `${filters.resource ?? 'ALL'}:${filters.reason ?? 'ALL'}:${page}`;
    if (inFlightRef.current.has(requestKey)) return;
    inFlightRef.current.add(requestKey);
    setLedgerState((current) => startLedgerPage(current, page));
    try {
      const response = await listLedger({ ...filters, page, pageSize: 20 });
      setLedgerState((current) => (
        sameFilters(current.filters, filters) ? mergeLedgerPage(current, response) : current
      ));
    } catch (e: any) {
      setLedgerState((current) => (
        sameFilters(current.filters, filters)
          ? failLedgerPage(current, page, e?.message || '流水加载失败')
          : current
      ));
    } finally {
      inFlightRef.current.delete(requestKey);
    }
  }

  function applyFilters(resource: CreditResource | '', reason: LedgerReason | '') {
    const filters: LedgerFilters = {
      ...(resource ? { resource } : {}),
      ...(reason ? { reason } : {}),
    };
    setLedgerState((current) => resetLedgerFilters(current, filters));
    void loadLedgerPage(1, filters);
  }

  function changeResource(index: number) {
    const next = RESOURCE_OPTIONS[index]?.value ?? '';
    setResourceFilter(next);
    applyFilters(next, reasonFilter);
  }

  function changeReason(index: number) {
    const next = REASON_OPTIONS[index]?.value ?? '';
    setReasonFilter(next);
    applyFilters(resourceFilter, next);
  }

  const summary = summaryResource.data;
  const ledgerStatus: AsyncResource<unknown>['status'] = ledgerState.initialLoading
    ? 'loading'
    : ledgerState.error
      ? 'error'
      : 'success';

  return (
    <View className="usage">
      <View className="usage__header">
        <Text className="usage__title">用量中心</Text>
        <View className="usage__balance">
          <View className="usage__balance-item">
            <Text className="usage__balance-num">{summary ? summary.aiBalance : '—'}</Text>
            <Text className="usage__balance-label">AI 算力(次)</Text>
          </View>
          <View className="usage__balance-item">
            <Text className="usage__balance-num">{summary ? summary.codeBalance : '—'}</Text>
            <Text className="usage__balance-label">二维码(个)</Text>
          </View>
        </View>
      </View>

      <View className="usage__body">
        <DataState
          status={summaryResource.status}
          error={summaryResource.error}
          hasData={summary !== null}
          loadingLabel="加载额度余额中…"
          errorTitle="额度余额加载失败"
          onRetry={() => void loadSummary()}
          compact
        />

        <View className="usage__section-head">
          <Text className="usage__section-title">额度流水</Text>
          <Text className="usage__total">共 {ledgerState.total} 条</Text>
        </View>
        <View className="usage__filters">
          <Picker
            mode="selector"
            range={RESOURCE_OPTIONS.map((option) => option.label)}
            onChange={(event) => changeResource(Number(event.detail.value))}
          >
            <Button className="nc-button-reset usage__filter">
              {RESOURCE_OPTIONS.find((option) => option.value === resourceFilter)?.label}
            </Button>
          </Picker>
          <Picker
            mode="selector"
            range={REASON_OPTIONS.map((option) => option.label)}
            onChange={(event) => changeReason(Number(event.detail.value))}
          >
            <Button className="nc-button-reset usage__filter">
              {REASON_OPTIONS.find((option) => option.value === reasonFilter)?.label}
            </Button>
          </Picker>
        </View>

        <DataState
          status={ledgerStatus}
          error={ledgerState.error}
          hasData={ledgerState.items.length > 0}
          loadingLabel="加载流水中…"
          emptyLabel="暂无流水记录"
          errorTitle="流水加载失败"
          onRetry={() => void loadLedgerPage(1)}
          compact
        />

        <ScrollView
          scrollY
          className="usage__ledger"
          lowerThreshold={80}
          onScrollToLower={() => void loadLedgerPage(ledgerState.page + 1)}
        >
          {ledgerState.items.map((entry) => (
            <View className="usage__row" key={entry.id}>
              <View className="usage__row-top">
                <Text className="usage__row-reason">
                  {REASON_LABEL[entry.reason]} · {RESOURCE_LABEL[entry.resource]}
                </Text>
                <Text className={`usage__row-delta ${entry.delta >= 0 ? 'usage__row-delta--in' : 'usage__row-delta--out'}`}>
                  {entry.delta >= 0 ? `+${entry.delta}` : entry.delta}
                </Text>
              </View>
              <View className="usage__row-bottom">
                <Text className="usage__row-time">{entry.createdAt.slice(0, 16).replace('T', ' ')}</Text>
                <Text className="usage__row-balance">余额 {entry.balanceAfter}</Text>
              </View>
            </View>
          ))}
          {ledgerState.appendLoading && <Text className="usage__append">加载更多中…</Text>}
          {ledgerState.appendError && (
            <View className="usage__append-error" role="alert">
              <Text>{ledgerState.appendError}</Text>
              <Button className="usage__append-retry" onClick={() => void loadLedgerPage(ledgerState.page + 1)}>
                重试加载更多
              </Button>
            </View>
          )}
          {!ledgerState.hasMore && ledgerState.items.length > 0 && (
            <Text className="usage__append">已加载全部流水</Text>
          )}
        </ScrollView>
      </View>
    </View>
  );
}
