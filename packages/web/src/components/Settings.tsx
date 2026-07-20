import { useEffect, useState } from 'react';
import { MonitorCog, Save } from 'lucide-react';
import { useAuth } from '../auth/auth-context';
import { useBranding } from '../branding/branding-context';
import { showToast } from '../hooks/useToast';
import { fluentButton, fluentFocus, fluentInput, fluentSelect } from '../ui/fluent';
import type { UpdateTenantSettingsInput } from '@nongchang/shared';

const STORAGE_KEY = 'agri_display_preferences';

type Preferences = {
  compactTables: boolean;
  reduceMotion: boolean;
  dateFormat: 'date' | 'dateTime';
};

type TenantDraft = UpdateTenantSettingsInput;

const DEFAULT_PREFERENCES: Preferences = {
  compactTables: false,
  reduceMotion: false,
  dateFormat: 'date',
};

function loadPreferences(): Preferences {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return DEFAULT_PREFERENCES;
  try {
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

const checkboxClass = `h-4 w-4 rounded-[4px] border-[#C8C6C4] text-[#0078D4] accent-[#0078D4] ${fluentFocus}`;

export default function Settings() {
  const { user } = useAuth();
  const branding = useBranding();
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences());
  const [draft, setDraft] = useState<TenantDraft>({
    publicCoordinateMode: branding.publicCoordinateMode,
    brandName: branding.brandName,
    industryName: branding.industryName,
    defaultCropName: branding.defaultCropName,
    workbenchTitle: branding.workbenchTitle,
    defaultBaseLabel: branding.defaultBaseLabel,
    supportContact: branding.supportContact,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setDraft({
      publicCoordinateMode: branding.publicCoordinateMode,
      brandName: branding.brandName,
      industryName: branding.industryName,
      defaultCropName: branding.defaultCropName,
      workbenchTitle: branding.workbenchTitle,
      defaultBaseLabel: branding.defaultBaseLabel,
      supportContact: branding.supportContact,
    });
  }, [
    branding.publicCoordinateMode,
    branding.brandName,
    branding.industryName,
    branding.defaultCropName,
    branding.workbenchTitle,
    branding.defaultBaseLabel,
    branding.supportContact,
  ]);

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    showToast('本地偏好已保存');
  };

  const updateTenantDraft = <K extends keyof TenantDraft>(key: K, value: TenantDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const saveTenantBranding = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await branding.save({
        ...draft,
        supportContact: draft.supportContact?.trim() || null,
      });
      showToast('租户展示配置已保存');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden border border-[#E1DFDD] bg-white">
      <div className="flex flex-col gap-3 border-b border-[#E1DFDD] bg-white px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-[#242424]">
            <MonitorCog className="h-5 w-5 text-[#0078D4]" />
            本地偏好
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#605E5C]">
            仅保存当前浏览器的显示习惯。账户资料与密码请从右上角头像进入。
          </p>
        </div>
        <button type="button" onClick={handleSave} className={fluentButton('primary')}>
          <Save className="h-4 w-4" />
          保存本地偏好
        </button>
      </div>

      <div className="fluent-scrollbar flex-1 overflow-y-auto p-5">
        <div className="max-w-2xl divide-y divide-[#E1DFDD] border border-[#E1DFDD] bg-white">
          <section className="p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-[#242424]">显示密度</h3>
              <p className="mt-1 text-xs leading-5 text-[#605E5C]">影响支持该偏好的表格与列表间距。</p>
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span className="text-sm font-semibold text-[#323130]">紧凑表格</span>
              <input
                aria-label="紧凑表格"
                type="checkbox"
                checked={preferences.compactTables}
                onChange={(e) => update('compactTables', e.target.checked)}
                className={checkboxClass}
              />
            </label>
          </section>

          <section className="p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-[#242424]">动效偏好</h3>
              <p className="mt-1 text-xs leading-5 text-[#605E5C]">减少非必要过渡动画，适合长时间后台操作。</p>
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span className="text-sm font-semibold text-[#323130]">减少动效</span>
              <input
                aria-label="减少动效"
                type="checkbox"
                checked={preferences.reduceMotion}
                onChange={(e) => update('reduceMotion', e.target.checked)}
                className={checkboxClass}
              />
            </label>
          </section>

          <section className="p-4">
            <label htmlFor="settings-date-format" className="mb-2 block text-sm font-semibold text-[#242424]">日期显示</label>
            <p className="mb-3 text-xs leading-5 text-[#605E5C]">选择列表中日期字段的默认显示格式。</p>
            <select
              id="settings-date-format"
              aria-label="日期显示格式"
              value={preferences.dateFormat}
              onChange={(e) => update('dateFormat', e.target.value as Preferences['dateFormat'])}
              className={`${fluentSelect} w-full`}
            >
              <option value="date">仅日期</option>
              <option value="dateTime">日期与时间</option>
            </select>
          </section>
        </div>

        {user?.role === 'system_admin' && (
          <div className="mt-6 max-w-2xl border border-[#E1DFDD] bg-white p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-[#242424]">租户展示与公开策略</h3>
              <p className="mt-1 text-xs leading-5 text-[#605E5C]">
                这里控制生产环境对外文案与公开坐标策略。hidden 隐藏坐标，approximate 保留两位小数，exact 公开精确值。
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[#323130]">品牌名称</span>
                <input
                  aria-label="品牌名称"
                  value={draft.brandName ?? ''}
                  onChange={(e) => updateTenantDraft('brandName', e.target.value)}
                  className={`${fluentInput} w-full`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[#323130]">行业名称</span>
                <input
                  aria-label="行业名称"
                  value={draft.industryName ?? ''}
                  onChange={(e) => updateTenantDraft('industryName', e.target.value)}
                  className={`${fluentInput} w-full`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[#323130]">默认作物名称</span>
                <input
                  aria-label="默认作物名称"
                  value={draft.defaultCropName ?? ''}
                  onChange={(e) => updateTenantDraft('defaultCropName', e.target.value)}
                  className={`${fluentInput} w-full`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[#323130]">工作台标题</span>
                <input
                  aria-label="工作台标题"
                  value={draft.workbenchTitle ?? ''}
                  onChange={(e) => updateTenantDraft('workbenchTitle', e.target.value)}
                  className={`${fluentInput} w-full`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[#323130]">默认基地标签</span>
                <input
                  aria-label="默认基地标签"
                  value={draft.defaultBaseLabel ?? ''}
                  onChange={(e) => updateTenantDraft('defaultBaseLabel', e.target.value)}
                  className={`${fluentInput} w-full`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[#323130]">客服联系方式</span>
                <input
                  aria-label="客服联系方式"
                  value={draft.supportContact ?? ''}
                  onChange={(e) => updateTenantDraft('supportContact', e.target.value)}
                  placeholder="电话、邮箱或客服入口"
                  className={`${fluentInput} w-full`}
                />
                <span className="mt-1 block text-xs leading-5 text-[#605E5C]">
                  留空时小程序显示通用的运营人员提示。
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[#323130]">公开坐标模式</span>
                <select
                  aria-label="公开坐标模式"
                  value={draft.publicCoordinateMode ?? 'hidden'}
                  onChange={(e) => updateTenantDraft('publicCoordinateMode', e.target.value as TenantDraft['publicCoordinateMode'])}
                  className={`${fluentSelect} w-full`}
                >
                  <option value="hidden">隐藏坐标</option>
                  <option value="approximate">近似坐标</option>
                  <option value="exact">精确坐标</option>
                </select>
              </label>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button type="button" onClick={() => void saveTenantBranding()} className={fluentButton('primary')} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? '保存中…' : '保存租户配置'}
              </button>
              {saveError && <p className="text-sm text-[#A4262C]">{saveError}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
