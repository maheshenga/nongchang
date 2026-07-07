import { useState } from 'react';
import { MonitorCog, Save } from 'lucide-react';
import { showToast } from '../hooks/useToast';
import { fluentButton, fluentFocus, fluentSelect } from '../ui/fluent';

const STORAGE_KEY = 'agri_display_preferences';

type Preferences = {
  compactTables: boolean;
  reduceMotion: boolean;
  dateFormat: 'date' | 'dateTime';
};

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
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences());

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    showToast('本地偏好已保存');
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
      </div>
    </div>
  );
}
