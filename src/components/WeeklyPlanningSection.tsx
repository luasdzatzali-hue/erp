import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  CalendarRange,
  UploadCloud,
  FileSpreadsheet,
  Download,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ShoppingCart,
  Calculator,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Check,
  HardDrive,
  RefreshCw,
  ArrowRight,
  Layers
} from 'lucide-react';
import {
  AppState,
  RequestCartItem,
  ShiftNumber,
  WeeklyPlanDayKey,
  WeeklyPlanSkuItem,
  WeeklyProductionPlan
} from '../types';
import {
  buildSampleWeeklyPlanCsv,
  calculateWeeklyPlanMaterialRequirements,
  convertPlanMaterialsToCartItems,
  createEmptyDailyCartons,
  downloadWeeklyPlanningTemplateXlsx,
  getPlannedCartonsForItem,
  parseWeeklyPlanTextOrJson,
  readAndParseWeeklyPlanFile,
  sumDailyCartons,
  WEEKLY_PLAN_DAYS,
  WeeklyPlanParseResult
} from '../utils/weeklyPlanningParser';
import { DriveFileItem, getAccessToken } from '../utils/googleWorkspace';
import { GoogleDriveFileBrowser } from './GoogleDriveFileBrowser';

interface WeeklyPlanningSectionProps {
  state: AppState;
  onSaveWeeklyPlan: (plan: WeeklyProductionPlan) => void;
  onSelectWeeklyPlan: (planId: string) => void;
  onDeleteWeeklyPlan: (planId: string) => void;
  onAddItemsToCart: (items: RequestCartItem[], mode: 'append' | 'replace') => void;
  onPrefillSkuFromPlan?: (skuId: string, cartons: number) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const WeeklyPlanningSection: React.FC<WeeklyPlanningSectionProps> = ({
  state,
  onSaveWeeklyPlan,
  onSelectWeeklyPlan,
  onDeleteWeeklyPlan,
  onAddItemsToCart,
  onPrefillSkuFromPlan,
  showToast
}) => {
  const savedPlans = state.weeklyPlannings || [];
  const activePlan = useMemo(() => {
    if (savedPlans.length === 0) return null;
    if (state.activeWeeklyPlanId) {
      const found = savedPlans.find(p => p.id === state.activeWeeklyPlanId);
      if (found) return found;
    }
    return savedPlans[0];
  }, [savedPlans, state.activeWeeklyPlanId]);

  const [isExpanded, setIsExpanded] = useState<boolean>(savedPlans.length > 0);
  const [activeSubTab, setActiveSubTab] = useState<'materials' | 'schedule'>('materials');

  // Auto-expand when user uploads a first plan
  useEffect(() => {
    if (savedPlans.length > 0) {
      setIsExpanded(true);
    }
  }, [savedPlans.length]);

  // Scope selectors for Material Order Calculation
  const [selectedDays, setSelectedDays] = useState<WeeklyPlanDayKey[]>(
    WEEKLY_PLAN_DAYS.map(d => d.key)
  );
  const [selectedShifts, setSelectedShifts] = useState<ShiftNumber[]>([1, 2, 3]);
  const [lineFilter, setLineFilter] = useState<string>('ALL');
  const [orderMode, setOrderMode] = useState<'FULL_NEED' | 'DEFICIT_ONLY'>('FULL_NEED');
  const [batchRoundMode, setBatchRoundMode] = useState<'EXACT' | 'CEIL_BATCH'>('CEIL_BATCH');
  const [packagingRoundMode, setPackagingRoundMode] = useState<'ROUND_UP' | 'EXACT'>('ROUND_UP');
  const [excludedItemIds, setExcludedItemIds] = useState<string[]>([]);

  // Upload / Import Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadSourceTab, setUploadSourceTab] = useState<'LOCAL' | 'DRIVE'>('LOCAL');
  const [isDragging, setIsDragging] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [rawPasteText, setRawPasteText] = useState('');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [parsePreview, setParsePreview] = useState<WeeklyPlanParseResult | null>(null);
  const [hasDriveToken, setHasDriveToken] = useState(false);
  const [selectedDriveFile, setSelectedDriveFile] = useState<DriveFileItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quick Manual Add Row State
  const [manualSkuId, setManualSkuId] = useState('');
  const [manualLine, setManualLine] = useState('1');
  const [manualDay, setManualDay] = useState<WeeklyPlanDayKey>('senin');
  const [manualShift1, setManualShift1] = useState<number>(1000);
  const [manualShift2, setManualShift2] = useState<number>(1000);
  const [manualShift3, setManualShift3] = useState<number>(1000);

  // Delete confirmation toggle (avoid window.confirm)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (isUploadModalOpen) {
      getAccessToken().then(tok => setHasDriveToken(Boolean(tok)));
    } else {
      setIsDragging(false);
      setIsReadingFile(false);
      setUploadError(null);
      setSelectedDriveFile(null);
    }
  }, [isUploadModalOpen]);

  // Reset excluded items & line filter when active plan changes
  useEffect(() => {
    setExcludedItemIds([]);
    setLineFilter('ALL');
  }, [activePlan?.id]);

  // Unique lines in active plan
  const availablePlanLines = useMemo(() => {
    if (!activePlan) return [];
    const set = new Set<string>();
    activePlan.items.forEach(it => {
      if (it.line && it.line !== '-') set.add(it.line);
    });
    return Array.from(set);
  }, [activePlan]);

  // Selected Item IDs (all active non-off items unless excluded)
  const activeSelectedItemIds = useMemo(() => {
    if (!activePlan) return [];
    return activePlan.items
      .filter(it => !excludedItemIds.includes(it.id))
      .map(it => it.id);
  }, [activePlan, excludedItemIds]);

  // Compute exploded material requirements from active plan + current filters
  const explosion = useMemo(() => {
    if (!activePlan) return null;
    return calculateWeeklyPlanMaterialRequirements(activePlan, state, {
      selectedDays,
      selectedShifts,
      selectedItemIds: activeSelectedItemIds,
      lineFilter,
      orderMode,
      batchRoundMode,
      packagingRoundMode
    });
  }, [
    activePlan,
    state,
    selectedDays,
    selectedShifts,
    activeSelectedItemIds,
    lineFilter,
    orderMode,
    batchRoundMode,
    packagingRoundMode
  ]);

  const orderableRequirements = useMemo(
    () => (explosion?.materialRequirements || []).filter(r => r.finalOrderQtyKg > 0.0001),
    [explosion]
  );

  // Handlers for Day & Shift multi-toggles
  const toggleDay = (dayKey: WeeklyPlanDayKey) => {
    setSelectedDays(prev => {
      if (prev.includes(dayKey)) {
        if (prev.length === 1) return prev; // Keep at least 1 day selected
        return prev.filter(d => d !== dayKey);
      }
      return [...prev, dayKey];
    });
  };

  const selectOnlyDay = (dayKey: WeeklyPlanDayKey) => {
    setSelectedDays([dayKey]);
  };

  const selectAllDays = () => {
    setSelectedDays(WEEKLY_PLAN_DAYS.map(d => d.key));
  };

  const toggleShift = (sh: ShiftNumber) => {
    setSelectedShifts(prev => {
      if (prev.includes(sh)) {
        if (prev.length === 1) return prev;
        return prev.filter(s => s !== sh);
      }
      return [...prev, sh].sort();
    });
  };

  // Upload File Handler
  const handleLocalFile = async (file: File) => {
    setUploadFileName(file.name);
    setUploadError(null);
    setIsReadingFile(true);
    setParsePreview(null);
    setRawPasteText('');

    try {
      const res = await readAndParseWeeklyPlanFile(
        file,
        state.master.skus,
        state.currentSession.name
      );
      if (res.errors.length > 0 || !res.plan) {
        setUploadError(res.errors[0] || 'File planning mingguan gagal dibaca.');
        setParsePreview(res);
      } else {
        setParsePreview(res);
        showToast(
          `Terbaca ${res.plan.items.length} SKU (${res.matchedSkuCount} cocok Master BOM) dari "${file.name}"`
        );
      }
    } catch (err: any) {
      const msg = err?.message || 'Gagal memproses file planning mingguan.';
      setUploadError(msg);
      showToast(msg, true);
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleParsePastedText = (text: string, labelName = 'input_planning.csv') => {
    setRawPasteText(text);
    setUploadFileName(labelName);
    setUploadError(null);
    if (!text.trim()) {
      setParsePreview(null);
      return;
    }
    const res = parseWeeklyPlanTextOrJson(text, state.master.skus, {
      fileName: labelName,
      uploadedBy: state.currentSession.name
    });
    if (res.errors.length > 0 || !res.plan) {
      setUploadError(res.errors[0] || 'Format tabel planning tidak valid.');
    }
    setParsePreview(res);
  };

  const handleSaveParsedPlan = () => {
    if (!parsePreview?.plan || parsePreview.plan.items.length === 0) {
      showToast('Belum ada data planning mingguan yang valid untuk disimpan.', true);
      return;
    }
    onSaveWeeklyPlan(parsePreview.plan);
    setIsUploadModalOpen(false);
    setIsExpanded(true);
    setActiveSubTab('materials');
    showToast(
      `Planning Mingguan "${parsePreview.plan.weekLabel}" (${parsePreview.plan.items.length} SKU) disimpan sebagai acuan pemesanan material!`
    );
  };

  const handleUpdatePreviewSkuMatch = (itemId: string, newSkuId: string) => {
    if (!parsePreview?.plan) return;
    const updatedItems = parsePreview.plan.items.map(it =>
      it.id === itemId ? { ...it, matchedSkuId: newSkuId || undefined } : it
    );
    const matchedSkuCount = updatedItems.filter(i => Boolean(i.matchedSkuId)).length;
    setParsePreview({
      ...parsePreview,
      plan: { ...parsePreview.plan, items: updatedItems },
      matchedSkuCount,
      unmatchedSkuCount: updatedItems.length - matchedSkuCount
    });
  };

  // Inline Update on Active Plan (link SKU or edit carton count directly)
  const handleUpdateActiveItemSkuLink = (itemId: string, skuId: string) => {
    if (!activePlan) return;
    const updated: WeeklyProductionPlan = {
      ...activePlan,
      items: activePlan.items.map(it =>
        it.id === itemId ? { ...it, matchedSkuId: skuId || undefined } : it
      )
    };
    onSaveWeeklyPlan(updated);
    showToast('Tautan Master SKU pada planning diperbarui.');
  };

  const handleUpdateActiveCellCartons = (
    itemId: string,
    shiftNum: ShiftNumber,
    dayKey: WeeklyPlanDayKey,
    val: number
  ) => {
    if (!activePlan) return;
    const cleanVal = Math.max(0, Math.round(val || 0));
    const updated: WeeklyProductionPlan = {
      ...activePlan,
      items: activePlan.items.map(it => {
        if (it.id !== itemId) return it;
        const nextShifts = it.shifts.map(sh => {
          if (sh.shift !== shiftNum) return sh;
          const nextDaily = { ...sh.dailyCartons, [dayKey]: cleanVal };
          return {
            ...sh,
            dailyCartons: nextDaily,
            totalOutput: sumDailyCartons(nextDaily)
          };
        });
        const nextTotal = nextShifts.reduce((a, s) => a + s.totalOutput, 0);
        return {
          ...it,
          shifts: nextShifts,
          totalProduksi: nextTotal,
          isOffProduction: nextTotal === 0 && /off/i.test(it.statusNote || '')
        };
      })
    };
    onSaveWeeklyPlan(updated);
  };

  const handleAddManualPlanningRow = () => {
    const sku = state.master.skus.find(s => s.id === manualSkuId);
    if (!sku) {
      showToast('Pilih SKU Master BOM terlebih dahulu.', true);
      return;
    }

    const makeShiftRow = (sh: ShiftNumber, qty: number) => {
      const daily = createEmptyDailyCartons();
      daily[manualDay] = Math.max(0, Math.round(qty || 0));
      return { shift: sh, dailyCartons: daily, totalOutput: daily[manualDay] };
    };

    const shifts = [
      makeShiftRow(1, manualShift1),
      makeShiftRow(2, manualShift2),
      makeShiftRow(3, manualShift3)
    ];
    const totalProd = shifts.reduce((a, s) => a + s.totalOutput, 0);
    if (totalProd <= 0) {
      showToast('Isi minimal satu target karton pada Shift 1, 2, atau 3.', true);
      return;
    }

    const newItem: WeeklyPlanSkuItem = {
      id: `wpi_man_${Date.now()}`,
      line: manualLine || '1',
      rawSkuCode: sku.code || sku.id,
      rawProductName: sku.name,
      matchedSkuId: sku.id,
      targetPerHour: sku.targetHour,
      shifts,
      totalProduksi: totalProd
    };

    if (activePlan) {
      onSaveWeeklyPlan({
        ...activePlan,
        items: [...activePlan.items, newItem]
      });
    } else {
      const now = new Date();
      const newPlan: WeeklyProductionPlan = {
        id: `plan_${Date.now()}`,
        title: 'RENCANA PRODUKSI MINGGUAN (MANUAL)',
        weekLabel: `WEEK ${Math.ceil((now.getDate() + 6 - now.getDay()) / 7)}`,
        periodStart: now.toISOString().split('T')[0],
        periodEnd: new Date(now.getTime() + 6 * 86400000).toISOString().split('T')[0],
        department: 'DEPARTEMEN PPIC',
        uploadedAt: now.toISOString(),
        uploadedBy: state.currentSession.name,
        sourceFileName: 'Input Manual',
        items: [newItem]
      };
      onSaveWeeklyPlan(newPlan);
    }

    setManualSkuId('');
    showToast(`SKU "${sku.name}" (+${totalProd.toLocaleString('id-ID')} karton) ditambahkan ke planning.`);
  };

  const handlePushToCart = (mode: 'append' | 'replace') => {
    if (!explosion || orderableRequirements.length === 0) {
      showToast('Tidak ada kebutuhan material > 0 kg untuk dimasukkan ke keranjang.', true);
      return;
    }
    const items = convertPlanMaterialsToCartItems(
      orderableRequirements,
      explosion.scopeSummaryLabel
    );
    onAddItemsToCart(items, mode);
    showToast(
      `${items.length} material (${explosion.totalFinalOrderKg.toFixed(2)} kg) dari ${explosion.scopeSummaryLabel} berhasil ${
        mode === 'replace' ? 'mengisi' : 'ditambahkan ke'
      } Keranjang Permintaan!`
    );
  };

  const handleDownloadCsvTemplate = () => {
    const csv = buildSampleWeeklyPlanCsv(state.master.skus);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Template_Planning_Mingguan_PPIC.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Template CSV Planning Mingguan berhasil diunduh.');
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Header Bar */}
      <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-950/60">
        <div className="flex items-start sm:items-center space-x-3">
          <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
            <CalendarRange className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-sm text-white">
                Acuan Planning Mingguan (PPIC)
              </h3>
              {activePlan ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  {activePlan.weekLabel} • {activePlan.periodStart} s/d {activePlan.periodEnd}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                  Belum Ada Jadwal
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Unggah jadwal produksi mingguan (SKU &amp; target karton per shift) sebagai dasar kalkulasi order material ke supplier.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {savedPlans.length > 0 && (
            <select
              value={activePlan?.id || ''}
              onChange={e => onSelectWeeklyPlan(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-cyan-500"
              title="Pilih Dokumen Planning Mingguan"
            >
              {savedPlans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.weekLabel} ({p.periodStart}–{p.periodEnd}) • {p.items.length} SKU
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setIsUploadModalOpen(true)}
            className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center space-x-1.5 active:scale-95"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Upload Planning Mingguan</span>
          </button>

          {activePlan && (
            <button
              type="button"
              onClick={() => setIsExpanded(prev => !prev)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-1 transition"
            >
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>{isExpanded ? 'Tutup' : 'Buka'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Empty CTA Strip when no weekly plan uploaded yet */}
      {!activePlan && (
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/30 text-xs">
          <div className="flex items-start space-x-2.5 text-slate-400">
            <FileSpreadsheet className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              Mendukung file Excel PPIC (<strong className="text-slate-200">.xlsx / .xls</strong> dengan sel merge 3 shift per SKU seperti format{' '}
              <em>Rencana Produksi Mingguan</em>), <strong className="text-slate-200">.csv</strong>, maupun Google Drive Spreadsheet.
            </span>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={() => downloadWeeklyPlanningTemplateXlsx(state.master.skus)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Template Excel</span>
            </button>
          </div>
        </div>
      )}

      {/* Expanded Active Plan Workspace */}
      {activePlan && isExpanded && (
        <div className="p-4 space-y-4">
          {/* Top KPI & Action Bar */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Total Target Terpilih</span>
              <span className="font-mono tabular-nums font-bold text-cyan-400 text-base">
                {(explosion?.totalPlannedCartons || 0).toLocaleString('id-ID')}{' '}
                <span className="text-[11px] font-normal text-slate-400">Karton</span>
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                {explosion?.includedSkuCount || 0} SKU aktif sesuai filter
              </span>
            </div>

            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Kecocokan Master BOM</span>
              <span className="font-mono tabular-nums font-bold text-white text-base">
                {explosion?.matchedSkuCount || 0} / {explosion?.includedSkuCount || 0}{' '}
                <span className="text-[11px] font-normal text-slate-400">SKU</span>
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                {explosion && explosion.unmatchedItems.length > 0
                  ? `${explosion.unmatchedItems.length} perlu ditautkan`
                  : 'Semua SKU aktif terhubung'}
              </span>
            </div>

            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Kebutuhan WIP &amp; Material</span>
              <span className="font-mono tabular-nums font-bold text-amber-400 text-base">
                {(explosion?.totalTheoreticalKg || 0).toLocaleString('id-ID', {
                  maximumFractionDigits: 2
                })}{' '}
                <span className="text-[11px] font-normal text-slate-400">kg</span>
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                {explosion?.wipNeeds.length || 0} Jenis WIP • {orderableRequirements.length} Material
              </span>
            </div>

            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Total Form Order Supplier</span>
              <span className="font-mono tabular-nums font-bold text-emerald-400 text-base">
                {(explosion?.totalFinalOrderKg || 0).toLocaleString('id-ID', {
                  maximumFractionDigits: 2
                })}{' '}
                <span className="text-[11px] font-normal text-slate-400">kg</span>
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                Termasuk pembulatan {explosion?.totalGdrmBags || 0} Kemasan Utuh
              </span>
            </div>
          </div>

          {/* Scope Filters: Hari, Shift, Line, Mode Order */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-3 text-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Day Multi-Select */}
              <div className="space-y-1.5">
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] font-semibold text-slate-300">
                    Rentang Hari Acuan Order:
                  </span>
                  <button
                    type="button"
                    onClick={selectAllDays}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition ${
                      selectedDays.length === 7
                        ? 'bg-cyan-600 text-white border-cyan-500'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    1 Minggu Penuh
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKLY_PLAN_DAYS.map(d => {
                    const isSelected = selectedDays.includes(d.key);
                    const dateSub = activePlan.dayDates?.[d.key];
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => toggleDay(d.key)}
                        onDoubleClick={() => selectOnlyDay(d.key)}
                        title={`Klik untuk pilih/batal ${d.label}. Double-klik untuk fokus ${d.label} saja.`}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition text-center ${
                          isSelected
                            ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/60 font-bold'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <span>{d.shortLabel}</span>
                        {dateSub && (
                          <span className="text-[9px] text-slate-400 ml-1 font-mono">({dateSub})</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Shift & Line & Mode */}
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <span className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Cakupan Shift:
                  </span>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setSelectedShifts([1, 2, 3])}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                        selectedShifts.length === 3
                          ? 'bg-cyan-600 text-white border-cyan-500'
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      Semua
                    </button>
                    {([1, 2, 3] as ShiftNumber[]).map(sh => {
                      const active = selectedShifts.includes(sh);
                      return (
                        <button
                          key={sh}
                          type="button"
                          onClick={() => toggleShift(sh)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition ${
                            active
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60'
                              : 'bg-slate-900 text-slate-500 border-slate-800'
                          }`}
                        >
                          S{sh}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {availablePlanLines.length > 0 && (
                  <div>
                    <span className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Filter Line:
                    </span>
                    <select
                      value={lineFilter}
                      onChange={e => setLineFilter(e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-[11px] text-white"
                    >
                      <option value="ALL">Semua Line</option>
                      {availablePlanLines.map(ln => (
                        <option key={ln} value={ln}>
                          Line {ln}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <span className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Basis Kuantitas Order:
                  </span>
                  <select
                    value={orderMode}
                    onChange={e => setOrderMode(e.target.value as 'FULL_NEED' | 'DEFICIT_ONLY')}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-[11px] text-white"
                  >
                    <option value="FULL_NEED">Kebutuhan Penuh Planning</option>
                    <option value="DEFICIT_ONLY">Hanya Defisit vs Stok Aktual</option>
                  </select>
                </div>

                <div>
                  <span className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Batch WIP Desimal:
                  </span>
                  <select
                    value={batchRoundMode}
                    onChange={e => setBatchRoundMode(e.target.value as 'EXACT' | 'CEIL_BATCH')}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-[11px] text-white"
                  >
                    <option value="CEIL_BATCH">Bulatkan Ke Atas (Rekomendasi)</option>
                    <option value="EXACT">Proporsional Karton (Desimal)</option>
                  </select>
                </div>

                <div>
                  <span className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Kemasan Custom / Zak:
                  </span>
                  <select
                    value={packagingRoundMode}
                    onChange={e => setPackagingRoundMode(e.target.value as 'ROUND_UP' | 'EXACT')}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-[11px] text-white"
                  >
                    <option value="ROUND_UP">Bulatkan Ke Atas (Kemasan Utuh)</option>
                    <option value="EXACT">Berat Eksak (kg)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Unmatched or Missing BOM Notice */}
          {explosion && (explosion.unmatchedItems.length > 0 || explosion.skusMissingBom.length > 0) && (
            <div className="p-3 bg-amber-950/30 border border-amber-500/40 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-start space-x-2 text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  {explosion.unmatchedItems.length > 0 && (
                    <span>
                      <strong>{explosion.unmatchedItems.length} SKU planning</strong> (
                      {explosion.unmatchedItems
                        .slice(0, 3)
                        .map(u => `${u.rawSkuCode} ${u.rawProductName}`)
                        .join(', ')}
                      {explosion.unmatchedItems.length > 3 ? ', ...' : ''}) belum tertaut ke Master SKU BOM.{' '}
                    </span>
                  )}
                  {explosion.skusMissingBom.length > 0 && (
                    <span>
                      <strong>{explosion.skusMissingBom.length} SKU</strong> belum memiliki relasi WIP pada Master BOM.
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab('schedule')}
                className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-[11px] font-semibold shrink-0"
              >
                Tautkan SKU di Jadwal
              </button>
            </div>
          )}

          {/* Sub-Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setActiveSubTab('materials')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 border ${
                  activeSubTab === 'materials'
                    ? 'bg-cyan-600 text-white border-cyan-500'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>1. Kebutuhan Order Material ({orderableRequirements.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('schedule')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 border ${
                  activeSubTab === 'schedule'
                    ? 'bg-cyan-600 text-white border-cyan-500'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>2. Matriks Planning SKU &amp; Shift ({activePlan.items.length} SKU)</span>
              </button>
            </div>

            <div className="flex items-center space-x-2">
              {confirmDeleteId === activePlan.id ? (
                <div className="flex items-center space-x-1.5 text-[11px]">
                  <span className="text-rose-300">Hapus jadwal ini?</span>
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteWeeklyPlan(activePlan.id);
                      setConfirmDeleteId(null);
                      showToast(`Planning "${activePlan.weekLabel}" dihapus.`);
                    }}
                    className="px-2 py-1 bg-rose-600 text-white rounded-lg font-bold"
                  >
                    Ya, Hapus
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="px-2 py-1 bg-slate-800 text-slate-300 rounded-lg"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(activePlan.id)}
                  className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 rounded-lg text-[11px] font-semibold flex items-center space-x-1 transition"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Hapus Plan</span>
                </button>
              )}
            </div>
          </div>

          {/* SUBTAB 1: MATERIAL REQUIREMENTS RESULT */}
          {activeSubTab === 'materials' && (
            <div className="space-y-3">
              {orderableRequirements.length > 0 ? (
                <>
                  <div className="overflow-x-auto border border-slate-800 rounded-xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-800/80 text-[11px] font-semibold text-slate-300 border-b border-slate-800">
                          <th className="py-2.5 px-3">Material &amp; Kode SAP</th>
                          <th className="py-2.5 px-3">Supplier</th>
                          <th className="py-2.5 px-3">WIP &amp; SKU Acuan</th>
                          <th className="py-2.5 px-3 text-right">Batch WIP</th>
                          <th className="py-2.5 px-3 text-right">Kebutuhan (kg)</th>
                          <th className="py-2.5 px-3 text-right">Stok Gudang</th>
                          <th className="py-2.5 px-3 text-right">Qty Order Supplier</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {orderableRequirements.map(req => (
                          <tr key={req.key} className="hover:bg-slate-800/40 transition">
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-white block">{req.materialName}</span>
                              <span className="text-[10px] font-mono text-cyan-400">
                                {req.materialCode || req.materialId} • {req.materialType.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                  req.supplier === 'GDRM'
                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                    : 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                                }`}
                              >
                                {req.supplier}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="font-medium text-amber-300 block">{req.wipName}</span>
                              <span className="text-[10px] text-slate-400 block truncate max-w-[220px]" title={req.contributingSkusLabel}>
                                {req.contributingSkusLabel}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                              {Number.isInteger(req.batchCount) ? req.batchCount : req.batchCount.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-200">
                              {req.theoreticalQtyKg.toFixed(2)} kg
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-400">
                              {req.currentStockKg.toFixed(2)} kg
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                              <span className="font-bold text-cyan-400 block">
                                {req.finalOrderQtyKg.toFixed(2)} kg
                              </span>
                              {(req.isPackagedOrder || req.isGdrmSolid) && req.bagCount && req.bagSizeKg && (
                                <span className="text-[10px] text-amber-300 block">
                                  {req.bagCount} {req.packUnitLabel || 'Zak'} @ {req.bagSizeKg} kg
                                  {req.surplusKg > 0 ? ` (+${req.surplusKg.toFixed(2)}kg)` : ''}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Push to Cart CTA Strip */}
                  <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="text-[11px] text-slate-300">
                      <span>
                        Siap membuat pesanan material untuk{' '}
                        <strong className="text-cyan-400">{explosion?.scopeSummaryLabel}</strong> — otomatis dipisah per Supplier &amp; WIP saat cetak Slip PDF.
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handlePushToCart('append')}
                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center space-x-1.5 active:scale-95"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>Masukkan ke Keranjang ({orderableRequirements.length} Item)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePushToCart('replace')}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5"
                        title="Ganti isi keranjang saat ini dengan hasil kalkulasi planning ini"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Ganti Isi Keranjang</span>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-8 px-4 text-center border border-slate-800 rounded-xl bg-slate-950/40 text-xs text-slate-400">
                  {orderMode === 'DEFICIT_ONLY' && (explosion?.totalTheoreticalKg || 0) > 0 ? (
                    <span className="text-emerald-300 font-semibold">
                      Stok gudang saat ini sudah mencukupi seluruh kebutuhan planning pada rentang hari &amp; shift terpilih. Ubah mode ke &quot;Kebutuhan Penuh Planning&quot; jika tetap ingin memesan ke supplier.
                    </span>
                  ) : (
                    <span>
                      Belum ada material BOM terhitung pada rentang hari &amp; shift terpilih. Pastikan SKU pada planning sudah tertaut ke Master SKU &amp; memiliki relasi WIP–Material di Master BOM.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SUBTAB 2: EDITABLE WEEKLY SCHEDULE MATRIX (SKU × SHIFT × SENIN–MINGGU) */}
          {activeSubTab === 'schedule' && (
            <div className="space-y-3">
              <div className="overflow-x-auto border border-slate-800 rounded-xl max-h-[460px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 text-slate-300">
                    <tr>
                      <th className="py-2 px-2.5 text-center">Pakai</th>
                      <th className="py-2 px-2">Line</th>
                      <th className="py-2 px-2.5 min-w-[200px]">SKU &amp; Nama Produk (Master BOM)</th>
                      <th className="py-2 px-2 text-center">Shift</th>
                      {WEEKLY_PLAN_DAYS.map(d => (
                        <th key={d.key} className="py-2 px-1.5 text-right min-w-[66px]">
                          <div>{d.shortLabel}</div>
                          {activePlan.dayDates?.[d.key] && (
                            <div className="text-[9px] text-slate-500 font-normal">
                              {activePlan.dayDates[d.key]}
                            </div>
                          )}
                        </th>
                      ))}
                      <th className="py-2 px-2 text-right">Output Shift</th>
                      <th className="py-2 px-2 text-right">Total Minggu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {activePlan.items.map(item => {
                      const isIncluded = !excludedItemIds.includes(item.id);
                      const scopedCartons = getPlannedCartonsForItem(
                        item,
                        selectedDays,
                        selectedShifts
                      );
                      const matchedSku = item.matchedSkuId
                        ? state.master.skus.find(s => s.id === item.matchedSkuId)
                        : undefined;

                      return (
                        <React.Fragment key={item.id}>
                          {item.shifts.map((sh, sIdx) => (
                            <tr
                              key={`${item.id}_s${sh.shift}`}
                              className={`${
                                item.isOffProduction ? 'opacity-50 bg-slate-950/60' : 'hover:bg-slate-800/30'
                              }`}
                            >
                              {sIdx === 0 && (
                                <>
                                  <td
                                    rowSpan={item.shifts.length}
                                    className="py-2 px-2.5 text-center align-top border-r border-slate-800/60"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isIncluded}
                                      onChange={() =>
                                        setExcludedItemIds(prev =>
                                          prev.includes(item.id)
                                            ? prev.filter(id => id !== item.id)
                                            : [...prev, item.id]
                                        )
                                      }
                                      className="rounded border-slate-600 bg-slate-800 text-cyan-500"
                                      title="Sertakan SKU ini dalam perhitungan order material"
                                    />
                                  </td>
                                  <td
                                    rowSpan={item.shifts.length}
                                    className="py-2 px-2 font-mono font-bold text-slate-300 align-top border-r border-slate-800/60"
                                  >
                                    {item.line}
                                  </td>
                                  <td
                                    rowSpan={item.shifts.length}
                                    className="py-2 px-2.5 align-top border-r border-slate-800/60 space-y-1.5"
                                  >
                                    <div>
                                      <span className="font-mono text-cyan-400 font-bold mr-1.5">
                                        {item.rawSkuCode}
                                      </span>
                                      <span className="font-semibold text-white">
                                        {item.rawProductName}
                                      </span>
                                    </div>
                                    {item.statusNote && (
                                      <span
                                        className={`inline-block text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                                          item.isOffProduction
                                            ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                                        }`}
                                      >
                                        {item.statusNote}
                                      </span>
                                    )}
                                    <select
                                      value={item.matchedSkuId || ''}
                                      onChange={e =>
                                        handleUpdateActiveItemSkuLink(item.id, e.target.value)
                                      }
                                      className={`w-full rounded-lg px-2 py-1 text-[10px] border ${
                                        matchedSku
                                          ? 'bg-slate-900 border-emerald-500/40 text-emerald-300'
                                          : 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                                      }`}
                                    >
                                      <option value="">-- Tautkan ke Master SKU BOM --</option>
                                      {state.master.skus.map(ms => (
                                        <option key={ms.id} value={ms.id}>
                                          {ms.code ? `[${ms.code}] ` : ''}
                                          {ms.name}
                                        </option>
                                      ))}
                                    </select>
                                    {matchedSku && scopedCartons > 0 && onPrefillSkuFromPlan && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onPrefillSkuFromPlan(matchedSku.id, scopedCartons);
                                          showToast(
                                            `Formulir diisi acuan ${matchedSku.name} (${scopedCartons.toLocaleString('id-ID')} karton)`
                                          );
                                        }}
                                        className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 font-semibold"
                                      >
                                        <span>Isi Form Batch ({scopedCartons.toLocaleString('id-ID')} ktn)</span>
                                        <ArrowRight className="w-3 h-3" />
                                      </button>
                                    )}
                                  </td>
                                </>
                              )}

                              <td className="py-1.5 px-2 text-center font-mono font-bold text-slate-300">
                                S{sh.shift}
                              </td>

                              {WEEKLY_PLAN_DAYS.map(d => {
                                const val = sh.dailyCartons[d.key] || 0;
                                return (
                                  <td key={d.key} className="py-1 px-1 text-right">
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={val === 0 ? '' : val}
                                      placeholder="-"
                                      onChange={e =>
                                        handleUpdateActiveCellCartons(
                                          item.id,
                                          sh.shift,
                                          d.key,
                                          parseInt(e.target.value || '0', 10)
                                        )
                                      }
                                      className="w-16 bg-slate-950/70 border border-slate-800 focus:border-cyan-500 rounded px-1.5 py-1 text-right font-mono tabular-nums text-[11px] text-white"
                                    />
                                  </td>
                                );
                              })}

                              <td className="py-1.5 px-2 text-right font-mono tabular-nums font-bold text-cyan-300">
                                {sh.totalOutput.toLocaleString('id-ID')}
                              </td>

                              {sIdx === 0 && (
                                <td
                                  rowSpan={item.shifts.length}
                                  className="py-2 px-2 text-right font-mono tabular-nums font-bold text-white align-middle border-l border-slate-800/60"
                                >
                                  {item.totalProduksi.toLocaleString('id-ID')}
                                </td>
                              )}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Quick Manual Add SKU Row */}
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                <span className="text-[11px] font-bold text-slate-200 block">
                  Tambah Baris SKU ke Planning Secara Manual
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-7 gap-2 text-xs items-end">
                  <div className="col-span-2">
                    <label className="block text-[10px] text-slate-400 mb-1">SKU Master BOM</label>
                    <select
                      value={manualSkuId}
                      onChange={e => setManualSkuId(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-[11px]"
                    >
                      <option value="">-- Pilih SKU --</option>
                      {state.master.skus.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.code ? `[${s.code}] ` : ''}
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Line</label>
                    <input
                      type="text"
                      value={manualLine}
                      onChange={e => setManualLine(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-[11px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Hari</label>
                    <select
                      value={manualDay}
                      onChange={e => setManualDay(e.target.value as WeeklyPlanDayKey)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-[11px]"
                    >
                      {WEEKLY_PLAN_DAYS.map(d => (
                        <option key={d.key} value={d.key}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Shift 1 (Ktn)</label>
                    <input
                      type="number"
                      min="0"
                      value={manualShift1}
                      onChange={e => setManualShift1(parseInt(e.target.value || '0', 10))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-[11px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Shift 2 / 3 (Ktn)</label>
                    <div className="flex space-x-1">
                      <input
                        type="number"
                        min="0"
                        value={manualShift2}
                        onChange={e => setManualShift2(parseInt(e.target.value || '0', 10))}
                        className="w-1/2 bg-slate-800 border border-slate-700 rounded-lg px-1.5 py-1.5 text-white text-[11px] font-mono"
                        title="Shift 2"
                      />
                      <input
                        type="number"
                        min="0"
                        value={manualShift3}
                        onChange={e => setManualShift3(parseInt(e.target.value || '0', 10))}
                        className="w-1/2 bg-slate-800 border border-slate-700 rounded-lg px-1.5 py-1.5 text-white text-[11px] font-mono"
                        title="Shift 3"
                      />
                    </div>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={handleAddManualPlanningRow}
                      className="w-full px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-[11px] font-bold flex items-center justify-center space-x-1 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL UPLOAD PLANNING MINGGUAN */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
                  <CalendarRange className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white">
                    Upload Rencana Produksi Mingguan (PPIC)
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Unggah file Excel (.xlsx/.xls), CSV, atau Google Sheet berisi SKU &amp; planning karton per shift per hari (Senin–Minggu)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Source Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-900 px-4 sm:px-6 pt-3 gap-2">
              <button
                type="button"
                onClick={() => setUploadSourceTab('LOCAL')}
                className={`flex items-center space-x-2 pb-3 px-3 text-xs font-bold border-b-2 transition ${
                  uploadSourceTab === 'LOCAL'
                    ? 'border-cyan-400 text-cyan-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <HardDrive className="w-4 h-4" />
                <span>1. Upload File Excel / CSV Lokal</span>
              </button>
              <button
                type="button"
                onClick={() => setUploadSourceTab('DRIVE')}
                className={`flex items-center space-x-2 pb-3 px-3 text-xs font-bold border-b-2 transition ${
                  uploadSourceTab === 'DRIVE'
                    ? 'border-cyan-400 text-cyan-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <UploadCloud className="w-4 h-4" />
                <span>2. Google Drive / Spreadsheet</span>
                {hasDriveToken && <span className="text-[10px] text-emerald-400">• Terhubung</span>}
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs">
              {uploadSourceTab === 'LOCAL' && (
                <div className="space-y-4">
                  {/* Drag & Drop Box */}
                  <div
                    onDragOver={e => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setIsDragging(false);
                      const files = e.dataTransfer.files;
                      if (files && files.length > 0) handleLocalFile(files[0]);
                    }}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center transition ${
                      isDragging
                        ? 'border-cyan-400 bg-cyan-950/20'
                        : 'border-slate-700 bg-slate-950/40 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex flex-col items-center space-y-2">
                      <div className="p-3 rounded-full bg-slate-800 text-cyan-400">
                        <UploadCloud className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="font-semibold text-white block">
                          Tarik &amp; lepas file Rencana Produksi Mingguan di sini
                        </span>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          Mendukung .xlsx, .xls (termasuk sel ter-merge 3 shift), .csv, .tsv, dan .json
                        </span>
                      </div>
                      <div className="pt-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".xlsx,.XLSX,.xls,.XLS,.xlsm,.ods,.csv,.CSV,.tsv,.TSV,.txt,.json,.JSON"
                          className="hidden"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (f) handleLocalFile(f);
                          }}
                        />
                        <button
                          type="button"
                          disabled={isReadingFile}
                          onClick={() => fileInputRef.current?.click()}
                          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white rounded-xl text-xs font-bold transition"
                        >
                          {isReadingFile ? 'Membaca Spreadsheet...' : 'Pilih File Planning (.xlsx / .csv)'}
                        </button>
                      </div>
                      {uploadFileName && !uploadError && (
                        <div className="text-xs font-mono text-cyan-300 bg-cyan-950/40 px-3 py-1 rounded-lg border border-cyan-800">
                          ✓ File terbaca: {uploadFileName}
                        </div>
                      )}
                      {uploadError && (
                        <div className="w-full max-w-xl text-left text-[11px] text-rose-200 bg-rose-950/50 border border-rose-500/40 px-3 py-2 rounded-xl flex items-start space-x-2">
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          <span>{uploadError}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Paste CSV / Sample Loader */}
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-[11px] font-semibold text-slate-300">
                        Atau Tempel Data Tabel Planning (Copy dari Excel / CSV):
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          handleParsePastedText(
                            buildSampleWeeklyPlanCsv(state.master.skus),
                            'contoh_rencana_produksi_mingguan_ppic.csv'
                          )
                        }
                        className="text-[11px] text-cyan-400 hover:underline font-semibold"
                      >
                        Muat Contoh Format PPIC (Week 41 • 3 Shift)
                      </button>
                    </div>
                    <textarea
                      value={rawPasteText}
                      onChange={e => handleParsePastedText(e.target.value)}
                      rows={4}
                      placeholder="Tempel baris tabel PPIC di sini (Line, SKU, Produk, Shift, Senin..Minggu)..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono text-[11px] placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {/* Template Download Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                    <span className="text-[11px] text-slate-400">
                      Unduh template resmi berformat PPIC (termasuk sel merge Shift 1, 2, 3):
                    </span>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => downloadWeeklyPlanningTemplateXlsx(state.master.skus)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center space-x-1.5 border border-slate-700 transition"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Template Excel (.xlsx)</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadCsvTemplate}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center space-x-1.5 border border-slate-700 transition"
                      >
                        <Download className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Template CSV</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {uploadSourceTab === 'DRIVE' && (
                <GoogleDriveFileBrowser
                  description="Pilih file Google Spreadsheet atau Excel (.xlsx) Rencana Produksi Mingguan dari Google Drive Anda."
                  searchPlaceholder="Cari file planning di Google Drive (misal: Rencana Produksi, Week 41, PPIC)..."
                  selectedFileId={selectedDriveFile?.id}
                  onFileLoaded={(content, loadedName, file) => {
                    setSelectedDriveFile(file);
                    handleParsePastedText(content, loadedName);
                  }}
                  onSwitchToLocal={() => setUploadSourceTab('LOCAL')}
                  onConnectionChange={setHasDriveToken}
                  showToast={showToast}
                />
              )}

              {/* Parse Result Preview */}
              {parsePreview?.plan && (
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <h4 className="font-bold text-sm text-white">
                        Pratinjau: {parsePreview.plan.title}
                      </h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
                        {parsePreview.plan.weekLabel} • {parsePreview.plan.periodStart} s/d{' '}
                        {parsePreview.plan.periodEnd}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 text-[11px] font-mono">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        Cocok BOM: <strong>{parsePreview.matchedSkuCount}</strong>
                      </span>
                      {parsePreview.unmatchedSkuCount > 0 && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          Perlu Tautkan: <strong>{parsePreview.unmatchedSkuCount}</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  {parsePreview.warnings.length > 0 && (
                    <div className="p-2.5 bg-amber-950/30 border border-amber-500/30 rounded-xl text-[11px] text-amber-200">
                      {parsePreview.warnings[0]}
                    </div>
                  )}

                  <div className="border border-slate-800 rounded-xl overflow-auto max-h-72 bg-slate-950">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead className="bg-slate-900 sticky top-0 text-slate-300 border-b border-slate-800">
                        <tr>
                          <th className="py-2 px-2">Line</th>
                          <th className="py-2 px-2">SKU &amp; Produk</th>
                          <th className="py-2 px-2">Tautan Master SKU BOM</th>
                          <th className="py-2 px-1.5 text-center">Shift</th>
                          {WEEKLY_PLAN_DAYS.map(d => (
                            <th key={d.key} className="py-2 px-1.5 text-right">
                              {d.shortLabel}
                            </th>
                          ))}
                          <th className="py-2 px-2 text-right">Output</th>
                          <th className="py-2 px-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {parsePreview.plan.items.map(it => (
                          <React.Fragment key={it.id}>
                            {it.shifts.map((sh, sIdx) => (
                              <tr key={`${it.id}_p${sh.shift}`} className={it.isOffProduction ? 'opacity-50' : ''}>
                                {sIdx === 0 && (
                                  <>
                                    <td
                                      rowSpan={it.shifts.length}
                                      className="py-1.5 px-2 font-mono font-bold text-slate-300 align-top border-r border-slate-800/60"
                                    >
                                      {it.line}
                                    </td>
                                    <td
                                      rowSpan={it.shifts.length}
                                      className="py-1.5 px-2 align-top border-r border-slate-800/60"
                                    >
                                      <span className="font-mono font-bold text-cyan-400 mr-1">
                                        {it.rawSkuCode}
                                      </span>
                                      <span className="text-white font-medium">{it.rawProductName}</span>
                                      {it.isOffProduction && (
                                        <span className="block text-[9px] text-rose-300 font-semibold">
                                          OFF PRODUKSI
                                        </span>
                                      )}
                                    </td>
                                    <td
                                      rowSpan={it.shifts.length}
                                      className="py-1.5 px-2 align-top border-r border-slate-800/60"
                                    >
                                      <select
                                        value={it.matchedSkuId || ''}
                                        onChange={e => handleUpdatePreviewSkuMatch(it.id, e.target.value)}
                                        className={`w-44 rounded-lg px-1.5 py-1 text-[10px] border ${
                                          it.matchedSkuId
                                            ? 'bg-slate-900 border-emerald-500/40 text-emerald-300'
                                            : 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                                        }`}
                                      >
                                        <option value="">-- Tautkan SKU --</option>
                                        {state.master.skus.map(ms => (
                                          <option key={ms.id} value={ms.id}>
                                            {ms.code ? `[${ms.code}] ` : ''}
                                            {ms.name}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                  </>
                                )}
                                <td className="py-1 px-1.5 text-center font-mono text-slate-300">
                                  {sh.shift}
                                </td>
                                {WEEKLY_PLAN_DAYS.map(d => (
                                  <td
                                    key={d.key}
                                    className="py-1 px-1.5 text-right font-mono tabular-nums text-slate-300"
                                  >
                                    {sh.dailyCartons[d.key] > 0
                                      ? sh.dailyCartons[d.key].toLocaleString('id-ID')
                                      : '-'}
                                  </td>
                                ))}
                                <td className="py-1 px-2 text-right font-mono tabular-nums text-cyan-300 font-semibold">
                                  {sh.totalOutput > 0 ? sh.totalOutput.toLocaleString('id-ID') : '-'}
                                </td>
                                {sIdx === 0 && (
                                  <td
                                    rowSpan={it.shifts.length}
                                    className="py-1.5 px-2 text-right font-mono tabular-nums font-bold text-white align-middle border-l border-slate-800/60"
                                  >
                                    {it.totalProduksi > 0 ? it.totalProduksi.toLocaleString('id-ID') : '-'}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveParsedPlan}
                disabled={!parsePreview?.plan || parsePreview.plan.items.length === 0}
                className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition flex items-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4" />
                <span>
                  Simpan Planning ({parsePreview?.plan?.items.length || 0} SKU) Sebagai Acuan Order
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
