import React, { useState, useEffect } from 'react';
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  HardDrive,
  Cpu,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { ProductionMachine } from '../types';
import {
  parseMachineFile,
  SAMPLE_MACHINE_CSV_TEMPLATE,
  SAMPLE_MACHINE_JSON_TEMPLATE,
  MachineParseResult
} from '../utils/machineParser';
import {
  googleSignIn,
  listDriveFiles,
  readDriveFileContent,
  DriveFileItem,
  getAccessToken
} from '../utils/googleWorkspace';

interface MachineImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingMachines: ProductionMachine[];
  onImportMachines: (newMachines: ProductionMachine[], mode: 'replace' | 'append') => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const MachineImportModal: React.FC<MachineImportModalProps> = ({
  isOpen,
  onClose,
  existingMachines,
  onImportMachines,
  showToast
}) => {
  const [activeSource, setActiveSource] = useState<'STORAGE' | 'DRIVE'>('STORAGE');
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');

  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);

  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [driveUserEmail, setDriveUserEmail] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [driveSearch, setDriveSearch] = useState('');
  const [selectedDriveFile, setSelectedDriveFile] = useState<DriveFileItem | null>(null);

  const [parseResult, setParseResult] = useState<MachineParseResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getAccessToken().then(tok => {
        if (tok) setDriveToken(tok);
      });
    } else {
      setFileContent('');
      setFileName('');
      setSelectedDriveFile(null);
      setParseResult(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (fileContent.trim()) {
      const res = parseMachineFile(fileContent);
      setParseResult(res);
    } else {
      setParseResult(null);
    }
  }, [fileContent]);

  const fetchDriveFiles = async (token: string, search?: string) => {
    setIsDriveLoading(true);
    try {
      const files = await listDriveFiles(token, search);
      const relevant = files.filter(f => {
        const mime = f.mimeType.toLowerCase();
        const name = f.name.toLowerCase();
        return (
          mime.includes('spreadsheet') ||
          mime.includes('csv') ||
          mime.includes('json') ||
          mime.includes('text') ||
          mime.includes('octet-stream') ||
          name.endsWith('.csv') ||
          name.endsWith('.json') ||
          name.endsWith('.tsv') ||
          name.endsWith('.txt')
        );
      });
      setDriveFiles(relevant.length > 0 ? relevant : files);
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat file dari Google Drive', true);
    } finally {
      setIsDriveLoading(false);
    }
  };

  const handleConnectGoogleDrive = async () => {
    try {
      setIsDriveLoading(true);
      const res = await googleSignIn();
      if (res) {
        setDriveToken(res.accessToken);
        setDriveUserEmail(res.user.email);
        showToast(`Google Drive terhubung: ${res.user.email}`);
        await fetchDriveFiles(res.accessToken);
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal login ke Google Drive', true);
    } finally {
      setIsDriveLoading(false);
    }
  };

  const handleSelectDriveFile = async (file: DriveFileItem) => {
    if (!driveToken) return;
    try {
      setIsProcessing(true);
      setSelectedDriveFile(file);
      setFileName(file.name);
      const content = await readDriveFileContent(driveToken, file.id, file.mimeType);
      setFileContent(content);
      showToast(`File "${file.name}" berhasil dimuat dari Google Drive`);
    } catch (err: any) {
      showToast(`Gagal membaca file dari Drive: ${err.message}`, true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLocalFileUpload = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setFileContent(text || '');
    };
    reader.onerror = () => {
      showToast('Gagal membaca file lokal', true);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleLocalFileUpload(e.dataTransfer.files[0]);
    }
  };

  const downloadTemplate = (type: 'csv' | 'json') => {
    const content = type === 'csv' ? SAMPLE_MACHINE_CSV_TEMPLATE : SAMPLE_MACHINE_JSON_TEMPLATE;
    const blob = new Blob([content], { type: type === 'csv' ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template_mesin_produksi.${type}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Template Mesin ${type.toUpperCase()} berhasil diunduh`);
  };

  const handleExecuteImport = () => {
    if (!parseResult || parseResult.valid.length === 0) {
      showToast('Tidak ada data mesin valid untuk diimpor', true);
      return;
    }

    onImportMachines(parseResult.valid, importMode);
    showToast(
      `Berhasil mengimpor ${parseResult.valid.length} mesin (${importMode === 'replace' ? 'Mode Gantikan Semua' : 'Mode Gabungkan'})`
    );
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/80 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-xl">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Import Master Mesin Produksi</h3>
              <p className="text-[11px] text-slate-400">
                Muat daftar mesin dari file lokal perangkat (CSV/JSON) atau Google Drive Cloud
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Navigation Tabs */}
        <div className="px-5 pt-3 pb-2 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between shrink-0">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveSource('STORAGE')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeSource === 'STORAGE'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <HardDrive className="w-4 h-4" />
              <span>1. Storage Internal (File Upload)</span>
            </button>
            <button
              onClick={() => {
                setActiveSource('DRIVE');
                if (driveToken && driveFiles.length === 0) {
                  fetchDriveFiles(driveToken);
                }
              }}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeSource === 'DRIVE'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 87.3 78" fill="currentColor">
                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.25z" fill="#00832d"/>
                <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
              </svg>
              <span>2. Google Drive Cloud</span>
            </button>
          </div>

          <div className="flex items-center space-x-1.5 text-[11px] text-slate-400">
            <span>Template Mesin:</span>
            <button
              onClick={() => downloadTemplate('csv')}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg flex items-center space-x-1"
              title="Unduh format tabel CSV"
            >
              <FileSpreadsheet className="w-3 h-3" />
              <span>CSV</span>
            </button>
            <button
              onClick={() => downloadTemplate('json')}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg flex items-center space-x-1"
              title="Unduh format JSON"
            >
              <FileCode className="w-3 h-3" />
              <span>JSON</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeSource === 'STORAGE' && (
            <div className="space-y-3">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition ${
                  isDragging
                    ? 'border-cyan-400 bg-cyan-950/20'
                    : 'border-slate-700 hover:border-slate-600 bg-slate-800/40'
                }`}
              >
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-cyan-400 border border-slate-700">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">
                      Tarik dan letakkan file CSV atau JSON mesin produksi di sini
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Kolom: Kode Mesin, Nama Mesin, Jalur (Line), Kapasitas (kg/jam), Status, Operator, Catatan
                    </p>
                  </div>
                  <label className="cursor-pointer inline-flex items-center space-x-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded-xl shadow-md shadow-cyan-600/20 transition active:scale-95">
                    <span>Pilih File dari Komputer</span>
                    <input
                      type="file"
                      accept=".csv,.json,.tsv,.txt"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleLocalFileUpload(e.target.files[0]);
                        }
                      }}
                    />
                  </label>
                  {fileName && (
                    <div className="mt-2 text-xs font-mono text-cyan-300 bg-cyan-950/40 px-3 py-1 rounded-lg border border-cyan-800">
                      File terpilih: {fileName}
                    </div>
                  )}
                </div>
              </div>

              {/* Paste Direct Text */}
              <details className="bg-slate-800/40 border border-slate-800 rounded-xl p-3 text-xs">
                <summary className="font-semibold text-slate-300 cursor-pointer hover:text-white">
                  Opsi Cepat: Tempel Teks CSV/JSON Mesin Langsung
                </summary>
                <div className="mt-2 space-y-2">
                  <textarea
                    rows={4}
                    value={fileContent}
                    onChange={(e) => {
                      setFileName('Manual Paste Input');
                      setFileContent(e.target.value);
                    }}
                    placeholder="Tempel baris CSV (Kode,Nama,Line,Kapasitas,Status,Operator,Catatan) atau JSON array di sini..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </details>
            </div>
          )}

          {activeSource === 'DRIVE' && (
            <div className="space-y-3">
              {!driveToken ? (
                <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 text-center space-y-4">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <svg className="w-8 h-8" viewBox="0 0 87.3 78" fill="currentColor">
                      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
                      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.25z" fill="#00832d"/>
                      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">Hubungkan ke Akun Google Drive</h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                      Akses file daftar master mesin (CSV, JSON, atau Google Spreadsheet) yang tersimpan di Google Drive secara aman.
                    </p>
                  </div>
                  <button
                    onClick={handleConnectGoogleDrive}
                    disabled={isDriveLoading}
                    className="inline-flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/25 transition active:scale-95 disabled:opacity-50"
                  >
                    {isDriveLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                      </svg>
                    )}
                    <span>Masuk dengan Google & Buka Drive</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-blue-950/20 border border-blue-900/40 rounded-xl">
                    <div className="flex items-center space-x-2 text-xs">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-slate-300">
                        Google Drive Terhubung: <strong className="text-white">{driveUserEmail || 'Akun Google'}</strong>
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => fetchDriveFiles(driveToken, driveSearch)}
                        disabled={isDriveLoading}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center space-x-1"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isDriveLoading ? 'animate-spin' : ''}`} />
                        <span>Segarkan</span>
                      </button>
                      <button
                        onClick={handleConnectGoogleDrive}
                        className="px-2.5 py-1.5 bg-blue-900/40 hover:bg-blue-800/40 text-blue-300 rounded-lg text-xs"
                      >
                        Ganti Akun
                      </button>
                    </div>
                  </div>

                  {/* Drive Search Bar */}
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={driveSearch}
                      onChange={(e) => setDriveSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') fetchDriveFiles(driveToken, driveSearch);
                      }}
                      placeholder="Cari file daftar mesin di Google Drive..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-20 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      onClick={() => fetchDriveFiles(driveToken, driveSearch)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-medium rounded-lg"
                    >
                      Cari
                    </button>
                  </div>

                  {/* Drive Files List */}
                  <div className="border border-slate-800 rounded-xl bg-slate-900/60 overflow-hidden">
                    <div className="p-2 border-b border-slate-800 text-[11px] font-semibold text-slate-400 flex justify-between">
                      <span>Daftar File di Google Drive ({driveFiles.length})</span>
                      <span>Klik untuk memuat isi</span>
                    </div>

                    <div className="max-h-52 overflow-y-auto divide-y divide-slate-800/60 no-scrollbar">
                      {isDriveLoading ? (
                        <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center space-x-2">
                          <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                          <span>Mengambil daftar file dari Google Drive...</span>
                        </div>
                      ) : driveFiles.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-400 space-y-2.5">
                          <p className="text-slate-400">Tidak ada file mesin yang cocok ditemukan di Google Drive atau akses dibatasi browser.</p>
                          <button
                            type="button"
                            onClick={() => setActiveSource('STORAGE')}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs font-medium transition"
                          >
                            <HardDrive className="w-3.5 h-3.5" />
                            <span>Gunakan Unggah File Lokal (CSV / JSON)</span>
                          </button>
                        </div>
                      ) : (
                        driveFiles.map((file) => {
                          const isSelected = selectedDriveFile?.id === file.id;
                          const isSheet = file.mimeType.includes('spreadsheet');
                          return (
                            <div
                              key={file.id}
                              onClick={() => handleSelectDriveFile(file)}
                              className={`p-2.5 flex items-center justify-between cursor-pointer transition ${
                                isSelected
                                  ? 'bg-cyan-950/40 border-l-4 border-cyan-400'
                                  : 'hover:bg-slate-800/60'
                              }`}
                            >
                              <div className="flex items-center space-x-2.5 truncate mr-2">
                                <div className="p-1.5 bg-slate-800 rounded-lg shrink-0">
                                  {isSheet ? (
                                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                                  ) : (
                                    <FileCode className="w-4 h-4 text-amber-400" />
                                  )}
                                </div>
                                <div className="truncate">
                                  <div className="text-xs font-semibold text-white truncate flex items-center space-x-1.5">
                                    <span>{file.name}</span>
                                    {isSheet && (
                                      <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-normal">
                                        Google Sheets
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    {file.modifiedTime && (
                                      <span>Diubah: {new Date(file.modifiedTime).toLocaleDateString('id-ID')}</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 flex items-center space-x-1 ${
                                  isSelected
                                    ? 'bg-cyan-500 text-slate-950 font-bold'
                                    : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                                }`}
                              >
                                <span>{isSelected ? 'Terpilih' : 'Muat File'}</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Validation & Preview Section */}
          {parseResult && (
            <div className="border border-slate-800 rounded-2xl bg-slate-950/60 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-white">
                      Hasil Analisis Mesin ({parseResult.valid.length} Item Valid Ditemukan)
                    </h4>
                    <p className="text-[10px] text-slate-400">
                      Sumber: {fileName || 'Data Terpilih'}
                    </p>
                  </div>
                </div>

                {/* Import Mode Selector */}
                <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
                  <label className="text-[11px] text-slate-400 px-1 font-medium">Metode Impor:</label>
                  <button
                    type="button"
                    onClick={() => setImportMode('append')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                      importMode === 'append' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Gabungkan (Append)
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode('replace')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                      importMode === 'replace' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Gantikan Semua (Replace)
                  </button>
                </div>
              </div>

              {parseResult.errors.length > 0 && (
                <div className="bg-amber-950/30 border border-amber-900/50 p-2.5 rounded-xl text-[11px] text-amber-300 space-y-1">
                  <div className="flex items-center space-x-1 font-semibold text-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Catatan Validasi ({parseResult.errors.length} baris dilewati):</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-[10px] max-h-20 overflow-y-auto">
                    {parseResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Preview Table */}
              <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-xl bg-slate-900">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/80 text-[10px] text-slate-400 uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Kode</th>
                      <th className="px-3 py-2">Nama Mesin</th>
                      <th className="px-3 py-2">Jalur (Line)</th>
                      <th className="px-3 py-2 text-right">Kapasitas (kg/jam)</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Operator</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-[11px]">
                    {parseResult.valid.map((m, idx) => (
                      <tr key={m.id || idx} className="hover:bg-slate-800/40">
                        <td className="px-3 py-2 font-mono text-cyan-300 font-bold">{m.code}</td>
                        <td className="px-3 py-2 font-medium text-white">{m.name}</td>
                        <td className="px-3 py-2 text-slate-300">{m.line}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-400 font-semibold">
                          {m.capacityKgPerHour} kg/jam
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            m.status === 'OPERATIONAL'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : m.status === 'STANDBY'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}>
                            {m.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-400">{m.operatorAssigned || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-400">
            Mesin aktif saat ini: <strong className="text-white font-mono">{existingMachines.length}</strong> unit
          </div>
          <div className="flex space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition"
            >
              Batal
            </button>
            <button
              onClick={handleExecuteImport}
              disabled={!parseResult || parseResult.valid.length === 0}
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-bold rounded-xl text-xs shadow-lg shadow-cyan-600/20 transition active:scale-95 flex items-center space-x-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {importMode === 'replace'
                  ? `Gantikan Semua (${parseResult?.valid.length || 0} Mesin)`
                  : `Terapkan Impor (${parseResult?.valid.length || 0} Mesin)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
