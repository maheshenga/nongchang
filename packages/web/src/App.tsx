import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { ChevronDown, ChevronRight, Leaf, LogOut, Menu, X } from 'lucide-react';
import AppLogin from './components/AppLogin';
import AppWorkspaceViews from './components/AppWorkspaceViews';
import type { AiWorkspaceContext } from './components/AiAssistant.model';
import GlobalSearch from './components/GlobalSearch';
import { useAuth } from './auth/auth-context';
import { navLabel, roleDisplay, toSystemRole } from './AppShell.model';
import { DialogHost } from './hooks/useDialog';
import { ToastBanner } from './hooks/useToast';
import { firstAllowedTab, getNavItems, type AppTab, type SystemRole } from './navigation';
import {
  getBrowserLocalStorage,
  navigationPreferenceKey,
  safeReadNavigationPreference,
  safeWriteNavigationPreference,
  toggleNavigationCategory,
} from './navigation-preferences';
import { updateRetainedTabs } from './page-retention';
import { fluentButton } from './ui/fluent';
import { PRODUCT_NAME } from './ui/branding';
import { confirmUnsavedNavigation } from './ui/unsaved-changes';
import AppErrorBoundary from './ui/AppErrorBoundary';
import { useAppLocation } from './useAppLocation';
import { useDrawerFocus } from './ui/useDrawerFocus';
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
export default function App() {
  const { user, profile, isAuthenticated, isReady, logout } = useAuth();
  const systemRole: SystemRole | null = user ? toSystemRole(user.role) : null;
  const [activeTab, setActiveTab] = useState<AppTab>('overview');
  const [retainedTabs, setRetainedTabs] = useState<AppTab[]>([]);
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [traceCode, setTraceCode] = useState<string | null>(null);
  const [payResultOrderId, setPayResultOrderId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [aiContext, setAiContext] = useState<AiWorkspaceContext>();
  const [authView, setAuthView] = useState<'landing' | 'login'>('landing');
  const drawerFocus = useDrawerFocus(mobileNavOpen, setMobileNavOpen);
  const navRole = systemRole ?? 'system_admin';
  const navItems = getNavItems(navRole);
  const navigationCategories = useMemo(() => navItems.map(category => category.category), [navItems]);
  const navigationStorage = getBrowserLocalStorage();
  const navigationStorageKey = navigationPreferenceKey(user?.tenantId ?? 'platform', user?.userId ?? 'anonymous', navRole);
  const [openNavigationCategories, setOpenNavigationCategories] = useState<Set<string>>(() =>
    safeReadNavigationPreference(navigationStorage, navigationStorageKey, navigationCategories),
  );
  const roleInfo = roleDisplay(systemRole);
  const flatNavItems = useMemo(() => navItems.flatMap(category => category.items), [navItems]);
  const activeItem = flatNavItems.find(item => item.id === activeTab);
  const activePageLabel = activeItem ? navLabel(activeItem.id, activeItem.label) : roleInfo.title;
  const searchItems = useMemo(
    () => flatNavItems.map(item => ({ id: item.id, label: navLabel(item.id, item.label), icon: item.icon })),
    [flatNavItems],
  );
  const allowedTabs = useMemo(() => flatNavItems.map(item => item.id), [flatNavItems]);
  const mountedTabs = useMemo(() => new Set(retainedTabs), [retainedTabs]);
  const { clearAuthenticatedRoute, pushWorkspaceTab, replaceWorkspaceTab } = useAppLocation({
    activeTab,
    isAuthenticated,
    isReady,
    navRole,
    setActiveTab,
    setPayResultOrderId,
    setTraceCode,
  });
  const requestTabChange = async (tab: AppTab, beforeChange?: () => void): Promise<boolean> => {
    if (!allowedTabs.includes(tab)) return false;
    if (tab !== activeTab && !(await confirmUnsavedNavigation())) return false;
    beforeChange?.();
    pushWorkspaceTab(tab);
    return true;
  };
  const openAiWorkspace = (context: AiWorkspaceContext) => {
    if (!allowedTabs.includes('aiAssistant')) return;
    void requestTabChange('aiAssistant', () => setAiContext(context));
  };

  useEffect(() => {
    setOpenNavigationCategories(safeReadNavigationPreference(navigationStorage, navigationStorageKey, navigationCategories));
  }, [navigationStorage, navigationStorageKey, navigationCategories]);

  useEffect(() => {
    document.title = isAuthenticated
      ? `${activePageLabel} - ${PRODUCT_NAME}`
      : PRODUCT_NAME;
  }, [activePageLabel, isAuthenticated]);

  const toggleNavigationGroup = (category: string) => {
    setOpenNavigationCategories(previous => {
      const next = toggleNavigationCategory(previous, category);
      safeWriteNavigationPreference(navigationStorage, navigationStorageKey, next);
      return next;
    });
  };

  useEffect(() => {
    const allowedTab = firstAllowedTab(navRole, activeTab);
    setRetainedTabs(previous => updateRetainedTabs(previous, allowedTab, allowedTabs));
  }, [navRole, activeTab, allowedTabs]);

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
    clearAuthenticatedRoute();
    setActiveTab('overview');
    setAuthView('landing');
  };

  if (!isReady) return <ViewSkeleton />;

  if (traceCode) {
    return (
      <AppErrorBoundary resetKey={`trace:${traceCode}`} onSessionExpired={handleLogout}>
        <Suspense fallback={<ViewSkeleton />}>
          <TraceabilityPage code={traceCode} onBack={() => { window.location.hash = ''; setTraceCode(null); }} />
        </Suspense>
      </AppErrorBoundary>
    );
  }

  if (!isAuthenticated) {
    return (
      <AppErrorBoundary resetKey={`public:${authView}`} onSessionExpired={handleLogout}>
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
      </AppErrorBoundary>
    );
  }

  if (payResultOrderId) {
    return (
      <AppErrorBoundary resetKey={`pay-result:${payResultOrderId}`} onSessionExpired={handleLogout}>
        <Suspense fallback={<ViewSkeleton />}>
          <PayResult
            orderId={payResultOrderId}
            onBack={() => {
              replaceWorkspaceTab('billing');
              setPayResultOrderId(null);
            }}
          />
        </Suspense>
      </AppErrorBoundary>
    );
  }

  const renderNavSections = (mobile = false) => navItems.map((category, categoryIndex) => {
    const open = openNavigationCategories.has(category.category);
    const sectionId = `${mobile ? 'mobile' : 'desktop'}-navigation-group-${categoryIndex}`;
    const CategoryIcon = open ? ChevronDown : ChevronRight;

    return (
    <div key={category.category} className="py-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={sectionId}
        onClick={() => toggleNavigationGroup(category.category)}
        className="flex w-full items-center gap-1 px-4 pb-1 pt-3 text-left text-[11px] font-semibold text-[#605E5C] hover:text-[#323130]"
      >
        <CategoryIcon className="h-3 w-3 shrink-0" />
        <span className="truncate">{category.category}</span>
      </button>
      {open && <div id={sectionId}>{category.items.map((item) => {
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
                if (changed && mobile) drawerFocus.closeDrawer();
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
      })}</div>}
    </div>
  )});

  return (
    <AppErrorBoundary resetKey={`${navRole}:${activeTab}`} onSessionExpired={handleLogout}>
      <div className="flex h-screen overflow-hidden bg-[#F5F5F5] text-[#242424]">
      {mobileNavOpen && !isPresentationMode && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="关闭导航遮罩"
            className="absolute inset-0 bg-black/30"
            onClick={drawerFocus.closeDrawer}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="移动导航"
            tabIndex={-1}
            onKeyDown={drawerFocus.onDialogKeyDown}
            className="mobile-navigation relative flex h-full w-[280px] flex-col border-r border-[#E1DFDD] bg-[#FAFAFA] shadow-xl"
          >
            <div className="flex h-12 items-center gap-3 border-b border-[#E1DFDD] px-4">
              <div className="grid h-7 w-7 place-items-center rounded-[4px] bg-[#0078D4] text-white">
                <Leaf className="h-4 w-4" />
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{PRODUCT_NAME}</span>
              <button ref={drawerFocus.closeButtonRef} type="button" aria-label="关闭导航" onClick={drawerFocus.closeDrawer} className={fluentButton('icon')}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="fluent-scrollbar flex-1 overflow-y-auto py-2">
              <div className="px-3 py-2 sm:hidden">
                <GlobalSearch
                  items={searchItems}
                  onOpen={tab => void requestTabChange(tab).then(changed => { if (changed) drawerFocus.closeDrawer(); })}
                  className="block sm:hidden"
                  idPrefix="mobile-global-search"
                  enableShortcut={false}
                />
              </div>
              {renderNavSections(true)}
            </nav>
          </aside>
        </div>
      )}

      {!isPresentationMode && (
        <aside className="hidden w-[232px] shrink-0 border-r border-[#E1DFDD] bg-[#FAFAFA] md:flex md:flex-col">
          <div className="flex h-12 items-center gap-3 border-b border-[#E1DFDD] px-4">
            <div className="grid h-7 w-7 place-items-center rounded-[4px] bg-[#0078D4] text-white">
              <Leaf className="h-4 w-4" />
            </div>
            <span className="truncate text-sm font-semibold">{PRODUCT_NAME}</span>
          </div>

          <nav className="fluent-scrollbar flex-1 overflow-y-auto py-2">
            {renderNavSections(false)}
          </nav>

        </aside>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        {!isPresentationMode && (
          <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[#E1DFDD] bg-white px-4">
            <button ref={drawerFocus.triggerRef} type="button" aria-label="打开导航" onClick={drawerFocus.openDrawer} className={`${fluentButton('icon')} md:hidden`}>
              <Menu className="h-4 w-4" />
            </button>
            <GlobalSearch items={searchItems} onOpen={tab => void requestTabChange(tab)} idPrefix="desktop-global-search" />
            <div className="ml-auto flex min-w-0 items-center gap-2 text-xs text-[#605E5C]">
              <span className="hidden truncate sm:inline">{profile?.displayName ?? '账户加载中'}</span>
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
          <div className="border-b border-[#E1DFDD] bg-white px-4 py-2 md:px-6">
            <div className="text-xs text-[#605E5C]">首页 / {activeItem ? navLabel(activeItem.id, activeItem.label) : '工作台'}</div>
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
    </AppErrorBoundary>
  );
}
