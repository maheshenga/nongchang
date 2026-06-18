import { useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { getToken } from '../../store/auth';
import { getBillingSummary, listLedger, listCreditPlans, createOrder, payOrder } from '../../api/billing';
import type { CreditLedgerItem, CreditPlanView } from '@nongchang/shared';
import './index.scss';

const REASON_LABEL: Record<string, string> = {
  RECHARGE: '充值',
  ALLOCATE_IN: '转入',
  ALLOCATE_OUT: '转出',
  CONSUME: '消费',
  REFUND: '退还',
  PURCHASE: '购买',
};
const RESOURCE_LABEL: Record<string, string> = { AI: 'AI算力', CODE: '二维码' };

export default function Usage() {
  const [summary, setSummary] = useState<{ aiBalance: number; codeBalance: number } | null>(null);
  const [items, setItems] = useState<CreditLedgerItem[]>([]);
  const [plans, setPlans] = useState<CreditPlanView[]>([]);
  const [buying, setBuying] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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
      const [s, ledger, planList] = await Promise.all([getBillingSummary(), listLedger(1, 30), listCreditPlans()]);
      setSummary({ aiBalance: s.aiBalance, codeBalance: s.codeBalance });
      setItems(ledger.items);
      setPlans(planList.filter((p) => p.active && !p.isUnit));
    } catch (e: any) {
      setErr(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  // 下单 + 立即支付(占位)一气呵成。
  async function buy(plan: CreditPlanView) {
    if (buying) return;
    setBuying(plan.id);
    try {
      const order = await createOrder({ planId: plan.id });
      await payOrder(order.id);
      Taro.showToast({ title: '购买成功', icon: 'success' });
      await load();
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '购买失败', icon: 'none' });
    } finally {
      setBuying('');
    }
  }

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
        {plans.length > 0 && (
          <View className="usage__buy">
            <Text className="usage__section-title">购买额度</Text>
            <View className="usage__plans">
              {plans.map((p) => (
                <View className="usage__plan" key={p.id}>
                  <Text className="usage__plan-name">{p.name}</Text>
                  <Text className="usage__plan-qty">{p.quantity} {p.resource === 'AI' ? '次' : '个'}</Text>
                  <Text className="usage__plan-price">¥{(p.priceCents / 100).toFixed(2)}</Text>
                  <View
                    className={`usage__plan-btn ${buying === p.id ? 'usage__plan-btn--disabled' : ''}`}
                    onClick={() => void buy(p)}
                  >
                    <Text className="usage__plan-btn-text">{buying === p.id ? '购买中…' : '购买'}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <Text className="usage__section-title">额度流水</Text>
        {loading && <Text className="usage__hint">加载中…</Text>}
        {err && <Text className="usage__hint usage__hint--err">{err}</Text>}
        {!loading && !err && items.length === 0 && (
          <Text className="usage__hint">暂无流水记录</Text>
        )}
        <ScrollView scrollY className="usage__ledger">
          {items.map((it) => (
            <View className="usage__row" key={it.id}>
              <View className="usage__row-top">
                <Text className="usage__row-reason">
                  {REASON_LABEL[it.reason] || it.reason} · {RESOURCE_LABEL[it.resource] || it.resource}
                </Text>
                <Text className={`usage__row-delta ${it.delta >= 0 ? 'usage__row-delta--in' : 'usage__row-delta--out'}`}>
                  {it.delta >= 0 ? `+${it.delta}` : it.delta}
                </Text>
              </View>
              <View className="usage__row-bottom">
                <Text className="usage__row-time">{it.createdAt.slice(0, 16).replace('T', ' ')}</Text>
                <Text className="usage__row-balance">余额 {it.balanceAfter}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}
