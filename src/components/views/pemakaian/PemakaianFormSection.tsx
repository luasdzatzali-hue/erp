import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Database,
  Lock,
  PackageX,
  PauseCircle,
  Play,
  PlayCircle,
  PlusCircle,
  QrCode,
  Sparkles,
  Tag,
  User,
  X
} from 'lucide-react';
import {
  ProductionLine,
  StorageLocation,
  WIP,
  WipBatchMaterialItem,
  WipProductionBatch,
  WipRecipe
} from '../../../types';
import { useErp } from '../../../context/ErpContext';
import { calculateStockBalances } from '../../../utils/storage';
import { getCurrentShift, ShiftNumber } from '../../../utils/shifts';
import { formatPauseDurationMs, SuggestedWipsFromScanState } from './utils';

interface PemakaianFormSectionProps {
  skuId: string;
  setSkuId: (id: string) => void;
  wipId: string;
  setWipId: (id: string) => void;
  selectedRecipeId: string;
  setSelectedRecipeId: (id: string) => void;
  selectedMachineId: string;
  setSelectedMachineId: (id: string) => void;
  selectedTargetTankId: string;
  setSelectedTargetTankId: (id: string) => void;
  operatorName: string;
  setOperatorName: (name: string) => void;
  notes: string;
  setNotes: (notes: string) => void;
  batchDurationMinutes: string;
  setBatchDurationMinutes: (mins: string) => void;
  availableWips: WIP[];
  selectedWipObj?: WIP;
  availableRecipesForWip: WipRecipe[];
  activeRecipeObj: WipRecipe | null;
  configuredMaterials: WipBatchMaterialItem[];
  stockBalances: ReturnType<typeof calculateStockBalances>;
  isBatchOrderFormOpen: boolean;
  setIsBatchOrderFormOpen: React.Dispatch<React.SetStateAction<boolean>>;
  suggestedWipsFromScan: SuggestedWipsFromScanState | null;
  setSuggestedWipsFromScan: (val: SuggestedWipsFromScanState | null) => void;
  pendingAutoVerifyRef: React.MutableRefObject<{ materialId: string; lotNumber?: string } | null>;
  currentTime: number;
  currentLiveShift: ReturnType<typeof getCurrentShift>;
  onOpenQrScanner: () => void;
  onOpenQrLabel: () => void;
  onOpenRejectDrawer: () => void;
  onOpenPauseModal: (batch: WipProductionBatch) => void;
  onStartBatchConfirmed: (payload: Omit<WipProductionBatch, 'id' | 'batchCode' | 'status' | 'startedAt'>) => void;
  onResumeWipBatch?: (batchId: string) => void;
  onCompleteWipBatch: (batchId: string) => void;
  onCancelWipBatch: (batchId: string) => void;
  children?: React.ReactNode;
}

