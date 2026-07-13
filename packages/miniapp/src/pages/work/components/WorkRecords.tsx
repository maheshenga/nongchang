import { memo } from 'react';
import { View, Text, Image } from '@tarojs/components';
import type { FarmRecord } from '../../../api/farm';
import DataState from '../../../components/DataState';
import type { AsyncResource } from '../../../components/DataState/model';
import '../index.scss';

interface Props {
  records: FarmRecord[];
  status: AsyncResource<FarmRecord[]>['status'];
  error: string | null;
  onRetry: () => void;
}

function WorkRecords({ records, status, error, onRetry }: Props) {
  return (
    <View className="work__card">
      <View className="work__section-head">
        <Text className="work__section-title">近期农事</Text>
        <Text className="work__section-sub">最近 5 条</Text>
      </View>
      <DataState
        status={status}
        error={error}
        hasData={records.length > 0}
        loadingLabel="加载农事记录中…"
        emptyLabel="暂无农事记录"
        errorTitle="农事记录加载失败"
        onRetry={onRetry}
        compact
      />
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
  );
}

export default memo(WorkRecords);
