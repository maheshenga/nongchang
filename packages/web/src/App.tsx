import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { QrCode, Bell, Sparkles, LogOut } from 'lucide-react';
import { motion } from 'motion/react';
import AppLogin from './components/AppLogin';
import { useAuth } from './auth/auth-context';
import { ToastBanner } from './hooks/useToast';
import { firstAllowedTab, getNavItems, isSystemRole, type AppTab, type SystemRole } from './navigation';

const MerchantAdmin = lazy(() => import('./components/MerchantAdmin'));
const BatchAdmin = lazy(() => import('./components/BatchAdmin'));
const FarmRecords = lazy(() => import('./components/FarmRecords'));
const LogisticsTracker = lazy(() => import('./components/LogisticsTracker'));
const FarmFields = lazy(() => import('./components/FarmFields'));
const Settings = lazy(() => import('./components/Settings'));
const AgentManagement = lazy(() => import('./components/AgentManagement'));
const TraceabilityPage = lazy(() => import('./components/TraceabilityPage'));
const MerchantManagement = lazy(() => import('./components/MerchantManagement'));
const AiProviders = lazy(() => import('./components/AiProviders'));
const SystemSettings = lazy(() => import('./components/SystemSettings'));
const IntegrationSettings = lazy(() => import('./components/IntegrationSettings'));
const UserGroups = lazy(() => import('./components/UserGroups'));
const PendingUsers = lazy(() => import('./components/PendingUsers'));
const QuickTemplates = lazy(() => import('./components/QuickTemplates'));
const AiAssistant = lazy(() => import('./components/AiAssistant'));
const PhenologyAdmin = lazy(() => import('./components/PhenologyAdmin'));
const BillingAdmin = lazy(() => import('./components/BillingAdmin'));
const TenantManagement = lazy(() => import('./components/TenantManagement'));
const PayResult = lazy(() => import('./components/PayResult'));
const ProfileSettings = lazy(() => import('./components/ProfileSettings'));

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

function roleDisplay(role: SystemRole | null): { title: string; subtitle: string; badge: string; short: string } {
  if (role === 'platform_admin') {
    return { title: 'Platform Admin', subtitle: '平台运营账户', badge: '平台管理员', short: 'Platform' };
  }
  if (role === 'system_admin') {
    return { title: 'Super Admin', subtitle: '企业版授权账户', badge: '总管理员', short: 'Super Admin' };
  }
  if (role === 'agent_admin') {
    return { title: 'Agent Admin', subtitle: '代理商管理专员', badge: '代理商', short: 'Agent' };
  }
  if (role === 'member') {
    return { title: 'Member', subtitle: '普通会员账号', badge: '普通会员', short: 'Member' };
  }
  return { title: 'Merchant', subtitle: '商户专属工作台', badge: '商家', short: 'Merchant' };
}

function toSystemRole(role: string): SystemRole {
  if (role === 'merchant') return 'merchant_admin';
  if (isSystemRole(role)) return role;
  return 'member';
}

