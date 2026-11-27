import React from 'react';
import { useErp } from '../context/ErpContext';
import { StorageTankModal } from './StorageTankModal';
import { AdminModal } from './AdminModal';
import { ResetModal } from './ResetModal';
import { ShiftReportPdfModal } from './ShiftReportPdfModal';
import { WipCompletionAlarmModal } from './WipCompletionAlarmModal';
import { UserRoleSwitcherModal } from './UserRoleSwitcherModal';
import { UserManagementModal } from './UserManagementModal';
import { MaterialStockAdjustmentModal } from './MaterialStockAdjustmentModal';
import { GlobalCommandPalette } from './GlobalCommandPalette';
import { BomActionPopupModal } from './BomActionPopupModal';
import { SixBigLossesModal } from './SixBigLossesModal';
import { MachineChangeoverModal } from './MachineChangeoverModal';
import { MaterialQrScannerModal } from './MaterialQrScannerModal';

export const GlobalModalManager: React.FC = () => {
  const erp = useErp();
  const { state, setupStatus, activeStation, showToast } = erp;

  if (!state.isAuthenticated || setupStatus !== 'ready') {
    return null;
  }

  // Kiosk station mode only renders the global WIP completion alarm overlay
  if (activeStation) {
    return (
      <WipCompletionAlarmModal
        completedBatch={erp.alarmWipBatch}
        onDismiss={() => erp.setAlarmWipBatch(null)}
        onNavigateToTanks={() => {
          erp.setAlarmWipBatch(null);
          erp.handleExitStationMonitor();
          erp.handleSwitchTab('tank-monitoring');
        }}
        tanks={state.master.tanks}
        machines={state.master.machines}
      />
    );
  }

  return (
    <>
      {/* Storage Tank Liquid Modal */}
      <StorageTankModal
        isOpen={erp.isTankModalOpen}
        onClose={() => erp.setIsTankModalOpen(false)}
        tank={state.tank}
        onUpdateTank={erp.handleUpdateTank}
      />

      {/* Admin Authentication Modal */}
      <AdminModal
        isOpen={erp.isAdminModalOpen}
        onClose={() => erp.setIsAdminModalOpen(false)}
        effectiveRole={erp.effectiveRole}
        adminPin={state.adminPin}
        adminGoogleEmails={state.adminGoogleEmails}
        currentAdminUser={state.currentAdminUser}
        onLogin={erp.handleAdminLogin}
        onLogout={erp.handleAdminLogout}
        onChangePin={erp.handleChangePin}
        onAddAdminEmail={erp.handleAddAdminEmail}
        onRemoveAdminEmail={erp.handleRemoveAdminEmail}
        showToast={showToast}
      />

      {/* Reset Confirmation Modal */}
      <ResetModal
        isOpen={erp.isResetModalOpen}
        onClose={() => erp.setIsResetModalOpen(false)}
        state={state}
        onResetAll={erp.handleResetAll}
        onResetMasterData={erp.handleResetMasterData}
        onResetStockReceipts={erp.handleResetStockReceipts}
        onResetRequests={erp.handleResetRequests}
        onResetUsages={erp.handleResetUsages}
        onLoadPreset={erp.handleLoadSampleData}
      />

      {/* Laporan Produksi Per Shift Format PDF Modal */}
      <ShiftReportPdfModal
        isOpen={erp.isPdfReportModalOpen}
        onClose={() => erp.setIsPdfReportModalOpen(false)}
        state={state}
        showToast={showToast}
      />

      {/* Alarm Peringatan Batch WIP Selesai Modal (Audio & Visual) */}
      <WipCompletionAlarmModal
        completedBatch={erp.alarmWipBatch}
        onDismiss={() => erp.setAlarmWipBatch(null)}
        onNavigateToTanks={() => erp.handleSwitchTab('tank-monitoring')}
        tanks={state.master.tanks}
        machines={state.master.machines}
      />

      {/* 3-Tier User Role Switcher Modal (Administrator, Operator, Management) */}
      <UserRoleSwitcherModal
        isOpen={erp.isRoleSwitcherOpen}
        onClose={() => erp.setIsRoleSwitcherOpen(false)}
        state={state}
        onSelectRole={erp.handleSelectRole}
        showToast={showToast}
      />

      {/* Administrator-Only User & Access Rights Management Modal */}
      <UserManagementModal
        isOpen={erp.isUserManagementOpen}
        onClose={() => erp.setIsUserManagementOpen(false)}
        state={state}
        onAddOperator={erp.handleAddOperator}
        onUpdateOperator={erp.handleUpdateOperator}
        onDeleteOperator={erp.handleDeleteOperator}
        onAddManagement={erp.handleAddManagement}
        onToggleManagementAccess={erp.handleToggleManagementAccess}
        onDeleteManagement={erp.handleDeleteManagement}
        onChangeAdminPin={erp.handleChangePin}
        showToast={showToast}
      />

      {/* Administrator Material Initial Stock Adjustment Modal */}
      <MaterialStockAdjustmentModal
        isOpen={erp.isStockAdjustmentModalOpen}
        onClose={() => erp.setIsStockAdjustmentModalOpen(false)}
        state={state}
        preselectedMaterialId={erp.stockAdjustmentPreselectedMatId}
        onAdjustStock={erp.handleAdjustMaterialStock}
        showToast={showToast}
      />

      {/* Global BomActionPopupModal instance (accessible via ErpContext from anywhere) */}
      {erp.bomPopupModal.open && (
        <BomActionPopupModal
          open={erp.bomPopupModal.open}
          onOpenChange={open => {
            if (!open) erp.closeBomPopupModal();
          }}
          state={state}
          initialAction={erp.bomPopupModal.initialAction}
          initialContext={erp.bomPopupModal.initialContext}
          onAddMaterial={erp.handleAddMaterial}
          onUpdateMaterial={erp.handleUpdateMaterial}
          onAddWip={erp.handleAddWip}
          onUpdateWip={erp.handleUpdateWip}
          onAddSku={erp.handleAddSku}
          onUpdateSku={erp.handleUpdateSku}
          onAddSkuWip={erp.handleAddSkuWip}
          onAddRecipe={erp.handleAddRecipe}
          onUpdateRecipe={erp.handleUpdateRecipe}
          onAddMaterialToRecipe={erp.handleAddMaterialToRecipe}
          onAddMultipleMaterialsToRecipe={erp.handleAddMultipleMaterialsToRecipe}
          onAddMachine={erp.handleAddMachine}
          onAddTank={erp.handleAddTank}
          onUpdateTank={erp.handleUpdateTankItem}
          onOpenImportModal={target => {
            if (erp.bomPopupModal.onOpenImportModal) {
              erp.bomPopupModal.onOpenImportModal(target);
            } else {
              erp.closeBomPopupModal();
              erp.handleSwitchTab('master');
            }
          }}
          showToast={showToast}
        />
      )}

      {/* Global SixBigLossesModal instance */}
      {erp.sixBigLossesModal.isOpen && (
        <SixBigLossesModal
          isOpen={erp.sixBigLossesModal.isOpen}
          onClose={erp.closeSixBigLossesModal}
          lineId={erp.sixBigLossesModal.lineId}
          lineName={erp.sixBigLossesModal.lineName}
          skuId={erp.sixBigLossesModal.skuId}
          skuName={erp.sixBigLossesModal.skuName}
          skuCode={erp.sixBigLossesModal.skuCode}
          startedAt={erp.sixBigLossesModal.startedAt}
          cartonsProducedDuringRun={erp.sixBigLossesModal.cartonsProducedDuringRun}
          onConfirmStop={(stopData, options) => {
            if (erp.sixBigLossesModal.onConfirmStop) {
              erp.sixBigLossesModal.onConfirmStop(stopData, options);
            } else {
              erp.handleStopSkuProduction(stopData);
            }
            erp.closeSixBigLossesModal();
          }}
          showToast={showToast}
        />
      )}

      {/* Global MachineChangeoverModal instance */}
      {erp.machineChangeoverModal.isOpen && (
        <MachineChangeoverModal
          isOpen={erp.machineChangeoverModal.isOpen}
          onClose={erp.closeMachineChangeoverModal}
          machine={erp.machineChangeoverModal.machine}
          availableWips={state.master.wips}
          availableTanks={state.master.tanks}
          onStartChangeover={erp.handleStartMachineChangeover}
          onCompleteChangeover={erp.handleCompleteMachineChangeover}
          onCancelChangeover={erp.handleCancelMachineChangeover}
          showToast={showToast}
        />
      )}

      {/* Global MaterialQrScannerModal instance */}
      {erp.qrScannerModal.isOpen && (
        <MaterialQrScannerModal
          isOpen={erp.qrScannerModal.isOpen}
          onClose={erp.closeQrScannerModal}
          materials={state.master.materials}
          title={erp.qrScannerModal.title}
          subtitle={erp.qrScannerModal.subtitle}
          allowContinuous={erp.qrScannerModal.allowContinuous}
          lastFeedback={erp.qrScannerModal.lastFeedback}
          onScanMatched={result => erp.qrScannerModal.onScanMatched?.(result)}
          onOpenLabelGenerator={erp.qrScannerModal.onOpenLabelGenerator}
        />
      )}

      {/* Global Command Palette (Ctrl+K / Cmd+K) */}
      <GlobalCommandPalette
        open={erp.isCommandMenuOpen}
        onOpenChange={erp.setIsCommandMenuOpen}
        state={state}
        theme={erp.isDaylightTheme ? 'daylight' : 'midnight'}
        onSwitchTab={erp.handleSwitchTab}
        onToggleTheme={erp.handleToggleTheme}
        onOpenTankModal={() => erp.setIsTankModalOpen(true)}
        onOpenPdfModal={() => erp.setIsPdfReportModalOpen(true)}
        onOpenStockAdjustment={erp.handleOpenStockAdjustment}
        onOpenRoleSwitcher={() => erp.setIsRoleSwitcherOpen(true)}
        onOpenUserManagement={() => erp.setIsUserManagementOpen(true)}
        onSelectTank={tankId => {
          erp.setFocusedTankId(tankId);
          erp.handleSwitchTab('tank-monitoring');
        }}
        onSelectLine={lineId => {
          erp.setFocusedLineId(lineId);
          erp.handleSwitchTab('dashboard');
        }}
      />
    </>
  );
};
