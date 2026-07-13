import { lazy, Suspense, type ReactNode } from 'react';
import type { AppTab, SystemRole } from '../navigation';
import type { AiWorkspaceContext } from './AiAssistant.model';

const MerchantAdmin = lazy(() => import('./MerchantAdmin'));
const Dashboard = lazy(() => import('./Dashboard'));
const BatchAdmin = lazy(() => import('./BatchAdmin'));
const FarmRecords = lazy(() => import('./FarmRecords'));
const LogisticsTracker = lazy(() => import('./LogisticsTracker'));
const FarmFields = lazy(() => import('./FarmFields'));
const Settings = lazy(() => import('./Settings'));
const MemberCenter = lazy(() => import('./MemberCenter'));
const AgentManagement = lazy(() => import('./AgentManagement'));
const MerchantManagement = lazy(() => import('./MerchantManagement'));
const AiProviders = lazy(() => import('./AiProviders'));
const SystemSettings = lazy(() => import('./SystemSettings'));
const IntegrationSettings = lazy(() => import('./IntegrationSettings'));
const UserGroups = lazy(() => import('./UserGroups'));
const PendingUsers = lazy(() => import('./PendingUsers'));
const QuickTemplates = lazy(() => import('./QuickTemplates'));
const AiAssistant = lazy(() => import('./AiAssistant'));
const PhenologyAdmin = lazy(() => import('./PhenologyAdmin'));
const BillingAdmin = lazy(() => import('./BillingAdmin'));
const TenantManagement = lazy(() => import('./TenantManagement'));

function ViewSlot({ tab, activeTab, mountedTabs, allowedTabs, children }: {
  tab: AppTab;
  activeTab: AppTab;
  mountedTabs: Set<AppTab>;
  allowedTabs: AppTab[];
  children: ReactNode;
}) {
  if (!mountedTabs.has(tab) || !allowedTabs.includes(tab)) return null;
  return (
    <div className={`h-full transition-opacity duration-300 ${activeTab === tab ? 'block opacity-100' : 'hidden opacity-0'}`}>
      {children}
    </div>
  );
}

export default function AppWorkspaceViews({
  activeTab,
  mountedTabs,
  allowedTabs,
  role,
  onNavigate,
  aiContext,
  onOpenAi,
  fallback,
}: {
  activeTab: AppTab;
  mountedTabs: Set<AppTab>;
  allowedTabs: AppTab[];
  role: SystemRole;
  onNavigate: (tab: AppTab) => void;
  aiContext?: AiWorkspaceContext;
  onOpenAi: (context: AiWorkspaceContext) => void;
  fallback: ReactNode;
}) {
  const slot = (tab: AppTab, content: ReactNode) => (
    <ViewSlot key={tab} tab={tab} activeTab={activeTab} mountedTabs={mountedTabs} allowedTabs={allowedTabs}>
      {content}
    </ViewSlot>
  );
  const aiAvailable = allowedTabs.includes('aiAssistant');

  return (
    <Suspense fallback={fallback}>
      <div className="relative h-full">
        {slot('overview', <Dashboard role={role} onNavigate={onNavigate} />)}
        {slot('fields', <FarmFields onNavigate={onNavigate} onOpenAi={aiAvailable ? onOpenAi : undefined} />)}
        {slot('tenants', <TenantManagement />)}
        {slot('agents', <AgentManagement />)}
        {slot('merchant', <MerchantAdmin onNavigate={onNavigate} />)}
        {slot('batches', (
          <BatchAdmin
            billingAvailable={allowedTabs.includes('billing')}
            onOpenBilling={() => onNavigate('billing')}
            onOpenAi={aiAvailable ? onOpenAi : undefined}
          />
        ))}
        {slot('records', <FarmRecords />)}
        {slot('logistics', <LogisticsTracker />)}
        {slot('memberHome', <MemberCenter />)}
        {slot('settings', <Settings />)}
        {slot('merchantFiles', <MerchantManagement />)}
        {slot('aiProviders', <AiProviders />)}
        {slot('aiOssSettings', <SystemSettings />)}
        {slot('integrations', <IntegrationSettings />)}
        {slot('userGroups', <UserGroups />)}
        {slot('pendingUsers', <PendingUsers />)}
        {slot('quickTemplates', <QuickTemplates />)}
        {slot('aiAssistant', <AiAssistant role={role} context={aiContext} />)}
        {slot('phenology', <PhenologyAdmin />)}
        {slot('billing', <BillingAdmin />)}
      </div>
    </Suspense>
  );
}
