import React, { useState, useEffect } from 'react';
import {
  Truck,
  CheckCircle2,
  AlertCircle,
  Search,
  Droplet,
  Warehouse,
  Building2,
  PackageCheck,
  Scale,
  Plus,
  Trash2,
  Split,
  Calculator,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Package,
  Layers,
  Sparkles,
  Clock,
  Lock,
  QrCode,
  Tag,
  X,
  ArrowRight
} from 'lucide-react';
import { AppState, MaterialReceipt, StorageLocation, ZakReceiptBreakdown, ShiftNumber } from '../../types';
import { getCurrentShift } from '../../utils/shifts';
import { MaterialQrScannerModal } from '../MaterialQrScannerModal';
import { MaterialQrLabelModal } from '../MaterialQrLabelModal';
import { ParsedMaterialQrResult } from '../../utils/materialQr';

interface PenerimaanViewProps {
  state: AppState;
  onReceiveMaterial: (receipt: Omit<MaterialReceipt, 'id' | 'receiptNumber' | 'date'>) => void;
  preselectedRequestId?: string;
  onOpenStockAdjustment?: (materialId?: string) => void;
  onSwitchTab?: (tab: AppState['currentTab']) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const PenerimaanView: React.FC<PenerimaanViewProps> = ({
  state,
  onReceiveMaterial,
  preselectedRequestId,
  onOpenStockAdjustment,
  onSwitchTab,
  showToast
}) => {
  const [selectedReqId, setSelectedReqId] = useState(preselectedRequestId || '');
  const [selectedMatId, setSelectedMatId] = useState('');
  const [location, setLocation] = useState<StorageLocation>('CK');
  const [requestedQty, setRequestedQty] = useState<number>(0);
  const [receivedQty, setReceivedQty] = useState<string>('');
  const [batchLotNumber, setBatchLotNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Shift Pengiriman (SOP: Hanya Shift 1 dan Shift 2, Shift 3 ditutup)
  const [deliveryShift, setDeliveryShift] = useState<ShiftNumber>(() => {
    const cur = getCurrentShift().shift;
    return cur === 3 ? 1 : cur;
  });

  // Zak / Kemasan Pabrikan Correction State (Khusus Kedatangan GDRM ke Area CK)
  // Default false: Proses koreksi timbangan zak tidak langsung ditampilkan
  const [isZakCorrection, setIsZakCorrection] = useState(false);
  const [standardBagWeight, setStandardBagWeight] = useState<number>(25); // 15, 20, 25, or 50 kg
  const [zakGroups, setZakGroups] = useState<ZakReceiptBreakdown[]>([
    {
      id: 'zg_init_1',
      bagCount: 100,
      weightPerBagKg: 25,
      subtotalKg: 2500,
      notes: 'Kelompok 1'
    }
  ]);
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);

  // QR Scanner & Label Generator State
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [isQrLabelOpen, setIsQrLabelOpen] = useState(false);
  const [lastQrScanInfo, setLastQrScanInfo] = useState<{
    materialName: string;
    materialCode?: string;
    matchedRequestNumber?: string;
    lotNumber?: string;
    qtyKg?: number;
  } | null>(null);
  const pendingQrOverrideRef = React.useRef<{
    lotNumber?: string;
    qtyKg?: number;
    location?: StorageLocation;
  } | null>(null);

  // Material Object
  const selectedMatObj = state.master.materials.find(m => m.id === selectedMatId);
  const isSolidOrPowder = selectedMatObj?.type === 'bubuk' || selectedMatObj?.type === 'padat';
  const isCkArea = location === 'CK';

  // Auto-detect standard bag weight from material or request
  useEffect(() => {
    if (selectedMatObj) {
      const pkgStr = (selectedMatObj.packaging || '').toLowerCase();
      const weight = selectedMatObj.weightKg;
      if (pkgStr.includes('15') || weight === 15) {
        setStandardBagWeight(15);
      } else if (pkgStr.includes('20') || weight === 20) {
        setStandardBagWeight(20);
      } else if (pkgStr.includes('50') || weight === 50) {
        setStandardBagWeight(50);
      } else {
        setStandardBagWeight(25);
      }
    }
  }, [selectedMatId, selectedMatObj]);

  // Auto-populate when selecting a request
  useEffect(() => {
    if (selectedReqId) {
      const req = state.transactions.requests.find(r => r.id === selectedReqId);
      if (req) {
        setSelectedMatId(req.materialId);
        setRequestedQty(req.qty);
        setReceivedQty(req.qty.toFixed(4));
        const mat = state.master.materials.find(m => m.id === req.materialId);
        if (mat?.type === 'liquid') {
          setLocation('STORAGE_TANK');
          setIsZakCorrection(false);
        } else if (req.supplier === 'GDRM') {
          setLocation('CK');
        } else {
          setLocation('WINEROTO');
        }

        const bagStd = req.packageSizeKg || (mat?.weightKg === 15 ? 15 : mat?.weightKg === 20 ? 20 : mat?.weightKg === 50 ? 50 : 25);
        setStandardBagWeight(bagStd);
        const count = req.packageCount || (req.qty > 0 ? Math.round(req.qty / bagStd) : 100);

        setZakGroups([
          {
            id: `zg_${Date.now()}_1`,
            bagCount: count || 100,
            weightPerBagKg: bagStd,
            subtotalKg: (count || 100) * bagStd,
            notes: 'Kelompok 1 (Utuh Standar)'
          }
        ]);

        if (pendingQrOverrideRef.current) {
          const ov = pendingQrOverrideRef.current;
          if (ov.location) setLocation(ov.location);
          if (ov.lotNumber) setBatchLotNumber(ov.lotNumber);
          if (typeof ov.qtyKg === 'number' && ov.qtyKg > 0) setReceivedQty(ov.qtyKg.toFixed(4));
          pendingQrOverrideRef.current = null;
        }
      }
    } else if (selectedMatId) {
      const mat = state.master.materials.find(m => m.id === selectedMatId);
      if (mat?.type === 'bubuk' || mat?.type === 'padat') {
        const bagStd = mat.weightKg === 15 ? 15 : mat.weightKg === 20 ? 20 : mat.weightKg === 50 ? 50 : 25;
        setStandardBagWeight(bagStd);
        if (location === 'CK') {
          const initialBags = 100;
          setZakGroups([
            {
              id: `zg_${Date.now()}_1`,
              bagCount: initialBags,
              weightPerBagKg: bagStd,
              subtotalKg: initialBags * bagStd,
              notes: 'Kelompok 1'
            }
          ]);
        }
      }
      if (pendingQrOverrideRef.current) {
        const ov = pendingQrOverrideRef.current;
        if (ov.location) setLocation(ov.location);
        if (ov.lotNumber) setBatchLotNumber(ov.lotNumber);
        if (typeof ov.qtyKg === 'number' && ov.qtyKg > 0) setReceivedQty(ov.qtyKg.toFixed(4));
        pendingQrOverrideRef.current = null;
      }
    }
  }, [selectedReqId, selectedMatId, state.transactions.requests, state.master.materials, location]);

  // Real-time calculations for Zak groups
  const totalZakCount = zakGroups.reduce((acc, g) => acc + (Number(g.bagCount) || 0), 0);
  const totalActualWeightKg = zakGroups.reduce((acc, g) => acc + (Number(g.subtotalKg) || 0), 0);
  const standardTotalKg = totalZakCount * standardBagWeight;
  const weightVarianceKg = totalActualWeightKg - standardTotalKg;
  const variancePercent = standardTotalKg > 0 ? (weightVarianceKg / standardTotalKg) * 100 : 0;
  const averageWeightPerBag = totalZakCount > 0 ? totalActualWeightKg / totalZakCount : 0;

  // Sync receivedQty with totalActualWeightKg when zak correction is active
  useEffect(() => {
    if (isZakCorrection && zakGroups.length > 0) {
      setReceivedQty(totalActualWeightKg.toFixed(4));
    }
  }, [isZakCorrection, totalActualWeightKg]);

  // Handlers for Zak Groups
  const handleAddZakGroup = () => {
    const newIdx = zakGroups.length + 1;
    const defaultBags = 10;
    setZakGroups(prev => [
      ...prev,
      {
        id: `zg_${Date.now()}_${newIdx}`,
        bagCount: defaultBags,
        weightPerBagKg: standardBagWeight,
        subtotalKg: defaultBags * standardBagWeight,
        notes: `Kelompok ${newIdx}`
      }
    ]);
  };

  const handleRemoveZakGroup = (id: string) => {
    if (zakGroups.length <= 1) {
      showToast('Minimal harus ada 1 kelompok timbangan zak', true);
      return;
    }
    setZakGroups(prev => prev.filter(g => g.id !== id));
  };

  const handleUpdateZakGroup = (
    id: string,
    field: 'bagCount' | 'weightPerBagKg' | 'subtotalKg' | 'notes',
    value: any
  ) => {
    setZakGroups(prev =>
      prev.map(g => {
        if (g.id !== id) return g;

        if (field === 'bagCount') {
          const count = Math.max(0, parseInt(value) || 0);
          return {
            ...g,
            bagCount: count,
            subtotalKg: parseFloat((count * g.weightPerBagKg).toFixed(4))
          };
        }

        if (field === 'weightPerBagKg') {
          const w = Math.max(0, parseFloat(value) || 0);
          return {
            ...g,
            weightPerBagKg: w,
            subtotalKg: parseFloat((g.bagCount * w).toFixed(4))
          };
        }

        if (field === 'subtotalKg') {
          const sub = Math.max(0, parseFloat(value) || 0);
          const w = g.bagCount > 0 ? parseFloat((sub / g.bagCount).toFixed(4)) : g.weightPerBagKg;
          return {
            ...g,
            subtotalKg: sub,
            weightPerBagKg: w
          };
        }

        if (field === 'notes') {
          return {
            ...g,
            notes: value
          };
        }

        return g;
      })
    );
  };

  // Quick split 50:50 (e.g. 100 bags into 50 bags and 50 bags)
  const handleSplitEvenly = () => {
    const totalBags = totalZakCount || 100;
    const half1 = Math.ceil(totalBags / 2);
    const half2 = totalBags - half1;
    setZakGroups([
      {
        id: `zg_${Date.now()}_1`,
        bagCount: half1,
        weightPerBagKg: standardBagWeight,
        subtotalKg: half1 * standardBagWeight,
        notes: `Kelompok 1 (${half1} Zak)`
      },
      {
        id: `zg_${Date.now()}_2`,
        bagCount: half2,
        weightPerBagKg: standardBagWeight,
        subtotalKg: half2 * standardBagWeight,
        notes: `Kelompok 2 (${half2} Zak)`
      }
    ]);
    showToast(`Dibagi menjadi 2 kelompok timbangan (${half1} zak & ${half2} zak)`);
  };

  // Reset to single standard group
  const handleResetToStandard = () => {
    const count = totalZakCount || (requestedQty > 0 ? Math.round(requestedQty / standardBagWeight) : 100);
    setZakGroups([
      {
        id: `zg_${Date.now()}_std`,
        bagCount: count,
        weightPerBagKg: standardBagWeight,
        subtotalKg: count * standardBagWeight,
        notes: 'Standar Pabrikan'
      }
    ]);
    showToast('Kelompok timbangan direset ke standar pabrikan');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = isZakCorrection ? totalActualWeightKg : parseFloat(receivedQty);
    if (!selectedMatId || isNaN(qty) || qty <= 0) {
      showToast('Kuantitas fisik diterima harus lebih dari 0', true);
      return;
    }

    // Validate delivery shift (SOP: Shift 1 and Shift 2 only)
    if (deliveryShift === 3) {
      showToast('Aturan SOP: Pengiriman material HANYA dilayani pada Shift 1 dan Shift 2 (Shift 3 ditutup)', true);
      return;
    }

    if (isZakCorrection && totalZakCount <= 0) {
      showToast('Jumlah zak harus lebih dari 0', true);
      return;
    }

    const hasVariance = Math.abs(qty - requestedQty) > 0.0001 && requestedQty > 0;

    // Generate informative breakdown note for audit & records
    let finalNotes = notes;
    if (isZakCorrection && zakGroups.length > 0) {
      const breakdownText = zakGroups
        .map(
          g =>
            `${g.bagCount} zak @ ${g.weightPerBagKg.toFixed(2)} kg (${g.subtotalKg.toFixed(1)} kg${
              g.notes ? ` - ${g.notes}` : ''
            })`
        )
        .join(' + ');
      const diffText =
        Math.abs(weightVarianceKg) > 0.001
          ? ` (Selisih dari std ${standardTotalKg.toFixed(1)} kg: ${weightVarianceKg > 0 ? '+' : ''}${weightVarianceKg.toFixed(2)} kg)`
          : ' (Sesuai berat standar pabrikan)';
      const summaryPrefix = `[Koreksi Zak GDRM -> CK: ${totalZakCount} zak = ${qty.toFixed(2)} kg | ${breakdownText}${diffText}]`;
      finalNotes = notes ? `${summaryPrefix} ${notes}` : summaryPrefix;
    }

    onReceiveMaterial({
      requestId: selectedReqId || undefined,
      materialId: selectedMatId,
      requestedQty: requestedQty || qty,
      receivedQty: qty,
      shift: deliveryShift, // SOP Rule: Pengiriman material dilakukan di shift 1 dan 2
      location,
      batchLotNumber: batchLotNumber || `LOT-${Date.now().toString().slice(-6)}`,
      status: hasVariance || (isZakCorrection && Math.abs(weightVarianceKg) > 0.01) ? 'Discrepancy' : 'Received',
      notes: finalNotes,
      isZakCorrectionActive: isZakCorrection,
      standardBagWeightKg: standardBagWeight,
      totalBagCount: isZakCorrection ? totalZakCount : undefined,
      standardTotalKg: isZakCorrection ? standardTotalKg : undefined,
      weightVarianceKg: isZakCorrection ? weightVarianceKg : undefined,
      zakBreakdown: isZakCorrection ? zakGroups : undefined
    });

    // Reset form
    setSelectedReqId('');
    setSelectedMatId('');
    setRequestedQty(0);
    setReceivedQty('');
    setBatchLotNumber('');
    setNotes('');
    setIsZakCorrection(false);
    setZakGroups([
      {
        id: `zg_${Date.now()}_1`,
        bagCount: 100,
        weightPerBagKg: standardBagWeight,
        subtotalKg: 100 * standardBagWeight,
        notes: 'Kelompok 1'
      }
    ]);

    showToast(`Penerimaan material dicatat. Stok ${location} berhasil ditambahkan (${qty.toFixed(2)} kg)!`);
  };

  const filteredReceipts = state.transactions.receipts.filter(r => {
    const mObj = state.master.materials.find(m => m.id === r.materialId);
    const query = searchTerm.toLowerCase();
    return (
      r.receiptNumber.toLowerCase().includes(query) ||
      (mObj && mObj.name.toLowerCase().includes(query)) ||
      (r.batchLotNumber && r.batchLotNumber.toLowerCase().includes(query)) ||
      r.location.toLowerCase().includes(query)
    );
  });

  const pendingRequests = state.transactions.requests.filter(r => r.status !== 'Received');

  const handleQrScanMatched = (result: ParsedMaterialQrResult) => {
    const mat = result.matchedMaterial;
    if (!mat) return;

    const matchingPendingReq = pendingRequests.find(r => r.materialId === mat.id);

    pendingQrOverrideRef.current = {
      lotNumber: result.lotNumber,
      qtyKg: result.qtyKg,
      location: result.location,
    };

    if (matchingPendingReq) {
      setSelectedReqId(matchingPendingReq.id);
    } else {
      setSelectedReqId('');
      setSelectedMatId(mat.id);
      setRequestedQty(0);
      if (result.location) {
        setLocation(result.location);
      } else if (mat.type === 'liquid') {
        setLocation('STORAGE_TANK');
        setIsZakCorrection(false);
      } else if (mat.source === 'GDRM') {
        setLocation('CK');
      } else {
        setLocation('WINEROTO');
      }
    }

    if (result.lotNumber) {
      setBatchLotNumber(result.lotNumber);
    }
    if (typeof result.qtyKg === 'number' && result.qtyKg > 0 && !isZakCorrection) {
      setReceivedQty(result.qtyKg.toFixed(4));
    }

    setLastQrScanInfo({
      materialName: mat.name,
      materialCode: mat.code,
      matchedRequestNumber: matchingPendingReq?.requestNumber,
      lotNumber: result.lotNumber,
      qtyKg: result.qtyKg,
    });

    showToast(
      `QR teridentifikasi: ${mat.code ? `[${mat.code}] ` : ''}${mat.name}${
        matchingPendingReq ? ` (Tertaut ke ${matchingPendingReq.requestNumber})` : ''
      }`
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* SOP Rule Banner: Pengiriman di Shift 1 dan Shift 2 */}
      <div className="bg-emerald-500/10 border border-emerald-500/30 p-3.5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
        <div className="flex items-start sm:items-center space-x-3">
          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center space-x-2">
              <span className="text-xs sm:text-sm font-bold text-emerald-300">
                Aturan SOP: Pengiriman Material Dilakukan di Shift 1 dan Shift 2
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                Shift 1 & 2 Aktif
              </span>
            </div>
            <p className="text-[11px] text-slate-300">
              Pengiriman dan penerimaan fisik material dari supplier / gudang dilayani pada Shift 1 (07:01 - 15:00) dan Shift 2 (15:01 - 23:00). Shift 3 ditutup untuk penerimaan material.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {state.currentUserRole === 'ADMINISTRATOR' && onOpenStockAdjustment && (
            <button
              type="button"
              onClick={() => onOpenStockAdjustment(selectedMatId || undefined)}
              className="shrink-0 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95 shadow-xs whitespace-nowrap"
              title="Buka Penyesuaian Saldo Awal Material (Akses Administrator)"
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Adjust Saldo Awal</span>
            </button>
          )}
          {onSwitchTab && (
            <button
              type="button"
              onClick={() => onSwitchTab('pemakaian')}
              className="shrink-0 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition active:scale-95 whitespace-nowrap"
            >
              <span>Lanjut Tahap 05: Work Order WIP</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Penerimaan Form */}
      <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3 border-b border-slate-800 pb-3">
          <h3 className="font-bold text-sm text-white flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Truck className="w-4 h-4" />
            </div>
            <span>Pencatatan Kedatangan & Penerimaan Fisik Material</span>
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <button
              type="button"
              onClick={() => setIsQrScannerOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm shadow-cyan-600/20 transition whitespace-nowrap shrink-0 active:scale-95"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Scan QR Material</span>
            </button>
            <button
              type="button"
              onClick={() => setIsQrLabelOpen(true)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center space-x-1.5 transition whitespace-nowrap shrink-0"
              title="Buat & unduh stiker QR Code untuk kemasan material"
            >
              <Tag className="w-3.5 h-3.5 text-cyan-400" />
              <span>Label QR</span>
            </button>
            <span className="whitespace-nowrap">
              Pending Request: <strong className="text-amber-400 tabular-nums">{pendingRequests.length}</strong>
            </span>
            {state.currentUserRole === 'ADMINISTRATOR' && onOpenStockAdjustment && selectedMatId && (
              <button
                type="button"
                onClick={() => onOpenStockAdjustment(selectedMatId)}
                className="text-[10px] text-amber-400 hover:text-amber-300 underline font-sans font-semibold whitespace-nowrap"
                title="Sesuaikan Saldo Awal Material Ini"
              >
                (Adjust Saldo Awal)
              </button>
            )}
          </div>
        </div>

        {lastQrScanInfo && (
          <div className="mb-3 p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/40 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <QrCode className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-white truncate">
                  Hasil Scan QR: {lastQrScanInfo.materialCode ? `[${lastQrScanInfo.materialCode}] ` : ''}
                  {lastQrScanInfo.materialName}
                </p>
                <p className="text-[11px] text-cyan-300/90 font-mono truncate">
                  {[
                    lastQrScanInfo.matchedRequestNumber ? `Dokumen: ${lastQrScanInfo.matchedRequestNumber}` : 'Kedatangan Langsung',
                    lastQrScanInfo.lotNumber ? `Lot: ${lastQrScanInfo.lotNumber}` : null,
                    lastQrScanInfo.qtyKg ? `Qty: ${lastQrScanInfo.qtyKg.toFixed(2)} kg` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLastQrScanInfo(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 shrink-0"
              aria-label="Tutup info scan QR"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {/* Shift Pengiriman Selector (Shift 1 & Shift 2 allowed, Shift 3 locked per SOP) */}
          <div className="sm:col-span-2 bg-slate-950/60 border border-slate-800 p-2.5 rounded-xl space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-200 flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Pilih Shift Pengiriman / Kedatangan Material:</span>
              </label>
              <span className="text-[10px] text-slate-400 font-mono">
                SOP: Pengiriman Hanya Shift 1 & 2
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setDeliveryShift(1)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 border ${
                  deliveryShift === 1
                    ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-sm shadow-sky-500/30'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <span>Shift 1 (Pagi)</span>
                <span className="text-[10px] text-sky-300 font-mono">07:01-15:00</span>
              </button>

              <button
                type="button"
                onClick={() => setDeliveryShift(2)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 border ${
                  deliveryShift === 2
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-sm shadow-amber-500/30'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <span>Shift 2 (Sore)</span>
                <span className="text-[10px] text-amber-300 font-mono">15:01-23:00</span>
              </button>

              <button
                type="button"
                disabled
                title="Sesuai aturan SOP pabrik, pengiriman material ditutup pada Shift 3"
                className="py-2 px-3 rounded-xl text-xs font-bold bg-slate-900/60 border border-slate-800 text-slate-600 cursor-not-allowed flex items-center justify-center space-x-1.5 opacity-60"
              >
                <Lock className="w-3 h-3 text-slate-600" />
                <span>Shift 3 (Ditutup)</span>
              </button>
            </div>
          </div>

          {/* Linked Request (Excludes already received requests) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-medium text-slate-300">
                Pilih Dokumen Permintaan (Menunggu Datang)
              </label>
              <span className="text-[10px] text-amber-400 font-semibold">
                {pendingRequests.length} Menunggu Kedatangan
              </span>
            </div>
            <select
              value={selectedReqId}
              onChange={(e) => setSelectedReqId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">
                {pendingRequests.length > 0
                  ? `-- Pilih Material Pending (${pendingRequests.length} menunggu) --`
                  : '-- Semua Dokumen Permintaan Telah Selesai Diterima --'}
              </option>
              {pendingRequests.map((req, idx) => {
                const mObj = state.master.materials.find(m => m.id === req.materialId);
                return (
                  <option key={`${req.id}_${idx}`} value={req.id}>
                    ⏳ {req.requestNumber} | {mObj?.name || 'Material'} ({req.qty.toFixed(4)} kg) - {req.supplier}
                  </option>
                );
              })}
            </select>
            <p className="text-[10px] text-slate-400 mt-1">
              ✓ Material yang sudah diterima otomatis dikeluarkan dari pilihan agar operator fokus pada barang yang belum dicek fisiknya.
            </p>
          </div>

          {/* Direct Material Selection if no request */}
          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Material Diterima (Database)
            </label>
            <select
              value={selectedMatId}
              onChange={(e) => {
                setSelectedMatId(e.target.value);
                const mat = state.master.materials.find(m => m.id === e.target.value);
                if (mat?.type === 'liquid') setLocation('STORAGE_TANK');
              }}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500 font-medium"
            >
              <option value="">-- Pilih Material Database --</option>
              {state.master.materials.map(m => (
                <option key={m.id} value={m.id}>
                  {m.code ? `[${m.code}] ` : ''}{m.name} ({m.type.toUpperCase()} - {m.source}) | Kemasan: {m.packaging} ({m.weightKg.toFixed(4)} kg)
                </option>
              ))}
            </select>
          </div>

          {/* Storage Destination */}
          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Lokasi Penyimpanan Tujuan
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value as StorageLocation)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="CK">Area Penyimpanan CK (Bubuk & Padat)</option>
              <option value="WINEROTO">Area WINEROTO (Campuran / Drum)</option>
              <option value="STORAGE_TANK">Storage Tank Liquid (1.000 kg)</option>
            </select>
            {location === 'STORAGE_TANK' && (
              <span className="text-[10px] text-cyan-400 mt-1 block flex items-center space-x-1">
                <Droplet className="w-3 h-3" />
                <span>Pipa feeding aktif. Menambah persediaan Storage Tank Liquid.</span>
              </span>
            )}
          </div>

          {/* Lot / Batch Code */}
          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              No. Lot / Batch Kedatangan
            </label>
            <input
              type="text"
              value={batchLotNumber}
              onChange={(e) => setBatchLotNumber(e.target.value)}
              placeholder="Contoh: LOT-202610-A91"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500"
            />
          </div>

          {/* OPSI KOREKSI JUMLAH KEDATANGAN MATERIAL ZAK DARI GDRM KE AREA CK */}
          <div className={`sm:col-span-2 rounded-2xl transition-all duration-200 ${
            isZakCorrection
              ? 'bg-amber-50 border border-amber-300 p-3.5 sm:p-4 space-y-3.5 shadow-sm text-slate-900'
              : 'bg-slate-50 border border-slate-200 hover:border-slate-300 p-3 text-slate-800'
          }`}>
            {/* Header with Switch */}
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${isZakCorrection ? 'border-b border-amber-500/30 pb-3' : ''}`}>
              <div className="flex items-center space-x-2.5">
                <div className={`p-2 rounded-xl border transition ${
                  isZakCorrection
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  <Scale className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="font-bold text-xs sm:text-sm text-white">
                      Koreksi Timbangan Kedatangan Zak (GDRM ➔ Area CK)
                    </h4>
                    {isZakCorrection && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold">
                        Mode Koreksi Aktif
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {isZakCorrection
                      ? `Gunakan tabel di bawah bila berat riil zak terkirim dari GDRM bervariasi (tidak persis ${standardBagWeight} kg/zak). Sistem akan otomatis mengalkulasikan total berat aktual.`
                      : `Centang opsi di samping untuk membuka formulir koreksi zak jika bobot fisik kemasan bervariasi (misal: 50 zak @ 24.8 kg & 50 zak @ 25.1 kg).`}
                  </p>
                </div>
              </div>

              {/* Toggle Aktif / Nonaktif */}
              <label className={`flex items-center space-x-2.5 cursor-pointer self-start sm:self-auto px-3 py-1.5 rounded-xl border transition select-none ${
                isZakCorrection
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-semibold shadow-sm'
                  : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700 hover:border-slate-600 text-slate-300'
              }`}>
                <input
                  type="checkbox"
                  checked={isZakCorrection}
                  onChange={(e) => setIsZakCorrection(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-xs font-semibold">
                  {isZakCorrection ? 'Mode Koreksi Zak Aktif' : 'Aktifkan Koreksi Zak'}
                </span>
              </label>
            </div>

            {isZakCorrection && (
              <div className="space-y-3">
                {/* Standar Kemasan & Tombol Cepat */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                  {/* Standar Kemasan Pabrikan */}
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-semibold text-slate-400">Kemasan Standar:</span>
                    <div className="flex rounded-lg overflow-hidden border border-slate-700 bg-slate-800 p-0.5">
                      {[15, 20, 25, 50].map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setStandardBagWeight(size)}
                          className={`px-2.5 py-1 text-[11px] font-mono font-bold rounded transition ${
                            standardBagWeight === size
                              ? 'bg-amber-500 text-slate-950 shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {size} kg
                        </button>
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-500 hidden sm:inline">per zak nominal</span>
                  </div>

                  {/* Tombol Aksi Cepat */}
                  <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                    <button
                      type="button"
                      onClick={handleSplitEvenly}
                      title="Bagi rata zak kedatangan menjadi 2 kelompok timbangan berbeda (contoh: 50 zak dan 50 zak)"
                      className="flex items-center space-x-1 px-2.5 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs font-semibold transition active:scale-95"
                    >
                      <Split className="w-3.5 h-3.5" />
                      <span>Bagi 2 Kelompok (50:50)</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleAddZakGroup}
                      className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-semibold transition active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Tambah Kelompok</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleResetToStandard}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs transition border border-slate-700"
                    >
                      Reset Standar
                    </button>
                  </div>
                </div>

                {/* Table of Zak Groups */}
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2">
                    <div className="col-span-3 sm:col-span-3">Kelompok / Pallet</div>
                    <div className="col-span-3 sm:col-span-2 text-center">Jumlah Zak</div>
                    <div className="col-span-3 sm:col-span-3 text-center">Berat / Zak (kg)</div>
                    <div className="col-span-3 sm:col-span-3 text-right">Subtotal Berat (kg)</div>
                    <div className="hidden sm:block sm:col-span-1 text-center">Hapus</div>
                  </div>

                  <div className="space-y-1.5">
                    {zakGroups.map((grp, idx) => (
                      <div
                        key={grp.id}
                        className="grid grid-cols-12 gap-2 items-center bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 hover:border-slate-700 transition"
                      >
                        {/* Label / Notes */}
                        <div className="col-span-3 sm:col-span-3">
                          <input
                            type="text"
                            value={grp.notes || ''}
                            onChange={(e) => handleUpdateZakGroup(grp.id, 'notes', e.target.value)}
                            placeholder={`Kelompok ${idx + 1}`}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                          />
                        </div>

                        {/* Jumlah Zak */}
                        <div className="col-span-3 sm:col-span-2">
                          <div className="relative">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={grp.bagCount}
                              onChange={(e) => handleUpdateZakGroup(grp.id, 'bagCount', e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-center text-amber-300 focus:outline-none focus:border-amber-400"
                            />
                            <span className="text-[9px] text-slate-500 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                              zak
                            </span>
                          </div>
                        </div>

                        {/* Berat Rata-rata per Zak */}
                        <div className="col-span-3 sm:col-span-3">
                          <div className="relative">
                            <input
                              type="number"
                              step="0.001"
                              value={grp.weightPerBagKg}
                              onChange={(e) => handleUpdateZakGroup(grp.id, 'weightPerBagKg', e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-center text-cyan-300 focus:outline-none focus:border-cyan-400"
                            />
                            <span className="text-[9px] text-slate-500 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                              kg/zak
                            </span>
                          </div>
                        </div>

                        {/* Subtotal Berat Kelompok */}
                        <div className="col-span-3 sm:col-span-3">
                          <div className="relative">
                            <input
                              type="number"
                              step="0.001"
                              value={grp.subtotalKg}
                              onChange={(e) => handleUpdateZakGroup(grp.id, 'subtotalKg', e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-right text-emerald-400 focus:outline-none focus:border-emerald-400"
                            />
                            <span className="text-[9px] text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                              kg
                            </span>
                          </div>
                        </div>

                        {/* Delete Button */}
                        <div className="hidden sm:flex col-span-1 justify-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveZakGroup(grp.id)}
                            disabled={zakGroups.length <= 1}
                            className="text-rose-400 hover:text-rose-300 disabled:opacity-30 disabled:cursor-not-allowed p-1.5 rounded-lg hover:bg-rose-500/10 transition"
                            title="Hapus baris kelompok ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live Real-time Summary Card */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                  <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block mb-0.5">Total Zak Diterima:</span>
                    <span className="font-mono font-bold text-amber-400 text-sm">
                      {totalZakCount} <span className="text-[10px] text-slate-500">Zak Fisik</span>
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      ({zakGroups.length} kelompok timbangan)
                    </span>
                  </div>

                  <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block mb-0.5">Bobot Standar Pabrikan:</span>
                    <span className="font-mono font-bold text-slate-300 text-sm">
                      {standardTotalKg.toFixed(2)} <span className="text-[10px] text-slate-500">kg</span>
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      ({totalZakCount} × {standardBagWeight} kg nominal)
                    </span>
                  </div>

                  <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block mb-0.5">Rata-rata Riil / Zak:</span>
                    <span className="font-mono font-bold text-cyan-300 text-sm">
                      {averageWeightPerBag.toFixed(3)} <span className="text-[10px] text-slate-500">kg/zak</span>
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      Std: {standardBagWeight} kg
                    </span>
                  </div>

                  <div className={`p-2.5 rounded-xl border ${
                    Math.abs(weightVarianceKg) > 0.001
                      ? weightVarianceKg > 0
                        ? 'bg-emerald-950/40 border-emerald-500/40'
                        : 'bg-amber-950/40 border-amber-500/40'
                      : 'bg-cyan-950/30 border-cyan-500/30'
                  }`}>
                    <span className="text-[10px] text-slate-300 font-semibold block mb-0.5">
                      Total Aktual Diterima:
                    </span>
                    <span className="font-mono font-bold text-emerald-400 text-base block">
                      {totalActualWeightKg.toFixed(4)} <span className="text-xs text-slate-400">kg</span>
                    </span>
                    <span className={`text-[10px] font-mono block ${
                      Math.abs(weightVarianceKg) < 0.001
                        ? 'text-cyan-400'
                        : weightVarianceKg > 0
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }`}>
                      {Math.abs(weightVarianceKg) < 0.001
                        ? '✓ Pas Sesuai Standar'
                        : `Deviasi: ${weightVarianceKg > 0 ? '+' : ''}${weightVarianceKg.toFixed(2)} kg (${variancePercent > 0 ? '+' : ''}${variancePercent.toFixed(2)}%)`}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Requested Qty vs Received Qty */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Qty Diminta (kg)
              </label>
              <input
                type="number"
                step="0.0001"
                disabled
                value={requestedQty > 0 ? requestedQty.toFixed(4) : '-'}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-400 font-mono"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-medium text-emerald-300">
                  Qty Fisik Aktual (kg)*
                </label>
                {isZakCorrection && (
                  <span className="text-[10px] text-amber-400 font-mono font-bold">
                    ✓ Terkalkulasi ({totalZakCount} Zak)
                  </span>
                )}
              </div>
              <input
                type="number"
                step="0.0001"
                required
                value={receivedQty}
                onChange={(e) => setReceivedQty(e.target.value)}
                placeholder="0.0000"
                className={`w-full bg-slate-800 border rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-none ${
                  isZakCorrection
                    ? 'border-amber-500/60 text-emerald-300 focus:border-amber-400'
                    : 'border-emerald-500/50 text-emerald-400 focus:border-emerald-400'
                }`}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Catatan Inspeksi / Kondisi Fisik
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Kemasan utuh, segel baik"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500"
            />
          </div>

          {/* CTA */}
          <div className="sm:col-span-2 pt-2">
            <button
              type="submit"
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs shadow-lg shadow-emerald-600/20 transition flex items-center justify-center space-x-2 active:scale-95"
            >
              <PackageCheck className="w-4 h-4" />
              <span>Terima & Tambah ke Stok {location}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Receipts History */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-white">History Penerimaan & Kedatangan Material</h3>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari penerimaan / lot / lokasi..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/60 text-[11px] font-semibold text-slate-400 border-b border-slate-800">
                <th className="py-2.5 px-3">No. Surat / Tanggal</th>
                <th className="py-2.5 px-3">Nama Material</th>
                <th className="py-2.5 px-3">No. Lot</th>
                <th className="py-2.5 px-3 text-right">Qty Diminta</th>
                <th className="py-2.5 px-3 text-right font-bold text-emerald-400">Qty Diterima</th>
                <th className="py-2.5 px-3 text-center">Lokasi Simpan</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredReceipts.length > 0 ? (
                filteredReceipts.map(rec => {
                  const mObj = state.master.materials.find(m => m.id === rec.materialId);

                  return (
                    <React.Fragment key={rec.id}>
                      <tr className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-3">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-mono font-semibold text-white block">{rec.receiptNumber}</span>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold font-mono border ${
                              rec.shift === 2
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                            }`}>
                              Shift {rec.shift || 1}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400">{rec.date}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-medium text-white block">{mObj ? mObj.name : 'Material'}</span>
                          <div className="flex items-center space-x-1.5 mt-0.5 flex-wrap gap-y-1">
                            <span className="text-[10px] text-slate-400">{mObj?.packaging || '-'}</span>
                            {rec.isZakCorrectionActive && rec.zakBreakdown && rec.zakBreakdown.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setExpandedReceiptId(expandedReceiptId === rec.id ? null : rec.id)}
                                className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-bold flex items-center space-x-1 hover:bg-amber-500/30 transition"
                              >
                                <span>{rec.totalBagCount || rec.zakBreakdown.reduce((sum, g) => sum + g.bagCount, 0)} Zak ({rec.zakBreakdown.length} Kelompok)</span>
                                {expandedReceiptId === rec.id ? (
                                  <ChevronUp className="w-3 h-3 text-amber-400" />
                                ) : (
                                  <ChevronDown className="w-3 h-3 text-amber-400" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-300">
                          {rec.batchLotNumber || '-'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-400">
                          {rec.requestedQty.toFixed(4)} kg
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          <span className="font-bold text-emerald-400 block">{rec.receivedQty.toFixed(4)} kg</span>
                          {rec.weightVarianceKg && Math.abs(rec.weightVarianceKg) > 0.001 ? (
                            <span className={`text-[10px] font-mono block ${
                              rec.weightVarianceKg > 0 ? 'text-emerald-400' : 'text-amber-400'
                            }`}>
                              {rec.weightVarianceKg > 0 ? '+' : ''}{rec.weightVarianceKg.toFixed(2)} kg vs std
                            </span>
                          ) : null}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            rec.location === 'STORAGE_TANK'
                              ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                              : rec.location === 'CK'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          }`}>
                            {rec.location}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] border font-medium ${
                            rec.status === 'Discrepancy'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          }`}>
                            {rec.status === 'Discrepancy' ? 'Selisih Qty' : 'Sesuai'}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded Zak Breakdown Accordion */}
                      {expandedReceiptId === rec.id && rec.zakBreakdown && rec.zakBreakdown.length > 0 && (
                        <tr className="bg-slate-950/90 border-b border-amber-500/30">
                          <td colSpan={7} className="p-3">
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-white flex items-center space-x-1.5">
                                  <Scale className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Rincian Timbangan Zak Kedatangan (Area {rec.location}):</span>
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  Standar: {rec.standardBagWeightKg || 25} kg/zak • Total: {rec.totalBagCount || '-'} Zak = {rec.receivedQty.toFixed(2)} kg
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {rec.zakBreakdown.map((zg, i) => (
                                  <div
                                    key={zg.id || i}
                                    className="bg-slate-950 p-2 rounded-lg border border-slate-800 text-xs space-y-1"
                                  >
                                    <div className="flex justify-between items-center text-[11px]">
                                      <strong className="text-white font-semibold">{zg.notes || `Kelompok ${i + 1}`}</strong>
                                      <span className="text-amber-400 font-mono font-bold">{zg.bagCount} Zak</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                                      <span>Rata-rata: {zg.weightPerBagKg.toFixed(3)} kg/zak</span>
                                      <span className="text-emerald-400 font-bold">{zg.subtotalKg.toFixed(2)} kg</span>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {rec.notes && (
                                <p className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-800">
                                  Catatan: {rec.notes}
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500 text-xs">
                    Belum ada riwayat penerimaan material tercatat.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals: Camera QR Scanner & Material QR Label Generator */}
      <MaterialQrScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        materials={state.master.materials}
        title="Scan QR Material Kedatangan"
        subtitle="Pindai QR pada kemasan bahan baku untuk otomatis mengisi material, nomor lot, dan dokumen permintaan terkait."
        onScanMatched={handleQrScanMatched}
        onOpenLabelGenerator={() => {
          setIsQrScannerOpen(false);
          setIsQrLabelOpen(true);
        }}
      />

      <MaterialQrLabelModal
        isOpen={isQrLabelOpen}
        onClose={() => setIsQrLabelOpen(false)}
        materials={state.master.materials}
        initialMaterialId={selectedMatId}
      />
    </div>
  );
};