export default function App() {
  const { user, profile, isAuthenticated, logout } = useAuth();
  const systemRole: SystemRole | null = user ? toSystemRole(user.role) : null;
  const [activeTab, setActiveTab] = useState<AppTab>('fields');
  const [mountedTabs, setMountedTabs] = useState<Set<AppTab>>(new Set());
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [traceCode, setTraceCode] = useState<string | null>(null);
  const [payResultOrderId, setPayResultOrderId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const navRole = systemRole ?? 'system_admin';
  const navItems = getNavItems(navRole);
  const roleInfo = roleDisplay(systemRole);
  const allowedTabs = useMemo(() => navItems.flatMap(category => category.items.map(item => item.id)), [navItems]);
  const canOpenBilling = allowedTabs.includes('billing');

  useEffect(() => {
    const allowedTab = firstAllowedTab(navRole, activeTab);
    setMountedTabs(prev => {
      const next = new Set<AppTab>();
      for (const tab of prev) {
        if (allowedTabs.includes(tab)) next.add(tab);
      }
      next.add(allowedTab);
      return next;
    });
  }, [navRole, activeTab, allowedTabs]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/trace/')) {
        // 取 #/trace/ 之后的首段,裁掉可能的尾部查询串/多余路径;与 fetchPublicTrace 的 encodeURIComponent 对称 decode。
        const raw = hash.slice('#/trace/'.length).split(/[/?#]/)[0];
        let code = raw;
        try { code = decodeURIComponent(raw); } catch { /* 非法编码则按原样 */ }
        setTraceCode(code);
        setPayResultOrderId(null);
      } else if (hash.startsWith('#/billing/pay-result')) {
        // 支付宝同步回跳:#/billing/pay-result?orderId=xxx
        const qs = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
        const orderId = new URLSearchParams(qs).get('orderId');
        setPayResultOrderId(orderId);
        setTraceCode(null);
      } else {
        setTraceCode(null);
        setPayResultOrderId(null);
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
    setActiveTab('fields');
  };

  // 默认/兜底:若当前 activeTab 不在该角色导航内(如已下线的 dashboard),自动跳到首个可用页。
  useEffect(() => {
    const fallbackTab = firstAllowedTab(navRole, activeTab);
    if (fallbackTab !== activeTab) {
      setActiveTab(fallbackTab);
    }
  }, [navRole, activeTab]);

  if (traceCode) {
    return <TraceabilityPage code={traceCode} onBack={() => { window.location.hash = ''; setTraceCode(null); }} />;
  }

  if (!isAuthenticated) {
    return <AppLogin />;
  }

  if (payResultOrderId) {
    return (
      <Suspense fallback={<ViewSkeleton />}>
        <PayResult
          orderId={payResultOrderId}
          onBack={() => { window.location.hash = ''; setPayResultOrderId(null); setActiveTab('billing'); }}
        />
      </Suspense>
    );
  }

  const isMounted = (tab: AppTab) => mountedTabs.has(tab) && allowedTabs.includes(tab);

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
              <div className="text-xs font-medium text-emerald-100">{roleInfo.title}</div>
              <div className="text-[10px] text-emerald-500/80">{roleInfo.subtitle}</div>
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
                       onClick={() => setActiveTab(item.id)}
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
        {canOpenBilling && (
        <div className="p-3 lg:p-5 group-hover:p-5 mt-auto border-t border-white/5 transition-all">
          <div className="bg-gradient-to-br from-emerald-900/40 to-teal-900/40 rounded-2xl p-2 lg:p-4 group-hover:p-4 border border-emerald-800/30 relative overflow-hidden transition-all flex flex-col items-center group-hover:items-stretch lg:items-stretch">
            <Sparkles className="absolute top-2 right-2 w-20 h-20 text-emerald-500/10 -rotate-12 pointer-events-none hidden group-hover:block lg:block" />
            <div className="text-[10px] text-emerald-400 font-bold mb-1 tracking-wider uppercase whitespace-nowrap hidden group-hover:block lg:block">资源订购</div>
            <button
              type="button"
              aria-label="Open billing resources"
              onClick={() => setActiveTab('billing')}
              className="w-full bg-white/10 hover:bg-emerald-500 hover:text-white text-emerald-100 text-[10px] lg:text-xs group-hover:text-xs font-bold py-1.5 lg:py-3 group-hover:py-3 rounded-lg lg:rounded-xl group-hover:rounded-xl transition-all duration-300 uppercase tracking-widest shadow-sm"
            >
              <span className="hidden group-hover:inline lg:inline">订购资源</span>
              <span className="inline group-hover:hidden lg:hidden">+</span>
            </button>
          </div>
        </div>
        )}
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
                 {roleInfo.badge}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <button
              type="button"
              aria-label="Notifications unavailable"
              disabled
              title="Notifications are not available"
              className="relative p-2 text-slate-300 cursor-not-allowed transition-colors"
            >
              <Bell className="w-5 h-5" />
            </button>
            <div className="h-6 w-px bg-slate-200"></div>
            <div onClick={() => setProfileOpen(true)} title="个人账号设置" className="flex items-center gap-3 cursor-pointer group">
              <div className="flex flex-col items-end">
                <span className="text-sm font-bold text-slate-700 group-hover:text-emerald-600 transition-colors">
                  {profile?.displayName ?? '已登录用户'}
                </span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  {roleInfo.short}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-100 to-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm shadow-sm ring-2 ring-white border border-slate-200 group-hover:border-emerald-200 transition-colors">
                  <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Admin" alt="Admin" className="w-7 h-7" />
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleLogout(); }} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-2" title="退出登录">
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
              {isMounted('fields') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'fields' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><FarmFields /></div>}
              {isMounted('tenants') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'tenants' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><TenantManagement /></div>}
              {isMounted('agents') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'agents' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><AgentManagement /></div>}
              {isMounted('merchant') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'merchant' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><MerchantAdmin onNavigate={setActiveTab} /></div>}
              {isMounted('batches') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'batches' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><BatchAdmin /></div>}
              {isMounted('records') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'records' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><FarmRecords /></div>}
              {isMounted('logistics') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'logistics' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><LogisticsTracker /></div>}
              {isMounted('settings') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'settings' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><Settings /></div>}
              {isMounted('merchantFiles') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'merchantFiles' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><MerchantManagement /></div>}
              {isMounted('aiProviders') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'aiProviders' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><AiProviders /></div>}
              {isMounted('aiOssSettings') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'aiOssSettings' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><SystemSettings /></div>}
              {isMounted('integrations') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'integrations' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><IntegrationSettings /></div>}
              {isMounted('userGroups') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'userGroups' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><UserGroups /></div>}
              {isMounted('pendingUsers') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'pendingUsers' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><PendingUsers /></div>}
              {isMounted('quickTemplates') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'quickTemplates' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><QuickTemplates /></div>}
              {isMounted('aiAssistant') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'aiAssistant' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><AiAssistant /></div>}
              {isMounted('phenology') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'phenology' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><PhenologyAdmin /></div>}
              {isMounted('billing') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'billing' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><BillingAdmin /></div>}
            </div>
          </Suspense>
        </section>
      </main>

      {profileOpen && (
        <Suspense fallback={null}>
          <ProfileSettings onClose={() => setProfileOpen(false)} />
        </Suspense>
      )}
      <ToastBanner />
    </div>
  );
}
