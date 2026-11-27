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
import { BomActionPopupModal } from './BomActionPopupModal';
import { SixBigLossesModal } from './SixBigLossesModal';
import { MachineChangeoverModal } from './MachineChangeoverModal';
import { MachineChangeoverHistoryModal } from './MachineChangeoverHistoryModal';
import { MaterialQrScannerModal } from './MaterialQrScannerModal';
import { MaterialQrLabelModal } from './MaterialQrLabelModal';
import { HoldingTankSelectionModal } from './HoldingTankSelectionModal';
import { InterTankTransferModal } from './InterTankTransferModal';
import { WipBatchPauseModal } from './WipBatchPauseModal';
import { RequestSlipPdfModal } from './RequestSlipPdfModal';
import { WhatsAppSblModal } from './WhatsAppSblModal';
import { CloudBackupModal } from './CloudBackupModal';

export const GlobalModalManager: React.FC = () => {
  const erp = useErp();
  const { state, setupStatus, activeStation, showToast } = erp;

  if (!state.isAuthenticated || setupStatus !== 'ready') {
    return null;
  }

  // Kiosk station mode renders only global WIP completion alarm & optional pause modal
  if (activeStation) {
    return (
      <>
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

        {erp.wipBatchPauseModal.isOpen && (
          <WipBatchPauseModal
            isOpen={erp.wipBatchPauseModal.isOpen}
            batch={erp.wipBatchPauseModal.batch}
            machineLabel={erp.wipBatchPauseModal.machineLabel}
            currentTime={Date.now()}
            actorName={
              erp.wipBatchPauseModal.actorName ||
              state.currentAdminUser?.displayName ||
              state.currentSession?.name ||
              'Operator'
            }
            onClose={erp.closeWipBatchPauseModal}
            onConfirmPause={(batchId, reason, category) => {
              if (erp.wipBatchPauseModal.onConfirmPause) {
                erp.wipBatchPauseModal.onConfirmPause(batchId, reason, category);
              } else {
                erp.handlePauseWipBatch(batchId, reason, category);
              }
              erp.closeWipBatchPauseModal();
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      <StorageTankModal
        isOpen={erp.isTankModalOpen}
        onClose={() => erp.setIsTankModalOpen(false)}
        tank={state.tank}
        onUpdateTank={erp.handleUpdateTank}
      />

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

      <ShiftReportPdfModal
        isOpen={erp.isPdfReportModalOpen}
        onClose={() => erp.setIsPdfReportModalOpen(false)}
        state={state}
        showToast={showToast}
      />

      <WipCompletionAlarmModal
        completedBatch={erp.alarmWipBatch}
        onDismiss={() => erp.setAlarmWipBatch(null)}
        onNavigateToTanks={() => erp.handleSwitchTab('tank-monitoring')}
        tanks={state.master.tanks}
        machines={state.master.machines}
      />

      <UserRoleSwitcherModal
        isOpen={erp.isRoleSwitcherOpen}
        onClose={() => erp.setIsRoleSwitcherOpen(false)}
        state={state}
        onSelectRole={erp.handleSelectRole}
        showToast={showToast}
      />

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

      <MaterialStockAdjustmentModal
        isOpen={erp.isStockAdjustmentModalOpen}
        onClose={() => erp.setIsStockAdjustmentModalOpen(false)}
        state={state}
        preselectedMaterialId={erp.stockAdjustmentPreselectedMatId}
        onAdjustStock={erp.handleAdjustMaterialStock}
        showToast={showToast}
      />

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

      {erp.machineChangeoverHistoryModal.isOpen && (
        <MachineChangeoverHistoryModal
          isOpen={erp.machineChangeoverHistoryModal.isOpen}
          onClose={erp.closeMachineChangeoverHistoryModal}
          machines={state.master.machines}
          selectedMachineId={erp.machineChangeoverHistoryModal.selectedMachineId}
          allChangeovers={state.transactions.changeovers || []}
        />
      )}

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

      {erp.qrLabelModal.isOpen && (
        <MaterialQrLabelModal
          isOpen={erp.qrLabelModal.isOpen}
          onClose={erp.closeQrLabelModal}
          materials={state.master.materials}
          initialMaterialId={erp.qrLabelModal.initialMaterialId}
        />
      )}

      {erp.holdingTankModal.isOpen && (
        <HoldingTankSelectionModal
          isOpen={erp.holdingTankModal.isOpen}
          onClose={erp.closeHoldingTankModal}
          state={state}
          pendingSkuIds={erp.holdingTankModal.pendingSkuIds}
          pendingAssignments={erp.holdingTankModal.pendingAssignments}
          initialSelectionsBySku={erp.holdingTankModal.initialSelectionsBySku}
          onConfirmStart={selectionsBySku => {
            erp.holdingTankModal.onConfirmStart?.(selectionsBySku);
            erp.closeHoldingTankModal();
          }}
          onConfirmAssignments={selectionsByKey => {
            erp.holdingTankModal.onConfirmAssignments?.(selectionsByKey);
            erp.closeHoldingTankModal();
          }}
        />
      )}

      {erp.interTankTransferModal.isOpen && (
        <InterTankTransferModal
          isOpen={erp.interTankTransferModal.isOpen}
          onClose={erp.closeInterTankTransferModal}
          tanks={state.master.tanks}
          wips={state.master.wips}
          initialSourceTankId={erp.interTankTransferModal.initialSourceTankId}
          onExecuteTransfer={erp.handleTransferBetweenTanks}
          showToast={showToast}
        />
      )}

      {erp.wipBatchPauseModal.isOpen && (
        <WipBatchPauseModal
          isOpen={erp.wipBatchPauseModal.isOpen}
          batch={erp.wipBatchPauseModal.batch}
          machineLabel={erp.wipBatchPauseModal.machineLabel}
          currentTime={Date.now()}
          actorName={
            erp.wipBatchPauseModal.actorName ||
            state.currentAdminUser?.displayName ||
            state.currentSession?.name ||
            'Operator'
          }
          onClose={erp.closeWipBatchPauseModal}
          onConfirmPause={(batchId, reason, category) => {
            if (erp.wipBatchPauseModal.onConfirmPause) {
              erp.wipBatchPauseModal.onConfirmPause(batchId, reason, category);
            } else {
              erp.handlePauseWipBatch(batchId, reason, category);
            }
            erp.closeWipBatchPauseModal();
          }}
        />
      )}

      {erp.requestSlipPdfModal.isOpen && (
        <RequestSlipPdfModal
          isOpen={erp.requestSlipPdfModal.isOpen}
          onClose={erp.closeRequestSlipPdfModal}
          state={state}
          cartItems={erp.requestSlipPdfModal.cartItems}
          initialGroupKey={erp.requestSlipPdfModal.initialGroupKey}
          initialSupplier={erp.requestSlipPdfModal.initialSupplier}
          requestNumbers={erp.requestSlipPdfModal.requestNumbers}
          onPreviewQrDetail={erp.requestSlipPdfModal.onPreviewQrDetail}
          showToast={showToast}
        />
      )}

      {erp.whatsAppSblModal.isOpen && (
        <WhatsAppSblModal
          isOpen={erp.whatsAppSblModal.isOpen}
          onClose={erp.closeWhatsAppSblModal}
          stopLog={erp.whatsAppSblModal.stopLog}
          recapLogs={erp.whatsAppSblModal.recapLogs}
          recapDate={erp.whatsAppSblModal.recapDate}
          recapShift={erp.whatsAppSblModal.recapShift}
          initialPhone={erp.whatsAppSblModal.initialPhone}
          showToast={showToast}
        />
      )}

      {erp.isCloudBackupModalOpen && (
        <CloudBackupModal
          isOpen={erp.isCloudBackupModalOpen}
          onClose={() => erp.setIsCloudBackupModalOpen(false)}
          state={state}
          onRestoreState={erp.handleRestoreCloudBackupState}
          showToast={showToast}
        />
      )}
    </>
  );
};
