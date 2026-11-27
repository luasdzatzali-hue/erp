import React, { Suspense, lazy } from 'react';
import { Toaster } from 'sonner';
import { Loader2 } from 'lucide-react';
import type { ContactFormData } from '@/components/ui/contact';
import { useErp } from './context/ErpContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { OperationalWorkflowStepper } from './components/OperationalWorkflowStepper';
import { FactoryDispatchStrip } from './components/FactoryDispatchStrip';
import { GlobalModalManager } from './components/GlobalModalManager';
import { AuthPortalView } from './components/views/AuthPortalView';

// Code-split main operational & reporting views for fast initial boot
const DashboardView = lazy(() =>
  import('./components/views/DashboardView').then(m => ({ default: m.DashboardView }))
);
const PemakaianView = lazy(() =>
  import('./components/views/PemakaianView').then(m => ({ default: m.PemakaianView }))
);
const MasterBOMView = lazy(() =>
  import('./components/views/MasterBOMView').then(m => ({ default: m.MasterBOMView }))
);
const PermintaanView = lazy(() =>
  import('./components/views/PermintaanView').then(m => ({ default: m.PermintaanView }))
);
const PenerimaanView = lazy(() =>
  import('./components/views/PenerimaanView').then(m => ({ default: m.PenerimaanView }))
);
const TankMonitoringView = lazy(() =>
  import('./components/views/TankMonitoringView').then(m => ({ default: m.TankMonitoringView }))
);
const WeeklyPlanningView = lazy(() =>
  import('./components/views/WeeklyPlanningView').then(m => ({ default: m.WeeklyPlanningView }))
);
const BOMCalculatorView = lazy(() =>
  import('./components/views/BOMCalculatorView').then(m => ({ default: m.BOMCalculatorView }))
);
const ShiftSummaryView = lazy(() =>
  import('./components/views/ShiftSummaryView').then(m => ({ default: m.ShiftSummaryView }))
);
const GoogleSheetsSyncView = lazy(() =>
  import('./components/views/GoogleSheetsSyncView').then(m => ({ default: m.GoogleSheetsSyncView }))
);
const AdminPortalView = lazy(() =>
  import('./components/views/AdminPortalView').then(m => ({ default: m.AdminPortalView }))
);
const LineStationMonitorView = lazy(() =>
  import('./components/views/LineStationMonitorView').then(m => ({ default: m.LineStationMonitorView }))
);
const CkStationMonitorView = lazy(() =>
  import('./components/views/CkStationMonitorView').then(m => ({ default: m.CkStationMonitorView }))
);
const ContactSection = lazy(() =>
  import('@/components/ui/contact').then(m => ({ default: m.ContactSection }))
);

const ViewLoadingFallback: React.FC = () => (
  <div className="flex flex-col items-center justify-center min-h-[280px] gap-2.5 text-ink-secondary text-xs">
    <Loader2 className="w-5 h-5 animate-spin text-ink-cyan" />
    <span>Memuat modul operasional...</span>
  </div>
);

