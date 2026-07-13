import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Leaf, LogOut, Menu, Sparkles, X } from 'lucide-react';
import AppLogin from './components/AppLogin';
import AppWorkspaceViews from './components/AppWorkspaceViews';
import type { AiWorkspaceContext } from './components/AiAssistant.model';
import GlobalSearch from './components/GlobalSearch';
import { useAuth } from './auth/auth-context';
import { DialogHost } from './hooks/useDialog';
import { ToastBanner } from './hooks/useToast';
import { firstAllowedTab, getNavItems, isSystemRole, type AppTab, type SystemRole } from './navigation';
import { fluentButton } from './ui/fluent';
import { confirmUnsavedNavigation } from './ui/unsaved-changes';

const PublicLanding = lazy(() => import('./components/PublicLanding'));
const TraceabilityPage = lazy(() => import('./components/TraceabilityPage'));
const PayResult = lazy(() => import('./components/PayResult'));
const ProfileSettings = lazy(() => import('./components/ProfileSettings'));

const ViewSkeleton = () => (
  <div role="status" aria-label="正在恢复会话" className="h-full w-full animate-pulse bg-white p-5">
    <div className="mb-5 h-7 w-64 rounded-[4px] bg-[#EDEBE9]" />
    <div className="mb-4 flex gap-2">
      <div className="h-8 w-28 rounded-[4px] bg-[#EDEBE9]" />
      <div className="h-8 w-24 rounded-[4px] bg-[#EDEBE9]" />
      <div className="h-8 w-24 rounded-[4px] bg-[#EDEBE9]" />
    </div>
    <div className="overflow-hidden border border-[#E1DFDD]">
      <div className="h-9 border-b border-[#E1DFDD] bg-[#FAFAFA]" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-11 border-b border-[#EDEBE9] bg-white" />
      ))}
    </div>
  </div>
);

function roleDisplay(role: SystemRole | null): { title: string; subtitle: string; badge: string; short: string } {
  if (role === 'platform_admin') {
    return { title: 'Platform Admin', subtitle: '平台运营账户', badge: '平台管理员', short: 'Platform' };
  }
  if (role === 'system_admin') {
    return { title: 'Super Admin', subtitle: '企业授权账户', badge: '总管理员', short: 'Super Admin' };
  }
  if (role === 'agent_admin') {
    return { title: 'Agent Admin', subtitle: '代理商管理账户', badge: '代理商', short: 'Agent' };
  }
  if (role === 'member') {
    return { title: 'Member', subtitle: '普通会员账户', badge: '普通会员', short: 'Member' };
  }
  return { title: 'Merchant', subtitle: '商户工作台账户', badge: '商户', short: 'Merchant' };
}

function toSystemRole(role: string): SystemRole {
  if (role === 'merchant') return 'merchant_admin';
  if (isSystemRole(role)) return role;
  return 'member';
}

function navLabel(id: AppTab, label: string): string {
  if (id === 'batches') return '批次管理';
  if (id === 'fields') return '地块管理';
  if (id === 'billing') return '计费中心';
  return label;
}

