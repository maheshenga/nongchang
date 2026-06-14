import { View, Text } from '@tarojs/components';
import { traceTypeMeta } from '../../utils/stats';
import type { TraceEvent } from '../../api/trace';
import './index.scss';

interface Props { events: TraceEvent[] }

function fmt(t?: string | null): string {
  if (!t) return '';
  return t.slice(0, 16).replace('T', ' ');
}

export default function TraceTimeline({ events }: Props) {
  if (events.length === 0) {
    return <Text className="tl__empty">暂无溯源事件</Text>;
  }
  const sorted = [...events].sort(
    (a, b) => new Date(a.occurredAt ?? 0).getTime() - new Date(b.occurredAt ?? 0).getTime(),
  );
  return (
    <View className="tl">
      {sorted.map((e, i) => {
        const meta = traceTypeMeta(e.type);
        return (
          <View className="tl__row" key={`${e.type}-${i}`}>
            <View className="tl__axis">
              <View className="tl__dot" style={{ background: meta.color }} />
              {i < sorted.length - 1 && <View className="tl__line" />}
            </View>
            <View className="tl__card">
              <View className="tl__top">
                <Text className="tl__badge" style={{ background: meta.color }}>{meta.label}</Text>
                <Text className="tl__title">{e.title}</Text>
              </View>
              {e.actor ? <Text className="tl__meta">操作人：{e.actor}</Text> : null}
              {e.location ? <Text className="tl__meta">地点：{e.location}</Text> : null}
              {e.occurredAt ? <Text className="tl__time">{fmt(e.occurredAt)}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
