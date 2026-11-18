import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  CheckCircle2,
  HardDrive,
  BookOpen,
  Sparkles
} from 'lucide-react';
import { WipRecipe, WIP, Material } from '../types';
import {
  parseRecipeFile,
  SAMPLE_RECIPE_CSV_TEMPLATE,
  SAMPLE_RECIPE_JSON_TEMPLATE,
  RecipeParseResult
} from '../utils/recipeParser';
import { DriveFileItem, getAccessToken, readLocalBomFile } from '../utils/googleWorkspace';
import { GoogleDriveFileBrowser } from './GoogleDriveFileBrowser';

interface RecipeImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableWips: WIP[];
  availableMaterials: Material[];
  existingRecipes: WipRecipe[];
  onImportRecipes: (newRecipes: WipRecipe[], mode: 'replace' | 'append') => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const RecipeImportModal: React.FC<RecipeImportModalProps> = ({
  isOpen,
  onClose,
  availableWips,
  availableMaterials,
  existingRecipes,
  onImportRecipes,
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
  const [parseResult, setParseResult] = useState<RecipeParseResult | null>(null);

  // On open, check if token is already in memory
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

  // When fileContent changes, auto-parse
  useEffect(() => {
    if (fileContent.trim()) {
      const res = parseRecipeFile(fileContent, availableWips, availableMaterials);
      setParseResult(res);
    } else {
      setParseResult(null);
    }
  }, [fileContent, availableWips, availableMaterials]);

  // Local file upload handlers
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
        throw new Error(`File "${file.name}" kosong atau tidak berisi data resep.`);
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
    const content = format === 'csv' ? SAMPLE_RECIPE_CSV_TEMPLATE : SAMPLE_RECIPE_JSON_TEMPLATE;
    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template_resep_formulasi.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Template ${format.toUpperCase()} berhasil diunduh`);
  };

  const handleConfirmImport = () => {
    if (!parseResult || parseResult.valid.length === 0) {
      showToast('Tidak ada data resep valid untuk diimpor', true);
      return;
    }

    onImportRecipes(parseResult.valid, importMode);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center space-x-2">
                <span>Import Resep Formulasi WIP</span>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">
                  Google Drive &amp; CSV / JSON
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Input resep formulasi baru dari Google Drive atau upload file lokal dengan auto-mapping material
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
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileUpload(e.dataTransfer.files[0]);
                  }
                }}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition ${
                  isDragging
                    ? 'border-cyan-400 bg-cyan-950/20'
                    : 'border-slate-700 bg-slate-950/50 hover:border-slate-600'
                }`}
              >
                <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-cyan-400 mb-3 shadow-inner">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-white text-sm mb-1">
                  Tarik &amp; Lepaskan File Resep (.xlsx, .xls, .csv, atau .json)
                </h3>
                <p className="text-slate-400 text-[11px] mb-3">
                  Atau klik tombol telusuri untuk memilih file dari komputer Anda
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.CSV,.tsv,.TSV,.txt,.TXT,.json,.JSON,.xlsx,.XLSX,.xls,.XLS,.xlsm,.ods,text/csv,text/plain,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) {
                      handleFileUpload(file);
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={isReadingFile}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white rounded-xl font-bold cursor-pointer transition shadow-md shadow-cyan-600/20"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{isReadingFile ? 'Membaca file...' : 'Pilih File dari Komputer'}</span>
                </button>
                {fileName && !localFileError && (
                  <p className="mt-3 text-cyan-300 font-mono font-bold">
                    ✓ File dipilih: {fileName}
                  </p>
                )}
                {localFileError && (
                  <div className="mt-3 mx-auto max-w-lg text-left text-[11px] text-rose-200 bg-rose-950/50 border border-rose-500/40 px-3 py-2 rounded-xl flex items-start space-x-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{localFileError}</span>
                  </div>
                )}
              </div>

              {/* Download Sample Templates & Paste Option */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-300 font-semibold text-[11px]">
                  Format File Standar Pabrik:
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadTemplate('csv')}
                    className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition border border-slate-700"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Download Template CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadTemplate('json')}
                    className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition border border-slate-700"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>Download Template JSON</span>
                  </button>
                </div>
              </div>

              {/* Raw Text Input (Paste CSV / JSON) */}
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Atau Tempel (Paste) Isi Teks CSV / JSON Resep di Bawah:
                </label>
                <textarea
                  rows={4}
                  value={fileContent}
                  onChange={(e) => {
                    setLocalFileError(null);
                    setFileContent(e.target.value);
                    setFileName('Data Tempel Manual');
                  }}
                  placeholder="Tempel baris data CSV (Kode Resep, Nama Resep, Target WIP, ...) atau format array JSON di sini..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 font-mono text-[11px] text-cyan-300 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          )}

          {/* TAB 2: GOOGLE DRIVE IMPORT */}
          {activeSource === 'DRIVE' && (
            <GoogleDriveFileBrowser
              description="Akses file Google Spreadsheet, Excel (.xlsx), CSV, atau JSON resep formulasi yang tersimpan di Google Drive atau Shared Drive perusahaan Anda."
              searchPlaceholder="Cari file resep di Google Drive (tekan Enter)..."
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

          {/* PARSE PREVIEW & VALIDATION RESULTS */}
          {parseResult && (
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-xs sm:text-sm">
                      Hasil Pemeriksaan: {parseResult.valid.length} Resep Terbaca
                    </h4>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Total {parseResult.valid.reduce((acc, r) => acc + r.items.length, 0)} komponen material formulasi
                    </span>
                  </div>
                </div>

                {/* Import Mode Selector */}
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] text-slate-400 font-medium">Mode Import:</span>
                  <select
                    value={importMode}
                    onChange={(e) => setImportMode(e.target.value as 'append' | 'replace')}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-cyan-500 font-semibold"
                  >
                    <option value="append">Gabungkan (Append / Update)</option>
                    <option value="replace">Ganti Seluruh Data (Replace)</option>
                  </select>
                </div>
              </div>

              {parseResult.errors.length > 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1">
                  <div className="flex items-center space-x-1.5 text-amber-400 font-bold">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Catatan Validasi ({parseResult.errors.length}):</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-amber-200/90 space-y-0.5">
                    {parseResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Table of Parsed Recipes */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60 max-h-56 overflow-y-auto no-scrollbar">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 border-b border-slate-800 text-[10px] text-slate-400 uppercase font-semibold">
                    <tr>
                      <th className="py-2 px-3">Kode Resep</th>
                      <th className="py-2 px-3">Nama Resep</th>
                      <th className="py-2 px-3">Target WIP</th>
                      <th className="py-2 px-3 text-center">Bahan</th>
                      <th className="py-2 px-3 text-right">Total Berat</th>
                      <th className="py-2 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {parseResult.valid.map((r, i) => {
                      const wipMatch = availableWips.find(w => w.id === r.wipId);
                      return (
                        <tr key={i} className="hover:bg-slate-900/40">
                          <td className="py-2 px-3 font-mono font-bold text-amber-400">
                            {r.recipeCode}
                          </td>
                          <td className="py-2 px-3 text-white font-medium">
                            {r.recipeName}
                            {r.description && (
                              <span className="block text-[10px] text-slate-400 truncate max-w-xs">
                                {r.description}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-300">
                            <span className="text-cyan-400 font-medium">
                              {wipMatch?.name || 'WIP Terkait'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-slate-300">
                            {r.items.length} item
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-cyan-400">
                            {r.totalWeightKg.toFixed(4)} kg
                          </td>
                          <td className="py-2 px-3 text-center">
                            {r.isDefault ? (
                              <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 text-[10px] font-semibold">
                                Resep Utama
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[10px]">Standar</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-t border-slate-800 bg-slate-950/80">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={!parseResult || parseResult.valid.length === 0}
            className="flex items-center space-x-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold transition shadow-xs active:scale-95"
          >
            <Sparkles className="w-4 h-4" />
            <span>
              {parseResult && parseResult.valid.length > 0
                ? `Impor ${parseResult.valid.length} Resep Formulasi ke Sistem`
                : 'Pilih File Resep Terlebih Dahulu'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
