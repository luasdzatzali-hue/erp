import React from 'react';
import { Activity, Clock, History, Layers, PlayCircle } from 'lucide-react';
import { AppState, MaterialUsage, WipProductionBatch } from '../../types';
import { useErp } from '../../context/ErpContext';
import { MaterialQrScannerModal } from '../MaterialQrScannerModal';
import { MaterialQrLabelModal } from '../MaterialQrLabelModal';
import { MaterialRejectDrawer } from '../MaterialRejectDrawer';
import { WipGanttChart } from '../WipGanttChart';
import { WipBatchPauseModal } from '../WipBatchPauseModal';
import { PemakaianTelemetryStrip } from './pemakaian/PemakaianTelemetryStrip';
import { PemakaianFormSection } from './pemakaian/PemakaianFormSection';
import { BomVariancePreviewTable } from './pemakaian/BomVariancePreviewTable';
import { WipConsumptionPanel } from './pemakaian/WipConsumptionPanel';
import { PemakaianHistoryList } from './pemakaian/PemakaianHistoryList';
import { usePemakaianWorkflow } from './pemakaian/usePemakaianWorkflow';

interface PemakaianViewProps {
  state?: AppState;
  onRecordUsage?: (usage: Omit<MaterialUsage, 'id' | 'usageNumber' | 'date'>) => void;
  onStartWipBatch?: (batchData: Omit<WipProductionBatch, 'id' | 'batchCode' | 'status' | 'startedAt'>) => void;
  onPauseWipBatch?: (batchId: string, reason: string, category?: string) => void;
  onResumeWipBatch?: (batchId: string) => void;
  onCompleteWipBatch?: (batchId: string) => void;
  onCancelWipBatch?: (batchId: string) => void;
  onSwitchTab?: (tab: AppState['currentTab']) => void;
  onOpenStationMonitor?: (station: { type: 'line' | 'ck'; id: string }) => void;
  showToast?: (msg: string, isError?: boolean) => void;
}

