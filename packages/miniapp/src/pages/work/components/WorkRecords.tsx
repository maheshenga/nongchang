import { memo } from 'react';
import { View, Text, Image } from '@tarojs/components';
import type { FarmRecord } from '../../../api/farm';
import '../index.scss';

interface Props {
  records: FarmRecord[];
  err: string | null;
}

function WorkRecords({ records, err }: Props) {
  return (
    <View className="work__card">
      <View className="work__section-head">
        <Text className="work__section-title">近期农事</Text>
        <Text className="work__section-sub">最近 5 条</Text>
      </View>
      {err && <Text className="work__hint work__hint--err">{err}</Text>}
      {!err && records.length === 0 && (
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
  );
}

export default memo(WorkRecords);