export default function App() {
  const { user, profile, isAuthenticated, isReady, logout } = useAuth();
  const systemRole: SystemRole | null = user ? toSystemRole(user.role) : null;
  const [activeTab, setActiveTab] = useState<AppTab>('overview');
  const [mountedTabs, setMountedTabs] = useState<Set<AppTab>>(new Set());
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [traceCode, setTraceCode] = useState<string | null>(null);
  const [payResultOrderId, setPayResultOrderId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [aiContext, setAiContext] = useState<AiWorkspaceContext>();
  const [authView, setAuthView] = useState<'landing' | 'login'>('landing');
  const navRole = systemRole ?? 'system_admin';
  const navItems = getNavItems(navRole);
  const flatNavItems = useMemo(() => navItems.flatMap(category => category.items), [navItems]);
  const searchItems = useMemo(
    () => flatNavItems.map(item => ({ id: item.id, label: navLabel(item.id, item.label), icon: item.icon })),
    [flatNavItems],
  );
  const roleInfo = roleDisplay(systemRole);
  const allowedTabs = useMemo(() => flatNavItems.map(item => item.id), [flatNavItems]);
  const canOpenBilling = allowedTabs.includes('billing');
  const requestTabChange = async (tab: AppTab, beforeChange?: () => void): Promise<boolean> => {
    if (!allowedTabs.includes(tab)) return false;
    if (tab !== activeTab && !(await confirmUnsavedNavigation())) return false;
    beforeChange?.();
    setActiveTab(tab);
    return true;
  };
  const openAiWorkspace = (context: AiWorkspaceContext) => {
    if (!allowedTabs.includes('aiAssistant')) return;
    void requestTabChange('aiAssistant', () => setAiContext(context));
  };

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
        const raw = hash.slice('#/trace/'.length).split(/[/?#]/)[0];
        let code = raw;
        try { code = decodeURIComponent(raw); } catch { /* keep raw code */ }
        setTraceCode(code);
        setPayResultOrderId(null);
      } else if (hash.startsWith('#/billing/pay-result')) {
        const qs = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
        const orderId = new URLSearchParams(qs).get('orderId');
        setPayResultOrderId(orderId);
        setTraceCode(null);
      } else {
        setTraceCode(null);
        setPayResultOrderId(null);
      }
    };

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
    void logout();
    setActiveTab('overview');
    setAuthView('landing');
  };

  useEffect(() => {
    const fallbackTab = firstAllowedTab(navRole, activeTab);
    if (fallbackTab !== activeTab) {
      setActiveTab(fallbackTab);
    }
  }, [navRole, activeTab]);

  if (!isReady) return <ViewSkeleton />;

  if (traceCode) {
    return <TraceabilityPage code={traceCode} onBack={() => { window.location.hash = ''; setTraceCode(null); }} />;
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<ViewSkeleton />}>
        {authView === 'login'
          ? <AppLogin onBackToLanding={() => setAuthView('landing')} />
          : (
              <PublicLanding
                onLogin={() => setAuthView('login')}
                onTraceLookup={code => { window.location.hash = `#/trace/${encodeURIComponent(code)}`; }}
              />
            )}
      </Suspense>
    );
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

  const activeItem = flatNavItems.find(i => i.id === activeTab);
  const renderNavSections = (mobile = false) => navItems.map((category) => (
    <div key={category.category} className="py-1">
      <div className="px-4 pb-1 pt-3 text-[11px] font-semibold text-[#605E5C]">{category.category}</div>
      {category.items.map((item) => {
        const Icon = item.icon;
        const active = activeTab === item.id;
        const label = navLabel(item.id, item.label);

        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            onClick={() => {
              void requestTabChange(item.id).then(changed => {
                if (changed && mobile) setMobileNavOpen(false);
              });
            }}
            className={`flex h-10 w-full items-center gap-3 border-l-2 px-4 text-left text-sm transition-colors ${
              active
                ? 'border-l-[#0078D4] bg-[#EFF6FC] text-[#005A9E]'
                : 'border-l-transparent text-[#323130] hover:bg-[#F3F2F1]'
            }`}
            title={label}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  ));

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F5F5] text-[#242424]">
      {mobileNavOpen && !isPresentationMode && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation backdrop"
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            className="relative flex h-full w-[280px] flex-col border-r border-[#E1DFDD] bg-[#FAFAFA] shadow-xl"
          >
            <div className="flex h-12 items-center gap-3 border-b border-[#E1DFDD] px-4">
              <div className="grid h-7 w-7 place-items-center rounded-[4px] bg-[#0078D4] text-white">
                <Leaf className="h-4 w-4" />
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">农场溯源管理</span>
              <button type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} className={fluentButton('icon')}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="fluent-scrollbar flex-1 overflow-y-auto py-2">
              {renderNavSections(true)}
            </nav>
            {canOpenBilling && (
              <div className="border-t border-[#E1DFDD] p-3">
                <button
                  type="button"
                  aria-label="Open billing resources"
                  onClick={() => {
                    void requestTabChange('billing').then(changed => {
                      if (changed) setMobileNavOpen(false);
                    });
                  }}
                  className={`${fluentButton('secondary')} w-full justify-start`}
                >
                  <Sparkles className="h-4 w-4" />
                  打开计费资源
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      {!isPresentationMode && (
        <aside className="hidden w-[232px] shrink-0 border-r border-[#E1DFDD] bg-[#FAFAFA] md:flex md:flex-col">
          <div className="flex h-12 items-center gap-3 border-b border-[#E1DFDD] px-4">
            <div className="grid h-7 w-7 place-items-center rounded-[4px] bg-[#0078D4] text-white">
              <Leaf className="h-4 w-4" />
            </div>
            <span className="truncate text-sm font-semibold">农场溯源管理</span>
          </div>

          <nav className="fluent-scrollbar flex-1 overflow-y-auto py-2">
            {renderNavSections(false)}
          </nav>

          {canOpenBilling && (
            <div className="border-t border-[#E1DFDD] p-3">
              <button
                type="button"
                aria-label="Open billing resources"
                onClick={() => void requestTabChange('billing')}
                className={`${fluentButton('secondary')} w-full justify-start`}
              >
                <Sparkles className="h-4 w-4" />
                打开计费资源
              </button>
            </div>
          )}
        </aside>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        {!isPresentationMode && (
          <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[#E1DFDD] bg-white px-4">
            <button type="button" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)} className={fluentButton('icon')}>
              <Menu className="h-4 w-4" />
            </button>
            <GlobalSearch items={searchItems} onOpen={tab => void requestTabChange(tab)} />
            <div className="ml-auto flex min-w-0 items-center gap-2 text-xs text-[#605E5C]">
              <span className="hidden truncate sm:inline">{profile?.displayName ?? user?.userId ?? '已登录用户'}</span>
              <span className="hidden rounded-[4px] bg-[#F3F2F1] px-2 py-1 font-semibold text-[#323130] sm:inline">{roleInfo.badge}</span>
              <button type="button" onClick={() => setProfileOpen(true)} className={fluentButton('subtle')}>账户</button>
              <button type="button" onClick={handleLogout} className={fluentButton('secondary')}>
                <LogOut className="h-4 w-4" />
                退出
              </button>
            </div>
          </header>
        )}

        {!isPresentationMode && (
          <div className="border-b border-[#E1DFDD] bg-white px-4 py-3 md:px-6">
            <div className="text-xs text-[#605E5C]">首页 / {activeItem ? navLabel(activeItem.id, activeItem.label) : '工作台'}</div>
            <h2 className="mt-1 text-xl font-semibold text-[#242424]">{activeItem ? navLabel(activeItem.id, activeItem.label) : roleInfo.title}</h2>
            <div className="mt-1 text-xs text-[#605E5C]">{roleInfo.subtitle}</div>
          </div>
        )}

        <section className={`fluent-scrollbar min-h-0 flex-1 overflow-auto ${isPresentationMode ? 'p-0' : 'p-4 md:p-6'}`}>
          <AppWorkspaceViews
            activeTab={activeTab}
            mountedTabs={mountedTabs}
            allowedTabs={allowedTabs}
            role={navRole}
            onNavigate={tab => void requestTabChange(tab)}
            aiContext={aiContext}
            onOpenAi={openAiWorkspace}
            fallback={<ViewSkeleton />}
          />
        </section>
      </main>

      {profileOpen && (
        <Suspense fallback={null}>
          <ProfileSettings onClose={() => setProfileOpen(false)} />
        </Suspense>
      )}
      <DialogHost />
      <ToastBanner />
    </div>
  );
}
