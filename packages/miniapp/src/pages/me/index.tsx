import { useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { getToken, clearToken } from '../../store/auth';
import { request } from '../../api/request';
import { listFields, type Field, type FarmRecord } from '../../api/farm';
import { decodeToken, roleLabel } from '../../utils/token';
import { countThisMonth } from '../../utils/stats';
import './index.scss';

export default function Me() {
  const [username, setUsername] = useState('农技员');
  const [role, setRole] = useState('农技员');
  const [monthCount, setMonthCount] = useState<number | null>(null);
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
      const recs = await request<FarmRecord[]>({ url: '/farm-records' });
      setMonthCount(countThisMonth(recs as any, new Date()));
    } catch {
      setMonthCount(null);
    }
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
        <Image className="me__avatar" src="https://api.dicebear.com/7.x/notionists/svg?seed=Admin" />
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
          <Text className="me__stat-num">98%</Text>
          <Text className="me__stat-label">合规率（示例）</Text>
        </View>
        <View className="me__stat">
          <Text className="me__stat-num">A</Text>
          <Text className="me__stat-label">绩效（示例）</Text>
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
            {fields.map((f) => (
              <Text className="me__field" key={f.id}>{f.name} · {f.area} 亩</Text>
            ))}
          </View>
        )}
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
