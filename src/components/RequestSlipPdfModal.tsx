import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  X,
  Printer,
  FileDown,
  FileText,
  CheckCircle2,
  QrCode,
  Layers,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal
} from 'lucide-react';
import { AppState, RequestCartItem } from '../types';
import {
  buildRequestSlipQrUrl,
  buildSupplierSlipFormOptions,
  formatIndonesianDateDash,
  generateMaterialRequestSlipPdf,
  groupCartItemsBySupplierAndWip,
  parseRequestSlipQrHash,
  REQUEST_SLIP_ROWS_PER_PAGE,
  RequestSlipDeepLinkData,
  RequestSlipFormOptions,
  RequestSlipSatMode,
  resolveBomMaterialCode,
  resolveCartItemSlipRow,
  SupplierWipCartGroup
} from '../utils/requestSlipPdf';

const A4_PREVIEW_BASE_WIDTH_PX = 1180;

interface ScaledSheetWrapperProps {
  scale: number;
  children: React.ReactNode;
}

const ScaledSheetWrapper: React.FC<ScaledSheetWrapperProps> = ({ scale, children }) => {
  const innerRef = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number>(820);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const updateHeight = () => {
      const nextH = el.offsetHeight;
      if (nextH > 0) setMeasuredHeight(nextH);
    };

    updateHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => updateHeight());
      ro.observe(el);
      return () => ro.disconnect();
    }
    return undefined;
  }, [children]);

  const scaledW = Math.round(A4_PREVIEW_BASE_WIDTH_PX * scale);
  const scaledH = Math.round(measuredHeight * scale);

  return (
    <div
      style={{
        width: `${scaledW}px`,
        height: `${scaledH}px`
      }}
      className="relative mx-auto shrink-0 transition-[width,height] duration-150 ease-out"
    >
      <div
        ref={innerRef}
        style={{
          width: `${A4_PREVIEW_BASE_WIDTH_PX}px`,
          transform: scale === 1 ? undefined : `scale(${scale})`,
          transformOrigin: 'top left'
        }}
      >
        {children}
      </div>
    </div>
  );
};

