import React, { useEffect, useMemo, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  X,
  Printer,
  FileDown,
  FileText,
  CheckCircle2,
  QrCode,
  Layers,
  ExternalLink
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
  const slipGroups = useMemo(() => groupCartItemsBySupplierAndWip(cartItems), [cartItems]);

  const [activeGroupKey, setActiveGroupKey] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [customSapCodes, setCustomSapCodes] = useState<Record<string, string>>({});

  const [formOptions, setFormOptions] = useState<RequestSlipFormOptions>({
    supplier: 'GDRM',
    wipId: '',
    wipName: '',
    factoryGroupName: state.factoryName || 'PRODTRACK',
    docCode: 'MAY PRC LLA WFR UTG WHRxx/09/001-08-4',
    department: 'Warehouse',
    kepadaWarehouse: 'GDRM (Gudang Bahan Baku)',
    tujuanPengiriman: 'Produksi',
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

  const activeSupplier = activeGroup?.supplier || 'GDRM';
  const activeWipName = activeGroup?.wipName || 'Umum';
  const activeGroupItems = activeGroup?.items || [];

  // Build form defaults for a (Supplier + WIP) group while preserving operator metadata edits
  const buildGroupDefaults = (
    group: SupplierWipCartGroup,
    prevOpts?: RequestSlipFormOptions
  ): RequestSlipFormOptions => {
    return buildSupplierSlipFormOptions(group.supplier, group.items, state, {
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
    formOptions.tanggal,
    activeSupplier,
    activeWipName,
    state.master.materials,
    customSapCodes,
    requestNumbers
  ]);

  const primaryQrUrl = previewSheets[0]?.sheetQrUrl || '';

  if (!isOpen) return null;

  const handleDownloadCurrentGroupPdf = async () => {
    if (!activeGroup || activeGroupItems.length === 0) {
      showToast('Tidak ada item untuk slip yang dipilih.', true);
      return;
    }
    setIsExporting(true);
    try {
      await generateMaterialRequestSlipPdf(activeGroupItems, {
        ...formOptions,
        supplier: activeSupplier,
        wipId: activeGroup.wipId,
        wipName: activeWipName,
        materialsCatalog: state.master.materials,
        customSapCodes,
        requestNumbers
      });
      showToast(
        `Slip PDF "${activeSupplier} • ${activeWipName}" (${activeGroupItems.length} item, ${totalPages} lembar) berhasil diunduh.`
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
        `Berhasil mengunduh ${slipGroups.length} file Slip PDF terpisah (Supplier & WIP).`
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-950/40 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white">
                Cetak Slip PDF Terpisah Per Supplier &amp; Jenis WIP — BON PERMINTAAN RM &amp; PM
              </h3>
              <p className="text-[11px] text-slate-400">
                Slip aktif: <strong className="text-cyan-300">{activeSupplier}</strong> • WIP:{' '}
                <strong className="text-amber-300">{activeWipName}</strong> ({activeGroupItems.length}{' '}
                item • {totalPages} lembar A4 Landscape @ 10 baris/lembar)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Supplier + WIP Split Tabs Bar */}
        {slipGroups.length > 0 && (
          <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-400 flex items-center space-x-1.5 mr-1">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>Lembar Slip (Supplier &amp; WIP):</span>
              </span>
              {slipGroups.map(grp => {
                const isSelected = grp.key === activeGroup?.key;
                return (
                  <button
                    key={grp.key}
                    type="button"
                    onClick={() => setActiveGroupKey(grp.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 border ${
                      isSelected
                        ? grp.supplier === 'GDRM'
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                          : 'bg-purple-500 text-white border-purple-400 shadow-md shadow-purple-500/20'
                        : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <span>
                      {grp.supplier} • {grp.wipName}
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                        isSelected ? 'bg-black/20' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {grp.items.length} item
                      {grp.pageCount > 1 ? ` • ${grp.pageCount} lbr` : ''}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
              ✓ Auto Kode SAP BOM: {autoSapFilledCount}/{activeGroupItems.length} item terisi
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs flex-1">
          {/* Form Metadata Controls */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <span className="font-bold text-cyan-300 flex items-center space-x-1.5">
                <FileText className="w-4 h-4" />
                <span>
                  Pengaturan Header Slip ({activeSupplier} — {activeWipName})
                </span>
              </span>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-400">Satuan (SAT):</span>
                {(
                  [
                    { id: 'kg', label: 'kg (Berat Order)' },
                    { id: 'zak_or_kg', label: 'zak / kg (Kemasan)' },
                    { id: 'batch', label: 'batch (Batch WIP)' }
                  ] as Array<{ id: RequestSlipSatMode; label: string }>
                ).map(mode => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setFormOptions(prev => ({ ...prev, satMode: mode.id }))}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition border ${
                      formOptions.satMode === mode.id
                        ? 'bg-cyan-600 text-white border-cyan-400 shadow-sm'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
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
                <label className="block text-[10px] text-slate-400 mb-1">Tujuan Pengiriman</label>
                <input
                  type="text"
                  value={formOptions.tujuanPengiriman}
                  onChange={e =>
                    setFormOptions(prev => ({ ...prev, tujuanPengiriman: e.target.value }))
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
                  placeholder="Produksi / Line Wafer"
                />
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

              <div className="sm:col-span-3 lg:col-span-1">
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

            {/* Auto-BOM Kode SAP Quick Editor / Toggle */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
              <label className="inline-flex items-center space-x-2 text-[11px] text-slate-300 cursor-pointer select-none">
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
                <span>
                  Input otomatis kolom <strong>Kode SAP*</strong> dari Kode Material di Master BOM
                </span>
              </label>

              {onPreviewQrDetail && primaryQrUrl && (
                <button
                  type="button"
                  onClick={() => handleTestQrDetail(primaryQrUrl)}
                  className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-[11px] font-semibold flex items-center space-x-1.5 transition"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Uji Buka Link Detail QR</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>

            {formOptions.includeMaterialCodeInSap && activeGroupItems.length > 0 && (
              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                <div className="text-[10px] font-semibold text-slate-400 mb-1.5">
                  Kode SAP* Terhubung dari Master BOM ({activeGroupItems.length} item — dapat
                  disesuaikan manual jika perlu):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
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

          {/* Live A4 Landscape Paper Previews (All Continuation Sheets @ 10 rows/sheet) */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-300 flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  Pratinjau Format Cetak PDF — Supplier {activeSupplier} • WIP: {activeWipName} (
                  {totalPages} Lembar A4 Landscape)
                </span>
              </span>
              {totalPages > 1 && (
                <span className="text-[10px] text-amber-300 font-mono bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                  Total {activeGroupItems.length} material otomatis dibagi ke {totalPages} lembar
                  (maks. 10 baris per lembar)
                </span>
              )}
            </div>

            {previewSheets.map(sheet => (
              <div key={sheet.pageNumber} className="space-y-1.5">
                {totalPages > 1 && (
                  <div className="flex items-center justify-between text-[11px] font-mono text-cyan-300 px-1">
                    <span>
                      Lembar {sheet.pageNumber} dari {totalPages}
                      {sheet.pageNumber > 1 ? ' (Lanjutan)' : ''} — Baris #{(sheet.pageNumber - 1) * REQUEST_SLIP_ROWS_PER_PAGE + 1} s.d. #
                      {Math.min(
                        sheet.pageNumber * REQUEST_SLIP_ROWS_PER_PAGE,
                        activeGroupItems.length
                      )}
                    </span>
                    {onPreviewQrDetail && sheet.sheetQrUrl && (
                      <button
                        type="button"
                        onClick={() => handleTestQrDetail(sheet.sheetQrUrl)}
                        className="text-[10px] underline hover:text-cyan-200"
                      >
                        Uji QR Lembar {sheet.pageNumber}
                      </button>
                    )}
                  </div>
                )}

                <div className="overflow-x-auto pb-2">
                  <div
                    style={{
                      backgroundColor: '#ffffff',
                      color: '#0f172a',
                      minWidth: '920px',
                      fontFamily: 'Arial, Helvetica, sans-serif'
                    }}
                    className="slip-paper-preview border border-slate-400 rounded shadow-lg p-5 mx-auto"
                  >
                    {/* Header Grid */}
                    <div style={{ borderColor: '#000000' }} className="grid grid-cols-12 border">
                      <div
                        style={{ borderColor: '#000000' }}
                        className="col-span-2 border-r p-2 flex flex-col justify-between min-h-[60px]"
                      >
                        <div className="text-center font-bold text-xs tracking-tight uppercase pt-1">
                          {formOptions.factoryGroupName || 'PRODTRACK'}
                        </div>
                        <div className="text-[9px] font-bold tracking-wider">GROUP</div>
                      </div>
                      <div
                        style={{ borderColor: '#000000' }}
                        className="col-span-7 border-r flex flex-col items-center justify-center p-2"
                      >
                        <div className="font-bold text-lg tracking-wide text-center leading-tight">
                          BON PERMINTAAN RM &amp; PM
                        </div>
                        {totalPages > 1 && (
                          <div className="text-[10px] font-medium mt-0.5 text-center">
                            Lembar {sheet.pageNumber} dari {totalPages}
                            {sheet.pageNumber > 1 ? ' (Lanjutan)' : ''}
                          </div>
                        )}
                      </div>
                      <div className="col-span-3 flex flex-col">
                        <div
                          style={{ borderColor: '#000000' }}
                          className="border-b px-2 py-1.5 text-[9px] text-center flex-1 flex items-center justify-center font-serif"
                        >
                          {formOptions.docCode}
                        </div>
                        <div className="px-2 py-1.5 text-[10px] text-center flex-1 flex items-center justify-center">
                          Departemen : {formOptions.department || 'Warehouse'}
                        </div>
                      </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-12 gap-3 my-3 text-[10px] items-start">
                      <div className="col-span-4 space-y-1">
                        <div className="flex">
                          <span className="w-28 font-semibold shrink-0">Kepada Warehouse</span>
                          <span className="mr-1.5">:</span>
                          <span className="truncate">{formOptions.kepadaWarehouse}</span>
                        </div>
                        <div className="flex">
                          <span className="w-28 font-semibold shrink-0">Tujuan Pengiriman</span>
                          <span className="mr-1.5">:</span>
                          <span className="truncate">{formOptions.tujuanPengiriman}</span>
                        </div>
                        <div className="flex">
                          <span className="w-28 font-semibold shrink-0">Permintaan Shift</span>
                          <span className="mr-1.5">:</span>
                          <span className="truncate">{formOptions.permintaanShift}</span>
                        </div>
                      </div>

                      <div className="col-span-4 space-y-1">
                        <div className="flex">
                          <span className="w-16 font-semibold shrink-0">No</span>
                          <span className="mr-1.5">:</span>
                          <span className="font-mono">
                            {formOptions.bonNumber}
                            {totalPages > 1 ? ` (${sheet.pageNumber}/${totalPages})` : ''}
                          </span>
                        </div>
                        <div className="flex">
                          <span className="w-16 font-semibold shrink-0">Tanggal</span>
                          <span className="mr-1.5">:</span>
                          <span className="font-mono">{formOptions.tanggal}</span>
                        </div>
                      </div>

                      <div className="col-span-4">
                        <table
                          style={{ borderColor: '#000000' }}
                          className="w-full border-collapse border text-[9px]"
                        >
                          <tbody>
                            <tr>
                              <td
                                style={{ borderColor: '#000000' }}
                                className="border px-1.5 py-0.5 font-semibold w-24"
                              >
                                Nama Pengirim
                              </td>
                              <td style={{ borderColor: '#000000' }} className="border px-1.5 py-0.5">
                                : {formOptions.namaPengirim}
                              </td>
                            </tr>
                            <tr>
                              <td style={{ borderColor: '#000000' }} className="border px-1.5 py-0.5">
                                &nbsp;
                              </td>
                              <td style={{ borderColor: '#000000' }} className="border px-1.5 py-0.5">
                                :
                              </td>
                            </tr>
                            <tr>
                              <td
                                style={{ borderColor: '#000000' }}
                                className="border px-1.5 py-0.5 font-semibold"
                              >
                                Nama Penerima
                              </td>
                              <td style={{ borderColor: '#000000' }} className="border px-1.5 py-0.5">
                                : {formOptions.namaPenerima}
                              </td>
                            </tr>
                            <tr>
                              <td style={{ borderColor: '#000000' }} className="border px-1.5 py-0.5">
                                &nbsp;
                              </td>
                              <td style={{ borderColor: '#000000' }} className="border px-1.5 py-0.5">
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
                      className="w-full border-collapse border text-[9px]"
                    >
                      <thead>
                        <tr className="text-center font-bold">
                          <th
                            rowSpan={3}
                            style={{ borderColor: '#000000' }}
                            className="border px-1 py-1 w-7"
                          >
                            No
                          </th>
                          <th
                            rowSpan={3}
                            style={{ borderColor: '#000000' }}
                            className="border px-1 py-1 w-20"
                          >
                            Kode SAP*
                          </th>
                          <th
                            rowSpan={3}
                            style={{ borderColor: '#000000' }}
                            className="border px-1 py-1 w-20"
                          >
                            Kode Batch
                          </th>
                          <th
                            rowSpan={3}
                            style={{ borderColor: '#000000' }}
                            className="border px-1.5 py-1 w-44"
                          >
                            Jenis Barang
                          </th>
                          <th
                            rowSpan={3}
                            style={{ borderColor: '#000000' }}
                            className="border px-1 py-1 w-11"
                          >
                            SAT
                          </th>
                          <th
                            rowSpan={3}
                            style={{ borderColor: '#000000' }}
                            className="border px-1 py-1 w-16"
                          >
                            Jumlah yang diminta
                          </th>
                          <th
                            colSpan={15}
                            style={{ borderColor: '#000000' }}
                            className="border px-1 py-1"
                          >
                            Jumlah yang dikirim
                          </th>
                          <th
                            rowSpan={3}
                            style={{ borderColor: '#000000' }}
                            className="border px-1 py-1 w-16"
                          >
                            Total yang dikirim
                          </th>
                        </tr>
                        <tr className="text-center font-bold">
                          {[1, 2, 3, 4, 5].map(idx => (
                            <React.Fragment key={idx}>
                              <th
                                rowSpan={2}
                                style={{ borderColor: '#000000' }}
                                className="border px-1 py-0.5 w-7"
                              >
                                ke-{idx}
                              </th>
                              <th
                                colSpan={2}
                                style={{ borderColor: '#000000' }}
                                className="border px-1 py-0.5"
                              >
                                TTD
                              </th>
                            </React.Fragment>
                          ))}
                        </tr>
                        <tr className="text-center font-bold text-[8px]">
                          {[1, 2, 3, 4, 5].map(idx => (
                            <React.Fragment key={idx}>
                              <th
                                style={{ borderColor: '#000000' }}
                                className="border px-0.5 py-0.5 w-6"
                              >
                                WH
                              </th>
                              <th
                                style={{ borderColor: '#000000' }}
                                className="border px-0.5 py-0.5 w-6"
                              >
                                Prod
                              </th>
                            </React.Fragment>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sheet.rows.map(({ rowNum, mapped }) => (
                          <tr key={rowNum} className="h-6">
                            <td
                              style={{ borderColor: '#000000' }}
                              className="border text-center font-medium"
                            >
                              {rowNum}
                            </td>
                            <td
                              style={{ borderColor: '#000000' }}
                              className="border text-center px-1 font-mono font-semibold"
                            >
                              {mapped?.kodeSap || ''}
                            </td>
                            <td
                              style={{ borderColor: '#000000' }}
                              className="border text-center px-1"
                            >
                              {mapped?.kodeBatch || ''}
                            </td>
                            <td
                              style={{ borderColor: '#000000' }}
                              className="border px-1.5 font-medium"
                            >
                              {mapped?.jenisBarang || ''}
                            </td>
                            <td
                              style={{ borderColor: '#000000' }}
                              className="border text-center px-1"
                            >
                              {mapped?.sat || ''}
                            </td>
                            <td
                              style={{ borderColor: '#000000' }}
                              className="border text-center font-bold px-1"
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
                    <div className="grid grid-cols-12 gap-3 mt-1.5 items-start">
                      <div className="col-span-5">
                        <p className="text-[8.5px] italic">
                          *Penulisan kode SAP hanya untuk permintaan barang packaging material (PM)
                        </p>
                        <div className="grid grid-cols-2 gap-3 mt-4 text-center text-[10px]">
                          <div>
                            <div className="font-semibold">Dibuat,</div>
                            <div className="h-10" />
                            <div>
                              {formOptions.dibuatOleh.trim()
                                ? `( ${formOptions.dibuatOleh.trim()} )`
                                : '(....................)'}
                            </div>
                          </div>
                          <div>
                            <div className="font-semibold">Menyetujui,</div>
                            <div className="h-10" />
                            <div>
                              {formOptions.menyetujui.trim()
                                ? `( ${formOptions.menyetujui.trim()} )`
                                : '(....................)'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Embedded QR Code Card */}
                      <div className="col-span-2 pt-1 flex justify-center">
                        <div
                          style={{ borderColor: '#000000' }}
                          className="border p-1.5 flex flex-col items-center justify-center text-center"
                        >
                          {sheet.sheetQrUrl && (
                            <QRCodeCanvas
                              value={sheet.sheetQrUrl}
                              size={66}
                              level="M"
                              bgColor="#ffffff"
                              fgColor="#0f172a"
                            />
                          )}
                          <span className="text-[7px] font-bold tracking-tight mt-1">
                            SCAN DETAIL REQUEST
                          </span>
                          <span className="text-[6.5px] font-mono leading-none mt-0.5">
                            {formOptions.bonNumber}
                            {totalPages > 1 ? ` (${sheet.pageNumber}/${totalPages})` : ''}
                          </span>
                        </div>
                      </div>

                      <div className="col-span-5 pt-1">
                        <div
                          style={{ borderColor: '#000000' }}
                          className="border p-2 min-h-[96px] text-[9.5px]"
                        >
                          <div className="font-bold mb-1">Keterangan :</div>
                          <div className="whitespace-pre-line leading-snug">
                            {formOptions.keterangan}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5 shrink-0">
          <span className="text-[11px] text-slate-400">
            Slip dipisah per Supplier &amp; WIP. Jika &gt;10 material, otomatis lanjut ke lembar
            berikutnya dengan QR per lembar.
          </span>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700 transition"
            >
              Tutup
            </button>

            {slipGroups.length > 1 && (
              <button
                type="button"
                onClick={handleDownloadAllGroupsPdf}
                disabled={isExporting}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold rounded-xl text-xs border border-amber-500/40 transition flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Layers className="w-4 h-4" />
                <span>Download Semua Slip ({slipGroups.length} File PDF)</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadCurrentGroupPdf}
              disabled={isExporting}
              className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-cyan-600/30 transition flex items-center space-x-2 active:scale-95 border border-cyan-400/40 disabled:opacity-50"
            >
              <FileDown className="w-4 h-4" />
              <span>
                {isExporting
                  ? 'Membuat PDF...'
                  : `Download Slip (${activeSupplier} • ${activeWipName})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
