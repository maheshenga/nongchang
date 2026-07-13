import { useState, type FormEvent } from 'react';
import { Layers, Map, MapPin, Maximize2, Plus, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { AuthUser, CreateFieldDto } from '@nongchang/shared';
import { useApi } from '../hooks/useApi';
import { createField, listFields, type Field } from '../api/fields';
import TiandituMap from './TiandituMap';
import TiandituPicker from './TiandituPicker';
import { listMerchants, type MerchantUser } from '../api/agents';
import { useAuth } from '../auth/auth-context';
import { fluentButton, fluentInput, fluentSelect } from '../ui/fluent';
import { ModalSurface } from '../ui/ModalSurface';
import type { AppTab } from '../navigation';

export default function FarmFields({ onNavigate }: { onNavigate?: (tab: AppTab) => void }) {
  const { user } = useAuth();
  const { data: rawFields, loading, error, reload } = useApi(listFields, { cacheKey: 'fields' });
  const fields: Field[] = rawFields ?? [];
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const activeField = fields.find((f) => f.id === activeFieldId) ?? fields[0] ?? null;
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const mapRecovery = user?.role === 'system_admin'
    ? {
        message: '尚未配置天地图，地块仍可使用列表与手动经纬度。',
        ...(onNavigate ? { actionLabel: '前往第三方集成', onAction: () => onNavigate('integrations') } : {}),
      }
    : { message: '请联系租户系统管理员配置天地图；当前仍可使用列表与手动经纬度。' };

  const filteredFields = fields.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-4">
      {showCreate && (
        <CreateFieldModal
          user={user}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); void reload(); }}
        />
      )}

      <header className="flex shrink-0 flex-col gap-3 border border-[#E1DFDD] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-[#242424]">
            <Map className="h-5 w-5 text-[#0078D4]" />
            数字地块管理
          </h2>
          <p className="mt-1 text-sm text-[#605E5C]">
            管理种植基地边界、归属商户、地图位置与 IoT 设备信息
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative block min-w-0 sm:w-64">
            <span className="sr-only">搜索地块</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#605E5C]" />
            <input
              type="search"
              placeholder="搜索地块..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`${fluentInput} w-full pl-8`}
            />
          </label>
          <button type="button" onClick={() => setShowCreate(true)} className={fluentButton('primary')}>
            <Plus className="h-4 w-4" /> 绘制新地块
          </button>
        </div>
      </header>

      {loading && <div className="border border-[#E1DFDD] bg-white p-8 text-center text-sm text-[#605E5C]">加载中...</div>}
      {error && (
        <div className="border border-[#F1B8BD] bg-[#FDE7E9] p-4 text-sm text-[#A4262C]">
          {error}
          <button type="button" onClick={() => void reload()} className="ml-2 font-semibold underline">重试</button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="flex min-h-[260px] w-full shrink-0 flex-col overflow-hidden border border-[#E1DFDD] bg-white">
          <div className="flex h-11 items-center justify-between border-b border-[#E1DFDD] bg-[#FAFAFA] px-3">
            <h3 className="text-sm font-semibold text-[#242424]">地块列表 ({filteredFields.length})</h3>
            <div className="inline-flex border border-[#C8C6C4] bg-white">
              <button
                type="button"
                aria-label="地图视图"
                aria-pressed={viewMode === 'map'}
                onClick={() => setViewMode('map')}
                className={`grid h-7 w-8 place-items-center ${viewMode === 'map' ? 'bg-[#EFF6FC] text-[#005A9E]' : 'text-[#605E5C] hover:bg-[#F3F2F1]'}`}
              >
                <MapPin className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="列表视图"
                aria-pressed={viewMode === 'list'}
                onClick={() => setViewMode('list')}
                className={`grid h-7 w-8 place-items-center border-l border-[#C8C6C4] ${viewMode === 'list' ? 'bg-[#EFF6FC] text-[#005A9E]' : 'text-[#605E5C] hover:bg-[#F3F2F1]'}`}
              >
                <Layers className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="fluent-scrollbar flex-1 overflow-y-auto">
            {filteredFields.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#605E5C]">暂无匹配地块</div>
            ) : (
              filteredFields.map((field) => (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => setActiveFieldId(field.id)}
                  className={`w-full border-l-2 px-3 py-3 text-left text-sm transition-colors ${
                    activeField?.id === field.id
                      ? 'border-l-[#0078D4] bg-[#EFF6FC] text-[#242424]'
                      : 'border-l-transparent hover:bg-[#F5F9FF]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{field.name}</span>
                    <span className="shrink-0 font-mono text-xs text-[#605E5C]">{field.area} 亩</span>
                  </div>
                  <div className="mt-1 truncate text-xs text-[#605E5C]">
                    归属商户: <span className="font-semibold text-[#323130]">{field.ownerName ?? '-'}</span>
                  </div>
                  <div className="mt-1 truncate font-mono text-xs text-[#605E5C]">
                    {field.lng != null && field.lat != null ? `${field.lng.toFixed(4)}, ${field.lat.toFixed(4)}` : '未设置坐标'}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="relative flex min-h-[420px] min-w-0 flex-1 flex-col overflow-hidden border border-[#E1DFDD] bg-white">
          {viewMode === 'map' ? (
            <div className="relative min-h-0 flex-1 bg-[#F5F5F5]">
              <TiandituMap
                fields={fields}
                activeFieldId={activeField?.id ?? null}
                onSelect={setActiveFieldId}
                recovery={mapRecovery}
              />
              <AnimatePresence mode="wait">
                <motion.div
                  data-testid="field-map-detail"
                  key={activeField?.id ?? 'none'}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  className="absolute bottom-4 left-4 right-4 z-20 border border-[#E1DFDD] bg-white/95 p-4 shadow-lg sm:left-auto sm:right-4 sm:top-4 sm:w-72"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <h4 className="font-semibold text-[#242424]">{activeField?.name ?? '-'}</h4>
                    <div className="grid h-7 w-7 place-items-center border border-[#E1DFDD] bg-[#FAFAFA]" aria-hidden="true">
                      <Maximize2 className="h-3.5 w-3.5 text-[#605E5C]" />
                    </div>
                  </div>
                  <dl className="space-y-2 border-t border-[#E1DFDD] pt-3 text-xs">
                    <div className="flex justify-between gap-3">
                      <dt className="text-[#605E5C]">负责人</dt>
                      <dd className="truncate font-semibold text-[#323130]">{activeField?.ownerName ?? '-'}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[#605E5C]">规划面积</dt>
                      <dd className="font-mono text-[#323130]">{activeField?.area ?? '-'} 亩</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[#605E5C]">经纬度</dt>
                      <dd className="truncate font-mono text-[#323130]">
                        {activeField?.lng != null && activeField?.lat != null
                          ? `${activeField.lng.toFixed(4)}, ${activeField.lat.toFixed(4)}`
                          : '-'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[#605E5C]">IoT 设备</dt>
                      <dd className="truncate font-semibold text-[#323130]">{activeField?.iotDeviceId ?? '-'}</dd>
                    </div>
                  </dl>
                </motion.div>
              </AnimatePresence>
            </div>
          ) : (
            <div className="fluent-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
              <div className="border border-[#E1DFDD] bg-white p-5">
                <div className="flex flex-col gap-5 sm:flex-row">
                  <div className="grid h-28 w-28 shrink-0 place-items-center border border-[#E1DFDD] bg-[#F5F5F5]">
                    <MapPin className="h-8 w-8 text-[#0078D4]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xl font-semibold text-[#242424]">{activeField?.name ?? '-'}</h3>
                    <p className="mt-2 break-all border border-[#E1DFDD] bg-[#FAFAFA] px-3 py-2 font-mono text-xs text-[#605E5C]">
                      ID: {activeField?.id ?? '-'} | 面积: {activeField?.area ?? '-'} 亩
                    </p>
                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-semibold text-[#605E5C]">归属商户</dt>
                        <dd className="mt-1 text-[#242424]">{activeField?.ownerName ?? '-'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold text-[#605E5C]">IoT 设备</dt>
                        <dd className="mt-1 text-[#242424]">{activeField?.iotDeviceId ?? '-'}</dd>
                      </div>
                    </dl>
                    <p className="mt-4 text-xs text-[#605E5C]">
                      编辑地块信息的后端接口尚未在此页接入，本页仅保留真实创建与地图选点流程。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CreateFieldModal({
  user, onClose, onCreated,
}: {
  user: AuthUser | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const isMerchant = user?.role === 'merchant';
  const { data: merchants } = useApi(listMerchants, { cacheKey: 'merchants' });
  const [ownerId, setOwnerId] = useState(isMerchant ? (user?.ownerId ?? user?.userId ?? '') : '');
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [lng, setLng] = useState('');
  const [lat, setLat] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const dto: CreateFieldDto = {
        ownerId,
        name,
        area: Number(area),
        lng: Number(lng),
        lat: Number(lat),
      };
      await createField(dto);
      onCreated();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSurface
      title="新建地块"
      onClose={onClose}
      closeDisabled={submitting}
      initialFocusSelector={isMerchant ? '#field-name' : '#field-owner'}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={submitting} className={fluentButton('secondary')}>取消</button>
          <button type="submit" form="create-field-form" disabled={submitting} className={fluentButton('primary')}>
            {submitting ? '提交中...' : '创建'}
          </button>
        </>
      )}
    >
      <form id="create-field-form" onSubmit={submit} className="space-y-4 p-5">
        {!isMerchant && (
          <label htmlFor="field-owner" className="grid gap-1 text-xs font-semibold text-[#605E5C]">
            归属商家
            <select id="field-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} required className={`${fluentSelect} w-full`}>
              <option value="">请选择...</option>
              {((merchants as MerchantUser[] | null) ?? []).map((merchant) => (
                <option key={merchant.id} value={merchant.id}>{merchant.displayName} ({merchant.username})</option>
              ))}
            </select>
          </label>
        )}
        <label htmlFor="field-name" className="grid gap-1 text-xs font-semibold text-[#605E5C]">
          地块名称
          <input id="field-name" value={name} onChange={(e) => setName(e.target.value)} required className={`${fluentInput} w-full`} />
        </label>
        <label htmlFor="field-area" className="grid gap-1 text-xs font-semibold text-[#605E5C]">
          面积(亩)
          <input id="field-area" type="number" step="0.1" value={area} onChange={(e) => setArea(e.target.value)} required className={`${fluentInput} w-full`} />
        </label>
        <div>
          <span className="mb-1 block text-xs font-semibold text-[#605E5C]">地块位置(点击地图选点，或手动填写)</span>
          <div className="h-48 overflow-hidden border border-[#E1DFDD]">
            <TiandituPicker
              lng={lng ? Number(lng) : null}
              lat={lat ? Number(lat) : null}
              onPick={(pickedLng, pickedLat) => { setLng(String(pickedLng)); setLat(String(pickedLat)); }}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor="field-lng" className="grid gap-1 text-xs font-semibold text-[#605E5C]">
            经度
            <input id="field-lng" type="number" step="0.000001" value={lng} onChange={(e) => setLng(e.target.value)} required className={`${fluentInput} w-full`} />
          </label>
          <label htmlFor="field-lat" className="grid gap-1 text-xs font-semibold text-[#605E5C]">
            纬度
            <input id="field-lat" type="number" step="0.000001" value={lat} onChange={(e) => setLat(e.target.value)} required className={`${fluentInput} w-full`} />
          </label>
        </div>
        {err && <p className="text-sm font-semibold text-[#A4262C]">{err}</p>}
      </form>
    </ModalSurface>
  );
}
