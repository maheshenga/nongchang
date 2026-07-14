import { useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import { useDidShow } from '@tarojs/taro';
import type { AccountDataPreview } from '@nongchang/shared';
import {
  exportMyData,
  getMyData,
  shareMyData,
  type AccountDataExportFormat,
} from '../../api/account';
import { accountRecordLabel, formatAccountDate } from './presentation';
import './index.scss';

const EXCLUSIONS = [
  '不包含密码、令牌、会话版本、微信 OpenID 和第三方密钥。',
  '不包含其他用户的个人资料、记录或上传内容。',
  '不包含 OSS 对象键、支付密钥、交易密钥和内部幂等标识。',
  '不包含上传文件二进制，仅包含允许公开给本人的上传元数据。',
];

function recordDate(item: unknown): string {
  const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
  const value = row.recordedAt ?? row.paidAt ?? row.updatedAt ?? row.createdAt;
  return formatAccountDate(typeof value === 'string' ? value : null);
}

export default function AccountDataPage() {
  const [data, setData] = useState<AccountDataPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<AccountDataExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastExportFormat, setLastExportFormat] = useState<AccountDataExportFormat>('json');
  const [savedFile, setSavedFile] = useState<{
    path: string;
    format: AccountDataExportFormat;
  } | null>(null);

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

  async function runExport(format: AccountDataExportFormat) {
    setExportingFormat(format);
    setLastExportFormat(format);
    setExportError(null);
    try {
      setSavedFile({ path: await exportMyData(format), format });
    } catch (e: unknown) {
      setExportError(e instanceof Error ? e.message : '数据导出失败');
    } finally {
      setExportingFormat(null);
    }
  }

  async function runShare() {
    if (!savedFile) return;
    setExportError(null);
    try {
      await shareMyData(savedFile.path, savedFile.format);
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
        <Text>生成时间：{formatAccountDate(data.generatedAt)}</Text>
        <View className="account-data__export-actions">
          <Button
            className="account-data__export"
            loading={exportingFormat === 'json'}
            disabled={exportingFormat !== null}
            onClick={() => void runExport('json')}
          >
            {exportError && lastExportFormat === 'json' ? '重新导出 JSON' : '导出 JSON 数据副本'}
          </Button>
          <Button
            className="account-data__export account-data__export--secondary"
            loading={exportingFormat === 'csv'}
            disabled={exportingFormat !== null}
            onClick={() => void runExport('csv')}
          >
            {exportError && lastExportFormat === 'csv' ? '重新导出 CSV' : '导出 CSV 数据副本'}
          </Button>
        </View>
        {exportError && <Text className="account-data__export-error">{exportError}</Text>}
        {savedFile && (
          <Button className="account-data__share" onClick={() => void runShare()}>
            分享数据副本（{savedFile.format.toUpperCase()}）
          </Button>
        )}
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
              <View className="account-data__record" key={item.id}>
                <Text>{accountRecordLabel(item, category.label)}</Text>
                <Text className="account-data__record-date">{recordDate(item)}</Text>
              </View>
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

    </View>
  );
}