export const PemakaianFormSection: React.FC<PemakaianFormSectionProps> = ({
  skuId,
  setSkuId,
  wipId,
  setWipId,
  selectedRecipeId,
  setSelectedRecipeId,
  selectedMachineId,
  setSelectedMachineId,
  selectedTargetTankId,
  setSelectedTargetTankId,
  operatorName,
  setOperatorName,
  notes,
  setNotes,
  batchDurationMinutes,
  setBatchDurationMinutes,
  availableWips,
  selectedWipObj,
  availableRecipesForWip,
  activeRecipeObj,
  configuredMaterials,
  stockBalances,
  isBatchOrderFormOpen,
  setIsBatchOrderFormOpen,
  suggestedWipsFromScan,
  setSuggestedWipsFromScan,
  pendingAutoVerifyRef,
  currentTime,
  currentLiveShift,
  onOpenQrScanner,
  onOpenQrLabel,
  onOpenRejectDrawer,
  onOpenPauseModal,
  onStartBatchConfirmed,
  onResumeWipBatch,
  onCompleteWipBatch,
  onCancelWipBatch,
  children
}) => {
  const { state, handleRecordUsage, showToast } = useErp();

  const [selectedLineId, setSelectedLineId] = useState<string>('');
  const [shortageConfirmList, setShortageConfirmList] = useState<string[] | null>(null);

  // Quick Direct Material Usage (Non-Batch) Form Toggle
  const [isDirectUsageOpen, setIsDirectUsageOpen] = useState(false);
  const [directMatId, setDirectMatId] = useState('');
  const [directLocation, setDirectLocation] = useState<StorageLocation>('CK');
  const [directDate, setDirectDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [directShift, setDirectShift] = useState<ShiftNumber>(() => getCurrentShift().shift);
  const [directQtyKg, setDirectQtyKg] = useState('');
  const [directNotes, setDirectNotes] = useState('');

  const productionLines: ProductionLine[] = state.master.productionLines || [];
  const selectedSkuObj = state.master.skus.find(s => s.id === skuId);
  const selectedMachObj = state.master.machines.find(m => m.id === selectedMachineId);

  const activeBatchForSelectedMachine = (state.transactions.wipBatches || []).find(
    b => b.targetMachineId === selectedMachineId && (b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA')
  );

  const directMatAvailableKg = useMemo(() => {
    if (!directMatId) return 0;
    const bal = stockBalances[directMatId];
    if (!bal) return 0;
    if (directLocation === 'CK') return bal.stockCk;
    if (directLocation === 'WINEROTO') return bal.stockWineroto;
    return bal.stockTank;
  }, [directMatId, directLocation, stockBalances]);

  const buildBatchPayload = (): Omit<
    WipProductionBatch,
    'id' | 'batchCode' | 'status' | 'startedAt'
  > | null => {
    if (!wipId || !selectedWipObj || !selectedMachineId) return null;
    const durMins = parseFloat(batchDurationMinutes) || selectedWipObj.productionDurationMinutes || 30;
    const estimatedCompletion = new Date(Date.now() + durMins * 60 * 1000).toISOString();
    const activeShiftNow = getCurrentShift().shift;
    const lineObj = productionLines.find(l => l.id === selectedLineId);
    const lineTag = lineObj ? `[${lineObj.name}] ` : '';

    return {
      wipId,
      wipName: selectedWipObj.name,
      recipeId: activeRecipeObj?.id,
      recipeCode: activeRecipeObj?.recipeCode,
      recipeName: activeRecipeObj?.recipeName,
      skuId: skuId || undefined,
      skuName: selectedSkuObj?.name,
      shift: activeShiftNow,
      batchSize: 1,
      batchWeightKg: selectedWipObj.batchWeightKg,
      operatorName: operatorName || `Operator Shift ${activeShiftNow}`,
      notes: notes ? `${lineTag}${notes} (Shift ${activeShiftNow})` : `${lineTag}Shift ${activeShiftNow}`,
      materials: configuredMaterials,
      durationMinutes: durMins,
      estimatedCompletionTime: estimatedCompletion,
      targetTankId:
        selectedTargetTankId ||
        selectedWipObj.targetTankId ||
        (selectedWipObj.targetTankIds && selectedWipObj.targetTankIds[0]),
      targetMachineId: selectedMachineId,
      targetMachineName: selectedMachObj?.name
    };
  };

  const handleStartBatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!wipId || !selectedWipObj) {
      showToast('Harap pilih jenis WIP terlebih dahulu', true);
      return;
    }

    if (!selectedMachineId) {
      showToast('Pilih mesin produksi dari master data mesin terlebih dahulu!', true);
      return;
    }

    if (activeBatchForSelectedMachine) {
      showToast(
        `Mesin ${selectedMachObj ? `${selectedMachObj.code} - ${selectedMachObj.name}` : 'terpilih'} masih memiliki 1 batch aktif (${activeBatchForSelectedMachine.batchCode})! 1 mesin hanya dapat memproses 1 batch dalam satu waktu.`,
        true
      );
      return;
    }

    if (configuredMaterials.length === 0) {
      showToast(
        `WIP ${selectedWipObj.name} belum memiliki komponen BOM material. Harap konfigurasikan BOM di menu Master Data.`,
        true
      );
      return;
    }

    // Validasi ketersediaan stok di lokasi sumber masing-masing material
    const insufficientItems: string[] = [];
    configuredMaterials.forEach(item => {
      const bal = stockBalances[item.materialId];
      let available = 0;
      if (bal) {
        if (item.sourceLocation === 'CK') available = bal.stockCk;
        else if (item.sourceLocation === 'WINEROTO') available = bal.stockWineroto;
        else if (item.sourceLocation === 'STORAGE_TANK') available = bal.stockTank;
      }
      if (item.actualUsedKg > available) {
        insufficientItems.push(
          `${item.materialName} (${available.toFixed(2)} kg tersedia di ${item.sourceLocation}, butuh ${item.actualUsedKg.toFixed(2)} kg)`
        );
      }
    });

    if (insufficientItems.length > 0) {
      setShortageConfirmList(insufficientItems);
      return;
    }

    const payload = buildBatchPayload();
    if (!payload) return;
    onStartBatchConfirmed(payload);
  };

  const handleConfirmShortageProceed = () => {
    const payload = buildBatchPayload();
    setShortageConfirmList(null);
    if (!payload) return;
    onStartBatchConfirmed(payload);
  };

  const handleDirectUsageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(directQtyKg);
    if (!directMatId) {
      showToast('Pilih bahan baku yang akan dicatat pemakaiannya', true);
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast('Masukkan berat pemakaian (kg) lebih dari 0', true);
      return;
    }
    if (qty > directMatAvailableKg) {
      showToast(
        `Stok di ${directLocation} tidak mencukupi (tersedia ${directMatAvailableKg.toFixed(2)} kg)`,
        true
      );
      return;
    }
    const lineObj = productionLines.find(l => l.id === selectedLineId);
    handleRecordUsage({
      skuId: skuId || '',
      wipId: wipId || '',
      materialId: directMatId,
      qty,
      batch: 1,
      usageQty: qty,
      sourceLocation: directLocation,
      shift: directShift,
      date: directDate || new Date().toISOString().slice(0, 10),
      operatorName: operatorName || `Operator Shift ${directShift}`,
      notes: [lineObj ? `[${lineObj.name}]` : '', directNotes || 'Pemakaian bahan baku langsung'].filter(Boolean).join(' ')
    });
    const matObj = state.master.materials.find(m => m.id === directMatId);
    showToast(`Pemakaian ${matObj?.name || 'material'} (${qty.toFixed(2)} kg) dicatat dari ${directLocation} (Shift ${directShift})`);
    setDirectQtyKg('');
    setDirectNotes('');
  };

  return (
    <div className="bg-surface border border-border-subtle p-4 sm:p-5 rounded-xl shadow-lg space-y-4">
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
          isBatchOrderFormOpen ? 'pb-3 border-b border-border-subtle' : ''
        }`}
      >
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-brand">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-ink-primary">
              Perintah Kerja Produksi WIP (Kapasitas 1 Batch per Periode)
            </h3>
            <p className="text-[11px] text-ink-secondary">
              Pilih jenis WIP &amp; mesin untuk memuat formulasi resep BOM serta alokasi FIFO secara otomatis
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenQrScanner}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition whitespace-nowrap shrink-0 active:scale-95"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Scan QR Bahan</span>
          </button>
          <button
            type="button"
            onClick={onOpenQrLabel}
            className="px-2.5 py-1.5 rounded-lg bg-elevated hover:bg-accent text-ink-primary border border-border-strong text-xs font-semibold flex items-center space-x-1.5 transition whitespace-nowrap shrink-0"
            title="Buat & unduh label QR untuk kemasan bahan baku"
          >
            <Tag className="w-3.5 h-3.5 text-brand" />
            <span>Label QR</span>
          </button>
          <button
            type="button"
            onClick={onOpenRejectDrawer}
            className="px-2.5 py-1.5 rounded-lg bg-tint-rose hover:bg-rose-500/20 text-ink-rose border border-tint-rose-border text-xs font-semibold flex items-center space-x-1.5 transition whitespace-nowrap shrink-0"
            title="Catat reject material / bahan baku di Central Kitchen"
          >
            <PackageX className="w-3.5 h-3.5" />
            <span>Catat Reject</span>
          </button>
          <button
            type="button"
            onClick={() => setIsDirectUsageOpen(v => !v)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center space-x-1.5 transition whitespace-nowrap shrink-0 ${
              isDirectUsageOpen
                ? 'bg-tint-purple border-purple-500/50 text-ink-purple'
                : 'bg-elevated hover:bg-accent border-border-strong text-ink-secondary hover:text-ink-primary'
            }`}
            title="Catat pemakaian bahan baku langsung di luar batch standar"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Input Langsung</span>
          </button>
          <span className="text-[11px] font-mono text-ink-secondary">1 Batch / Mesin</span>
          <button
            type="button"
            onClick={() => setIsBatchOrderFormOpen(prev => !prev)}
            aria-expanded={isBatchOrderFormOpen}
            className="px-2.5 py-1.5 rounded-lg bg-elevated hover:bg-accent border border-border-strong text-ink-secondary hover:text-ink-primary text-[11px] font-semibold flex items-center gap-1 transition whitespace-nowrap shrink-0"
          >
            {isBatchOrderFormOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>{isBatchOrderFormOpen ? 'Tutup Form' : 'Buka Form'}</span>
          </button>
        </div>
      </div>

      {/* Optional Direct Material Usage Quick Entry */}
      {isDirectUsageOpen && (
        <form
          onSubmit={handleDirectUsageSubmit}
          className="p-3.5 rounded-xl bg-canvas border border-purple-500/40 space-y-3 text-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="font-bold text-ink-primary text-xs">
                Catat Pemakaian Bahan Baku Langsung (Non-Batch)
              </h4>
              <p className="text-[10px] text-ink-secondary">
                Pemotongan stok langsung per transaksi untuk penyesuaian adonan / pemakaian tambahan shift berjalan
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsDirectUsageOpen(false)}
              className="p-1 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-elevated"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5">
            <div>
              <label className="block text-[10px] font-medium text-ink-secondary mb-1">Tanggal</label>
              <input
                type="date"
                value={directDate}
                onChange={e => setDirectDate(e.target.value)}
                required
                className="w-full bg-elevated border border-border-strong rounded-lg px-2.5 py-1.5 text-xs font-mono text-ink-primary"
              />
            </div>

            <div>
              <label className="block text-[10px] font-medium text-ink-secondary mb-1">Shift &amp; Line</label>
              <div className="flex gap-1">
                <select
                  value={directShift}
                  onChange={e => setDirectShift(Number(e.target.value) as ShiftNumber)}
                  aria-label="Pilih Shift Pemakaian"
                  className="w-1/2 bg-elevated border border-border-strong rounded-lg px-2 py-1.5 text-xs text-ink-primary"
                >
                  <option value={1}>Shift 1</option>
                  <option value={2}>Shift 2</option>
                  <option value={3}>Shift 3</option>
                </select>
                <select
                  value={selectedLineId}
                  onChange={e => setSelectedLineId(e.target.value)}
                  aria-label="Pilih Line Produksi Pemakaian"
                  className="w-1/2 bg-elevated border border-border-strong rounded-lg px-2 py-1.5 text-xs text-ink-primary"
                >
                  <option value="">All Line</option>
                  {productionLines.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[10px] font-medium text-ink-secondary mb-1">Material / Premix *</label>
              <select
                value={directMatId}
                onChange={e => {
                  const id = e.target.value;
                  setDirectMatId(id);
                  const mat = state.master.materials.find(m => m.id === id);
                  if (mat?.type === 'liquid') setDirectLocation('STORAGE_TANK');
                  else setDirectLocation('CK');
                }}
                required
                className="w-full bg-elevated border border-border-strong rounded-lg px-2.5 py-1.5 text-xs text-ink-primary"
              >
                <option value="">-- Pilih Bahan Baku --</option>
                {state.master.materials.map(m => (
                  <option key={m.id} value={m.id}>
                    [{m.code}] {m.name} ({m.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-ink-secondary mb-1">Gudang Sumber</label>
              <select
                value={directLocation}
                onChange={e => setDirectLocation(e.target.value as StorageLocation)}
                className="w-full bg-elevated border border-border-strong rounded-lg px-2.5 py-1.5 text-xs text-ink-primary"
              >
                <option value="CK">Area CK</option>
                <option value="WINEROTO">Area WINEROTO</option>
                <option value="STORAGE_TANK">Storage Tank Liquid</option>
              </select>
              {directMatId && (
                <span className="text-[10px] font-mono text-ink-secondary block mt-0.5 tabular-nums">
                  Tersedia: <strong className="text-brand">{directMatAvailableKg.toFixed(2)} kg</strong>
                </span>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-medium text-ink-secondary mb-1">Qty Pakai (kg) *</label>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                value={directQtyKg}
                onChange={e => setDirectQtyKg(e.target.value)}
                placeholder="0.00"
                required
                className="w-full bg-elevated border border-border-strong rounded-lg px-2.5 py-1.5 text-xs font-mono text-ink-primary"
              />
            </div>

            <div>
              <label className="block text-[10px] font-medium text-ink-secondary mb-1">Catatan</label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={directNotes}
                  onChange={e => setDirectNotes(e.target.value)}
                  placeholder="Keterangan..."
                  className="w-full bg-elevated border border-border-strong rounded-lg px-2.5 py-1.5 text-xs text-ink-primary"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold whitespace-nowrap shrink-0 transition"
                >
                  Simpan
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {isBatchOrderFormOpen && (
        <>
          {suggestedWipsFromScan && (
            <div className="p-3.5 rounded-xl bg-tint-cyan border border-cyan-500/40 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <QrCode className="w-4 h-4 text-brand shrink-0" />
                  <p className="font-semibold text-ink-primary truncate">
                    Material Terpindai:{' '}
                    {suggestedWipsFromScan.materialCode ? `[${suggestedWipsFromScan.materialCode}] ` : ''}
                    {suggestedWipsFromScan.materialName} · Pilih Target WIP:
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSuggestedWipsFromScan(null)}
                  className="p-1 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-elevated shrink-0"
                  aria-label="Tutup saran WIP"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestedWipsFromScan.wips.map(w => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      pendingAutoVerifyRef.current = {
                        materialId: suggestedWipsFromScan.materialId,
                        lotNumber: suggestedWipsFromScan.lotNumber
                      };
                      setWipId(w.id);
                      setSuggestedWipsFromScan(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-elevated hover:bg-cyan-600 text-ink-primary border border-border-strong hover:border-cyan-400 text-xs font-semibold transition whitespace-nowrap shrink-0"
                  >
                    [{w.code}] {w.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Insufficient Stock Confirmation Banner (Non-Blocking) */}
          {shortageConfirmList && shortageConfirmList.length > 0 && (
            <div className="p-4 rounded-xl bg-tint-rose border border-rose-500/50 space-y-3 text-xs">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-ink-rose shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <h4 className="font-bold text-ink-rose text-xs sm:text-sm">
                    Peringatan Validasi Stok Kurang untuk 1 Batch WIP
                  </h4>
                  <ul className="list-disc pl-4 space-y-0.5 text-ink-primary font-mono text-[11px]">
                    {shortageConfirmList.map((msg, idx) => (
                      <li key={idx}>{msg}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShortageConfirmList(null)}
                  className="px-3 py-1.5 rounded-lg bg-elevated hover:bg-accent border border-border-strong text-ink-secondary text-xs font-semibold"
                >
                  Batal &amp; Periksa Stok
                </button>
                <button
                  type="button"
                  onClick={handleConfirmShortageProceed}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                >
                  Tetap Mulai Produksi Batch WIP
                </button>
              </div>
            </div>
          )}

          <form
            onSubmit={handleStartBatchSubmit}
            className="space-y-4 text-xs bg-canvas border border-border-subtle rounded-2xl p-3.5 sm:p-4"
          >
            {/* Header Form Row: Line/SKU, WIP Selection, Recipe Selection, Machine Selection, Target Tank Selection, Fixed Batch Count */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              {/* Optional SKU & Production Line context */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-ink-secondary">
                    SKU &amp; Line (Opsional)
                  </label>
                  {productionLines.length > 0 && (
                    <select
                      aria-label="Filter Line Produksi"
                      value={selectedLineId}
                      onChange={e => setSelectedLineId(e.target.value)}
                      className="bg-transparent text-[10px] font-mono text-brand focus:outline-none cursor-pointer"
                    >
                      <option value="">Semua Line</option>
                      {productionLines.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.code}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <select
                  value={skuId}
                  onChange={e => {
                    setSkuId(e.target.value);
                    setWipId('');
                  }}
                  className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary focus:outline-none focus:border-purple-500 text-xs"
                >
                  <option value="">-- Semua / Pilih SKU --</option>
                  {state.master.skus.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.isKite ? '(KITE Ekspor)' : '(Domestik)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* WIP Selection */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-ink-purple font-semibold">
                    Target WIP *
                  </label>
                  {selectedWipObj?.code && (
                    <span className="font-mono text-[10px] text-ink-amber font-bold px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/20">
                      {selectedWipObj.code}
                    </span>
                  )}
                </div>
                <select
                  value={wipId}
                  onChange={e => setWipId(e.target.value)}
                  required
                  className="w-full bg-elevated border border-purple-500/40 rounded-xl px-3 py-2 text-ink-primary focus:outline-none focus:border-purple-400 font-semibold text-xs"
                >
                  <option value="">-- Pilih Jenis WIP --</option>
                  {availableWips.map(w => (
                    <option key={w.id} value={w.id}>
                      [{w.code}] {w.name} ({w.batchWeightKg.toFixed(1)} kg)
                    </option>
                  ))}
                </select>
              </div>

              {/* Recipe Selection */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-ink-amber font-semibold flex items-center space-x-1">
                    <Sparkles className="w-3.5 h-3.5 text-ink-amber" />
                    <span>Resep Formulasi *</span>
                  </label>
                  {activeRecipeObj && (
                    <span className="text-[10px] text-ink-amber font-mono">{activeRecipeObj.recipeCode}</span>
                  )}
                </div>
                <select
                  value={selectedRecipeId}
                  onChange={e => setSelectedRecipeId(e.target.value)}
                  disabled={!wipId}
                  required
                  className="w-full bg-elevated border border-amber-500/50 rounded-xl px-3 py-2 text-ink-primary focus:outline-none focus:border-amber-400 font-semibold text-xs disabled:opacity-50"
                >
                  {availableRecipesForWip.length === 0 ? (
                    <option value="">-- {wipId ? 'Belum Ada Resep (Default BOM)' : 'Pilih WIP Dahulu'} --</option>
                  ) : (
                    <>
                      <option value="">-- Pilih Resep Formulasi --</option>
                      {availableRecipesForWip.map(r => (
                        <option key={r.id} value={r.id}>
                          [{r.recipeCode}] {r.recipeName} ({r.totalWeightKg.toFixed(4)} kg) {r.isDefault ? '★' : ''}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>

              {/* Production Machine Selection */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-brand font-semibold flex items-center space-x-1">
                    <Cpu className="w-3.5 h-3.5 text-brand" />
                    <span>Mesin Produksi *</span>
                  </label>
                  {selectedMachineId && (
                    <span className="text-[10px] text-brand font-mono">
                      {state.master.machines.find(m => m.id === selectedMachineId)?.code || ''}
                    </span>
                  )}
                </div>
                <select
                  value={selectedMachineId}
                  onChange={e => setSelectedMachineId(e.target.value)}
                  required
                  className="w-full bg-elevated border border-cyan-500/50 rounded-xl px-3 py-2 text-ink-primary focus:outline-none focus:border-accent-primary font-semibold text-xs"
                >
                  <option value="">-- Pilih Mesin Master --</option>
                  {state.master.machines.map(m => {
                    const isPreferred =
                      selectedWipObj?.assignedMachineIds?.includes(m.id) ||
                      selectedWipObj?.assignedMachineId === m.id;
                    const isBusy = (state.transactions.wipBatches || []).some(
                      b => b.targetMachineId === m.id && (b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA')
                    );
                    const statusBadge =
                      m.status === 'OPERATIONAL' ? 'Operasional' : m.status === 'MAINTENANCE' ? 'Maintenance' : 'Stop';
                    return (
                      <option key={m.id} value={m.id}>
                        {m.code} - {m.name} [{statusBadge}] {isBusy ? '⛔ [SIBUK]' : isPreferred ? '⭐ [WIP]' : '✅'}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Target Transfer Tank Selection */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-ink-purple font-semibold flex items-center space-x-1">
                    <Database className="w-3.5 h-3.5 text-ink-purple" />
                    <span>Tangki Transfer *</span>
                  </label>
                  {selectedTargetTankId && (
                    <span className="text-[10px] text-ink-purple font-mono">
                      {state.master.tanks.find(t => t.id === selectedTargetTankId)?.code || ''}
                    </span>
                  )}
                </div>
                <select
                  value={selectedTargetTankId}
                  onChange={e => setSelectedTargetTankId(e.target.value)}
                  disabled={!wipId}
                  required
                  className="w-full bg-elevated border border-purple-500/50 rounded-xl px-3 py-2 text-ink-primary focus:outline-none focus:border-purple-400 font-semibold text-xs disabled:opacity-50"
                >
                  <option value="">-- Pilih Tangki Penampungan --</option>
                  {state.master.tanks.map(t => {
                    const isLinkedToWip =
                      selectedWipObj?.targetTankIds?.includes(t.id) || selectedWipObj?.targetTankId === t.id;
                    const isHT = t.type === 'HOLDING_TANK';
                    const availableSpace = Math.max(0, t.capacityKg - t.currentLevelKg);
                    return (
                      <option key={t.id} value={t.id}>
                        [{isHT ? 'HT' : 'ST'}] {t.code} (Sisa: {availableSpace.toFixed(0)} kg){' '}
                        {isLinkedToWip ? '⭐ [DITAUTKAN]' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Fixed Batch Count */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[11px] font-medium text-ink-secondary">Jumlah Batch</label>
                  <span className="text-[10px] text-ink-amber font-mono">Terkunci: 1 Batch</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    disabled
                    value="1.0000"
                    className="w-full bg-canvas border border-border-subtle rounded-xl px-3 py-2 text-ink-amber font-mono font-bold cursor-not-allowed text-xs"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-muted font-mono">
                    1 Batch
                  </span>
                </div>
              </div>
            </div>

            {/* Active Recipe Summary Preview */}
            {activeRecipeObj && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-elevated rounded-xl border border-amber-500/30 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="p-1 rounded-lg bg-amber-500/20 text-ink-amber">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-ink-secondary">
                    Resep Formulasi Acuan:{' '}
                    <strong className="text-ink-primary font-mono">[{activeRecipeObj.recipeCode}]</strong>{' '}
                    <strong className="text-ink-amber">{activeRecipeObj.recipeName}</strong>
                  </span>
                  {activeRecipeObj.isDefault && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-tint-cyan text-brand border border-tint-cyan-border">
                      Resep Utama (Default)
                    </span>
                  )}
                  {activeRecipeObj.description && (
                    <span className="text-ink-secondary text-[11px] hidden md:inline">
                      ({activeRecipeObj.description})
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-3 text-[11px] font-mono text-ink-secondary">
                  <span>
                    Bobot Resep: <strong className="text-brand">{activeRecipeObj.totalWeightKg.toFixed(4)} kg/batch</strong>
                  </span>
                  <span>
                    Komposisi: <strong className="text-ink-amber">{activeRecipeObj.items.length} Bahan (Padat/Bubuk/Liquid)</strong>
                  </span>
                </div>
              </div>
            )}

            {/* Selected Machine Detail Card Preview */}
            {selectedMachineId &&
              (() => {
                const m = state.master.machines.find(mach => mach.id === selectedMachineId);
                if (!m) return null;
                const isBusy = (state.transactions.wipBatches || []).some(
                  b => b.targetMachineId === m.id && (b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA')
                );
                return (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-elevated rounded-xl border border-cyan-500/30 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="p-1 rounded-lg bg-cyan-500/20 text-brand">
                        <Cpu className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-ink-secondary">
                        Mesin: <strong className="text-ink-primary">{m.code} - {m.name}</strong> ({m.line})
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          m.status === 'OPERATIONAL'
                            ? 'bg-tint-emerald text-ink-emerald border border-tint-emerald-border'
                            : 'bg-tint-amber text-ink-amber border border-tint-amber-border'
                        }`}
                      >
                        {m.status === 'OPERATIONAL' ? 'Status: Operasional' : `Status: ${m.status}`}
                      </span>
                      {isBusy && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-tint-rose text-ink-rose border border-tint-rose-border animate-pulse">
                          Sedang Memproses Batch Lain
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-3 text-[11px] font-mono text-ink-secondary">
                      <span>
                        Kapasitas: <strong className="text-brand">{m.capacityKgPerHour} kg/jam</strong>
                      </span>
                      {selectedWipObj && (
                        <span>
                          Tangki Tujuan:{' '}
                          <strong className="text-ink-purple">
                            {state.master.tanks.find(t => t.id === selectedWipObj.targetTankId)?.code || 'Holding Tank'}
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

            {/* Operator, Shift Selection, Duration, and Notes row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                  Operator Penanggung Jawab
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-ink-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={operatorName}
                    onChange={e => setOperatorName(e.target.value)}
                    placeholder="Contoh: Sutrisno (Leader Batching)"
                    className="w-full bg-elevated border border-border-strong rounded-xl pl-9 pr-3 py-2 text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                  Shift Pemakaian Material (Jam Aktual)
                </label>
                <div
                  className={`w-full bg-elevated border ${currentLiveShift.borderClass} rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-between`}
                >
                  <span className={currentLiveShift.colorClass}>
                    {currentLiveShift.name} ({currentLiveShift.timeRange})
                  </span>
                  <span className="text-[10px] font-mono text-ink-emerald">Otomatis</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-ink-amber flex items-center space-x-1">
                    <Clock className="w-3 h-3 text-ink-amber" />
                    <span>Lama Waktu Produksi</span>
                  </label>
                  <span className="text-[10px] text-ink-amber font-mono font-bold">{batchDurationMinutes} mnt</span>
                </div>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    min="1"
                    max="720"
                    value={batchDurationMinutes}
                    onChange={e => setBatchDurationMinutes(e.target.value)}
                    required
                    className="w-20 bg-elevated border border-amber-500/50 rounded-xl px-2.5 py-2 text-ink-primary font-mono font-bold focus:outline-none focus:border-amber-400 text-xs"
                  />
                  <div className="grid grid-cols-4 gap-0.5 flex-1">
                    {['15', '30', '45', '60'].map(mins => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setBatchDurationMinutes(mins)}
                        className={`py-1 rounded text-[10px] font-mono transition text-center ${
                          batchDurationMinutes === mins
                            ? 'bg-amber-500 text-slate-950 font-bold'
                            : 'bg-elevated hover:bg-accent text-ink-secondary'
                        }`}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                  Catatan Batch / Line
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Contoh: Batching line wafer shift 1"
                  className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* STRICT MACHINE BATCH PRODUCTION LOCK & LIVE PROGRESS BANNER */}
            {activeBatchForSelectedMachine &&
              (() => {
                const isPaused = activeBatchForSelectedMachine.status === 'DIJEDA';
                const estTime = activeBatchForSelectedMachine.estimatedCompletionTime
                  ? new Date(activeBatchForSelectedMachine.estimatedCompletionTime).getTime()
                  : null;
                const remainingMs = isPaused
                  ? typeof activeBatchForSelectedMachine.remainingMsAtPause === 'number'
                    ? activeBatchForSelectedMachine.remainingMsAtPause
                    : (activeBatchForSelectedMachine.durationMinutes || 30) * 60_000
                  : estTime
                  ? estTime - currentTime
                  : 0;
                const isOverdue = !isPaused && estTime ? remainingMs <= 0 : false;
                const remMins = Math.floor(Math.abs(remainingMs) / 60_000);
                const remSecs = Math.floor((Math.abs(remainingMs) % 60_000) / 1000);
                const targetTank = state.master.tanks.find(
                  t =>
                    t.id === activeBatchForSelectedMachine.targetTankId ||
                    t.assignedWipId === activeBatchForSelectedMachine.wipId
                );
                const targetMach = state.master.machines.find(
                  m => m.id === activeBatchForSelectedMachine.targetMachineId
                );
                const latestPauseLog =
                  activeBatchForSelectedMachine.pauseLogs?.[
                    activeBatchForSelectedMachine.pauseLogs.length - 1
                  ];

                return (
                  <div
                    className={`p-4 rounded-2xl space-y-3 shadow-xl border ${
                      isPaused
                        ? 'bg-tint-sky border-sky-500/60'
                        : 'bg-gradient-to-r from-tint-amber via-tint-purple to-surface border-amber-500/50'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <div className="flex items-center space-x-3">
                        <div
                          className={`p-2 rounded-xl shrink-0 ${
                            isPaused
                              ? 'bg-tint-sky border border-sky-700 text-ink-sky'
                              : 'bg-amber-500/20 text-ink-amber animate-pulse'
                          }`}
                        >
                          {isPaused ? <PauseCircle className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                        </div>
                        <div>
                          <h4 className="font-bold text-ink-primary text-xs sm:text-sm flex flex-wrap items-center gap-2">
                            <span>
                              {isPaused
                                ? 'Batch WIP Sedang Di-Pause Sementara (Timer Dihentikan)'
                                : 'Mesin Sedang Memproses Batch di Lantai Produksi'}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                                isPaused
                                  ? 'bg-tint-sky text-ink-sky border border-sky-700'
                                  : 'bg-amber-500/30 text-ink-amber'
                              }`}
                            >
                              {activeBatchForSelectedMachine.batchCode}
                            </span>
                          </h4>
                          <p className="text-xs text-ink-secondary mt-0.5">
                            Mesin:{' '}
                            <strong className="text-brand">
                              {targetMach ? `${targetMach.code} - ${targetMach.name}` : 'Mesin'}
                            </strong>{' '}
                            • WIP: <strong>"{activeBatchForSelectedMachine.wipName}"</strong> •{' '}
                            {activeBatchForSelectedMachine.batchWeightKg.toFixed(2)} kg • Operator:{' '}
                            <strong>{activeBatchForSelectedMachine.operatorName}</strong>
                          </p>
                        </div>
                      </div>

                      <div
                        className={`text-right shrink-0 bg-canvas px-3 py-1.5 rounded-xl border ${
                          isPaused ? 'border-sky-500/50' : 'border-amber-500/40'
                        }`}
                      >
                        <span className="text-[10px] text-ink-secondary block uppercase font-mono">
                          {isPaused
                            ? 'Waktu Dihentikan Sementara'
                            : isOverdue
                            ? 'Status Waktu'
                            : 'Sisa Durasi Siklus'}
                        </span>
                        <span
                          className={`font-mono tabular-nums text-sm font-black ${
                            isPaused
                              ? 'text-ink-sky'
                              : isOverdue
                              ? 'text-ink-emerald animate-pulse'
                              : 'text-ink-amber'
                          }`}
                        >
                          {isPaused
                            ? `Dijeda · ${remMins}m ${String(remSecs).padStart(2, '0')}s`
                            : isOverdue
                            ? 'SELESAI (Picu Alarm)'
                            : `${remMins}m ${String(remSecs).padStart(2, '0')}s`}
                        </span>
                      </div>
                    </div>

                    {isPaused && (activeBatchForSelectedMachine.pauseReason || latestPauseLog) && (
                      <div className="p-2.5 rounded-xl bg-tint-sky border border-sky-700/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="space-y-0.5">
                          <span className="text-[11px] font-bold text-ink-sky block">
                            Log Alasan Pause ({latestPauseLog?.category || 'Lainnya'}):
                          </span>
                          <p className="text-ink-primary font-medium">
                            {latestPauseLog?.reason || activeBatchForSelectedMachine.pauseReason}
                          </p>
                        </div>
                        {latestPauseLog && (
                          <div className="text-[10px] font-mono text-ink-secondary sm:text-right shrink-0">
                            <div>
                              Oleh: <strong>{latestPauseLog.pausedBy}</strong>
                            </div>
                            <div>Mulai jeda: {new Date(latestPauseLog.pausedAt).toLocaleTimeString('id-ID')}</div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-xs pt-1 border-t border-border-subtle">
                      {targetMach && (
                        <span className="px-2 py-1 rounded-lg bg-elevated text-ink-secondary border border-border-strong font-mono text-[11px]">
                          Mesin: <strong className="text-brand">{targetMach.code} - {targetMach.name}</strong>
                        </span>
                      )}
                      {targetTank && (
                        <span className="px-2 py-1 rounded-lg bg-tint-cyan text-brand border border-cyan-700/60 font-mono text-[11px]">
                          ➔ Tujuan Transfer:{' '}
                          <strong className="text-brand">
                            {targetTank.code} ({targetTank.type === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'})
                          </strong>
                        </span>
                      )}
                      {typeof activeBatchForSelectedMachine.totalPausedMs === 'number' &&
                        activeBatchForSelectedMachine.totalPausedMs > 0 && (
                          <span className="px-2 py-1 rounded-lg bg-tint-sky text-ink-sky border border-tint-sky-border font-mono text-[11px]">
                            Akumulasi Jeda: {formatPauseDurationMs(activeBatchForSelectedMachine.totalPausedMs)}
                          </span>
                        )}
                      <span className="text-[11px] text-ink-secondary ml-auto italic">
                        {isPaused
                          ? 'Tekan "Lanjutkan Produksi" agar penghitungan estimasi berjalan kembali.'
                          : 'Otomatis tertransfer ke tangki & alarm berbunyi saat durasi tuntas.'}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-border-subtle">
                      <button
                        type="button"
                        onClick={() => onCancelWipBatch(activeBatchForSelectedMachine.id)}
                        className="w-full sm:w-auto px-3 py-1.5 rounded-xl bg-elevated border border-border-strong text-ink-rose hover:bg-accent text-xs font-semibold transition"
                      >
                        Batalkan Perintah Kerja
                      </button>
                      {isPaused
                        ? onResumeWipBatch && (
                            <button
                              type="button"
                              onClick={() => onResumeWipBatch(activeBatchForSelectedMachine.id)}
                              className="w-full sm:w-auto px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center justify-center space-x-1.5 active:scale-95"
                            >
                              <Play className="w-4 h-4" />
                              <span>Lanjutkan Produksi (Resume)</span>
                            </button>
                          )
                        : onPauseWipBatchHelper(onOpenPauseModal, activeBatchForSelectedMachine)}
                      <button
                        type="button"
                        onClick={() => onCompleteWipBatch(activeBatchForSelectedMachine.id)}
                        className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition flex items-center justify-center space-x-2 active:scale-95"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Selesai Sekarang &amp; Uji Alarm ({activeBatchForSelectedMachine.batchCode})</span>
                      </button>
                    </div>
                  </div>
                );
              })()}

            {/* Slotted BOM & Real-time Variance Preview Table */}
            {children}

            {/* Action Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={
                  Boolean(activeBatchForSelectedMachine) ||
                  !wipId ||
                  !selectedMachineId ||
                  configuredMaterials.length === 0
                }
                className={`w-full py-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 shadow-lg ${
                  activeBatchForSelectedMachine || !wipId || !selectedMachineId || configuredMaterials.length === 0
                    ? 'bg-elevated text-ink-muted cursor-not-allowed border border-border-strong'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-600/25 active:scale-95'
                }`}
              >
                {activeBatchForSelectedMachine ? (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>
                      Mesin Terkunci: {selectedMachObj?.name || 'Mesin ini'} Sedang Memproses Batch (
                      {activeBatchForSelectedMachine.batchCode})
                    </span>
                  </>
                ) : (
                  <>
                    <PlayCircle className="w-4 h-4" />
                    <span>
                      Mulai Produksi 1 Batch WIP pada {selectedMachObj?.code || 'Mesin Terpilih'} &amp; Potong Stok
                      Sesuai BOM
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
};

function onPauseWipBatchHelper(
  onOpenPauseModal: (batch: WipProductionBatch) => void,
  batch: WipProductionBatch
) {
  return (
    <button
      type="button"
      onClick={() => onOpenPauseModal(batch)}
      className="w-full sm:w-auto px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center justify-center space-x-1.5 active:scale-95"
    >
      <PauseCircle className="w-4 h-4" />
      <span>Pause Sementara</span>
    </button>
  );
}