export default function App() {
  const erp = useErp();
  const { state, setupStatus, isDaylightTheme, authViewKey, showToast } = erp;
  const themeMode = isDaylightTheme ? 'daylight' : 'midnight';

  const toasterNode = (
    <Toaster
      position="bottom-right"
      richColors
      theme={isDaylightTheme ? 'light' : 'dark'}
      closeButton
      duration={3200}
      toastOptions={{
        className: 'font-sans text-xs border border-border shadow-xl'
      }}
    />
  );

  // 1. TAMPILAN AWAL: WIZARD REGISTRASI ADMIN PERTAMA ATAU PORTAL SIGN IN
  if (!state.isAuthenticated || setupStatus !== 'ready') {
    return (
      <>
        <div
          key={`auth-portal-shell-${authViewKey}`}
          className="min-h-screen w-full overflow-y-auto bg-background text-foreground font-sans"
        >
          <AuthPortalView
            key={`auth-portal-${authViewKey}`}
            state={state}
            theme={themeMode}
            onToggleTheme={erp.handleToggleTheme}
            setupStatus={setupStatus}
            cloudFactoryName={erp.cloudFactoryName}
            firebaseUser={erp.firebaseUser}
            cloudAuthRole={erp.cloudAuthRole}
            isSyncingCloud={erp.isSyncingCloud}
            authError={erp.authErrorBanner}
            onClearAuthError={() => erp.setAuthErrorBanner(null)}
            onRetryCheckSetup={erp.runSetupCheck}
            onCompleteFirstAdminSetup={erp.handleCompleteFirstAdminSetup}
            onGoogleCloudLogin={erp.handleGoogleCloudLogin}
            onFirebaseSignOut={erp.handleFirebaseSignOut}
            onLoginSuccess={erp.handleLoginSuccess}
            showToast={showToast}
          />
        </div>
        {toasterNode}
      </>
    );
  }

  // 1B. DEDICATED STATION MONITOR MODE (KIOSK MODE: ?station=line&id=... or ?station=ck&id=...)
  if (erp.activeStation) {
    return (
      <>
        <ErrorBoundary>
          <Suspense fallback={<ViewLoadingFallback />}>
            {erp.activeStation.type === 'line' ? (
              <LineStationMonitorView
                state={state}
                lineId={erp.activeStation.id}
                theme={themeMode}
                onToggleTheme={erp.handleToggleTheme}
                onExitMonitor={erp.handleExitStationMonitor}
                onRecordMaterialReject={erp.handleRecordMaterialReject}
                onProduceCartons={erp.handleProduceCartons}
              />
            ) : (
              <CkStationMonitorView
                state={state}
                machineId={erp.activeStation.id}
                theme={themeMode}
                onToggleTheme={erp.handleToggleTheme}
                onExitMonitor={erp.handleExitStationMonitor}
                onRecordMaterialReject={erp.handleRecordMaterialReject}
                onCompleteWipBatch={erp.handleCompleteWipBatch}
                onResumeWipBatch={erp.handleResumeWipBatch}
                onPauseWipBatch={erp.handlePauseWipBatch}
              />
            )}
          </Suspense>
        </ErrorBoundary>
        <GlobalModalManager />
        {toasterNode}
      </>
    );
  }

  // 2. TAMPILAN SETELAH LOGIN (LEFT NAVIGATION RAIL + SLIM TOP BAR + COMPACT STEPPER)
  return (
    <>
      <div
        key={`app-shell-${authViewKey}`}
        className="h-screen w-screen overflow-hidden flex flex-col md:flex-row bg-background text-foreground font-sans select-none"
      >
        <Sidebar
          isOpen={erp.isSidebarOpen}
          onClose={() => erp.setIsSidebarOpen(false)}
          onOpenMobileDrawer={() => erp.setIsSidebarOpen(true)}
          state={state}
          onSwitchTab={erp.handleSwitchTab}
          onOpenAdminModal={() => erp.setIsAdminModalOpen(true)}
          onOpenResetModal={() => erp.setIsResetModalOpen(true)}
          onLoadSampleData={erp.handleLoadSampleData}
          onExportData={erp.handleExportJSON}
          onOpenPdfModal={() => erp.setIsPdfReportModalOpen(true)}
          onOpenRoleSwitcher={() => erp.setIsRoleSwitcherOpen(true)}
          onOpenUserManagement={() => erp.setIsUserManagementOpen(true)}
          onSignOut={erp.handleSignOut}
        />

        <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
          <Header
            state={state}
            theme={themeMode}
            onToggleTheme={erp.handleToggleTheme}
            onOpenSidebar={() => erp.setIsSidebarOpen(true)}
            onOpenAdminModal={() => erp.setIsAdminModalOpen(true)}
            onOpenTankModal={() => erp.setIsTankModalOpen(true)}
            onLoadSampleData={erp.handleLoadSampleData}
            onOpenPdfModal={() => erp.setIsPdfReportModalOpen(true)}
            onOpenRoleSwitcher={() => erp.setIsRoleSwitcherOpen(true)}
            onOpenUserManagement={() => erp.setIsUserManagementOpen(true)}
            onSwitchTab={erp.handleSwitchTab}
            onSignOut={erp.handleSignOut}
            onOpenCommandMenu={() => erp.setIsCommandMenuOpen(true)}
            isSyncingCloud={erp.isSyncingCloud}
            isCloudConnected={Boolean(erp.firebaseUser && erp.cloudAuthRole)}
            isCloudQuotaExceeded={erp.cloudQuotaStatus.isQuotaExceeded}
            currentViewTitle={erp.viewTitles[state.currentTab] || 'ProdTrack MES'}
          />

          <FactoryDispatchStrip />

          {state.currentTab !== 'contact' && (
            <OperationalWorkflowStepper state={state} onSwitchTab={erp.handleSwitchTab} />
          )}

          <main
            ref={erp.mainScrollRef}
            className="flex-1 overflow-y-auto p-3 sm:p-4 pb-20 md:pb-6 bg-background relative"
          >
            <ErrorBoundary>
              <Suspense fallback={<ViewLoadingFallback />}>
                {state.currentTab === 'admin-portal' && (
                  <AdminPortalView
                    state={state}
                    onSwitchTab={erp.handleSwitchTab}
                    onOpenPdfModal={() => erp.setIsPdfReportModalOpen(true)}
                    onOpenTankModal={() => erp.setIsTankModalOpen(true)}
                    onOpenUserManagement={() => erp.setIsUserManagementOpen(true)}
                    onOpenStockAdjustment={erp.handleOpenStockAdjustment}
                    showToast={showToast}
                  />
                )}

                {state.currentTab === 'weekly-planning' && (
                  <WeeklyPlanningView
                    state={state}
                    onSaveWeeklyPlan={erp.handleSaveWeeklyPlan}
                    onSelectWeeklyPlan={erp.handleSelectWeeklyPlan}
                    onDeleteWeeklyPlan={erp.handleDeleteWeeklyPlan}
                    onSwitchTab={erp.handleSwitchTab}
                    showToast={showToast}
                  />
                )}

                {state.currentTab === 'dashboard' && (
                  <DashboardView
                    state={state}
                    liveLineStatus={erp.liveDashboardLineStatus}
                    onOpenTankModal={() => erp.setIsTankModalOpen(true)}
                    onSwitchTab={erp.handleSwitchTab}
                    onTransferStock={erp.handleTransferStock}
                    onProduceCartons={erp.handleProduceCartons}
                    onStartSkuProduction={erp.handleStartSkuProduction}
                    onStartMultipleSkus={erp.handleStartMultipleSkus}
                    onStartLineBatchRuns={erp.handleStartLineBatchRuns}
                    onCompleteLineRun={erp.handleCompleteLineRun}
                    onResumeLineRun={erp.handleResumeLineRun}
                    onRecordMaterialShortage={erp.handleTriggerMaterialShortageStop}
                    onUpdateRunHoldingTank={erp.handleUpdateRunHoldingTank}
                    onStopSkuProduction={erp.handleStopSkuProduction}
                    onStopAllSkuProduction={erp.handleStopAllSkuProduction}
                    onTriggerShiftHandover={() =>
                      erp.handleTriggerShiftHandover({ isAutomatic: false, forceHandoverAll: true })
                    }
                    onSetRunSpeedMultiplier={erp.handleSetRunSpeedMultiplier}
                    onAddProductionLine={erp.handleAddProductionLine}
                    onUpdateProductionLine={erp.handleUpdateProductionLine}
                    onDeleteProductionLine={erp.handleDeleteProductionLine}
                    onSetProductionLinesCount={erp.handleSetProductionLinesCount}
                    onOpenPdfModal={() => erp.setIsPdfReportModalOpen(true)}
                    onChangeSku={erp.handleSkuChangeover}
                    onOpenStationMonitor={erp.handleOpenStationMonitor}
                    focusedLineId={erp.focusedLineId}
                    onClearFocusedLine={() => erp.setFocusedLineId(null)}
                    showToast={showToast}
                  />
                )}

                {state.currentTab === 'tank-monitoring' && (
                  <TankMonitoringView
                    state={state}
                    onUpdateTankItem={erp.handleUpdateTankItem}
                    onTopUpTank={erp.handleTopUpTank}
                    onTransferTanks={erp.handleTransferBetweenTanks}
                    showToast={showToast}
                    onSwitchTab={erp.handleSwitchTab}
                    focusedTankId={erp.focusedTankId}
                    onClearFocusedTank={() => erp.setFocusedTankId(null)}
                  />
                )}

                {state.currentTab === 'permintaan' && (
                  <PermintaanView
                    state={state}
                    onCreateRequest={erp.handleCreateRequest}
                    onCreateMultipleRequests={erp.handleCreateMultipleRequests}
                    onJumpToReceive={erp.handleJumpToReceive}
                    onSwitchTab={erp.handleSwitchTab}
                    onOpenStockAdjustment={erp.handleOpenStockAdjustment}
                    deepLinkSlip={erp.deepLinkSlip}
                    onClearDeepLinkSlip={() => {
                      erp.setDeepLinkSlip(null);
                      if (window.location.hash.includes('bon=') || window.location.hash.includes('req=')) {
                        window.location.hash = 'tab=permintaan';
                      }
                    }}
                    showToast={showToast}
                  />
                )}

                {state.currentTab === 'penerimaan' && (
                  <PenerimaanView
                    state={state}
                    onReceiveMaterial={erp.handleReceiveMaterial}
                    preselectedRequestId={erp.preselectedRequestId}
                    onOpenStockAdjustment={erp.handleOpenStockAdjustment}
                    onSwitchTab={erp.handleSwitchTab}
                    showToast={showToast}
                  />
                )}

                {state.currentTab === 'pemakaian' && (
                  <PemakaianView
                    state={state}
                    onRecordUsage={erp.handleRecordUsage}
                    onStartWipBatch={erp.handleStartWipBatch}
                    onPauseWipBatch={erp.handlePauseWipBatch}
                    onResumeWipBatch={erp.handleResumeWipBatch}
                    onCompleteWipBatch={erp.handleCompleteWipBatch}
                    onCancelWipBatch={erp.handleCancelWipBatch}
                    onSwitchTab={erp.handleSwitchTab}
                    onOpenStationMonitor={erp.handleOpenStationMonitor}
                    showToast={showToast}
                  />
                )}

                {state.currentTab === 'master' && (
                  <MasterBOMView
                    state={state}
                    onAddMaterial={erp.handleAddMaterial}
                    onUpdateMaterial={erp.handleUpdateMaterial}
                    onDeleteMaterial={erp.handleDeleteMaterial}
                    onImportMaterials={erp.handleImportMaterials}
                    onOpenStockAdjustment={erp.handleOpenStockAdjustment}
                    onAddWip={erp.handleAddWip}
                    onUpdateWip={erp.handleUpdateWip}
                    onDeleteWip={erp.handleDeleteWip}
                    onAddSku={erp.handleAddSku}
                    onUpdateSku={erp.handleUpdateSku}
                    onDeleteSku={erp.handleDeleteSku}
                    onImportSkus={erp.handleImportSkus}
                    onAddSkuWip={erp.handleAddSkuWip}
                    onDeleteSkuWip={erp.handleDeleteSkuWip}
                    onImportSkuWips={erp.handleImportSkuWips}
                    onAddWipMat={erp.handleAddWipMat}
                    onDeleteWipMat={erp.handleDeleteWipMat}
                    onAddRecipe={erp.handleAddRecipe}
                    onUpdateRecipe={erp.handleUpdateRecipe}
                    onDeleteRecipe={erp.handleDeleteRecipe}
                    onImportRecipes={erp.handleImportRecipes}
                    onAddMaterialToRecipe={erp.handleAddMaterialToRecipe}
                    onAddMultipleMaterialsToRecipe={erp.handleAddMultipleMaterialsToRecipe}
                    onUpdateRecipeItem={erp.handleUpdateRecipeItem}
                    onDeleteMaterialFromRecipe={erp.handleDeleteMaterialFromRecipe}
                    onAddMachine={erp.handleAddMachine}
                    onDeleteMachine={erp.handleDeleteMachine}
                    onImportMachines={erp.handleImportMachines}
                    onStartMachineChangeover={erp.handleStartMachineChangeover}
                    onCompleteMachineChangeover={erp.handleCompleteMachineChangeover}
                    onCancelMachineChangeover={erp.handleCancelMachineChangeover}
                    onAddTank={erp.handleAddTank}
                    onUpdateTank={erp.handleUpdateTankItem}
                    onDeleteTank={erp.handleDeleteTank}
                    onImportTanks={erp.handleImportTanks}
                    onAddOperator={erp.handleAddOperator}
                    onUpdateOperator={erp.handleUpdateOperator}
                    onDeleteOperator={erp.handleDeleteOperator}
                    onAddManagement={erp.handleAddManagement}
                    onToggleManagementAccess={erp.handleToggleManagementAccess}
                    onDeleteManagement={erp.handleDeleteManagement}
                    onChangeAdminPin={erp.handleChangePin}
                    onOpenAdminModal={() => erp.setIsAdminModalOpen(true)}
                    onOpenUserManagement={() => erp.setIsUserManagementOpen(true)}
                    onSwitchTab={erp.handleSwitchTab}
                    showToast={showToast}
                  />
                )}

                {state.currentTab === 'bom-calculator' && (
                  <BOMCalculatorView
                    state={state}
                    onSwitchTab={erp.handleSwitchTab}
                    onQuickGenerateRequest={erp.handleCreateRequest}
                    showToast={showToast}
                  />
                )}

                {state.currentTab === 'shift-summary' && (
                  <ShiftSummaryView
                    state={state}
                    onSwitchTab={erp.handleSwitchTab}
                    onOpenPdfModal={() => erp.setIsPdfReportModalOpen(true)}
                    showToast={showToast}
                  />
                )}

                {state.currentTab === 'sheets-sync' && (
                  <GoogleSheetsSyncView
                    state={state}
                    onSwitchTab={erp.handleSwitchTab}
                    showToast={showToast}
                  />
                )}

                {state.currentTab === 'contact' && (
                  <ContactSection
                    brandName={state.factoryName || 'ProdTrack MES Support'}
                    title="Dukungan Teknis & Integrasi Operasional Pabrik"
                    mainMessage="Hubungi Tim Engineering"
                    contactEmail="support@prodtrack-mes.local"
                    ctaLabel="Kirim Tiket"
                    navLinks={[
                      { label: 'Dashboard', href: '#tab=dashboard', onClick: () => erp.handleSwitchTab('dashboard') },
                      { label: 'Tangki WIP', href: '#tab=tank-monitoring', onClick: () => erp.handleSwitchTab('tank-monitoring') },
                      { label: 'Permintaan Material', href: '#tab=permintaan', onClick: () => erp.handleSwitchTab('permintaan') },
                      { label: 'Ringkasan Shift', href: '#tab=shift-summary', onClick: () => erp.handleSwitchTab('shift-summary') }
                    ]}
                    projectTypeOptions={erp.contactProjectTypeOptions}
                    onSubmit={(data: ContactFormData) => {
                      showToast(`Pesan dukungan dari ${data.name} berhasil dicatat (${data.projectType.length} topik).`);
                    }}
                  />
                )}
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>

        <GlobalModalManager />
      </div>
      {toasterNode}
    </>
  );
}
