import { useState } from 'react';
import { View, Text, Map } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { getToken, clearToken } from '../../store/auth';
import { request } from '../../api/request';
import { listBatches, listFields, type Field, type FarmRecord } from '../../api/farm';
import { decodeToken, roleLabel } from '../../utils/token';
import { countThisMonth } from '../../utils/stats';
import { wgs84ToGcj02 } from '../../utils/geo';
import './index.scss';

export default function Me() {
  const [username, setUsername] = useState('农技员');
  const [role, setRole] = useState('农技员');
  const [monthCount, setMonthCount] = useState<number | null>(null);
  const [batchCount, setBatchCount] = useState<number | null>(null);
  const [fieldCount, setFieldCount] = useState<number | null>(null);
  const [fields, setFields] = useState<Field[] | null>(null);

  useDidShow(() => {
    const token = getToken();
    if (!token) {
      Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    const p = decodeToken(token);
    if (p?.username) setUsername(p.username);
    setRole(roleLabel(p?.role));
    void loadStats();
  });

  async function loadStats() {
    try {
      // /farm-records 返回分页对象 {items,total,page,pageSize},取 items 统计本月记录数
      const res = await request<{ items: FarmRecord[] }>({ url: '/farm-records' });
      setMonthCount(countThisMonth(res.items as any, new Date()));
    } catch {
      setMonthCount(null);
    }
    listBatches().then((bs) => setBatchCount(bs.length)).catch(() => setBatchCount(null));
    listFields().then((fs) => setFieldCount(fs.length)).catch(() => setFieldCount(null));
  }

  const comingSoon = () => Taro.showToast({ title: '功能即将开放', icon: 'none' });

  async function toggleFields() {
    if (fields) { setFields(null); return; }
    try {
      setFields(await listFields());
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '加载地块失败', icon: 'none' });
    }
  }

  function showHelp() {
    Taro.showModal({
      title: '系统帮助与客服',
      content: '如需帮助请联系平台管理员，或拨打服务热线 400-000-0000。',
      showCancel: false,
    });
  }

  function logout() {
    clearToken();
    Taro.redirectTo({ url: '/pages/login/index' });
  }

  return (
    <View className="me">
      <View className="me__header">
        <View className="me__avatar">
          <Text className="me__avatar-text">{username.slice(0, 1)}</Text>
        </View>
        <View>
          <Text className="me__name">{username}</Text>
          <Text className="me__role">{role}</Text>
        </View>
      </View>

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

      <View className="me__menu">
        <View className="me__item me__item--reserved" onClick={comingSoon}>
          <Text className="me__item-text">蓝牙传感设备配置</Text>
          <Text className="me__item-badge">即将开放</Text>
        </View>
        <View className="me__item" onClick={toggleFields}>
          <Text className="me__item-text">承包地块管理</Text>
          <Text className="me__item-arrow">{fields ? '收起' : '展开'}</Text>
        </View>
        {fields && (
          <View className="me__fields">
            {fields.length === 0 && <Text className="me__field-empty">暂无地块</Text>}
            {(() => {
              const located = fields.filter((f) => f.lng != null && f.lat != null);
              if (located.length === 0) return null;
              // DB 存 WGS84,原生 <map> 用 GCJ-02,渲染前转换
              const pts = located.map((f) => ({ f, c: wgs84ToGcj02(f.lng, f.lat) }));
              const markers = pts.map(({ f, c }, i) => ({
                id: i,
                latitude: c.lat,
                longitude: c.lng,
                title: `${f.name} · ${f.area} 亩`,
                iconPath: '',
                width: 24,
                height: 24,
              }));
              return (
                <Map
                  className="me__field-map"
                  longitude={pts[0].c.lng}
                  latitude={pts[0].c.lat}
                  scale={12}
                  markers={markers}
                  showLocation
                  onError={() => Taro.showToast({ title: '地图加载失败', icon: 'none' })}
                />
              );
            })()}
            {fields.map((f) => (
              <Text className="me__field" key={f.id}>{f.name} · {f.area} 亩</Text>
            ))}
          </View>
        )}
        <View className="me__item" onClick={() => Taro.navigateTo({ url: '/pages/usage/index' })}>
          <Text className="me__item-text">算力与额度用量</Text>
          <Text className="me__item-arrow">›</Text>
        </View>
        <View className="me__item me__item--reserved" onClick={comingSoon}>
          <Text className="me__item-text">区块链存证</Text>
          <Text className="me__item-badge">即将开放</Text>
        </View>
        <View className="me__item" onClick={showHelp}>
          <Text className="me__item-text">系统帮助与客服</Text>
          <Text className="me__item-arrow">›</Text>
        </View>
      </View>

      <View className="me__logout" onClick={logout}>
        <Text className="me__logout-text">退出登录</Text>
      </View>
    </View>
  );
}
