import React, { useMemo, useState } from 'react';
import {
  Boxes,
  Check,
  Clock,
  Copy,
  Download,
  Edit3,
  FileText,
  History,
  Layers,
  MessageCircle,
  Printer,
  Search,
  ShieldCheck,
  Trash2,
  X
} from 'lucide-react';
import { MaterialUsage, StorageLocation } from '../../../types';
import { useErp } from '../../../context/ErpContext';
import { calculateUsageBreakdown } from '../../../utils/reportBreakdown';
import { formatIndonesianDate, getCurrentShift, SHIFTS_CONFIG, ShiftNumber } from '../../../utils/shifts';
import { loadWhatsAppRecipients, normalizeWhatsAppPhone } from '../../../utils/whatsappReport';
import { formatPauseDurationMs } from './utils';

interface PemakaianHistoryListProps {
  mode: 'material-history' | 'shift-activity';
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  filterShift: 'all' | '1' | '2' | '3';
  setFilterShift: (val: 'all' | '1' | '2' | '3') => void;
  currentTime: number;
  currentLiveShift: ReturnType<typeof getCurrentShift>;
  shiftStats: Record<ShiftNumber, { totalKg: number; count: number; batchesCount: number; operators: string[] }>;
}

export const PemakaianHistoryList: React.FC<PemakaianHistoryListProps> = ({
  mode,
  searchTerm,
  setSearchTerm,
  filterShift,
  setFilterShift,
  currentTime,
  currentLiveShift,
  shiftStats
}) => {
  const { state, handleUpdateUsage, handleDeleteUsage, showToast } = useErp();

  const [usageViewMode, setUsageViewMode] = useState<'breakdown-sku-wip' | 'list'>('breakdown-sku-wip');
  const [usageFilterSkuId, setUsageFilterSkuId] = useState<string>('all');
  const [usageFilterWipId, setUsageFilterWipId] = useState<string>('all');

  // Inline Edit & Delete states
  const [editingUsageId, setEditingUsageId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<string>('');
  const [editLocation, setEditLocation] = useState<StorageLocation>('CK');
  const [editOperator, setEditOperator] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // WhatsApp export modal state
  const [isWaModalOpen, setIsWaModalOpen] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const waRecipients = useMemo(() => loadWhatsAppRecipients(), [isWaModalOpen]);

  const filteredUsages = useMemo(() => {
    const query = searchTerm.toLowerCase();
    return state.transactions.usages.filter(u => {
      const sObj = state.master.skus.find(s => s.id === u.skuId);
      const wObj = state.master.wips.find(w => w.id === u.wipId);
      const mObj = state.master.materials.find(m => m.id === u.materialId);
      const matchShift = filterShift === 'all' || String(u.shift || 1) === filterShift;
      const matchQuery =
        u.usageNumber.toLowerCase().includes(query) ||
        (sObj && sObj.name.toLowerCase().includes(query)) ||
        (wObj && wObj.name.toLowerCase().includes(query)) ||
        (mObj && mObj.name.toLowerCase().includes(query)) ||
        (u.operatorName && u.operatorName.toLowerCase().includes(query));
      return matchShift && matchQuery;
    });
  }, [state.transactions.usages, state.master.skus, state.master.wips, state.master.materials, searchTerm, filterShift]);

  const usageBreakdownGroups = useMemo(() => {
    const shiftOpt = filterShift === 'all' ? 'ALL' : (parseInt(filterShift) as ShiftNumber);
    const groups = calculateUsageBreakdown(state, { shift: shiftOpt });
    const query = searchTerm.toLowerCase();

    return groups.filter(grp => {
      const matchSku = usageFilterSkuId === 'all' || grp.skuId === usageFilterSkuId;
      const matchWip = usageFilterWipId === 'all' || grp.wipId === usageFilterWipId;
      const matchQuery =
        !query ||
        grp.skuName.toLowerCase().includes(query) ||
        grp.wipName.toLowerCase().includes(query) ||
        grp.materials.some(
          m =>
            m.materialName.toLowerCase().includes(query) ||
            m.materialCode.toLowerCase().includes(query) ||
            m.operators.some(op => op.toLowerCase().includes(query))
        );
      return matchSku && matchWip && matchQuery;
    });
  }, [state, filterShift, searchTerm, usageFilterSkuId, usageFilterWipId]);

  const shiftGroups = useMemo(() => {
    const groups: Record<ShiftNumber, MaterialUsage[]> = { 1: [], 2: [], 3: [] };
    const query = searchTerm.toLowerCase();
    state.transactions.usages.forEach(u => {
      const sObj = state.master.skus.find(s => s.id === u.skuId);
      const wObj = state.master.wips.find(w => w.id === u.wipId);
      const mObj = state.master.materials.find(m => m.id === u.materialId);
      const matchQuery =
        !query ||
        u.usageNumber.toLowerCase().includes(query) ||
        (sObj && sObj.name.toLowerCase().includes(query)) ||
        (wObj && wObj.name.toLowerCase().includes(query)) ||
        (mObj && mObj.name.toLowerCase().includes(query)) ||
        (u.operatorName && u.operatorName.toLowerCase().includes(query));

      if (matchQuery) {
        const s = (u.shift || 1) as ShiftNumber;
        if (groups[s]) groups[s].push(u);
        else groups[1].push(u);
      }
    });
    return groups;
  }, [state.transactions.usages, state.master.skus, state.master.wips, state.master.materials, searchTerm]);

  const beginEditUsage = (u: MaterialUsage) => {
    setEditingUsageId(u.id);
    setEditQty(String(u.usageQty));
    setEditLocation(u.sourceLocation);
    setEditOperator(u.operatorName || '');
    setEditNotes(u.notes || '');
    setConfirmDeleteId(null);
  };

  const saveEditUsage = (usageId: string) => {
    const parsedQty = parseFloat(editQty);
    if (!Number.isFinite(parsedQty) || parsedQty < 0) {
      showToast('Qty pemakaian harus berupa angka >= 0', true);
      return;
    }
    handleUpdateUsage(usageId, {
      usageQty: parsedQty,
      sourceLocation: editLocation,
      operatorName: editOperator.trim(),
      notes: editNotes.trim()
    });
    setEditingUsageId(null);
  };

  const handleExportCsv = () => {
    const header = ['No. Transaksi', 'Shift', 'Tanggal', 'SKU', 'WIP', 'Material', 'Qty (kg)', 'Gudang', 'Operator', 'Catatan'];
    const rows = filteredUsages.map(u => {
      const sName = state.master.skus.find(s => s.id === u.skuId)?.name || 'WIP Langsung';
      const wName = state.master.wips.find(w => w.id === u.wipId)?.name || '-';
      const mName = state.master.materials.find(m => m.id === u.materialId)?.name || '-';
      return [
        u.usageNumber,
        `Shift ${u.shift || 1}`,
        u.date,
        sName,
        wName,
        mName,
        u.usageQty.toFixed(4),
        u.sourceLocation,
        u.operatorName || '-',
        (u.notes || '').replace(/"/g, '""')
      ]
        .map(cell => `"${cell}"`)
        .join(',');
    });
    const csvContent = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pemakaian_material_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`Ekspor CSV berhasil (${filteredUsages.length} baris transaksi)`);
  };

  const whatsappSummaryMessage = useMemo(() => {
    const shiftLabel = filterShift === 'all' ? 'Semua Shift' : `Shift ${filterShift}`;
    const totalKg = filteredUsages.reduce((sum, u) => sum + u.usageQty, 0);
    const topLines = usageBreakdownGroups.slice(0, 6).map(grp => {
      return `• *${grp.skuName}* (${grp.wipName}): ${grp.totalGroupKg.toFixed(2)} kg / ${grp.totalGroupBatches.toFixed(2)} btc`;
    });
    return [
      `*LAPORAN PEMAKAIAN BAHAN BAKU (${shiftLabel})*`,
      `Pabrik: ${state.factoryName || 'ProdTrack MES'}`,
      `Tanggal: ${formatIndonesianDate()}`,
      `Total Transaksi: ${filteredUsages.length} | Total Terpakai: ${totalKg.toFixed(2)} kg`,
      '',
      ...(topLines.length > 0 ? ['*Ringkasan per SKU & WIP:*', ...topLines] : ['Belum ada transaksi pada filter ini.'])
    ].join('\n');
  }, [filterShift, filteredUsages, state.factoryName, usageBreakdownGroups]);

  const normalizedPhone = normalizeWhatsAppPhone(waPhone);
  const waHref = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(whatsappSummaryMessage)}`;

  const handleCopyWaText = async () => {
    try {
      await navigator.clipboard.writeText(whatsappSummaryMessage);
      showToast('Ringkasan laporan WhatsApp berhasil disalin ke clipboard');
    } catch {
      showToast('Gagal menyalin ke clipboard', true);
    }
  };

  const waExportModal = isWaModalOpen && (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
      <div className="bg-surface border border-border-strong rounded-2xl w-full max-w-md p-4 space-y-3 shadow-2xl text-xs">
        <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
          <div className="flex items-center gap-2 font-bold text-ink-primary text-sm">
            <MessageCircle className="w-4 h-4 text-ink-emerald" />
            <span>Ekspor Ringkasan Pemakaian ke WhatsApp</span>
          </div>
          <button
            type="button"
            onClick={() => setIsWaModalOpen(false)}
            className="p-1 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-elevated"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[11px] font-medium text-ink-secondary">
            Nomor Tujuan WhatsApp (opsional untuk kontak langsung)
          </label>
          <input
            type="text"
            value={waPhone}
            onChange={e => setWaPhone(e.target.value)}
            placeholder="Contoh: 081234567890"
            className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-xs font-mono text-ink-primary"
          />
          {waRecipients.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {waRecipients.slice(0, 4).map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setWaPhone(r.phone)}
                  className="px-2 py-0.5 rounded bg-elevated hover:bg-accent border border-border-strong text-[10px] text-ink-secondary"
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <pre className="bg-canvas border border-border-subtle rounded-xl p-3 text-[11px] font-mono text-ink-secondary whitespace-pre-wrap max-h-48 overflow-y-auto">
          {whatsappSummaryMessage}
        </pre>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleCopyWaText}
            className="px-3 py-1.5 rounded-xl bg-elevated hover:bg-accent border border-border-strong text-ink-primary font-semibold flex items-center gap-1.5"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Salin Teks</span>
          </button>
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setIsWaModalOpen(false)}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Buka WhatsApp</span>
          </a>
        </div>
      </div>
    </div>
  );

  if (mode === 'material-history') {
    return (
      <>
        <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden shadow-xl space-y-0">
          <div className="p-4 border-b border-border-subtle flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-purple-500/10 text-ink-purple">
                <History className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-ink-primary">Laporan Pemakaian Bahan Baku</h3>
                <p className="text-[11px] text-ink-secondary">
                  {usageViewMode === 'breakdown-sku-wip'
                    ? 'Dipisahkan sesuai dengan SKU dan Jenis WIP yang diproduksi'
                    : 'Daftar riwayat pemotongan stok bahan baku per transaksi kronologis (Edit & Hapus)'}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto no-print flex-wrap">
              <div className="flex items-center space-x-1 bg-canvas p-1 rounded-xl border border-border-subtle">
                {(['all', '1', '2', '3'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilterShift(tab)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition ${
                      filterShift === tab
                        ? 'bg-purple-600 text-white font-bold shadow-sm'
                        : 'text-ink-secondary hover:text-ink-primary'
                    }`}
                  >
                    {tab === 'all' ? 'Semua Shift' : `Shift ${tab}`}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-52">
                <Search className="w-3.5 h-3.5 text-ink-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Cari SKU, WIP, material..."
                  className="w-full bg-elevated border border-border-strong rounded-xl pl-8 pr-3 py-1.5 text-xs text-ink-primary placeholder:text-ink-muted"
                />
              </div>

              <button
                type="button"
                onClick={handleExportCsv}
                className="px-2.5 py-1.5 bg-elevated hover:bg-accent border border-border-strong text-ink-primary rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shrink-0"
                title="Ekspor Log Pemakaian ke CSV"
              >
                <Download className="w-3.5 h-3.5 text-brand" />
                <span>CSV</span>
              </button>

              <button
                type="button"
                onClick={() => setIsWaModalOpen(true)}
                className="px-2.5 py-1.5 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/40 text-ink-emerald rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shrink-0"
                title="Kirim Ringkasan Pemakaian via WhatsApp"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-elevated hover:bg-accent border border-border-strong text-ink-primary rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shrink-0"
                title="Cetak Log Pemakaian Material"
              >
                <Printer className="w-3.5 h-3.5 text-ink-purple" />
                <span>Cetak</span>
              </button>
            </div>
          </div>

          <div className="px-4 py-2.5 bg-canvas border-b border-border-subtle flex flex-wrap items-center justify-between gap-2 text-xs no-print">
            <div className="flex items-center space-x-1 bg-surface p-1 rounded-xl border border-border-subtle">
              <button
                type="button"
                onClick={() => setUsageViewMode('breakdown-sku-wip')}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs transition flex items-center space-x-1.5 ${
                  usageViewMode === 'breakdown-sku-wip'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Dipisah per SKU &amp; WIP</span>
              </button>

              <button
                type="button"
                onClick={() => setUsageViewMode('list')}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs transition flex items-center space-x-1.5 ${
                  usageViewMode === 'list'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Daftar Transaksi Kronologis ({filteredUsages.length})</span>
              </button>
            </div>

            {usageViewMode === 'breakdown-sku-wip' && (
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1">
                  <span className="text-[11px] text-ink-secondary">SKU:</span>
                  <select
                    value={usageFilterSkuId}
                    onChange={e => setUsageFilterSkuId(e.target.value)}
                    className="bg-elevated border border-border-strong rounded-lg px-2 py-1 text-[11px] text-ink-primary focus:outline-none focus:border-purple-500 font-medium"
                  >
                    <option value="all">Semua SKU ({state.master.skus.length})</option>
                    {state.master.skus.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                    <option value="UNLINKED_SKU">Produksi WIP Langsung</option>
                  </select>
                </div>

                <div className="flex items-center space-x-1">
                  <span className="text-[11px] text-ink-secondary">WIP:</span>
                  <select
                    value={usageFilterWipId}
                    onChange={e => setUsageFilterWipId(e.target.value)}
                    className="bg-elevated border border-border-strong rounded-lg px-2 py-1 text-[11px] text-ink-primary focus:outline-none focus:border-purple-500 font-medium"
                  >
                    <option value="all">Semua Jenis WIP ({state.master.wips.length})</option>
                    {state.master.wips.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {usageViewMode === 'breakdown-sku-wip' ? (
            <div className="p-4 space-y-4">
              {usageBreakdownGroups.length > 0 ? (
                usageBreakdownGroups.map(group => (
                  <div
                    key={group.groupKey}
                    className="bg-canvas border border-border-subtle rounded-2xl overflow-hidden shadow-lg transition hover:border-border-strong"
                  >
                    <div className="bg-gradient-to-r from-surface via-slate-850 to-tint-purple p-3.5 sm:p-4 border-b border-border-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-elevated text-brand border border-border-strong font-bold">
                            {group.skuCode}
                          </span>
                          <h4 className="font-bold text-sm text-ink-primary">{group.skuName}</h4>
                          {group.isKite && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-ink-amber border border-amber-500/30">
                              KITE
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 text-xs">
                          <span className="text-ink-secondary">Jenis WIP:</span>
                          <span className="px-2 py-0.5 rounded bg-purple-500/20 text-ink-purple border border-purple-500/30 font-semibold">
                            {group.wipName}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <div className="bg-surface px-3 py-1.5 rounded-xl border border-border-strong text-right">
                          <span className="text-[10px] text-ink-secondary block font-mono">Total Terpakai:</span>
                          <span className="text-xs font-bold font-mono text-ink-rose">
                            -{group.totalGroupKg.toFixed(4)} kg
                          </span>
                        </div>
                        <div className="bg-tint-purple px-3 py-1.5 rounded-xl border border-purple-500/30 text-right">
                          <span className="text-[10px] text-ink-purple block font-mono">Est. Output Batch:</span>
                          <span className="text-xs font-bold font-mono text-ink-purple">
                            {group.totalGroupBatches.toFixed(2)} btc
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-surface text-[11px] font-semibold text-ink-secondary border-b border-border-subtle">
                            <th className="py-2 px-3 text-center w-10">No</th>
                            <th className="py-2 px-3">Kode Material</th>
                            <th className="py-2 px-3">Nama Bahan Baku</th>
                            <th className="py-2 px-3">Gudang Sumber</th>
                            <th className="py-2 px-3">Shift &amp; Frekuensi</th>
                            <th className="py-2 px-3 text-right text-ink-rose font-bold">Qty Terpakai (kg)</th>
                            <th className="py-2 px-3 text-right text-ink-purple font-bold">Kesetaraan Batch</th>
                            <th className="py-2 px-3">Operator PIC</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                          {group.materials.map((m, mIdx) => (
                            <tr key={m.materialId} className="hover:bg-elevated transition text-xs">
                              <td className="py-2.5 px-3 text-center text-ink-muted font-mono">{mIdx + 1}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-brand">
                                <span className="px-1.5 py-0.5 rounded bg-elevated border border-border-strong text-[10px]">
                                  {m.materialCode}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-medium text-ink-primary">
                                <div>{m.materialName}</div>
                                <div className="text-[10px] text-ink-muted font-mono">
                                  Standar Formula: {m.batchSizeKg.toFixed(2)} kg/batch
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="px-1.5 py-0.5 rounded bg-elevated border border-border-strong text-[10px] text-ink-secondary">
                                  {m.locations.join(', ') || 'CK'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-ink-secondary">
                                <span>{m.shifts.map(s => `Shift ${s}`).join(', ') || '-'}</span>
                                <span className="text-[10px] text-ink-muted block">({m.usageCount}x pemakaian)</span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-ink-rose">
                                -{m.totalUsageKg.toFixed(4)} kg
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-ink-purple">
                                {m.estimatedBatch.toFixed(2)} btc
                              </td>
                              <td className="py-2.5 px-3 text-ink-secondary text-[11px]">
                                {m.operators.join(', ') || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-ink-muted text-xs">
                  <Boxes className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-ink-primary">
                    Belum ada riwayat pemakaian bahan baku yang cocok dengan filter.
                  </p>
                  <p className="text-xs text-ink-muted mt-1">
                    Pastikan sudah terdapat transaksi Work Order pemakaian bahan baku pada shift ini.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-elevated text-[11px] font-semibold text-ink-secondary border-b border-border-subtle">
                    <th className="py-2.5 px-3">No. Transaksi</th>
                    <th className="py-2.5 px-3">Shift</th>
                    <th className="py-2.5 px-3">Tanggal</th>
                    <th className="py-2.5 px-3">SKU Produk</th>
                    <th className="py-2.5 px-3">WIP Terkait</th>
                    <th className="py-2.5 px-3">Nama Material</th>
                    <th className="py-2.5 px-3 text-right font-bold text-ink-rose">Qty Terpakai</th>
                    <th className="py-2.5 px-3 text-center">Gudang</th>
                    <th className="py-2.5 px-3">Operator / Catatan</th>
                    <th className="py-2.5 px-3 text-center no-print">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filteredUsages.length > 0 ? (
                    filteredUsages.map(u => {
                      const sObj = state.master.skus.find(s => s.id === u.skuId);
                      const wObj = state.master.wips.find(w => w.id === u.wipId);
                      const mObj = state.master.materials.find(m => m.id === u.materialId);
                      const isEditing = editingUsageId === u.id;
                      const isConfirmDelete = confirmDeleteId === u.id;

                      return (
                        <tr key={u.id} className="hover:bg-elevated transition">
                          <td className="py-3 px-3 font-mono font-semibold text-ink-primary">{u.usageNumber}</td>
                          <td className="py-3 px-3">
                            {(() => {
                              const sNum = (u.shift || 1) as ShiftNumber;
                              const sInfo = SHIFTS_CONFIG[sNum] || SHIFTS_CONFIG[1];
                              return (
                                <span
                                  className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${sInfo.badgeBg} border ${sInfo.borderClass}`}
                                >
                                  {sInfo.shortLabel}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="py-3 px-3 text-ink-secondary text-[11px]">{u.date}</td>
                          <td className="py-3 px-3 text-ink-secondary">
                            {sObj ? sObj.name : 'Produksi WIP Langsung'}
                          </td>
                          <td className="py-3 px-3 text-ink-secondary">{wObj ? wObj.name : '-'}</td>
                          <td className="py-3 px-3 font-medium text-ink-primary">{mObj ? mObj.name : '-'}</td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-ink-rose">
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.0001"
                                min="0"
                                value={editQty}
                                onChange={e => setEditQty(e.target.value)}
                                className="w-24 bg-canvas border border-purple-500 rounded-lg px-2 py-1 text-right text-ink-primary font-mono text-xs"
                              />
                            ) : (
                              <>
                                <div>-{u.usageQty.toFixed(4)} kg</div>
                                {u.palletAllocations && u.palletAllocations.length > 0 && (
                                  <div className="text-[9px] text-ink-amber font-normal mt-0.5">
                                    🔒 FIFO ({u.palletAllocations.reduce((sum, a) => sum + a.bagsUsed, 0)} Zak)
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {isEditing ? (
                              <select
                                value={editLocation}
                                onChange={e => setEditLocation(e.target.value as StorageLocation)}
                                className="bg-canvas border border-border-strong rounded-lg px-2 py-1 text-[10px] text-ink-primary"
                              >
                                <option value="CK">CK</option>
                                <option value="WINEROTO">WINEROTO</option>
                                <option value="STORAGE_TANK">STORAGE_TANK</option>
                              </select>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] bg-elevated border border-border-strong text-ink-secondary">
                                {u.sourceLocation}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-ink-secondary">
                            {isEditing ? (
                              <div className="space-y-1">
                                <input
                                  type="text"
                                  value={editOperator}
                                  onChange={e => setEditOperator(e.target.value)}
                                  placeholder="Operator"
                                  className="w-full bg-canvas border border-border-strong rounded px-2 py-1 text-[11px] text-ink-primary"
                                />
                                <input
                                  type="text"
                                  value={editNotes}
                                  onChange={e => setEditNotes(e.target.value)}
                                  placeholder="Catatan"
                                  className="w-full bg-canvas border border-border-strong rounded px-2 py-1 text-[11px] text-ink-primary"
                                />
                              </div>
                            ) : (
                              <>
                                <span className="text-ink-primary block">{u.operatorName || '-'}</span>
                                <span className="text-[10px] text-ink-secondary block">{u.notes || ''}</span>
                                {u.palletAllocations && u.palletAllocations.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {u.palletAllocations.map((a, aIdx) => (
                                      <span
                                        key={aIdx}
                                        className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-tint-purple text-ink-purple border border-purple-500/30"
                                      >
                                        {a.palletLabel}: {a.bagsUsed} zak @ {a.weightPerBagKg.toFixed(2)} kg ={' '}
                                        {a.subtotalKg.toFixed(2)} kg
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center no-print whitespace-nowrap">
                            {isEditing ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => saveEditUsage(u.id)}
                                  className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
                                  title="Simpan Perubahan"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingUsageId(null)}
                                  className="p-1.5 rounded-lg bg-elevated hover:bg-accent text-ink-secondary"
                                  title="Batal Edit"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : isConfirmDelete ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleDeleteUsage(u.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold"
                                >
                                  Hapus
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 rounded-lg bg-elevated text-ink-secondary text-[10px]"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => beginEditUsage(u)}
                                  className="p-1.5 rounded-lg bg-elevated hover:bg-accent border border-border-subtle text-brand transition"
                                  title="Edit Transaksi Pemakaian"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmDeleteId(u.id);
                                    setEditingUsageId(null);
                                  }}
                                  className="p-1.5 rounded-lg bg-elevated hover:bg-rose-500/20 border border-border-subtle text-ink-rose transition"
                                  title="Hapus Transaksi Pemakaian"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={10} className="text-center py-8 text-ink-muted text-xs">
                        Belum ada riwayat pemakaian material yang cocok dengan filter pencarian / shift.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {waExportModal}
      </>
    );
  }

  // SHIFT ACTIVITY LOG VIEW
  return (
    <>
      <div className="space-y-4">
        <div className="print-only p-4 border-b-2 border-slate-900 mb-2">
          <h1 className="text-lg font-bold">PRODTRACK - LAPORAN LOG AKTIVITAS PEMAKAIAN MATERIAL 3 SHIFT</h1>
          <p className="text-xs text-slate-700">
            Dicetak pada: {formatIndonesianDate()} | Shift Aktif: {currentLiveShift.name} (
            {currentLiveShift.timeRange}) | Total Terpakai:{' '}
            {(shiftStats[1].totalKg + shiftStats[2].totalKg + shiftStats[3].totalKg).toFixed(4)} kg
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 no-print">
          {([1, 2, 3] as ShiftNumber[]).map(sNum => {
            const sInfo = SHIFTS_CONFIG[sNum];
            const sStat = shiftStats[sNum];
            const isCurrent = currentLiveShift.shift === sNum;

            return (
              <div
                key={sNum}
                className={`p-4 rounded-2xl border shadow-xl space-y-2 transition ${
                  isCurrent
                    ? 'bg-gradient-to-br from-surface via-surface to-tint-indigo border-cyan-500/40 ring-1 ring-cyan-500/20'
                    : 'bg-surface border-border-subtle'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${sInfo.badgeBg} border ${sInfo.borderClass}`}
                  >
                    {sInfo.name}
                  </span>
                  <span className="text-[11px] font-mono text-ink-secondary">{sInfo.timeRange}</span>
                </div>

                <div>
                  <span className="text-[10px] text-ink-secondary block">Total Material Terpakai:</span>
                  <div className="text-2xl font-bold font-mono text-ink-primary mt-0.5">
                    {sStat.totalKg.toFixed(2)} <span className="text-xs text-ink-secondary font-normal">kg</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-border-subtle text-xs text-ink-secondary space-y-1">
                  <div className="flex justify-between">
                    <span>Perintah Kerja Batch WIP:</span>
                    <strong className="text-ink-primary font-mono">{sStat.batchesCount} Batch</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Transaksi Pemakaian:</span>
                    <strong className="text-ink-primary font-mono">{sStat.count} Catatan</strong>
                  </div>
                  <div className="flex justify-between items-center pt-0.5">
                    <span>Operator Bertugas:</span>
                    <span className="text-brand truncate max-w-[130px] font-medium text-[11px]">
                      {sStat.operators.length > 0 ? sStat.operators.join(', ') : '-'}
                    </span>
                  </div>
                </div>

                {isCurrent && (
                  <div className="pt-1">
                    <span className="w-full py-1 rounded-lg bg-cyan-500/10 text-brand text-[10px] font-semibold flex items-center justify-center space-x-1 border border-cyan-500/20">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
                      <span>Shift Sedang Beroperasi (Live)</span>
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden shadow-xl space-y-0">
          <div className="p-4 border-b border-border-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 no-print">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-purple-500/10 text-ink-purple">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-ink-primary">
                  Shift Activity Log: Pemakaian Material Terkelompok 3 Shift
                </h3>
                <p className="text-[11px] text-ink-secondary">
                  Shift 1 (07:01 - 15:00) • Shift 2 (15:01 - 23:00) • Shift 3 (23:01 - 07:00)
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto flex-wrap">
              <div className="flex items-center space-x-1 bg-canvas p-1 rounded-xl border border-border-subtle">
                {(['all', '1', '2', '3'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilterShift(tab)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition ${
                      filterShift === tab
                        ? 'bg-purple-600 text-white font-bold shadow-sm'
                        : 'text-ink-secondary hover:text-ink-primary'
                    }`}
                  >
                    {tab === 'all' ? 'Semua Shift' : `Shift ${tab}`}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-48">
                <Search className="w-3.5 h-3.5 text-ink-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Filter nama/kode..."
                  className="w-full bg-elevated border border-border-strong rounded-xl pl-8 pr-3 py-1.5 text-xs text-ink-primary placeholder:text-ink-muted"
                />
              </div>

              <button
                type="button"
                onClick={() => setIsWaModalOpen(true)}
                className="px-2.5 py-1.5 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/40 text-ink-emerald rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shrink-0"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-elevated hover:bg-accent border border-border-strong text-ink-primary rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shrink-0"
                title="Cetak Log Aktivitas Shift"
              >
                <Printer className="w-3.5 h-3.5 text-ink-purple" />
                <span className="hidden sm:inline">Cetak Log</span>
              </button>
            </div>
          </div>

          <div className="divide-y divide-border-subtle">
            {([1, 2, 3] as ShiftNumber[])
              .filter(sNum => filterShift === 'all' || String(sNum) === filterShift)
              .map(sNum => {
                const sInfo = SHIFTS_CONFIG[sNum];
                const usagesInShift = shiftGroups[sNum] || [];
                const totalKgInShift = usagesInShift.reduce((acc, curr) => acc + curr.usageQty, 0);
                const isCurrent = currentLiveShift.shift === sNum;

                return (
                  <div key={sNum} className="p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-canvas p-3 rounded-xl border border-border-subtle">
                      <div className="flex items-center space-x-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold ${sInfo.badgeBg} border ${sInfo.borderClass}`}
                        >
                          {sInfo.name}
                        </span>
                        <span className="text-xs text-ink-secondary font-mono">{sInfo.timeRange}</span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-ink-emerald border border-emerald-500/30 font-semibold animate-pulse">
                            ● Sedang Berjalan
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-3 text-xs">
                        <span className="text-ink-secondary">
                          Total Pemakaian:{' '}
                          <strong className="text-ink-rose font-mono">-{totalKgInShift.toFixed(4)} kg</strong>
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="text-ink-secondary font-mono">{usagesInShift.length} Transaksi</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-border-subtle">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-elevated text-[11px] font-semibold text-ink-secondary border-b border-border-subtle">
                            <th className="py-2.5 px-3">No. Transaksi</th>
                            <th className="py-2.5 px-3">Tanggal</th>
                            <th className="py-2.5 px-3">WIP / SKU Terkait</th>
                            <th className="py-2.5 px-3">Material &amp; Kode</th>
                            <th className="py-2.5 px-3 text-right font-bold text-ink-rose">Qty Digunakan</th>
                            <th className="py-2.5 px-3 text-center">Gudang</th>
                            <th className="py-2.5 px-3">Operator &amp; Catatan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                          {usagesInShift.length > 0 ? (
                            usagesInShift.map(u => {
                              const wObj = state.master.wips.find(w => w.id === u.wipId);
                              const mObj = state.master.materials.find(m => m.id === u.materialId);

                              return (
                                <tr key={u.id} className="hover:bg-elevated transition">
                                  <td className="py-2.5 px-3 font-mono font-semibold text-ink-primary">
                                    {u.usageNumber}
                                  </td>
                                  <td className="py-2.5 px-3 text-ink-secondary text-[11px]">{u.date}</td>
                                  <td className="py-2.5 px-3 text-ink-secondary">{wObj ? wObj.name : '-'}</td>
                                  <td className="py-2.5 px-3 font-medium text-ink-primary">
                                    <div className="flex items-center space-x-1.5">
                                      <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-elevated text-brand border border-border-strong">
                                        {mObj?.code || `MAT-${u.materialId.slice(-4)}`}
                                      </span>
                                      <span>{mObj ? mObj.name : '-'}</span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-ink-rose">
                                    -{u.usageQty.toFixed(4)} kg
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-elevated border border-border-strong text-ink-secondary">
                                      {u.sourceLocation}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-ink-secondary">
                                    <span className="text-ink-primary block font-medium">{u.operatorName || '-'}</span>
                                    <span className="text-[10px] text-ink-muted">{u.notes || ''}</span>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={7} className="text-center py-6 text-ink-muted text-xs">
                                Belum ada aktivitas pemakaian material yang tercatat pada {sInfo.name} ({sInfo.timeRange}).
                              </td>
                            </tr>
                          )}
                        </tbody>
                        {usagesInShift.length > 0 && (
                          <tfoot>
                            <tr className="bg-canvas font-bold border-t border-border-subtle text-xs">
                              <td colSpan={4} className="py-2 px-3 text-ink-secondary text-right">
                                Subtotal Pemakaian {sInfo.name}:
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-ink-rose">
                                -{totalKgInShift.toFixed(4)} kg
                              </td>
                              <td colSpan={2} className="py-2 px-3 text-ink-secondary font-mono text-[11px]">
                                {usagesInShift.length} transaksi
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Audit Trail Penghentian Sementara (Pause) Batch WIP */}
        {(() => {
          const pauseAuditRows = (state.transactions.wipBatches || []).flatMap(b => {
            const mach = state.master.machines.find(m => m.id === b.targetMachineId);
            return (b.pauseLogs || []).map(log => ({
              batch: b,
              machLabel: mach ? `${mach.code} - ${mach.name}` : b.targetMachineName || '-',
              log
            }));
          });
          if (pauseAuditRows.length === 0) return null;
          return (
            <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 border-b border-border-subtle flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 rounded-lg bg-tint-sky border border-tint-sky-border text-ink-sky">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-ink-primary">
                      Audit Trail Penghentian Sementara (Pause) Batch WIP
                    </h3>
                    <p className="text-[11px] text-ink-secondary">
                      Catatan kronologis setiap jeda perintah kerja batch WIP beserta kategori, alasan, dan durasinya
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-mono tabular-nums text-ink-sky font-semibold">
                  {pauseAuditRows.length} Catatan Pause
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-elevated text-[11px] font-semibold text-ink-secondary border-b border-border-subtle">
                      <th className="py-2.5 px-3">Batch &amp; WIP</th>
                      <th className="py-2.5 px-3">Mesin</th>
                      <th className="py-2.5 px-3">Kategori</th>
                      <th className="py-2.5 px-3">Alasan Penghentian Sementara</th>
                      <th className="py-2.5 px-3">Waktu Pause / Lanjut</th>
                      <th className="py-2.5 px-3 text-right">Durasi Jeda</th>
                      <th className="py-2.5 px-3">Petugas Audit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {pauseAuditRows.map(({ batch, machLabel, log }) => (
                      <tr key={log.id} className="hover:bg-elevated transition">
                        <td className="py-2.5 px-3">
                          <span className="font-mono font-bold text-ink-sky block">{batch.batchCode}</span>
                          <span className="text-[11px] text-ink-primary">{batch.wipName}</span>
                        </td>
                        <td className="py-2.5 px-3 text-ink-secondary text-[11px]">{machLabel}</td>
                        <td className="py-2.5 px-3 font-semibold text-ink-sky whitespace-nowrap">{log.category}</td>
                        <td className="py-2.5 px-3 text-ink-primary">{log.reason}</td>
                        <td className="py-2.5 px-3 font-mono tabular-nums text-[11px] text-ink-secondary whitespace-nowrap">
                          <div>Pause: {new Date(log.pausedAt).toLocaleString('id-ID')}</div>
                          <div className="text-ink-secondary">
                            Lanjut: {log.resumedAt ? new Date(log.resumedAt).toLocaleString('id-ID') : 'Masih Dijeda'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink-amber font-semibold whitespace-nowrap">
                          {log.pausedDurationMs !== undefined
                            ? formatPauseDurationMs(log.pausedDurationMs)
                            : formatPauseDurationMs(
                                Math.max(0, currentTime - new Date(log.pausedAt).getTime())
                              )}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-ink-secondary">
                          <div>
                            Pause: <strong>{log.pausedBy}</strong>
                          </div>
                          {log.resumedBy && <div className="text-ink-secondary">Lanjut: {log.resumedBy}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </div>
      {waExportModal}
    </>
  );
};
