import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import './index.scss';

const SENSORS = [
  { label: '光照度', value: '15,400', unit: 'lx' },
  { label: '环境温', value: '24.2', unit: '°C' },
  { label: '土壤湿', value: '58.5', unit: '%' },
];

// 传感器为预留入口（后端暂无 IoT 端点）。展示示例值 + 角标，点击提示即将开放。
export default function Sensors() {
  const onTap = () =>
    Taro.showToast({ title: '传感器接入中，敬请期待', icon: 'none' });

  return (
    <View className="sensors" onClick={onTap}>
      {SENSORS.map((s) => (
        <View className="sensors__card" key={s.label}>
          <Text className="sensors__badge">示例</Text>
          <Text className="sensors__value">{s.value}</Text>
          <Text className="sensors__unit">{s.unit}</Text>
          <Text className="sensors__label">{s.label}</Text>
        </View>
      ))}
    </View>
  );
}
