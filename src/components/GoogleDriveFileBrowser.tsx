import React, { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet,
  FileCode,
  FileText,
  RefreshCw,
  Search,
  HardDrive,
  ArrowRight,
  Loader2,
  AlertTriangle,
  LogOut,
  ExternalLink
} from 'lucide-react';
import {
  googleSignIn,
  googleSignInRedirect,
  listDriveFiles,
  readDriveFileContent,
  DriveFileItem,
  getAccessToken,
  getDriveUserEmail,
  clearWorkspaceDriveToken,
  isDriveAuthError,
  isDrivePopupBlockedError,
  isExcelMimeOrName
} from '../utils/googleWorkspace';

interface GoogleDriveFileBrowserProps {
  description: string;
  searchPlaceholder: string;
  selectedFileId?: string | null;
  onFileLoaded: (content: string, fileName: string, file: DriveFileItem) => void;
  onSwitchToLocal: () => void;
  onConnectionChange?: (connected: boolean) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const GoogleDriveFileBrowser: React.FC<GoogleDriveFileBrowserProps> = ({
  description,
  searchPlaceholder,
  selectedFileId,
  onFileLoaded,
  onSwitchToLocal,
  onConnectionChange,
  showToast
}) => {
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [driveUserEmail, setDriveUserEmail] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);
  const [driveSearch, setDriveSearch] = useState('');
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [showRedirectFallback, setShowRedirectFallback] = useState(false);

  const updateConnectionState = useCallback(
    (token: string | null, email: string | null) => {
      setDriveToken(token);
      setDriveUserEmail(email);
      onConnectionChange?.(Boolean(token));
    },
    [onConnectionChange]
  );