interface RequestSlipPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  cartItems: RequestCartItem[];
  initialGroupKey?: string;
  initialSupplier?: string;
  requestNumbers?: string[];
  onPreviewQrDetail?: (data: RequestSlipDeepLinkData) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const RequestSlipPdfModal: React.FC<RequestSlipPdfModalProps> = ({
  isOpen,
  onClose,
  state,
  cartItems,
  initialGroupKey,
  initialSupplier,
  requestNumbers,
  onPreviewQrDetail,
  showToast
}) => {
  const slipGroups = useMemo(
    () => groupCartItemsBySupplierAndWip(cartItems, state),
    [cartItems, state]
  );

  const [activeGroupKey, setActiveGroupKey] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [customSapCodes, setCustomSapCodes] = useState<Record<string, string>>({});
  const [isHeaderEditorOpen, setIsHeaderEditorOpen] = useState(false);
  const [isSlipListCollapsed, setIsSlipListCollapsed] = useState(false);
  const [zoomMode, setZoomMode] = useState<'fit' | number>(100);
  const [fitScale, setFitScale] = useState<number>(1);

  const stageRef = useRef<HTMLDivElement>(null);

  const [formOptions, setFormOptions] = useState<RequestSlipFormOptions>({
    lineId: '',
    lineName: 'Line Umum',
    supplier: 'GDRM',
    wipId: '',
    wipName: '',
    factoryGroupName: state.factoryName || 'PRODTRACK',
    docCode: 'MAY PRC LLA WFR UTG WHRxx/09/001-08-4',
    department: 'Warehouse',
    kepadaWarehouse: 'GDRM (Gudang Bahan Baku)',
    tujuanPengiriman: 'Line Umum · Area Penyimpanan CK',
    permintaanShift: 'Shift 1',
    bonNumber: '',
    tanggal: formatIndonesianDateDash(),
    namaPengirim: '',
    namaPenerima: state.currentSession?.name || '',
    dibuatOleh: state.currentSession?.name || '',
    menyetujui: '',
    keterangan: '',
    satMode: 'kg',
    includeMaterialCodeInSap: true
  });

  // Measure preview stage width for Fit-to-Screen mode & responsive initial readability
  useEffect(() => {
    if (!isOpen) return;
    const stage = stageRef.current;
    if (!stage) return;

    const computeFit = () => {
      const availableW = stage.clientWidth - 36;
      if (availableW > 100) {
        const computed = Math.min(1.35, Math.max(0.55, availableW / A4_PREVIEW_BASE_WIDTH_PX));
        setFitScale(Number(computed.toFixed(3)));
      }
    };

    computeFit();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => computeFit());
      ro.observe(stage);
      return () => ro.disconnect();
    }
    return undefined;
  }, [isOpen, isHeaderEditorOpen, isSlipListCollapsed]);

  // Auto-select comfortable scale when modal opens (fit on narrow screens, crisp 100% on wide desktop)
  useEffect(() => {
    if (!isOpen) return;
    if (typeof window !== 'undefined' && window.innerWidth < 1260) {
      setZoomMode('fit');
    } else {
      setZoomMode(100);
    }
  }, [isOpen]);

  const effectiveScale = useMemo(() => {
    if (zoomMode === 'fit') return fitScale;
    return Math.min(1.6, Math.max(0.6, zoomMode / 100));
  }, [zoomMode, fitScale]);

  const displayedZoomPercent = Math.round(effectiveScale * 100);

  // Sync active (Supplier + WIP) tab when modal opens or groups change
  useEffect(() => {
    if (!isOpen || slipGroups.length === 0) return;

    if (initialGroupKey && slipGroups.some(g => g.key === initialGroupKey)) {
      setActiveGroupKey(initialGroupKey);
      return;
    }

    if (initialSupplier) {
      const matched = slipGroups.find(g => g.supplier === initialSupplier);
      if (matched) {
        setActiveGroupKey(matched.key);
        return;
      }
    }

    if (!slipGroups.some(g => g.key === activeGroupKey)) {
      setActiveGroupKey(slipGroups[0].key);
    }
  }, [isOpen, initialGroupKey, initialSupplier, slipGroups, activeGroupKey]);

  const activeGroup: SupplierWipCartGroup | null = useMemo(() => {
    if (slipGroups.length === 0) return null;
    return slipGroups.find(g => g.key === activeGroupKey) || slipGroups[0];
  }, [slipGroups, activeGroupKey]);

  const activeLineName = activeGroup?.lineName || 'Line Umum';
  const activeSupplier = activeGroup?.supplier || 'GDRM';
  const activeWipName = activeGroup?.wipName || 'Umum';
  const activeGroupItems = activeGroup?.items || [];

  // Build form defaults for a (Line + Supplier + WIP) group while preserving operator metadata edits
  const buildGroupDefaults = (
    group: SupplierWipCartGroup,
    prevOpts?: RequestSlipFormOptions
  ): RequestSlipFormOptions => {
    return buildSupplierSlipFormOptions(group.supplier, group.items, state, {
      lineId: group.lineId,
      lineName: group.lineName,
      wipId: group.wipId,
      wipName: group.wipName,
      factoryGroupName: state.factoryName || prevOpts?.factoryGroupName || 'PRODTRACK',
      docCode: prevOpts?.docCode || 'MAY PRC LLA WFR UTG WHRxx/09/001-08-4',
      department: prevOpts?.department || 'Warehouse',
      namaPengirim: prevOpts?.namaPengirim || '',
      namaPenerima: prevOpts?.namaPenerima || undefined,
      dibuatOleh: prevOpts?.dibuatOleh || undefined,
      menyetujui: prevOpts?.menyetujui || '',
      satMode: prevOpts?.satMode || 'kg',
      includeMaterialCodeInSap:
        prevOpts?.includeMaterialCodeInSap !== undefined ? prevOpts.includeMaterialCodeInSap : true,
      materialsCatalog: state.master.materials,
      customSapCodes,
      requestNumbers
    });
  };

  // Refresh slip metadata whenever active (Supplier + WIP) group or modal open changes
  useEffect(() => {
    if (!isOpen || !activeGroup || activeGroup.items.length === 0) return;
    setFormOptions(prev => buildGroupDefaults(activeGroup, prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeGroup?.key, activeGroup?.items.length, state.master.materials]);

  // Count how many items have BOM material codes automatically populated
  const autoSapFilledCount = useMemo(() => {
    return activeGroupItems.filter(
      item => resolveBomMaterialCode(item, state.master.materials, customSapCodes).length > 0
    ).length;
  }, [activeGroupItems, state.master.materials, customSapCodes]);

  const totalPages = Math.max(1, Math.ceil(activeGroupItems.length / REQUEST_SLIP_ROWS_PER_PAGE));

  // Build sheet payloads (10 rows per sheet; overflows to continuation sheets)
  const previewSheets = useMemo(() => {
    return Array.from({ length: totalPages }, (_, pageIdx) => {
      const startIdx = pageIdx * REQUEST_SLIP_ROWS_PER_PAGE;
      const pageItems = activeGroupItems.slice(startIdx, startIdx + REQUEST_SLIP_ROWS_PER_PAGE);
      const rows = Array.from({ length: REQUEST_SLIP_ROWS_PER_PAGE }, (_, r) => {
        const item = pageItems[r];
        return {
          rowNum: startIdx + r + 1,
          item,
          mapped: item
            ? resolveCartItemSlipRow(
                item,
                formOptions.satMode,
                formOptions.includeMaterialCodeInSap,
                state.master.materials,
                customSapCodes
              )
            : null
        };
      });

      const sheetQrUrl =
        pageItems.length > 0
          ? buildRequestSlipQrUrl(pageItems, {
              bonNumber: formOptions.bonNumber,
              lineName: formOptions.lineName || activeLineName,
              supplier: activeSupplier,
              wipName: activeWipName,
              tanggal: formOptions.tanggal,
              satMode: formOptions.satMode,
              includeMaterialCodeInSap: true,
              materialsCatalog: state.master.materials,
              customSapCodes,
              requestNumbers,
              pageNumber: pageIdx + 1,
              totalPages
            })
          : '';

      return {
        pageNumber: pageIdx + 1,
        pageItems,
        rows,
        sheetQrUrl
      };
    });
  }, [
    totalPages,
    activeGroupItems,
    formOptions.satMode,
    formOptions.includeMaterialCodeInSap,
    formOptions.bonNumber,
    formOptions.lineName,
    formOptions.tanggal,
    activeLineName,
    activeSupplier,
    activeWipName,
    state.master.materials,
    customSapCodes,
    requestNumbers
  ]);

  const primaryQrUrl = previewSheets[0]?.sheetQrUrl || '';

  if (!isOpen) return null;

  const handleStepZoom = (deltaPercent: number) => {
    const base = zoomMode === 'fit' ? displayedZoomPercent : zoomMode;
    const next = Math.min(160, Math.max(60, Math.round((base + deltaPercent) / 5) * 5));
    setZoomMode(next);
  };

  const handleDownloadCurrentGroupPdf = async () => {
    if (!activeGroup || activeGroupItems.length === 0) {
      showToast('Tidak ada item untuk slip yang dipilih.', true);
      return;
    }
    setIsExporting(true);
    try {
      const effectiveLineName = formOptions.lineName || activeLineName;
      await generateMaterialRequestSlipPdf(activeGroupItems, {
        ...formOptions,
        lineId: activeGroup.lineId,
        lineName: effectiveLineName,
        supplier: activeSupplier,
        wipId: activeGroup.wipId,
        wipName: activeWipName,
        materialsCatalog: state.master.materials,
        customSapCodes,
        requestNumbers
      });
      showToast(
        `Slip PDF "${effectiveLineName} • ${activeSupplier} • ${activeWipName}" (${activeGroupItems.length} item, ${totalPages} lembar) berhasil diunduh.`
      );
    } catch (err) {
      console.error('Failed to generate request slip PDF:', err);
      showToast('Gagal membuat file PDF slip permintaan.', true);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadAllGroupsPdf = async () => {
    if (slipGroups.length === 0) return;
    setIsExporting(true);
    try {
      for (let idx = 0; idx < slipGroups.length; idx++) {
        const grp = slipGroups[idx];
        if (grp.items.length === 0) continue;
        if (idx > 0) {
          await new Promise<void>(resolve => setTimeout(resolve, 180));
        }
        const grpOpts =
          grp.key === activeGroup?.key
            ? {
                ...formOptions,
                lineId: grp.lineId,
                lineName: formOptions.lineName || grp.lineName,
                supplier: grp.supplier,
                wipId: grp.wipId,
                wipName: grp.wipName,
                materialsCatalog: state.master.materials,
                customSapCodes,
                requestNumbers
              }
            : buildGroupDefaults(grp, formOptions);
        await generateMaterialRequestSlipPdf(grp.items, grpOpts);
      }
      showToast(
        `Berhasil mengunduh ${slipGroups.length} file Slip PDF terpisah (Line Produksi, Supplier & WIP).`
      );
    } catch (err) {
      console.error('Failed to export all slip PDFs:', err);
      showToast('Gagal mengunduh seluruh slip PDF.', true);
    } finally {
      setIsExporting(false);
    }
  };

  const handleTestQrDetail = (targetUrl?: string) => {
    const urlToParse = targetUrl || primaryQrUrl;
    if (!urlToParse) return;
    const hashIdx = urlToParse.indexOf('#');
    const hashStr = hashIdx >= 0 ? urlToParse.slice(hashIdx) : '';
    const parsed = parseRequestSlipQrHash(hashStr);
    if (parsed && onPreviewQrDetail) {
      onPreviewQrDetail(parsed);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-3 bg-slate-950/88 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-[97vw] xl:max-w-[1480px] h-[95vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3 bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-950/40 shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shrink-0">
              <Printer className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base text-white truncate">
                Pratinjau &amp; Cetak Slip PDF — BON PERMINTAAN RM &amp; PM
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                Line <strong className="text-emerald-300">{formOptions.lineName || activeLineName}</strong> · Supplier{' '}
                <strong className="text-cyan-300">{activeSupplier}</strong> · WIP{' '}
                <strong className="text-amber-300">{activeWipName}</strong> ·{' '}
                <span className="font-mono tabular-nums">
                  {activeGroupItems.length} item · {totalPages} lembar A4 Landscape
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pratinjau slip"
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Line Produksi + Supplier + WIP Collapsible Tabs Bar */}
        {slipGroups.length > 0 && (
          <div className="px-4 py-2 bg-slate-950 border-b border-slate-800 shrink-0 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="text-[11px] font-semibold text-slate-300 flex items-center space-x-1.5 shrink-0">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Lembar Slip ({slipGroups.length}):</span>
                </span>

                {isSlipListCollapsed && (
                  <div className="flex items-center gap-2 min-w-0">
                    <select
                      aria-label="Pilih lembar slip aktif"
                      value={activeGroup?.key || ''}
                      onChange={e => setActiveGroupKey(e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-semibold text-white max-w-[360px]"
                    >
                      {slipGroups.map(grp => (
                        <option key={grp.key} value={grp.key}>
                          {grp.lineName} · {grp.supplier} · {grp.wipName} ({grp.items.length} item
                          {grp.pageCount > 1 ? ` · ${grp.pageCount} lbr` : ''})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <span className="text-[11px] font-mono tabular-nums text-emerald-400">
                  ✓ Kode SAP BOM: {autoSapFilledCount}/{activeGroupItems.length} item terisi
                </span>

                <button
                  type="button"
                  onClick={() => setIsSlipListCollapsed(prev => !prev)}
                  aria-expanded={!isSlipListCollapsed}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 transition"
                  title={
                    isSlipListCollapsed
                      ? 'Tampilkan daftar lembar slip agar lebih mudah memilih'
                      : 'Collapse daftar lembar slip agar porsi pratinjau kertas lebih besar'
                  }
                >
                  {isSlipListCollapsed ? (
                    <>
                      <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Tampilkan Lembar Slip</span>
                    </>
                  ) : (
                    <>
                      <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Collapse Lembar Slip</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {!isSlipListCollapsed && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {slipGroups.map(grp => {
                  const isSelected = grp.key === activeGroup?.key;
                  return (
                    <button
                      key={grp.key}
                      type="button"
                      onClick={() => setActiveGroupKey(grp.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 border whitespace-nowrap shrink-0 ${
                        isSelected
                          ? grp.supplier === 'GDRM'
                            ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                            : 'bg-purple-600 text-white border-purple-400 shadow-sm'
                          : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <span>
                        {grp.lineName} · {grp.supplier} · {grp.wipName}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums ${
                          isSelected ? 'bg-black/20' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {grp.items.length} item
                        {grp.pageCount > 1 ? ` · ${grp.pageCount} lbr` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Quick Preview Toolbar: SAT Mode, Zoom Controls, & Collapsible Header Editor Trigger */}
        <div className="px-4 py-2.5 bg-slate-900/95 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 rounded-lg p-1">
              <span className="text-[11px] text-slate-400 px-1.5 font-medium">SAT:</span>
              {(
                [
                  { id: 'kg', label: 'kg' },
                  { id: 'zak_or_kg', label: 'Kemasan / Zak' },
                  { id: 'batch', label: 'Batch' }
                ] as Array<{ id: RequestSlipSatMode; label: string }>
              ).map(mode => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setFormOptions(prev => ({ ...prev, satMode: mode.id }))}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                    formOptions.satMode === mode.id
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <label className="inline-flex items-center space-x-1.5 text-[11px] text-slate-300 cursor-pointer select-none px-2 py-1 rounded-lg bg-slate-950/60 border border-slate-800">
              <input
                type="checkbox"
                checked={formOptions.includeMaterialCodeInSap}
                onChange={e =>
                  setFormOptions(prev => ({
                    ...prev,
                    includeMaterialCodeInSap: e.target.checked
                  }))
                }
                className="rounded border-slate-600 bg-slate-800 text-cyan-500"
              />
              <span>Auto Kode SAP BOM</span>
            </label>

            <button
              type="button"
              onClick={() => setIsHeaderEditorOpen(prev => !prev)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition flex items-center space-x-1.5 ${
                isHeaderEditorOpen
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Edit Detail Header &amp; Kode SAP</span>
              {isHeaderEditorOpen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {onPreviewQrDetail && primaryQrUrl && (
              <button
                type="button"
                onClick={() => handleTestQrDetail(primaryQrUrl)}
                className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-[11px] font-semibold flex items-center space-x-1.5 transition"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Uji QR</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Paper Zoom Controls */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 rounded-lg p-1">
            <button
              type="button"
              onClick={() => handleStepZoom(-15)}
              title="Perkecil tampilan pratinjau"
              className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            {[
              { key: 'fit' as const, label: 'Fit' },
              { key: 100 as const, label: '100%' },
              { key: 120 as const, label: '120%' },
              { key: 140 as const, label: '140%' }
            ].map(preset => (
              <button
                key={String(preset.key)}
                type="button"
                onClick={() => setZoomMode(preset.key)}
                className={`px-2 py-1 rounded-md text-[11px] font-mono font-semibold transition ${
                  zoomMode === preset.key
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleStepZoom(15)}
              title="Perbesar tampilan pratinjau"
              className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[11px] font-mono tabular-nums text-cyan-300 border-l border-slate-800 flex items-center gap-1">
              <Maximize2 className="w-3 h-3 text-slate-400" />
              {displayedZoomPercent}%
            </span>
          </div>
        </div>

        {/* Collapsible Header Metadata & Kode SAP Editor Drawer */}
        {isHeaderEditorOpen && (
          <div className="px-4 py-3 bg-slate-950/90 border-b border-slate-800 space-y-3 overflow-y-auto max-h-[38vh] shrink-0 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-cyan-300 flex items-center space-x-1.5">
                <FileText className="w-4 h-4" />
                <span>
                  Pengaturan Header Slip ({formOptions.lineName || activeLineName} — {activeSupplier} — {activeWipName})
                </span>
              </span>
              <button
                type="button"
                onClick={() => setIsHeaderEditorOpen(false)}
                className="text-[11px] text-slate-400 hover:text-white underline"
              >
                Tutup Editor Header
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Line Produksi Tujuan</label>
                <input
                  type="text"
                  value={formOptions.lineName || ''}
                  onChange={e =>
                    setFormOptions(prev => ({ ...prev, lineName: e.target.value }))
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
                  placeholder="Line A / Line 1"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Kepada Warehouse</label>
                <input
                  type="text"
                  value={formOptions.kepadaWarehouse}
                  onChange={e =>
                    setFormOptions(prev => ({ ...prev, kepadaWarehouse: e.target.value }))
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
                  placeholder="GDRM / Warehouse RM"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">
                  Tujuan Pengiriman (Lokasi Penyimpanan)
                </label>
                <input
                  type="text"
                  list="slip-tujuan-lokasi-options"
                  value={formOptions.tujuanPengiriman}
                  onChange={e =>
                    setFormOptions(prev => ({ ...prev, tujuanPengiriman: e.target.value }))
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
                  placeholder="Area Penyimpanan CK / WINEROTO / Storage Tank Liquid"
                />
                <datalist id="slip-tujuan-lokasi-options">
                  <option value="Area Penyimpanan CK" />
                  <option value="Area Penyimpanan WINEROTO" />
                  <option value="Storage Tank Liquid" />
                  <option value="Area Penyimpanan CK / Storage Tank Liquid" />
                </datalist>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Permintaan Shift</label>
                <input
                  type="text"
                  value={formOptions.permintaanShift}
                  onChange={e =>
                    setFormOptions(prev => ({ ...prev, permintaanShift: e.target.value }))
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
                  placeholder="Shift 1"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">No. Bon Permintaan</label>
                <input
                  type="text"
                  value={formOptions.bonNumber}
                  onChange={e => setFormOptions(prev => ({ ...prev, bonNumber: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                  placeholder="BON-261120-GDRM-WIP-01"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Tanggal</label>
                <input
                  type="text"
                  value={formOptions.tanggal}
                  onChange={e => setFormOptions(prev => ({ ...prev, tanggal: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                  placeholder="20-11-2026"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Nama Pengirim (WH)</label>
                <input
                  type="text"
                  value={formOptions.namaPengirim}
                  onChange={e =>
                    setFormOptions(prev => ({ ...prev, namaPengirim: e.target.value }))
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
                  placeholder="(Kosongkan u/ diisi WH)"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Nama Penerima (Prod)</label>
                <input
                  type="text"
                  value={formOptions.namaPenerima}
                  onChange={e =>
                    setFormOptions(prev => ({ ...prev, namaPenerima: e.target.value }))
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
                  placeholder="Nama penerima produksi"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Departemen</label>
                <input
                  type="text"
                  value={formOptions.department || 'Warehouse'}
                  onChange={e => setFormOptions(prev => ({ ...prev, department: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
                  placeholder="Warehouse"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Kode Form (Kanan Atas)</label>
                <input
                  type="text"
                  value={formOptions.docCode || ''}
                  onChange={e => setFormOptions(prev => ({ ...prev, docCode: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                  placeholder="MAY PRC LLA WFR UTG WHRxx/09/001-08-4"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Dibuat Oleh</label>
                <input
                  type="text"
                  value={formOptions.dibuatOleh}
                  onChange={e => setFormOptions(prev => ({ ...prev, dibuatOleh: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
                  placeholder="Operator / Pembuat"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Menyetujui</label>
                <input
                  type="text"
                  value={formOptions.menyetujui}
                  onChange={e => setFormOptions(prev => ({ ...prev, menyetujui: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
                  placeholder="Leader / Supervisor"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">
                  Keterangan (Box Kanan Bawah)
                </label>
                <textarea
                  rows={2}
                  value={formOptions.keterangan}
                  onChange={e => setFormOptions(prev => ({ ...prev, keterangan: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs resize-none"
                  placeholder="Contoh: u/ cream tanpa..."
                />
              </div>
            </div>

            {formOptions.includeMaterialCodeInSap && activeGroupItems.length > 0 && (
              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                <div className="text-[10px] font-semibold text-slate-400 mb-1.5">
                  Kode SAP* Terhubung dari Master BOM ({activeGroupItems.length} item — dapat
                  disesuaikan manual jika perlu):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
                  {activeGroupItems.map((item, idx) => {
                    const resolvedSap = resolveBomMaterialCode(
                      item,
                      state.master.materials,
                      customSapCodes
                    );
                    const sheetNo = Math.floor(idx / REQUEST_SLIP_ROWS_PER_PAGE) + 1;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center space-x-2 bg-slate-950/70 border border-slate-800 rounded-lg px-2 py-1"
                      >
                        <span className="text-[10px] font-mono text-slate-500 shrink-0">
                          #{idx + 1}
                          {totalPages > 1 ? ` (L${sheetNo})` : ''}
                        </span>
                        <span
                          className="text-[10px] text-slate-300 truncate flex-1"
                          title={item.materialName}
                        >
                          {item.materialName}
                        </span>
                        <input
                          type="text"
                          value={resolvedSap}
                          onChange={e =>
                            setCustomSapCodes(prev => ({
                              ...prev,
                              [item.id]: e.target.value
                            }))
                          }
                          placeholder="Kode SAP"
                          className="w-24 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] font-mono text-cyan-300"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Live Full-Size A4 Landscape Paper Preview Stage */}
        <div
          ref={stageRef}
          className="flex-1 overflow-auto bg-slate-950/80 p-3 sm:p-5 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 max-w-[1180px] mx-auto">
            <span className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Pratinjau Kertas A4 Landscape ({displayedZoomPercent}%) — Bon{' '}
                <span className="font-mono text-cyan-300">{formOptions.bonNumber || '-'}</span>
              </span>
            </span>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span>
                Shift: <strong className="text-slate-200">{formOptions.permintaanShift}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Tgl: <strong className="font-mono text-slate-200">{formOptions.tanggal}</strong>
              </span>
              {totalPages > 1 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-300 font-mono">
                    {totalPages} Lembar (@ 10 baris/lembar)
                  </span>
                </>
              )}
            </div>
          </div>

          {previewSheets.map(sheet => (
            <div key={sheet.pageNumber} className="space-y-2">
              {totalPages > 1 && (
                <div className="flex items-center justify-between text-xs font-mono text-cyan-300 max-w-[1180px] mx-auto px-1">
                  <span>
                    Lembar {sheet.pageNumber} dari {totalPages}
                    {sheet.pageNumber > 1 ? ' (Lanjutan)' : ''} — Baris #
                    {(sheet.pageNumber - 1) * REQUEST_SLIP_ROWS_PER_PAGE + 1} s.d. #
                    {Math.min(
                      sheet.pageNumber * REQUEST_SLIP_ROWS_PER_PAGE,
                      activeGroupItems.length
                    )}
                  </span>
                  {onPreviewQrDetail && sheet.sheetQrUrl && (
                    <button
                      type="button"
                      onClick={() => handleTestQrDetail(sheet.sheetQrUrl)}
                      className="text-xs underline hover:text-cyan-200"
                    >
                      Uji QR Lembar {sheet.pageNumber}
                    </button>
                  )}
                </div>
              )}

              <ScaledSheetWrapper scale={effectiveScale}>
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    color: '#0f172a',
                    width: `${A4_PREVIEW_BASE_WIDTH_PX}px`,
                    fontFamily: 'Arial, Helvetica, sans-serif'
                  }}
                  className="slip-paper-preview border-2 border-slate-400 rounded-sm shadow-2xl p-7"
                >
                  {/* Header Grid */}
                  <div style={{ borderColor: '#000000' }} className="grid grid-cols-12 border-2">
                    <div
                      style={{ borderColor: '#000000' }}
                      className="col-span-2 border-r-2 p-3 flex flex-col justify-between min-h-[78px]"
                    >
                      <div className="text-center font-bold text-sm tracking-tight uppercase pt-1 leading-snug">
                        {formOptions.factoryGroupName || 'PRODTRACK'}
                      </div>
                      <div className="text-[11px] font-bold tracking-wider">GROUP</div>
                    </div>
                    <div
                      style={{ borderColor: '#000000' }}
                      className="col-span-7 border-r-2 flex flex-col items-center justify-center p-3"
                    >
                      <div className="font-bold text-2xl tracking-wide text-center leading-tight">
                        BON PERMINTAAN RM &amp; PM
                      </div>
                      {(formOptions.lineName || totalPages > 1) && (
                        <div className="text-xs font-bold mt-1 text-center">
                          {[
                            formOptions.lineName ? `Line Produksi: ${formOptions.lineName}` : '',
                            totalPages > 1
                              ? `Lembar ${sheet.pageNumber} dari ${totalPages}${sheet.pageNumber > 1 ? ' (Lanjutan)' : ''}`
                              : ''
                          ]
                            .filter(Boolean)
                            .join('  •  ')}
                        </div>
                      )}
                    </div>
                    <div className="col-span-3 flex flex-col">
                      <div
                        style={{ borderColor: '#000000' }}
                        className="border-b-2 px-3 py-2 text-[11px] text-center flex-1 flex items-center justify-center font-serif"
                      >
                        {formOptions.docCode}
                      </div>
                      <div className="px-3 py-2 text-xs font-medium text-center flex-1 flex items-center justify-center">
                        Departemen : {formOptions.department || 'Warehouse'}
                      </div>
                    </div>
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-12 gap-4 my-4 text-xs items-start">
                    <div className="col-span-4 space-y-1.5">
                      <div className="flex items-baseline">
                        <span className="w-36 font-semibold shrink-0">Kepada Warehouse</span>
                        <span className="mr-2">:</span>
                        <span className="font-medium break-words">{formOptions.kepadaWarehouse}</span>
                      </div>
                      <div className="flex items-baseline">
                        <span className="w-36 font-semibold shrink-0">Tujuan Pengiriman</span>
                        <span className="mr-2">:</span>
                        <span className="font-medium break-words">{formOptions.tujuanPengiriman}</span>
                      </div>
                      <div className="flex items-baseline">
                        <span className="w-36 font-semibold shrink-0">Permintaan Shift</span>
                        <span className="mr-2">:</span>
                        <span className="font-medium">{formOptions.permintaanShift}</span>
                      </div>
                    </div>

                    <div className="col-span-4 space-y-1.5">
                      <div className="flex items-baseline">
                        <span className="w-20 font-semibold shrink-0">No</span>
                        <span className="mr-2">:</span>
                        <span className="font-mono font-semibold">
                          {formOptions.bonNumber}
                          {totalPages > 1 ? ` (${sheet.pageNumber}/${totalPages})` : ''}
                        </span>
                      </div>
                      <div className="flex items-baseline">
                        <span className="w-20 font-semibold shrink-0">Tanggal</span>
                        <span className="mr-2">:</span>
                        <span className="font-mono font-semibold">{formOptions.tanggal}</span>
                      </div>
                    </div>

                    <div className="col-span-4">
                      <table
                        style={{ borderColor: '#000000' }}
                        className="w-full border-collapse border text-xs"
                      >
                        <tbody>
                          <tr>
                            <td
                              style={{ borderColor: '#000000' }}
                              className="border px-2.5 py-1 font-semibold w-32"
                            >
                              Nama Pengirim
                            </td>
                            <td style={{ borderColor: '#000000' }} className="border px-2.5 py-1">
                              : {formOptions.namaPengirim}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ borderColor: '#000000' }} className="border px-2.5 py-1">
                              &nbsp;
                            </td>
                            <td style={{ borderColor: '#000000' }} className="border px-2.5 py-1">
                              :
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{ borderColor: '#000000' }}
                              className="border px-2.5 py-1 font-semibold"
                            >
                              Nama Penerima
                            </td>
                            <td style={{ borderColor: '#000000' }} className="border px-2.5 py-1">
                              : {formOptions.namaPenerima}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ borderColor: '#000000' }} className="border px-2.5 py-1">
                              &nbsp;
                            </td>
                            <td style={{ borderColor: '#000000' }} className="border px-2.5 py-1">
                              :
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Main 10-Row 22-Column Table */}
                  <table
                    style={{ borderColor: '#000000' }}
                    className="w-full border-collapse border-2 text-xs"
                  >
                    <thead>
                      <tr className="text-center font-bold">
                        <th
                          rowSpan={3}
                          style={{ borderColor: '#000000' }}
                          className="border px-1.5 py-1.5 w-9"
                        >
                          No
                        </th>
                        <th
                          rowSpan={3}
                          style={{ borderColor: '#000000' }}
                          className="border px-2 py-1.5 w-24"
                        >
                          Kode SAP*
                        </th>
                        <th
                          rowSpan={3}
                          style={{ borderColor: '#000000' }}
                          className="border px-2 py-1.5 w-24"
                        >
                          Kode Batch
                        </th>
                        <th
                          rowSpan={3}
                          style={{ borderColor: '#000000' }}
                          className="border px-2.5 py-1.5 min-w-[220px]"
                        >
                          Jenis Barang
                        </th>
                        <th
                          rowSpan={3}
                          style={{ borderColor: '#000000' }}
                          className="border px-1.5 py-1.5 w-14"
                        >
                          SAT
                        </th>
                        <th
                          rowSpan={3}
                          style={{ borderColor: '#000000' }}
                          className="border px-1.5 py-1.5 w-20 leading-tight"
                        >
                          Jumlah yang diminta
                        </th>
                        <th
                          colSpan={15}
                          style={{ borderColor: '#000000' }}
                          className="border px-2 py-1.5"
                        >
                          Jumlah yang dikirim
                        </th>
                        <th
                          rowSpan={3}
                          style={{ borderColor: '#000000' }}
                          className="border px-1.5 py-1.5 w-20 leading-tight"
                        >
                          Total yang dikirim
                        </th>
                      </tr>
                      <tr className="text-center font-bold text-[11px]">
                        {[1, 2, 3, 4, 5].map(idx => (
                          <React.Fragment key={idx}>
                            <th
                              rowSpan={2}
                              style={{ borderColor: '#000000' }}
                              className="border px-1 py-1 w-9"
                            >
                              ke-{idx}
                            </th>
                            <th
                              colSpan={2}
                              style={{ borderColor: '#000000' }}
                              className="border px-1 py-1"
                            >
                              TTD
                            </th>
                          </React.Fragment>
                        ))}
                      </tr>
                      <tr className="text-center font-bold text-[10px]">
                        {[1, 2, 3, 4, 5].map(idx => (
                          <React.Fragment key={idx}>
                            <th
                              style={{ borderColor: '#000000' }}
                              className="border px-1 py-1 w-8"
                            >
                              WH
                            </th>
                            <th
                              style={{ borderColor: '#000000' }}
                              className="border px-1 py-1 w-8"
                            >
                              Prod
                            </th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.rows.map(({ rowNum, mapped }) => (
                        <tr key={rowNum} className="h-9">
                          <td
                            style={{ borderColor: '#000000' }}
                            className="border text-center font-semibold tabular-nums"
                          >
                            {rowNum}
                          </td>
                          <td
                            style={{ borderColor: '#000000' }}
                            className="border text-center px-1.5 font-mono font-semibold tabular-nums"
                          >
                            {mapped?.kodeSap || ''}
                          </td>
                          <td
                            style={{ borderColor: '#000000' }}
                            className="border text-center px-1.5 font-mono"
                          >
                            {mapped?.kodeBatch || ''}
                          </td>
                          <td
                            style={{ borderColor: '#000000' }}
                            className="border px-2.5 font-medium leading-snug"
                          >
                            {mapped?.jenisBarang || ''}
                          </td>
                          <td
                            style={{ borderColor: '#000000' }}
                            className="border text-center px-1.5 font-medium"
                          >
                            {mapped?.sat || ''}
                          </td>
                          <td
                            style={{ borderColor: '#000000' }}
                            className="border text-center font-bold text-sm tabular-nums px-1.5"
                          >
                            {mapped?.jumlahDiminta || ''}
                          </td>
                          {Array.from({ length: 15 }).map((_, cIdx) => (
                            <td key={cIdx} style={{ borderColor: '#000000' }} className="border" />
                          ))}
                          <td style={{ borderColor: '#000000' }} className="border" />
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Footer: Footnote, Signatures, QR Code, Keterangan */}
                  <div className="grid grid-cols-12 gap-4 mt-2.5 items-start">
                    <div className="col-span-5">
                      <p className="text-[11px] italic">
                        *Penulisan kode SAP hanya untuk permintaan barang packaging material (PM)
                      </p>
                      <div className="grid grid-cols-2 gap-4 mt-5 text-center text-xs">
                        <div>
                          <div className="font-semibold">Dibuat,</div>
                          <div className="h-14" />
                          <div className="font-medium">
                            {formOptions.dibuatOleh.trim()
                              ? `( ${formOptions.dibuatOleh.trim()} )`
                              : '(....................)'}
                          </div>
                        </div>
                        <div>
                          <div className="font-semibold">Menyetujui,</div>
                          <div className="h-14" />
                          <div className="font-medium">
                            {formOptions.menyetujui.trim()
                              ? `( ${formOptions.menyetujui.trim()} )`
                              : '(....................)'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Embedded QR Code Card */}
                    <div className="col-span-2 pt-2 flex justify-center">
                      <div
                        style={{ borderColor: '#000000' }}
                        className="border p-2.5 flex flex-col items-center justify-center text-center"
                      >
                        {sheet.sheetQrUrl && (
                          <QRCodeCanvas
                            value={sheet.sheetQrUrl}
                            size={96}
                            level="M"
                            bgColor="#ffffff"
                            fgColor="#0f172a"
                          />
                        )}
                        <span className="text-[9.5px] font-bold tracking-tight mt-1.5">
                          SCAN DETAIL REQUEST
                        </span>
                        <span className="text-[9px] font-mono leading-tight mt-0.5">
                          {formOptions.bonNumber}
                          {totalPages > 1 ? ` (${sheet.pageNumber}/${totalPages})` : ''}
                        </span>
                      </div>
                    </div>

                    <div className="col-span-5 pt-2">
                      <div
                        style={{ borderColor: '#000000' }}
                        className="border p-3 min-h-[132px] text-xs"
                      >
                        <div className="font-bold mb-1.5">Keterangan :</div>
                        <div className="whitespace-pre-line leading-relaxed">
                          {formOptions.keterangan}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </ScaledSheetWrapper>
            </div>
          ))}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-3 border-t border-slate-800 bg-slate-950 flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5 shrink-0">
          <span className="text-[11px] text-slate-400">
            Slip dipisah per Line Produksi, Supplier &amp; WIP (10 baris/lembar A4 Landscape dengan QR per lembar).
          </span>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700 transition whitespace-nowrap shrink-0"
            >
              Tutup
            </button>

            {slipGroups.length > 1 && (
              <button
                type="button"
                onClick={handleDownloadAllGroupsPdf}
                disabled={isExporting}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold rounded-xl text-xs border border-amber-500/40 transition flex items-center space-x-1.5 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Layers className="w-4 h-4" />
                <span>Download Semua Slip ({slipGroups.length} File PDF)</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadCurrentGroupPdf}
              disabled={isExporting}
              className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-cyan-600/30 transition flex items-center space-x-2 active:scale-95 border border-cyan-400/40 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <FileDown className="w-4 h-4" />
              <span>
                {isExporting
                  ? 'Membuat PDF...'
                  : `Download Slip (${formOptions.lineName || activeLineName} • ${activeSupplier} • ${activeWipName})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
