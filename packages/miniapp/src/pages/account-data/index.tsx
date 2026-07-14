import { useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import { useDidShow } from '@tarojs/taro';
import type { AccountDataPreview } from '@nongchang/shared';
import { exportMyData, getMyData, shareMyData } from '../../api/account';
import './index.scss';

const EXCLUSIONS = [
  '不包含密码、令牌、会话版本、微信 OpenID 和第三方密钥。',
  '不包含其他用户的个人资料、记录或上传内容。',
  '不包含 OSS 对象键、支付密钥、交易密钥和内部幂等标识。',
  '不包含上传文件二进制，仅包含允许公开给本人的上传元数据。',
];

function recordLabel(item: unknown): string {
  const row = item as {
    id: string;
    name?: string;
    batchNo?: string;
    action?: string;
    purpose?: string;
    kind?: string;
    resource?: string;
    reason?: string;
  };
  return row.name || row.batchNo || row.action || row.purpose || row.kind
    || row.reason || row.resource || row.id;
}

export default function AccountDataPage() {
  const [data, setData] = useState<AccountDataPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      setData(await getMyData());
    } catch (e: unknown) {
      setData(null);
      setError(e instanceof Error ? e.message : '数据加载失败');
    } finally {
      setLoading(false);
    }
  }

  useDidShow(() => {
    void loadData();
  });

  async function runExport() {
    setExporting(true);
    setExportError(null);
    try {
      setSavedFilePath(await exportMyData());
    } catch (e: unknown) {
      setExportError(e instanceof Error ? e.message : '数据导出失败');
    } finally {
      setExporting(false);
    }
  }

  async function runShare() {
    if (!savedFilePath) return;
    setExportError(null);
    try {
      await shareMyData(savedFilePath);
    } catch (e: unknown) {
      setExportError(e instanceof Error ? e.message : '数据分享失败');
    }
  }

  if (loading) {
    return <View className="account-data__state">数据加载中…</View>;
  }
  if (error || !data) {
    return (
      <View className="account-data__state account-data__state--error">
        <Text>{error || '数据加载失败'}</Text>
        <Button className="account-data__retry" onClick={() => void loadData()}>
          重新加载数据
        </Button>
      </View>
    );
  }

  const categories = [
    { label: '地块', count: data.counts.fields, items: data.recent.fields },
    { label: '批次', count: data.counts.batches, items: data.recent.batches },
    { label: '农事记录', count: data.counts.farmRecords, items: data.recent.farmRecords },
    { label: '农资库存', count: data.counts.supplies, items: data.recent.supplies },
    { label: '农资领用', count: data.counts.supplyIssues, items: data.recent.supplyIssues },
    { label: '上传记录', count: data.counts.uploads, items: data.recent.uploads },
    { label: 'AI 操作', count: data.counts.aiOperations, items: data.recent.aiOperations },
    { label: '额度订单', count: data.counts.creditOrders, items: data.recent.creditOrders },
    {
      label: '额度流水',
      count: data.counts.creditLedgers,
      items: data.recent.creditAccount?.ledgers ?? [],
    },
  ];

  return (
    <View className="account-data">
      <View className="account-data__identity">
        <Text className="account-data__title">我的数据</Text>
        <Text>机构：{data.tenant.name}（{data.tenant.code}）</Text>
        <Text>账号：{data.account.displayName}（{data.account.username}）</Text>
        <Text>生成时间：{data.generatedAt}</Text>
      </View>

      <View className="account-data__counts">
        {categories.map(category => (
          <View className="account-data__count" key={category.label}>
            <Text className="account-data__count-value">{category.count}</Text>
            <Text className="account-data__count-label">{category.label}</Text>
          </View>
        ))}
      </View>

      <View className="account-data__section">
        <Text className="account-data__section-title">最近记录（每类最多 {data.recentLimit} 条）</Text>
        {categories.map(category => (
          <View className="account-data__group" key={category.label}>
            <Text className="account-data__group-title">{category.label}</Text>
            {category.items.length === 0 ? (
              <Text className="account-data__empty">暂无记录</Text>
            ) : category.items.map(item => (
              <Text className="account-data__record" key={item.id}>{recordLabel(item)}</Text>
            ))}
          </View>
        ))}
      </View>

      <View className="account-data__section">
        <Text className="account-data__section-title">数据副本不包含的内容</Text>
        {EXCLUSIONS.map(item => (
          <Text className="account-data__exclusion" key={item}>• {item}</Text>
        ))}
      </View>

      {exportError && <Text className="account-data__export-error">{exportError}</Text>}
      <Button className="account-data__export" loading={exporting} onClick={() => void runExport()}>
        {exportError ? '重新导出' : '导出 JSON 数据副本'}
      </Button>
      {savedFilePath && (
        <Button className="account-data__share" onClick={() => void runShare()}>
          分享数据副本
        </Button>
      )}
    </View>
  );
}
