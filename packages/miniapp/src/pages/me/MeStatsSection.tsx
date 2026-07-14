import { Text, View } from '@tarojs/components';

interface Props {
  monthCount: number | null;
  batchCount: number | null;
  fieldCount: number | null;
}

export default function MeStatsSection({ monthCount, batchCount, fieldCount }: Props) {
  return (
    <View className="me__stats">
      <View className="me__stat">
        <Text className="me__stat-num">{monthCount ?? '—'}</Text>
        <Text className="me__stat-label">本月记录</Text>
      </View>
      <View className="me__stat">
        <Text className="me__stat-num">{batchCount ?? '—'}</Text>
        <Text className="me__stat-label">在管批次</Text>
      </View>
      <View className="me__stat">
        <Text className="me__stat-num">{fieldCount ?? '—'}</Text>
        <Text className="me__stat-label">承包地块</Text>
      </View>
    </View>
  );
}