export const PemakaianView: React.FC<PemakaianViewProps> = props => {
  const erp = useErp();
  const state = props.state ?? erp.state;
  const onStartWipBatch = props.onStartWipBatch ?? erp.handleStartWipBatch;
  const onPauseWipBatch = props.onPauseWipBatch ?? erp.handlePauseWipBatch;
  const onResumeWipBatch = props.onResumeWipBatch ?? erp.handleResumeWipBatch;
  const onCompleteWipBatch = props.onCompleteWipBatch ?? erp.handleCompleteWipBatch;
  const onCancelWipBatch = props.onCancelWipBatch ?? erp.handleCancelWipBatch;
  const onSwitchTab = props.onSwitchTab ?? erp.handleSwitchTab;
  const onOpenStationMonitor = props.onOpenStationMonitor ?? erp.handleOpenStationMonitor;
  const showToast = props.showToast ?? erp.showToast;

  const wf = usePemakaianWorkflow({ state, showToast, onStartWipBatch });

  return (
    <div className="max-w-[1440px] mx-auto space-y-4">
      <PemakaianTelemetryStrip
        state={state}
        currentTime={wf.currentTime}
        currentLiveShift={wf.currentLiveShift}
        allActiveBatches={wf.allActiveBatches}
        runningBatchesCount={wf.runningBatchesCount}
        pausedBatchesCount={wf.pausedBatchesCount}
        activeBatchTotalKg={wf.activeBatchTotalKg}
        operationalMachinesCount={wf.operationalMachinesCount}
        busyMachineIds={wf.busyMachineIds}
        currentShiftStats={wf.currentShiftStats}
        onSwitchTab={onSwitchTab}
        onOpenStationMonitor={onOpenStationMonitor}
      />

      <WipConsumptionPanel
        section="active-pipeline"
        currentTime={wf.currentTime}
        searchTerm={wf.searchTerm}
        setSearchTerm={wf.setSearchTerm}
        filterShift={wf.filterShift}
        setFilterShift={wf.setFilterShift}
        onOpenPauseModal={b => wf.setPauseModalBatch(b)}
        onResumeWipBatch={onResumeWipBatch}
        onCompleteWipBatch={onCompleteWipBatch}
        onOpenStationMonitor={onOpenStationMonitor}
      />

      {/* Control Room Workspace Selector Bar */}
      <div className="bg-surface border border-border-subtle p-1.5 rounded-xl flex items-center justify-between gap-2 shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => wf.setActiveTab('batch-order')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
              wf.activeTab === 'batch-order'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
            }`}
          >
            <PlayCircle className="w-3.5 h-3.5" />
            <span>1. Perintah Kerja WIP (BOM)</span>
          </button>

          <button
            onClick={() => wf.setActiveTab('gantt-schedule')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
              wf.activeTab === 'gantt-schedule'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>2. Gantt Chart Produksi WIP</span>
          </button>

          <button
            onClick={() => wf.setActiveTab('batch-history')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
              wf.activeTab === 'batch-history'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>3. Status Batch &amp; Tangki WIP ({wf.wipBatchesList.length})</span>
          </button>

          <button
            onClick={() => wf.setActiveTab('material-history')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
              wf.activeTab === 'material-history'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>4. Log Pemakaian Bahan Baku</span>
          </button>

          <button
            onClick={() => wf.setActiveTab('shift-activity')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
              wf.activeTab === 'shift-activity'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>5. Log Aktivitas 3 Shift</span>
          </button>
        </div>

        {wf.activeTab === 'batch-order' && (
          <button
            type="button"
            onClick={() => wf.setShowInlineGantt(v => !v)}
            className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition whitespace-nowrap shrink-0 ${
              wf.showInlineGantt
                ? 'bg-cyan-500/15 border-cyan-500/40 text-brand'
                : 'bg-surface border-border-strong text-ink-secondary hover:text-ink-primary'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{wf.showInlineGantt ? 'Sembunyikan Gantt' : 'Tampilkan Gantt'}</span>
          </button>
        )}
      </div>

      {wf.activeTab === 'gantt-schedule' && (
        <WipGanttChart
          state={state}
          currentTime={wf.currentTime}
          compact={false}
          onPauseWipBatch={b => wf.setPauseModalBatch(b)}
          onResumeWipBatch={onResumeWipBatch}
          onCompleteWipBatch={onCompleteWipBatch}
          onCancelWipBatch={onCancelWipBatch}
          onQuickSelectLane={wf.handleQuickSelectFromGantt}
        />
      )}

      {wf.activeTab === 'batch-order' && (
        <div className="space-y-4">
          {wf.showInlineGantt && (
            <WipGanttChart
              state={state}
              currentTime={wf.currentTime}
              compact={true}
              onExpandFullView={() => wf.setActiveTab('gantt-schedule')}
              onPauseWipBatch={b => wf.setPauseModalBatch(b)}
              onResumeWipBatch={onResumeWipBatch}
              onCompleteWipBatch={onCompleteWipBatch}
              onCancelWipBatch={onCancelWipBatch}
              onQuickSelectLane={wf.handleQuickSelectFromGantt}
            />
          )}

          <PemakaianFormSection
            skuId={wf.skuId}
            setSkuId={wf.setSkuId}
            wipId={wf.wipId}
            setWipId={wf.setWipId}
            selectedRecipeId={wf.selectedRecipeId}
            setSelectedRecipeId={wf.setSelectedRecipeId}
            selectedMachineId={wf.selectedMachineId}
            setSelectedMachineId={wf.setSelectedMachineId}
            selectedTargetTankId={wf.selectedTargetTankId}
            setSelectedTargetTankId={wf.setSelectedTargetTankId}
            operatorName={wf.operatorName}
            setOperatorName={wf.setOperatorName}
            notes={wf.notes}
            setNotes={wf.setNotes}
            batchDurationMinutes={wf.batchDurationMinutes}
            setBatchDurationMinutes={wf.setBatchDurationMinutes}
            availableWips={wf.availableWips}
            selectedWipObj={wf.selectedWipObj}
            availableRecipesForWip={wf.availableRecipesForWip}
            activeRecipeObj={wf.activeRecipeObj}
            configuredMaterials={wf.configuredMaterials}
            stockBalances={wf.stockBalances}
            isBatchOrderFormOpen={wf.isBatchOrderFormOpen}
            setIsBatchOrderFormOpen={wf.setIsBatchOrderFormOpen}
            suggestedWipsFromScan={wf.suggestedWipsFromScan}
            setSuggestedWipsFromScan={wf.setSuggestedWipsFromScan}
            pendingAutoVerifyRef={wf.pendingAutoVerifyRef}
            currentTime={wf.currentTime}
            currentLiveShift={wf.currentLiveShift}
            onOpenQrScanner={() => wf.setIsQrScannerOpen(true)}
            onOpenQrLabel={() => wf.setIsQrLabelOpen(true)}
            onOpenRejectDrawer={() => wf.setIsRejectDrawerOpen(true)}
            onOpenPauseModal={b => wf.setPauseModalBatch(b)}
            onStartBatchConfirmed={wf.handleStartBatchConfirmed}
            onResumeWipBatch={onResumeWipBatch}
            onCompleteWipBatch={onCompleteWipBatch}
            onCancelWipBatch={onCancelWipBatch}
          >
            <BomVariancePreviewTable
              selectedWipObj={wf.selectedWipObj}
              activeRecipeObj={wf.activeRecipeObj}
              configuredMaterials={wf.configuredMaterials}
              stockBalances={wf.stockBalances}
              verifiedMaterialsMap={wf.verifiedMaterialsMap}
              expandedPalletMatId={wf.expandedPalletMatId}
              setExpandedPalletMatId={wf.setExpandedPalletMatId}
              onOpenQrScanner={() => wf.setIsQrScannerOpen(true)}
              onLocationChange={wf.handleLocationChange}
              onUpdateMaterialRow={wf.handleUpdateMaterialRow}
              onAdjustPalletBags={wf.handleAdjustPalletBags}
              onResetFifo={wf.handleResetFifo}
            />
          </PemakaianFormSection>
        </div>
      )}

      {wf.activeTab === 'batch-history' && (
        <WipConsumptionPanel
          section="batch-history"
          currentTime={wf.currentTime}
          searchTerm={wf.searchTerm}
          setSearchTerm={wf.setSearchTerm}
          filterShift={wf.filterShift}
          setFilterShift={wf.setFilterShift}
          onOpenPauseModal={b => wf.setPauseModalBatch(b)}
          onResumeWipBatch={onResumeWipBatch}
          onCompleteWipBatch={onCompleteWipBatch}
          onOpenStationMonitor={onOpenStationMonitor}
        />
      )}

      {(wf.activeTab === 'material-history' || wf.activeTab === 'shift-activity') && (
        <PemakaianHistoryList
          mode={wf.activeTab}
          searchTerm={wf.searchTerm}
          setSearchTerm={wf.setSearchTerm}
          filterShift={wf.filterShift}
          setFilterShift={wf.setFilterShift}
          currentTime={wf.currentTime}
          currentLiveShift={wf.currentLiveShift}
          shiftStats={wf.shiftStats}
          onOpenRejectDrawer={() => wf.setIsRejectDrawerOpen(true)}
        />
      )}

      <MaterialQrScannerModal
        isOpen={wf.isQrScannerOpen}
        onClose={() => wf.setIsQrScannerOpen(false)}
        materials={state.master.materials}
        title={
          wf.wipId
            ? `Scan QR Bahan Baku (${wf.selectedWipObj?.code || 'WIP'})`
            : 'Scan QR Bahan Baku Produksi'
        }
        subtitle={
          wf.wipId
            ? 'Pindai QR pada kemasan bahan baku untuk memverifikasi kesesuaian resep WIP & lokasi FIFO.'
            : 'Pindai QR bahan baku untuk mengidentifikasi material dan mencari formula WIP terkait.'
        }
        allowContinuous={Boolean(wf.wipId)}
        lastFeedback={wf.qrScanFeedback}
        onScanMatched={wf.handleQrScanMatched}
        onOpenLabelGenerator={() => {
          wf.setIsQrScannerOpen(false);
          wf.setIsQrLabelOpen(true);
        }}
      />

      <MaterialQrLabelModal
        isOpen={wf.isQrLabelOpen}
        onClose={() => wf.setIsQrLabelOpen(false)}
        materials={state.master.materials}
        initialMaterialId={wf.configuredMaterials[0]?.materialId}
      />

      <WipBatchPauseModal
        isOpen={Boolean(wf.pauseModalBatch)}
        batch={wf.pauseModalBatch}
        machineLabel={
          wf.pauseModalBatch?.targetMachineId
            ? (() => {
                const m = state.master.machines.find(x => x.id === wf.pauseModalBatch?.targetMachineId);
                return m ? `${m.code} - ${m.name}` : wf.pauseModalBatch?.targetMachineName;
              })()
            : wf.pauseModalBatch?.targetMachineName
        }
        currentTime={wf.currentTime}
        actorName={
          state.currentAdminUser?.displayName ||
          state.currentSession?.name ||
          wf.pauseModalBatch?.operatorName ||
          'Operator'
        }
        onClose={() => wf.setPauseModalBatch(null)}
        onConfirmPause={(bId, reason, category) => {
          onPauseWipBatch(bId, reason, category);
          wf.setPauseModalBatch(null);
        }}
      />

      <MaterialRejectDrawer
        open={wf.isRejectDrawerOpen}
        onOpenChange={wf.setIsRejectDrawerOpen}
        state={state}
        stationType="CENTRAL_KITCHEN"
        shift={wf.currentLiveShift.shift}
        dateStr={new Date().toISOString().slice(0, 10)}
        machineId={wf.selectedMachineId || undefined}
        machineName={wf.selectedMachObj?.name}
        skuId={wf.skuId || undefined}
        skuName={wf.selectedSkuObj?.name}
        skuCode={wf.selectedSkuObj?.code}
        wipId={wf.wipId || undefined}
        wipName={wf.selectedWipObj?.name}
        recipeId={wf.selectedRecipeId || undefined}
        onSubmitReject={erp.handleRecordMaterialReject}
      />
    </div>
  );
};
