import { useState, useEffect, lazy, Suspense } from 'react';
import { LayoutDashboard, QrCode, Smartphone, Database, Layers, FileSpreadsheet, Truck, Bell, Sparkles, Map, Settings as SettingsIcon, Users, Store, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AppLogin from './components/AppLogin';
import { useAuth } from './auth/auth-context';

const Dashboard = lazy(() => import('./components/Dashboard'));
const MerchantAdmin = lazy(() => import('./components/MerchantAdmin'));
const MobileView = lazy(() => import('./components/MobileView'));
const SystemAdmin = lazy(() => import('./components/SystemAdmin'));
const BatchAdmin = lazy(() => import('./components/BatchAdmin'));
const FarmRecords = lazy(() => import('./components/FarmRecords'));
const LogisticsTracker = lazy(() => import('./components/LogisticsTracker'));
const FarmFields = lazy(() => import('./components/FarmFields'));
const Settings = lazy(() => import('./components/Settings'));
const AgentPlatform = lazy(() => import('./components/AgentPlatform'));
const TraceabilityPage = lazy(() => import('./components/TraceabilityPage'));
const MerchantManagement = lazy(() => import('./components/MerchantManagement'));
const AiProviders = lazy(() => import('./components/AiProviders'));
const SystemSettings = lazy(() => import('./components/SystemSettings'));

const ViewSkeleton = () => (
  <div className="animate-pulse space-y-6 w-full h-full p-4">
    <div className="h-8 bg-slate-200 rounded-lg w-1/4"></div>
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <div className="h-32 bg-slate-200 rounded-2xl"></div>
      <div className="h-32 bg-slate-200 rounded-2xl"></div>
      <div className="h-32 bg-slate-200 rounded-2xl"></div>
      <div className="h-32 bg-slate-200 rounded-2xl"></div>
    </div>
    <div className="h-[400px] bg-slate-200 rounded-2xl w-full"></div>
  </div>
);

type SystemRole = 'system_admin' | 'agent_admin' | 'merchant_admin';

type NavItem = { id: string; label: string; icon: any };
type NavCategory = { category: string; items: NavItem[] };

export default function App() {
  const { user, isAuthenticated, logout } = useAuth();
  const systemRole: SystemRole | null = user
    ? (user.role === 'merchant' ? 'merchant_admin' : user.role)
    : null;
  const [activeTab, setActiveTab] = useState<'dashboard' | 'fields' | 'merchant' | 'batches' | 'records' | 'mobile' | 'warehouse' | 'logistics' | 'settings' | 'agents' | 'merchantFiles' | 'aiProviders' | 'aiOssSettings'>('dashboard');
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set(['dashboard']));
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [traceCode, setTraceCode] = useState<string | null>(null);

  useEffect(() => {
    setMountedTabs(prev => new Set(prev).add(activeTab));
  }, [activeTab]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/trace/')) {
        const code = hash.replace('#/trace/', '');
        setTraceCode(code);
      } else {
        setTraceCode(null);
      }
    };
    
    // Initial check
    handleHashChange();
    
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const handleTogglePresentation = (e: Event) => {
      const customEvent = e as CustomEvent;
      setIsPresentationMode(customEvent.detail?.mode ?? !isPresentationMode);
    };
    window.addEventListener('toggle-presentation', handleTogglePresentation);
    return () => window.removeEventListener('toggle-presentation', handleTogglePresentation);
  }, [isPresentationMode]);

  const handleLogout = () => {
    logout();
    setActiveTab('dashboard');
  };

  // Define nav items for each role
  const SYSTEM_ADMIN_NAV: NavCategory[] = [
    {
      category: '核心看板',
      items: [
        { id: 'dashboard', label: '总台大屏监控', icon: LayoutDashboard },
      ]
    },
    {
      category: '平台组织管理',
      items: [
        { id: 'agents', label: '代理商管理', icon: Users },
        { id: 'merchantFiles', label: '商户管理与档案', icon: Store },
      ]
    },
    {
      category: '生产与供应链',
      items: [
        { id: 'fields', label: '数字地块与 IoT', icon: Map },
        { id: 'records', label: '农事实操记录', icon: FileSpreadsheet },
        { id: 'batches', label: '全域批次追踪', icon: Layers },
        { id: 'warehouse', label: '智能仓储管理', icon: Database },
        { id: 'logistics', label: '现代物流与系统', icon: Truck },
      ]
    },
    {
      category: '移动端与系统',
      items: [
        { id: 'mobile', label: '种植与检测小程序', icon: Smartphone },
        { id: 'aiProviders', label: 'AI 服务商', icon: Sparkles },
        { id: 'aiOssSettings', label: 'AI 与存储设置', icon: SettingsIcon },
        { id: 'settings', label: '系统设置', icon: SettingsIcon },
      ]
    }
  ];

  const AGENT_ADMIN_NAV: NavCategory[] = [
    {
      category: '代理商中心',
      items: [
        { id: 'dashboard', label: '代理商大屏', icon: LayoutDashboard },
        { id: 'merchantFiles', label: '旗下商家管理', icon: Store },
      ]
    },
    {
      category: '业务与系统',
      items: [
        { id: 'batches', label: '辖区批次追踪', icon: Layers },
        { id: 'settings', label: '代理商设置', icon: SettingsIcon },
      ]
    }
  ];

  const MERCHANT_ADMIN_NAV: NavCategory[] = [
    {
      category: '商家总览',
      items: [
        { id: 'dashboard', label: '商家数据看板', icon: LayoutDashboard },
      ]
    },
    {
      category: '生产与档案',
      items: [
        { id: 'fields', label: '我的地块管理', icon: Map },
        { id: 'merchant', label: '我的芍药档案', icon: QrCode },
        { id: 'records', label: '农事实操', icon: FileSpreadsheet },
        { id: 'batches', label: '我的批次记录', icon: Layers },
      ]
    },
    {
      category: '系统',
      items: [
        { id: 'mobile', label: '商家移动端', icon: Smartphone },
        { id: 'settings', label: '商家设置', icon: SettingsIcon },
      ]
    }
  ];

  const getNavItems = () => {
    switch (systemRole) {
      case 'system_admin': return SYSTEM_ADMIN_NAV;
      case 'agent_admin': return AGENT_ADMIN_NAV;
      case 'merchant_admin': return MERCHANT_ADMIN_NAV;
      default: return SYSTEM_ADMIN_NAV;
    }
  };

  const navItems = getNavItems();

  if (traceCode) {
    return <TraceabilityPage code={traceCode} onBack={() => { window.location.hash = ''; setTraceCode(null); }} />;
  }

  if (!isAuthenticated) {
    return <AppLogin />;
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      {/* Sidebar */}
      {!isPresentationMode && (
        <aside className="group w-20 hover:w-72 lg:w-72 transition-all duration-300 ease-in-out bg-[#0E1B15] text-emerald-50 flex flex-col border-r border-[#1B2F25] shrink-0 z-50 h-full absolute lg:relative overflow-hidden shadow-2xl lg:shadow-none">
          <div className="p-5 flex flex-col gap-6">
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-3 whitespace-nowrap">
            <div className="w-10 h-10 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 shrink-0">
              <QrCode className="w-5 h-5 shrink-0" />
            </div>
            <span className="opacity-0 group-hover:opacity-100 lg:opacity-100 transition-opacity duration-300">溯源 SaaS</span>
          </h1>
          <div className="bg-white/5 border border-white/10 rounded-xl p-1.5 lg:px-4 lg:py-3 flex items-center gap-3 backdrop-blur-sm cursor-pointer hover:bg-white/10 transition-colors whitespace-nowrap group-hover:px-4 group-hover:py-3">
            <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-300 font-bold text-xs ring-1 ring-emerald-500/50 shrink-0 transition-all">A</div>
            <div className="flex-1 opacity-0 w-0 lg:w-auto overflow-hidden group-hover:w-auto group-hover:opacity-100 lg:opacity-100 transition-all duration-300">
              <div className="text-xs font-medium text-emerald-100">{systemRole === 'system_admin' ? 'Super Admin' : systemRole === 'agent_admin' ? 'Agent Admin' : 'Merchant'}</div>
              <div className="text-[10px] text-emerald-500/80">{systemRole === 'system_admin' ? '企业版授权账户' : systemRole === 'agent_admin' ? '代理商管理专员' : '商户专属工作台'}</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-6 lg:px-4 lg:space-y-6 transition-all overflow-y-auto overflow-x-hidden no-scrollbar">
          {navItems.map((category) => (
            <div key={category.category} className="space-y-1 group-hover:space-y-1 relative">
               <div className="text-[10px] font-bold tracking-widest text-emerald-600/70 uppercase px-3 mb-2 whitespace-nowrap opacity-0 group-hover:opacity-100 lg:opacity-100 transition-opacity duration-300 hidden group-hover:block lg:block">
                  {category.category}
               </div>
               <div className="space-y-1">
                 {category.items.map((item) => {
                   const Icon = item.icon;
                   const isActive = activeTab === item.id;
                   return (
                     <button
                       key={item.id}
                       onClick={() => setActiveTab(item.id as any)}
                       className={`w-full flex items-center gap-3 p-2.5 lg:px-4 lg:py-2.5 group-hover:px-4 group-hover:py-2.5 rounded-xl transition-all duration-200 text-sm font-medium relative overflow-hidden flex-nowrap
                         ${isActive 
                           ? 'text-white' 
                           : 'text-emerald-300/60 hover:text-emerald-100 hover:bg-white/5'
                         }
                       `}
                       title={item.label}
                     >
                       {isActive && (
                          <motion.div 
                            layoutId="nav-active-bg" 
                            className="absolute inset-0 bg-emerald-500/15 border border-emerald-500/30 rounded-xl"
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                          />
                       )}
                       
                       <Icon className={`w-5 h-5 shrink-0 transition-all duration-300 relative z-10 ${isActive ? 'text-emerald-400' : 'group-hover:scale-110 lg:group-hover:scale-110 group-hover:text-emerald-300'}`} />
                       <span className="relative z-10 whitespace-nowrap opacity-0 group-hover:opacity-100 lg:opacity-100 transition-opacity duration-300 hidden group-hover:inline lg:inline w-0 group-hover:w-auto lg:w-auto text-left text-ellipsis overflow-hidden">{item.label}</span>
                     </button>
                   );
                 })}
               </div>
            </div>
          ))}
        </nav>
        <div className="p-3 lg:p-5 group-hover:p-5 mt-auto border-t border-white/5 transition-all">
          <div className="bg-gradient-to-br from-emerald-900/40 to-teal-900/40 rounded-2xl p-2 lg:p-4 group-hover:p-4 border border-emerald-800/30 relative overflow-hidden transition-all flex flex-col items-center group-hover:items-stretch lg:items-stretch">
            <Sparkles className="absolute top-2 right-2 w-20 h-20 text-emerald-500/10 -rotate-12 pointer-events-none hidden group-hover:block lg:block" />
            <div className="text-[10px] text-emerald-400 font-bold mb-1 tracking-wider uppercase whitespace-nowrap hidden group-hover:block lg:block">系统配额</div>
            <div className="flex items-end gap-1 mb-0 group-hover:mb-4 lg:mb-4">
              <span className="text-sm lg:text-2xl group-hover:text-2xl font-black text-white shrink-0">12K</span>
              <span className="text-[10px] text-emerald-500 mb-1.5 uppercase font-bold hidden group-hover:inline lg:inline whitespace-nowrap">/ 20K</span>
            </div>
            <button className="w-full bg-white/10 hover:bg-emerald-500 hover:text-white text-emerald-100 text-[10px] lg:text-xs group-hover:text-xs font-bold py-1.5 lg:py-3 group-hover:py-3 rounded-lg lg:rounded-xl group-hover:rounded-xl transition-all duration-300 uppercase tracking-widest shadow-sm">
              <span className="hidden group-hover:inline lg:inline">增订资源</span>
              <span className="inline group-hover:hidden lg:hidden">+</span>
            </button>
          </div>
        </div>
      </aside>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#f4f7f6]">
        {!isPresentationMode && (
          <header className="h-[72px] bg-white/80 backdrop-blur-xl border-b border-slate-200/60 flex items-center justify-between px-8 shrink-0 relative z-10">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3 tracking-tight">
                <div className="w-1.5 h-6 bg-gradient-to-b from-emerald-400 to-emerald-600 rounded-full"></div>
                {navItems.flatMap(c => c.items).find(i => i.id === activeTab)?.label}
              </h2>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-gradient-to-r from-blue-50 to-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest rounded-md border border-indigo-100/50 shadow-sm">
                 {systemRole === 'system_admin' ? '总管理员' : systemRole === 'agent_admin' ? '代理商' : '商家'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <button className="relative p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white animate-pulse" />
            </button>
            <div className="h-6 w-px bg-slate-200"></div>
            <div className="flex items-center gap-3 cursor-pointer group">
              <div className="flex flex-col items-end">
                <span className="text-sm font-bold text-slate-700 group-hover:text-emerald-600 transition-colors">
                  {systemRole === 'system_admin' ? '李总管' : systemRole === 'agent_admin' ? '西南大区代理' : '大理基地主理人'}
                </span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  {systemRole === 'system_admin' ? 'Super Admin' : systemRole === 'agent_admin' ? 'Agent' : 'Merchant'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-100 to-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm shadow-sm ring-2 ring-white border border-slate-200 group-hover:border-emerald-200 transition-colors">
                  <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Admin" alt="Admin" className="w-7 h-7" />
                </div>
                <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-2" title="退出登录">
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </header>
      )}
        
        <section className={`flex-1 overflow-auto relative ${isPresentationMode ? 'p-0' : 'p-4 md:p-8'}`}>
          <Suspense fallback={<ViewSkeleton />}>
            <div className="h-full relative">
              {mountedTabs.has('dashboard') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'dashboard' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><Dashboard /></div>}
              {mountedTabs.has('fields') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'fields' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><FarmFields /></div>}
              {mountedTabs.has('agents') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'agents' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><AgentPlatform /></div>}
              {mountedTabs.has('merchant') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'merchant' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><MerchantAdmin /></div>}
              {mountedTabs.has('batches') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'batches' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><BatchAdmin /></div>}
              {mountedTabs.has('records') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'records' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><FarmRecords /></div>}
              {mountedTabs.has('mobile') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'mobile' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><MobileView /></div>}
              {mountedTabs.has('warehouse') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'warehouse' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><SystemAdmin /></div>}
              {mountedTabs.has('logistics') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'logistics' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><LogisticsTracker /></div>}
              {mountedTabs.has('settings') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'settings' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><Settings /></div>}
              {mountedTabs.has('merchantFiles') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'merchantFiles' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><MerchantManagement /></div>}
              {mountedTabs.has('aiProviders') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'aiProviders' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><AiProviders /></div>}
              {mountedTabs.has('aiOssSettings') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'aiOssSettings' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><SystemSettings /></div>}
            </div>
          </Suspense>
        </section>
      </main>
    </div>
  );
}