  const fetchFiles = useCallback(
    async (token: string, search?: string) => {
      setIsLoading(true);
      setDriveError(null);
      try {
        const files = await listDriveFiles(token, search);
        setDriveFiles(files);
      } catch (err: any) {
        const msg = err?.message || 'Gagal memuat daftar file dari Google Drive';
        setDriveError(msg);
        showToast(msg, true);
        if (isDriveAuthError(err)) {
          clearWorkspaceDriveToken();
          updateConnectionState(null, null);
          setDriveFiles([]);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [showToast, updateConnectionState]
  );

  // Sync in-memory Drive token on mount and automatically load files
  useEffect(() => {
    let mounted = true;
    getAccessToken().then(tok => {
      if (!mounted) return;
      if (tok) {
        updateConnectionState(tok, getDriveUserEmail());
        fetchFiles(tok);
      } else {
        updateConnectionState(null, null);
      }
    });
    return () => {
      mounted = false;
    };
  }, [fetchFiles, updateConnectionState]);

  const handleConnect = async () => {
    setIsLoading(true);
    setDriveError(null);
    setShowRedirectFallback(false);
    try {
      const res = await googleSignIn(true);
      if (res) {
        updateConnectionState(res.accessToken, res.user.email || getDriveUserEmail());
        showToast(`Google Drive terhubung: ${res.user.email || 'Akun Google'}`);
        await fetchFiles(res.accessToken, driveSearch);
      }
    } catch (err: any) {
      const msg = err?.message || 'Gagal menghubungkan ke Google Drive';
      setDriveError(msg);
      if (isDrivePopupBlockedError(err) || msg.toLowerCase().includes('popup')) {
        setShowRedirectFallback(true);
      }
      showToast(msg, true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRedirectConnect = async () => {
    setIsLoading(true);
    setDriveError(null);
    try {
      await googleSignInRedirect();
    } catch (err: any) {
      const msg = err?.message || 'Gagal memulai login redirect Google Drive';
      setDriveError(msg);
      showToast(msg, true);
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    clearWorkspaceDriveToken();
    updateConnectionState(null, null);
    setDriveFiles([]);
    setDriveError(null);
    showToast('Koneksi Google Drive diputus');
  };

  const handleSelectFile = async (file: DriveFileItem) => {
    if (!driveToken) return;
    setLoadingFileId(file.id);
    setDriveError(null);
    try {
      const content = await readDriveFileContent(driveToken, file.id, file.mimeType, file.name);
      onFileLoaded(content, file.name, file);
      showToast(`File "${file.name}" berhasil dimuat dari Google Drive`);
    } catch (err: any) {
      const msg = err?.message || 'Gagal membaca isi file dari Google Drive';
      setDriveError(msg);
      showToast(msg, true);
      if (isDriveAuthError(err)) {
        clearWorkspaceDriveToken();
        updateConnectionState(null, null);
        setDriveFiles([]);
      }
    } finally {
      setLoadingFileId(null);
    }
  };

  const relevantFiles = driveFiles.filter(f => {
    const mime = (f.mimeType || '').toLowerCase();
    const name = (f.name || '').toLowerCase();
    return (
      mime === 'application/vnd.google-apps.spreadsheet' ||
      mime === 'application/vnd.google-apps.document' ||
      mime === 'application/vnd.google-apps.shortcut' ||
      isExcelMimeOrName(mime, name) ||
      mime.includes('csv') ||
      mime.includes('json') ||
      mime.includes('text/') ||
      name.endsWith('.csv') ||
      name.endsWith('.json') ||
      name.endsWith('.tsv') ||
      name.endsWith('.txt')
    );
  });

  const displayedFiles =
    showAllFiles || relevantFiles.length === 0 ? driveFiles : relevantFiles;

  return (
    <div className="space-y-3">
      {driveError && (
        <div className="p-3 bg-rose-950/50 border border-rose-500/40 rounded-xl text-xs text-rose-200 flex items-start space-x-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1">
            <p className="font-semibold text-rose-300">Kendala Google Drive:</p>
            <p className="text-[11px] leading-relaxed">{driveError}</p>
          </div>
        </div>
      )}

      {!driveToken ? (
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <svg className="w-8 h-8" viewBox="0 0 87.3 78" fill="currentColor">
              <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
              <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47" />
              <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
              <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.25z" fill="#00832d" />
              <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
              <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
            </svg>
          </div>
          <div>
            <h4 className="font-bold text-white text-sm">Hubungkan ke Akun Google Drive</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
              {description}
            </p>
            <p className="text-[11px] text-cyan-300/80 mt-1.5 max-w-md mx-auto">
              Mendukung Google Spreadsheet, Excel (.xlsx/.xls), CSV, TSV, JSON, dan Google Docs. Pastikan izin baca Google Drive dicentang saat login.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleConnect}
              disabled={isLoading}
              className="inline-flex items-center space-x-2.5 px-5 py-2.5 bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold rounded-xl shadow-lg transition active:scale-95 disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
              )}
              <span>Sign in with Google &amp; Buka Drive</span>
            </button>

            <button
              type="button"
              onClick={handleRedirectConnect}
              disabled={isLoading}
              className={`inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition border ${
                showRedirectFallback
                  ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-600/20'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="Gunakan metode ini jika browser memblokir jendela popup"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Hubungkan via Redirect</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Account Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-blue-950/20 border border-blue-900/40 rounded-xl">
            <div className="flex items-center space-x-2 text-xs">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300">
                Google Drive Terhubung:{' '}
                <strong className="text-white">{driveUserEmail || 'Akun Google'}</strong>
              </span>
            </div>

            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => fetchFiles(driveToken, driveSearch)}
                disabled={isLoading}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center space-x-1 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Segarkan</span>
              </button>
              <button
                type="button"
                onClick={handleConnect}
                disabled={isLoading}
                className="px-2.5 py-1.5 bg-blue-900/40 hover:bg-blue-800/50 text-blue-300 rounded-lg text-xs transition"
              >
                Ganti Akun
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isLoading}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-rose-950 text-rose-300 rounded-lg text-xs flex items-center space-x-1 transition"
                title="Putuskan koneksi Google Drive"
              >
                <LogOut className="w-3 h-3" />
                <span>Keluar</span>
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={driveSearch}
              onChange={(e) => setDriveSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  fetchFiles(driveToken, driveSearch);
                }
              }}
              placeholder={searchPlaceholder}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-20 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <button
              type="button"
              onClick={() => fetchFiles(driveToken, driveSearch)}
              disabled={isLoading}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-medium rounded-lg disabled:opacity-50"
            >
              Cari
            </button>
          </div>

          {/* File List */}
          <div className="border border-slate-800 rounded-xl bg-slate-900/60 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-800 text-[11px] font-semibold text-slate-400 flex flex-wrap items-center justify-between gap-2">
              <span>Daftar File di Google Drive ({displayedFiles.length})</span>
              <div className="flex items-center space-x-3">
                {driveFiles.length > relevantFiles.length && relevantFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllFiles(prev => !prev)}
                    className="text-cyan-400 hover:underline font-normal"
                  >
                    {showAllFiles
                      ? `Filter Spreadsheet/CSV (${relevantFiles.length})`
                      : `Tampilkan semua (${driveFiles.length})`}
                  </button>
                )}
                <span>Klik untuk memuat isi</span>
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/60 no-scrollbar">
              {isLoading ? (
                <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Mengambil daftar file dari Google Drive...</span>
                </div>
              ) : displayedFiles.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 space-y-2.5">
                  <p className="text-slate-400">
                    Tidak ada file Spreadsheet, Excel, CSV, atau JSON ditemukan di Google Drive Anda.
                  </p>
                  <button
                    type="button"
                    onClick={onSwitchToLocal}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs font-medium transition"
                  >
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>Gunakan Unggah File Lokal (CSV / Excel / JSON)</span>
                  </button>
                </div>
              ) : (
                displayedFiles.map(file => {
                  const isSelected = selectedFileId === file.id;
                  const isFileLoading = loadingFileId === file.id;
                  const mimeLower = (file.mimeType || '').toLowerCase();
                  const isGoogleSheet = mimeLower === 'application/vnd.google-apps.spreadsheet';
                  const isGoogleDoc = mimeLower === 'application/vnd.google-apps.document';
                  const isExcel = !isGoogleSheet && isExcelMimeOrName(mimeLower, file.name);
                  const isJson = mimeLower.includes('json') || file.name.toLowerCase().endsWith('.json');

                  return (
                    <div
                      key={file.id}
                      onClick={() => {
                        if (!loadingFileId) handleSelectFile(file);
                      }}
                      className={`p-2.5 flex items-center justify-between cursor-pointer transition ${
                        isSelected
                          ? 'bg-cyan-950/40 border-l-4 border-cyan-400'
                          : 'hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 truncate mr-2">
                        <div className="p-1.5 bg-slate-800 rounded-lg shrink-0">
                          {isGoogleSheet || isExcel ? (
                            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                          ) : isJson ? (
                            <FileCode className="w-4 h-4 text-amber-400" />
                          ) : isGoogleDoc ? (
                            <FileText className="w-4 h-4 text-blue-400" />
                          ) : (
                            <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                          )}
                        </div>
                        <div className="truncate">
                          <div className="text-xs font-semibold text-white truncate flex items-center space-x-1.5">
                            <span className="truncate">{file.name}</span>
                            {isGoogleSheet && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded font-normal shrink-0">
                                Google Sheets
                              </span>
                            )}
                            {isExcel && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-300 rounded font-normal shrink-0">
                                Excel
                              </span>
                            )}
                            {isGoogleDoc && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded font-normal shrink-0">
                                Google Docs
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center space-x-2">
                            {file.modifiedTime && (
                              <span>
                                Diubah: {new Date(file.modifiedTime).toLocaleDateString('id-ID')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={Boolean(loadingFileId)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 flex items-center space-x-1 ${
                          isSelected
                            ? 'bg-cyan-500 text-slate-950 font-bold'
                            : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                        }`}
                      >
                        {isFileLoading ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Memuat...</span>
                          </>
                        ) : (
                          <>
                            <span>{isSelected ? 'Terpilih' : 'Muat File'}</span>
                            <ArrowRight className="w-3 h-3" />
                          </>
                        )}
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
  );
};
