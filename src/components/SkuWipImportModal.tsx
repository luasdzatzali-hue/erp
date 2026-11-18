import React, { useState, useEffect } from 'react';
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  FileCode,
  AlertTriangle,
  CheckCircle2,
  HardDrive,
  GitBranch,
  Check
} from 'lucide-react';
import { SKU, WIP, SkuWip } from '../types';
import {
  parseSkuWipFile,
  buildSkuWipCsvTemplate,
  buildSkuWipJsonTemplate,
  SAMPLE_SKU_WIP_CSV_TEMPLATE,
  SAMPLE_SKU_WIP_JSON_TEMPLATE,
  SkuWipParseResult
} from '../utils/skuWipParser';
import { DriveFileItem, getAccessToken, readLocalBomFile } from '../utils/googleWorkspace';
import { GoogleDriveFileBrowser } from './GoogleDriveFileBrowser';

interface SkuWipImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableSkus: SKU[];
  availableWips: WIP[];
  existingSkuWips: SkuWip[];
  onImportSkuWips: (newSkuWips: SkuWip[], mode: 'replace' | 'append') => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const SkuWipImportModal: React.FC<SkuWipImportModalProps> = ({
  isOpen,
  onClose,
  availableSkus,
  availableWips,
  existingSkuWips,
  onImportSkuWips,
  showToast
}) => {
  const [activeSource, setActiveSource] = useState<'STORAGE' | 'DRIVE'>('STORAGE');
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');

  // Local file state
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);

  // Google Drive state
  const [hasDriveToken, setHasDriveToken] = useState(false);
  const [selectedDriveFile, setSelectedDriveFile] = useState<DriveFileItem | null>(null);

  // Parse result preview
  const [parseResult, setParseResult] = useState<SkuWipParseResult | null>(null);

  useEffect(() => {
    if (isOpen) {
      getAccessToken().then(tok => setHasDriveToken(Boolean(tok)));
    } else {
      setFileContent('');
      setFileName('');
      setSelectedDriveFile(null);
      setParseResult(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (fileContent.trim()) {
      const res = parseSkuWipFile(fileContent, availableSkus, availableWips);
      setParseResult(res);
    } else {
      setParseResult(null);
    }
  }, [fileContent, availableSkus, availableWips]);

  const handleFileUpload = async (file: File) => {
    setFileName(file.name);
    setSelectedDriveFile(null);
    try {
      const text = await readLocalBomFile(file);
      setFileContent(text || '');
    } catch (err: any) {
      showToast(err?.message || 'Gagal membaca file lokal', true);
    }
  };

  const handleDownloadTemplate = (format: 'csv' | 'json') => {
    const content =
      format === 'csv'
        ? buildSkuWipCsvTemplate(availableSkus, availableWips)
        : buildSkuWipJsonTemplate(availableSkus, availableWips);
    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template_wip_per_karton_sku.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Template WIP-SKU ${format.toUpperCase()} berhasil diunduh`);
  };

  const handleLoadSample = (format: 'csv' | 'json') => {
    const content =
      format === 'csv'
        ? availableSkus.length > 0 && availableWips.length > 0
          ? buildSkuWipCsvTemplate(availableSkus, availableWips)
          : SAMPLE_SKU_WIP_CSV_TEMPLATE
        : availableSkus.length > 0 && availableWips.length > 0
          ? buildSkuWipJsonTemplate(availableSkus, availableWips)
          : SAMPLE_SKU_WIP_JSON_TEMPLATE;
    setFileContent(content);
    setFileName(`contoh_wip_sku.${format}`);
  };

  const handleConfirmImport = () => {
    if (!parseResult || parseResult.valid.length === 0) {
      showToast('Tidak ada relasi WIP-SKU yang valid untuk diimpor', true);
      return;
    }

    onImportSkuWips(
      parseResult.valid.map(row => row.skuWip),
      importMode
    );
    onClose();
  };

  if (!isOpen) return null;

  const validCount = parseResult?.valid.length || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Modal */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex flex-wrap items-center gap-2">
                <span>Import Jenis WIP (kg/karton) untuk 1 Karton SKU</span>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">
                  CSV / TSV / JSON / Google Drive
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Tautkan kebutuhan WIP per 1 karton SKU secara massal dari file lokal, spreadsheet, atau tempel teks
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source Selector Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900 px-4 sm:px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveSource('STORAGE')}
            className={`flex items-center space-x-2 pb-3 px-3 text-xs font-bold border-b-2 transition ${
              activeSource === 'STORAGE'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
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
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
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
                    ? 'border-cyan-400 bg-cyan-950/20'
                    : 'border-slate-700 bg-slate-950/40 hover:border-slate-600'
                }`}
              >
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="p-3 rounded-full bg-slate-800 text-cyan-400">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="font-semibold text-white">Tarik &amp; lepas file relasi WIP-SKU di sini</span>
                    <span className="text-slate-400 text-[11px] block mt-0.5">
                      Mendukung format .csv, .tsv, .json, atau .txt (kolom: Kode/Nama SKU, Kode/Nama WIP, Kebutuhan kg/karton)
                    </span>
                  </div>
                  <div className="pt-2">
                    <label className="cursor-pointer px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow-md shadow-cyan-600/20 transition inline-block">
                      <span>Pilih File dari Komputer</span>
                      <input
                        type="file"
                        accept=".csv,.json,.tsv,.txt,.xlsx,.xls"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file);
                        }}
                      />
                    </label>
                  </div>
                  {fileName && (
                    <p className="mt-2 text-cyan-300 font-mono font-bold text-[11px]">
                      ✓ File dimuat: {fileName}
                    </p>
                  )}
                </div>
              </div>

              {/* Paste Text / Quick Editor Option */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Atau Tempel / Ketik Konten Data WIP per Karton SKU (CSV / JSON):
                  </label>
                  <div className="flex items-center space-x-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => handleLoadSample('csv')}
                      className="text-cyan-400 hover:underline"
                    >
                      Muat Contoh CSV
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={() => handleLoadSample('json')}
                      className="text-cyan-400 hover:underline"
                    >
                      Muat Contoh JSON
                    </button>
                  </div>
                </div>
                <textarea
                  value={fileContent}
                  onChange={(e) => {
                    setFileContent(e.target.value);
                    setFileName('input_manual.csv');
                  }}
                  rows={4}
                  placeholder="Kode SKU,Nama SKU,Kode WIP,Nama WIP,Kebutuhan WIP (kg/karton)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono text-[11px] placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Download Template Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                <div className="text-[11px] text-slate-400">
                  <span>Butuh acuan format file? Unduh template (otomatis mengisi contoh SKU &amp; WIP Anda):</span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadTemplate('csv')}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition border border-slate-700"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Download Template CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadTemplate('json')}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition border border-slate-700"
                  >
                    <FileCode className="w-3.5 h-3.5 text-amber-400" />
                    <span>Download Template JSON</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GOOGLE DRIVE / SPREADSHEET */}
          {activeSource === 'DRIVE' && (
            <GoogleDriveFileBrowser
              description="Pilih file Google Spreadsheet, Excel (.xlsx), CSV, atau JSON konfigurasi WIP per karton SKU dari Google Drive Anda."
              searchPlaceholder="Cari file konfigurasi WIP-SKU di Google Drive..."
              selectedFileId={selectedDriveFile?.id}
              onFileLoaded={(content, loadedName, file) => {
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
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <h4 className="font-bold text-sm text-white flex items-center space-x-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Hasil Pembacaan Relasi WIP per Karton SKU:</span>
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                    {validCount} Relasi Valid
                  </span>
                </div>
              </div>

              {parseResult.errors.length > 0 && (
                <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl space-y-1 text-xs">
                  <span className="font-bold text-rose-300 flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span>{parseResult.errors.length} Baris Tidak Valid (Dilewati):</span>
                  </span>
                  <ul className="list-disc list-inside text-rose-200/80 text-[11px] max-h-24 overflow-y-auto no-scrollbar space-y-0.5">
                    {parseResult.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {parseResult.warnings.length > 0 && (
                <div className="p-2.5 bg-amber-950/30 border border-amber-500/30 rounded-xl space-y-1 text-[11px] text-amber-200/90">
                  <span className="font-semibold text-amber-300">Pemberitahuan Otomatis:</span>
                  <ul className="list-disc list-inside text-[10px] max-h-16 overflow-y-auto no-scrollbar">
                    {parseResult.warnings.slice(0, 5).map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {validCount > 0 && (
                <div className="border border-slate-800 rounded-xl overflow-hidden max-h-60 overflow-y-auto no-scrollbar bg-slate-950">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900 sticky top-0 text-[11px] text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">SKU Produk Target</th>
                        <th className="py-2 px-3">Jenis WIP Terpisah</th>
                        <th className="py-2 px-3 text-right">Kebutuhan WIP (kg/karton)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {parseResult.valid.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/50">
                          <td className="py-2 px-3">
                            <span className="font-semibold text-white block">{item.skuName}</span>
                            {item.skuCode && (
                              <span className="text-[10px] font-mono text-cyan-400">{item.skuCode}</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <span className="font-medium text-slate-200 block">{item.wipName}</span>
                            {item.wipCode && (
                              <span className="text-[10px] font-mono text-amber-400">{item.wipCode}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-cyan-300">
                            {item.skuWip.kgWipPerCartonSku.toFixed(4)} kg/ktn
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Import Mode Selector */}
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="font-semibold text-white block text-xs">Pilih Mode Impor Relasi WIP-SKU:</span>
                  <span className="text-[11px] text-slate-400">
                    Saat ini terdapat {existingSkuWips.length} relasi WIP-SKU tersimpan di sistem.
                  </span>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <label
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition ${
                      importMode === 'append'
                        ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="skuWipImportMode"
                      value="append"
                      checked={importMode === 'append'}
                      onChange={() => setImportMode('append')}
                      className="hidden"
                    />
                    <span>Gabungkan / Update (Append)</span>
                  </label>

                  <label
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition ${
                      importMode === 'replace'
                        ? 'bg-rose-500/20 border-rose-500/60 text-rose-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="skuWipImportMode"
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
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
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
              Impor {validCount > 0 ? `${validCount} Relasi WIP-SKU` : 'File'} Sekarang
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
