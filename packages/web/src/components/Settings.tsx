import { useState } from 'react';
import { Check, MonitorCog, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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

export default function Settings() {
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences());
  const [showToast, setShowToast] = useState(false);

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative">
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-4 py-2 rounded-full font-bold text-sm shadow-xl z-50 flex items-center gap-2"
          >
            <Check className="w-4 h-4" /> 本地偏好已保存
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="bg-slate-800 p-2 rounded-xl shadow-sm">
            <MonitorCog className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">本地偏好</h2>
            <p className="text-xs text-slate-500 mt-0.5">仅保存当前浏览器的显示习惯。账户资料与密码请从右上角头像进入。</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2"
        >
          <Save className="w-4 h-4" /> 保存本地偏好
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl space-y-4">
          <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-800">显示密度</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">影响支持该偏好的表格与列表间距。</p>
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-sm font-medium text-slate-700">紧凑表格</span>
              <input
                aria-label="紧凑表格"
                type="checkbox"
                checked={preferences.compactTables}
                onChange={(e) => update('compactTables', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
            </label>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-800">动效偏好</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">减少非必要过渡动画，适合长时间后台操作。</p>
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-sm font-medium text-slate-700">减少动效</span>
              <input
                aria-label="减少动效"
                type="checkbox"
                checked={preferences.reduceMotion}
                onChange={(e) => update('reduceMotion', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
            </label>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-800">日期显示</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">选择列表中日期字段的默认显示格式。</p>
            <select
              aria-label="日期显示格式"
              value={preferences.dateFormat}
              onChange={(e) => update('dateFormat', e.target.value as Preferences['dateFormat'])}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
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
