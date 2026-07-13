import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { canonicalAllowedTab, parseAuthenticatedTab, tabToHash } from './app-route';
import type { AppTab, SystemRole } from './navigation';
import { confirmUnsavedNavigation } from './ui/unsaved-changes';

interface UseAppLocationOptions {
  activeTab: AppTab;
  isAuthenticated: boolean;
  isReady: boolean;
  navRole: SystemRole;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  setPayResultOrderId: Dispatch<SetStateAction<string | null>>;
  setTraceCode: Dispatch<SetStateAction<string | null>>;
}

export function useAppLocation({
  activeTab,
  isAuthenticated,
  isReady,
  navRole,
  setActiveTab,
  setPayResultOrderId,
  setTraceCode,
}: UseAppLocationOptions) {
  const acceptedWorkspaceHashRef = useRef<string | null>(null);

  const pushWorkspaceTab = useCallback((tab: AppTab) => {
    const nextHash = tabToHash(tab);
    if (window.location.hash !== nextHash) window.history.pushState(window.history.state, '', nextHash);
    acceptedWorkspaceHashRef.current = nextHash;
    setActiveTab(tab);
  }, [setActiveTab]);

  const replaceWorkspaceTab = useCallback((tab: AppTab) => {
    const nextHash = tabToHash(tab);
    window.history.replaceState(window.history.state, '', nextHash);
    acceptedWorkspaceHashRef.current = nextHash;
    setActiveTab(tab);
  }, [setActiveTab]);

  const clearAuthenticatedRoute = useCallback(() => {
    if (parseAuthenticatedTab(window.location.hash)) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    }
    acceptedWorkspaceHashRef.current = null;
  }, []);

  useEffect(() => {
    let active = true;

    const handleLocationChange = async () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/trace/')) {
        const raw = hash.slice('#/trace/'.length).split(/[/?#]/)[0];
        let code = raw;
        try { code = decodeURIComponent(raw); } catch { /* keep raw code */ }
        if (active) { setTraceCode(code); setPayResultOrderId(null); }
        return;
      }
      if (hash.startsWith('#/billing/pay-result')) {
        const qs = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
        const orderId = new URLSearchParams(qs).get('orderId');
        if (active) { setPayResultOrderId(orderId); setTraceCode(null); }
        return;
      }

      if (!active) return;
      setTraceCode(null);
      setPayResultOrderId(null);
      if (!isReady || !isAuthenticated) return;

      const requestedTab = parseAuthenticatedTab(hash);
      const nextTab = canonicalAllowedTab(hash, navRole);
      const nextHash = tabToHash(nextTab);
      if (requestedTab !== nextTab) {
        window.history.replaceState(window.history.state, '', nextHash);
        acceptedWorkspaceHashRef.current = nextHash;
        setActiveTab(nextTab);
        return;
      }

      if (nextTab !== activeTab && !(await confirmUnsavedNavigation())) {
        const acceptedHash = acceptedWorkspaceHashRef.current ?? tabToHash(activeTab);
        window.history.replaceState(window.history.state, '', acceptedHash);
        return;
      }
      if (!active) return;
      if (hash !== nextHash) window.history.replaceState(window.history.state, '', nextHash);
      acceptedWorkspaceHashRef.current = nextHash;
      setActiveTab(nextTab);
    };

    void handleLocationChange();
    const onLocationChange = () => { void handleLocationChange(); };
    window.addEventListener('hashchange', onLocationChange);
    window.addEventListener('popstate', onLocationChange);
    return () => {
      active = false;
      window.removeEventListener('hashchange', onLocationChange);
      window.removeEventListener('popstate', onLocationChange);
    };
  }, [activeTab, isAuthenticated, isReady, navRole, setActiveTab, setPayResultOrderId, setTraceCode]);

  return { clearAuthenticatedRoute, pushWorkspaceTab, replaceWorkspaceTab };
}
