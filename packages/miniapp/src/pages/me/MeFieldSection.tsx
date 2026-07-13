import { Map, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { Field } from '../../api/farm';
import { wgs84ToGcj02 } from '../../utils/geo';

export default function MeFieldSection({ fields, onToggle }: {
  fields: Field[] | null;
  onToggle: () => void;
}) {
  const located = (fields ?? []).filter((field): field is Field & { lng: number; lat: number } => (
    field.lng != null && field.lat != null
  ));
  const points = located.map((field) => ({ field, coordinate: wgs84ToGcj02(field.lng, field.lat) }));
  const markers = points.map(({ field, coordinate }, index) => ({
    id: index,
    latitude: coordinate.lat,
    longitude: coordinate.lng,
    title: `${field.name} · ${field.area} 亩`,
    iconPath: '',
    width: 24,
    height: 24,
  }));

  return (
    <>
      <View className="me__item" onClick={onToggle}>
        <Text className="me__item-text">承包地块管理</Text>
        <Text className="me__item-arrow">{fields ? '收起' : '展开'}</Text>
      </View>
      {fields && (
        <View className="me__fields">
          {fields.length === 0 && <Text className="me__field-empty">暂无地块</Text>}
          {points.length > 0 && (
            <Map
              className="me__field-map"
              longitude={points[0].coordinate.lng}
              latitude={points[0].coordinate.lat}
              scale={12}
              markers={markers}
              showLocation
              onError={() => Taro.showToast({ title: '地图加载失败', icon: 'none' })}
            />
          )}
          {fields.map((field) => (
            <Text className="me__field" key={field.id}>{field.name} · {field.area} 亩</Text>
          ))}
        </View>
      )}
    </>
  );
}
