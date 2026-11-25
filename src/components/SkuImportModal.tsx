import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  FileCode,
  AlertTriangle,
  CheckCircle2,
  HardDrive,
  Box,
  Check
} from 'lucide-react';
import { SKU } from '../types';
import {
  parseSkuFile,
  SAMPLE_SKU_CSV_TEMPLATE,
  SAMPLE_SKU_JSON_TEMPLATE,
  SkuParseResult
} from '../utils/skuParser';
import { DriveFileItem, getAccessToken, readLocalBomFile } from '../utils/googleWorkspace';
import { GoogleDriveFileBrowser } from './GoogleDriveFileBrowser';

interface SkuImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingSkus: SKU[];
  onImportSkus: (newSkus: SKU[], mode: 'replace' | 'append') => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const SkuImportModal: React.FC<SkuImportModalProps> = ({
  isOpen,
  onClose,
  existingSkus,
  onImportSkus,
  showToast
}) => {
  const [activeSource, setActiveSource] = useState<'STORAGE' | 'DRIVE'>('STORAGE');
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');

  // Local file state
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [localFileError, setLocalFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Google Drive state
  const [hasDriveToken, setHasDriveToken] = useState(false);
  const [selectedDriveFile, setSelectedDriveFile] = useState<DriveFileItem | null>(null);

  // Parse result preview
  const [parseResult, setParseResult] = useState<SkuParseResult | null>(null);

  // On open, check if Google Drive access token is already available
  useEffect(() => {
    if (isOpen) {
      getAccessToken().then(tok => setHasDriveToken(Boolean(tok)));
    } else {
      setFileContent('');
      setFileName('');
      setSelectedDriveFile(null);
      setParseResult(null);
      setIsReadingFile(false);
      setLocalFileError(null);
    }
  }, [isOpen]);

  // When fileContent changes, auto-parse SKU
  useEffect(() => {
    if (fileContent.trim()) {
      const res = parseSkuFile(fileContent);
      setParseResult(res);
    } else {
      setParseResult(null);
    }
  }, [fileContent]);

  // Local file upload handler
  const handleFileUpload = async (file: File) => {
    setFileName(file.name);
    setSelectedDriveFile(null);
    setLocalFileError(null);
    setFileContent('');
    setParseResult(null);
    setIsReadingFile(true);
    try {
      const text = await readLocalBomFile(file);
      if (!text || !text.trim()) {
        throw new Error(`File "${file.name}" kosong atau tidak berisi data SKU.`);
      }
      setFileContent(text);
    } catch (err: any) {
      const msg = err?.message || 'Gagal membaca file lokal';
      setLocalFileError(msg);
      setFileContent('');
      showToast(msg, true);
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleDownloadTemplate = (format: 'csv' | 'json') => {
    const content = format === 'csv' ? SAMPLE_SKU_CSV_TEMPLATE : SAMPLE_SKU_JSON_TEMPLATE;
    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template_master_sku_${format}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Template SKU ${format.toUpperCase()} berhasil diunduh`);
  };

  const handleConfirmImport = () => {
    if (!parseResult || parseResult.valid.length === 0) {
      showToast('Tidak ada data SKU valid untuk diimpor', true);
      return;
    }

    onImportSkus(parseResult.valid, importMode);
    onClose();
  };

  if (!isOpen) return null;

  const validCount = parseResult?.valid.length || 0;
  const kiteCount = parseResult?.valid.filter(s => s.isKite).length || 0;
  const domCount = parseResult?.valid.filter(s => !s.isKite).length || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-surface border border-border-strong rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Modal */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border-subtle bg-canvas">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-cyan-500/10 text-brand rounded-xl border border-cyan-500/20">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-ink-primary flex items-center space-x-2">
                <span>Import Master SKU (Domestik / KITE Ekspor)</span>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-500/20 text-brand">
                  Google Drive &amp; CSV / JSON
                </span>
              </h2>
              <p className="text-xs text-ink-secondary mt-0.5">
                Impor daftar SKU produk jadi langsung dari Google Drive Spreadsheet atau unggah file CSV / JSON lokal
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-secondary hover:text-ink-primary p-2 rounded-xl bg-elevated hover:bg-elevated transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source Selector Tabs */}
        <div className="flex border-b border-border-subtle bg-surface px-4 sm:px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveSource('STORAGE')}
            className={`flex items-center space-x-2 pb-3 px-3 text-xs font-bold border-b-2 transition ${
              activeSource === 'STORAGE'
                ? 'border-cyan-400 text-brand'
                : 'border-transparent text-ink-secondary hover:text-ink-primary'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>1. File Lokal &amp; Tempel Teks</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSource('DRIVE')}
            className={`flex items-center space-x-2 pb-3 px-3 text-xs font-bold border-b-2 transition ${
              activeSource === 'DRIVE'
                ? 'border-cyan-400 text-brand'
                : 'border-transparent text-ink-secondary hover:text-ink-primary'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>2. Google Drive / Spreadsheet</span>
            {hasDriveToken && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs">
          {/* TAB 1: LOCAL FILE / STORAGE */}
          {activeSource === 'STORAGE' && (
            <div className="space-y-4">
              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const files = e.dataTransfer.files;
                  if (files && files.length > 0) {
                    handleFileUpload(files[0]);
                  }
                }}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition ${
                  isDragging
                    ? 'border-cyan-400 bg-tint-cyan'
                    : 'border-border-strong bg-canvas hover:border-border-strong'
                }`}
              >
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="p-3 rounded-full bg-elevated text-brand">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="font-semibold text-ink-primary">Tarik &amp; lepas file SKU di sini</span>
                    <span className="text-ink-secondary text-[11px] block mt-0.5">
                      Mendukung format .xlsx, .xls, .csv, .tsv, .json, atau .txt
                    </span>
                  </div>
                  <div className="pt-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.CSV,.tsv,.TSV,.txt,.TXT,.json,.JSON,.xlsx,.XLSX,.xls,.XLS,.xlsm,.ods,text/csv,text/plain,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) handleFileUpload(file);
                      }}
                    />
                    <button
                      type="button"
                      disabled={isReadingFile}
                      onClick={() => fileInputRef.current?.click()}
                      className="cursor-pointer px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white rounded-xl text-xs font-bold shadow-md shadow-cyan-600/20 transition inline-block"
                    >
                      <span>{isReadingFile ? 'Membaca file...' : 'Pilih File dari Komputer'}</span>
                    </button>
                  </div>
                  {fileName && !localFileError && (
                    <div className="mt-2 text-xs font-mono text-brand bg-tint-cyan px-3 py-1 rounded-lg border border-tint-cyan-border">
                      ✓ File terpilih: {fileName}
                    </div>
                  )}
                  {localFileError && (
                    <div className="mt-2 w-full max-w-lg text-left text-[11px] text-ink-rose bg-tint-rose border border-rose-500/40 px-3 py-2 rounded-xl flex items-start space-x-2">
                      <AlertTriangle className="w-4 h-4 text-ink-rose shrink-0 mt-0.5" />
                      <span>{localFileError}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Paste Text / Quick Editor Option */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-ink-secondary">
                    Atau Tempel / Ketik Konten Data SKU (CSV / JSON):
                  </label>
                  <div className="flex items-center space-x-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => {
                        setLocalFileError(null);
                        setFileName('contoh_sku.csv');
                        setFileContent(SAMPLE_SKU_CSV_TEMPLATE);
                      }}
                      className="text-brand hover:underline"
                    >
                      Muat Contoh CSV
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        setLocalFileError(null);
                        setFileName('contoh_sku.json');
                        setFileContent(SAMPLE_SKU_JSON_TEMPLATE);
                      }}
                      className="text-brand hover:underline"
                    >
                      Muat Contoh JSON
                    </button>
                  </div>
                </div>
                <textarea
                  value={fileContent}
                  onChange={(e) => {
                    setLocalFileError(null);
                    setFileContent(e.target.value);
                    setFileName('input_manual.csv');
                  }}
                  rows={4}
                  placeholder="Tempel teks CSV atau JSON SKU di sini..."
                  className="w-full bg-canvas border border-border-subtle rounded-xl p-3 text-ink-primary font-mono text-[11px] placeholder:text-ink-muted focus:outline-none focus:border-accent-primary"
                />
              </div>

              {/* Download Template Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-canvas rounded-xl border border-border-subtle">
                <div className="text-[11px] text-ink-secondary">
                  <span>Butuh acuan format file? Unduh template resmi SKU:</span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadTemplate('csv')}
                    className="px-2.5 py-1.5 bg-elevated hover:bg-accent text-ink-primary rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition border border-border-strong"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-ink-emerald" />
                    <span>Download Template CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadTemplate('json')}
                    className="px-2.5 py-1.5 bg-elevated hover:bg-accent text-ink-primary rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition border border-border-strong"
                  >
                    <FileCode className="w-3.5 h-3.5 text-ink-amber" />
                    <span>Download Template JSON</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GOOGLE DRIVE / SPREADSHEET */}
          {activeSource === 'DRIVE' && (
            <GoogleDriveFileBrowser
              description="Pilih file Google Spreadsheet, Excel (.xlsx), CSV, atau JSON yang tersimpan di Google Drive Anda untuk langsung diimpor ke dalam master SKU."
              searchPlaceholder="Cari file SKU di Google Drive (e.g. Master SKU, Biskuit, KITE)..."
              selectedFileId={selectedDriveFile?.id}
              onFileLoaded={(content, loadedName, file) => {
                setLocalFileError(null);
                setSelectedDriveFile(file);
                setFileName(loadedName);
                setFileContent(content);
              }}
              onSwitchToLocal={() => setActiveSource('STORAGE')}
              onConnectionChange={setHasDriveToken}
              showToast={showToast}
            />
          )}

          {/* PARSE RESULT PREVIEW TABLE */}
          {parseResult && (
            <div className="space-y-3 pt-2 border-t border-border-subtle">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <h4 className="font-bold text-sm text-ink-primary flex items-center space-x-1.5">
                    <CheckCircle2 className="w-4 h-4 text-ink-emerald" />
                    <span>Hasil Pembacaan Data SKU:</span>
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-tint-cyan text-brand border border-tint-cyan-border">
                    {validCount} SKU Terbaca Valid
                  </span>
                </div>

                {/* Domestik vs KITE Breakdown Chips */}
                <div className="flex items-center space-x-2 text-[11px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-brand border border-cyan-500/30">
                    Domestik: <strong>{domCount}</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-ink-amber border border-amber-500/30">
                    KITE Ekspor: <strong>{kiteCount}</strong>
                  </span>
                </div>
              </div>

              {/* Warnings / Errors */}
              {parseResult.errors.length > 0 && (
                <div className="p-3 bg-tint-rose border border-rose-500/40 rounded-xl space-y-1 text-xs">
                  <span className="font-bold text-ink-rose flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-ink-rose" />
                    <span>{parseResult.errors.length} Baris Tidak Valid (Dilewati):</span>
                  </span>
                  <ul className="list-disc list-inside text-ink-rose text-[11px] max-h-24 overflow-y-auto no-scrollbar space-y-0.5">
                    {parseResult.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {parseResult.warnings.length > 0 && (
                <div className="p-2.5 bg-tint-amber border border-amber-500/30 rounded-xl space-y-1 text-[11px] text-ink-amber">
                  <span className="font-semibold text-ink-amber">Pemberitahuan Otomatis:</span>
                  <ul className="list-disc list-inside text-[10px] max-h-16 overflow-y-auto no-scrollbar">
                    {parseResult.warnings.slice(0, 3).map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Data Preview Table */}
              {validCount > 0 && (
                <div className="border border-border-subtle rounded-xl overflow-hidden max-h-60 overflow-y-auto no-scrollbar bg-canvas">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-surface sticky top-0 text-[11px] text-ink-secondary border-b border-border-subtle">
                      <tr>
                        <th className="py-2 px-3">Kode SKU</th>
                        <th className="py-2 px-3">Nama Produk SKU</th>
                        <th className="py-2 px-3 text-center">Kategori</th>
                        <th className="py-2 px-3 text-right">Target Ktn/Jam</th>
                        <th className="py-2 px-3 text-right">Berat kg/Ktn</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle font-mono">
                      {parseResult.valid.map((s, idx) => (
                        <tr key={idx} className="hover:bg-surface">
                          <td className="py-2 px-3 font-bold text-brand">
                            {s.code || '-'}
                          </td>
                          <td className="py-2 px-3 text-ink-primary font-sans font-medium">
                            {s.name}
                          </td>
                          <td className="py-2 px-3 text-center font-sans">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                s.isKite
                                  ? 'bg-amber-500/20 text-ink-amber border-amber-500/40'
                                  : 'bg-cyan-500/20 text-brand border-cyan-500/40'
                              }`}
                            >
                              {s.isKite ? '★ KITE Ekspor' : 'Domestik'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-ink-secondary">
                            {s.targetHour} ktn/j
                          </td>
                          <td className="py-2 px-3 text-right text-ink-amber font-bold">
                            {s.cartonWeightKg.toFixed(4)} kg
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Import Mode Selector */}
              <div className="p-3 bg-canvas rounded-xl border border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="font-semibold text-ink-primary block text-xs">Pilih Mode Impor SKU:</span>
                  <span className="text-[11px] text-ink-secondary">
                    Tentukan bagaimana data baru digabungkan dengan {existingSkus.length} SKU yang sudah ada di database.
                  </span>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <label
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition ${
                      importMode === 'append'
                        ? 'bg-cyan-500/20 border-cyan-500/60 text-brand font-bold'
                        : 'bg-surface border-border-subtle text-ink-secondary'
                    }`}
                  >
                    <input
                      type="radio"
                      name="skuImportMode"
                      value="append"
                      checked={importMode === 'append'}
                      onChange={() => setImportMode('append')}
                      className="hidden"
                    />
                    <span>Gabungkan (Append)</span>
                  </label>

                  <label
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition ${
                      importMode === 'replace'
                        ? 'bg-rose-500/20 border-rose-500/60 text-ink-rose font-bold'
                        : 'bg-surface border-border-subtle text-ink-secondary'
                    }`}
                  >
                    <input
                      type="radio"
                      name="skuImportMode"
                      value="replace"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="hidden"
                    />
                    <span>Gantikan Semua (Replace)</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-border-subtle bg-canvas flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-elevated hover:bg-accent text-ink-secondary rounded-xl text-xs font-semibold transition"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={!parseResult || validCount === 0}
            className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-2 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            <span>
              Impor {validCount > 0 ? `${validCount} SKU (${domCount} Dom, ${kiteCount} KITE)` : 'SKU'} Sekarang
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
