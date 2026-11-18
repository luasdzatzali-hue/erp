import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut
} from 'firebase/auth';
import * as XLSX from 'xlsx';
import firebaseConfig from '../../firebase-applet-config.json';

// Reuse existing Firebase App singleton (per Firebase & Workspace integration guidelines)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

const PENDING_DRIVE_REDIRECT_KEY = 'prodtrack_pending_drive_oauth_v1';

function createDriveOAuthProvider(forceAccountSelect = true): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  SCOPES.forEach(scope => provider.addScope(scope));
  provider.setCustomParameters({
    prompt: forceAccountSelect ? 'select_account consent' : 'consent',
    include_granted_scopes: 'true'
  });
  return provider;
}

export class DriveApiError extends Error {
  isAuthError: boolean;
  isPopupBlocked: boolean;
  status?: number;

  constructor(
    message: string,
    options?: { isAuthError?: boolean; isPopupBlocked?: boolean; status?: number }
  ) {
    super(message);
    this.name = 'DriveApiError';
    this.isAuthError = Boolean(options?.isAuthError);
    this.isPopupBlocked = Boolean(options?.isPopupBlocked);
    this.status = options?.status;
  }
}

export function isDriveAuthError(err: unknown): boolean {
  return Boolean((err as any)?.isAuthError);
}

export function isDrivePopupBlockedError(err: unknown): boolean {
  return Boolean((err as any)?.isPopupBlocked);
}

// In-memory token & user email cache (NEVER persist OAuth access tokens to Web Storage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedDriveEmail: string | null = null;

export const setWorkspaceDriveToken = (token: string | null, email?: string | null) => {
  cachedAccessToken = token;
  if (email !== undefined) {
    cachedDriveEmail = email;
  }
};

export const getDriveUserEmail = (): string | null => {
  return cachedDriveEmail || auth.currentUser?.email || null;
};

export const consumePendingDriveRedirectFlag = (): boolean => {
  if (typeof window === 'undefined' || !window.sessionStorage) return false;
  const flag = window.sessionStorage.getItem(PENDING_DRIVE_REDIRECT_KEY) === '1';
  if (flag) {
    window.sessionStorage.removeItem(PENDING_DRIVE_REDIRECT_KEY);
  }
  return flag;
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      cachedDriveEmail = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (
  forceAccountSelect = true
): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const provider = createDriveOAuthProvider(forceAccountSelect);
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new DriveApiError(
        'Gagal mendapatkan token akses Google Drive. Silakan coba masuk kembali dan pastikan Anda menyetujui izin akses Google Drive.',
        { isAuthError: true }
      );
    }

    cachedAccessToken = credential.accessToken;
    cachedDriveEmail = result.user.email || cachedDriveEmail;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    const errorCode = String(error?.code || '');

    if (
      errorCode === 'auth/popup-closed-by-user' ||
      errorCode === 'auth/cancelled-popup-request' ||
      errorCode === 'auth/user-cancelled'
    ) {
      return null;
    }

    if (
      errorCode === 'auth/popup-blocked' ||
      errorCode === 'auth/operation-not-supported-in-this-environment' ||
      errorCode === 'auth/web-storage-unsupported'
    ) {
      throw new DriveApiError(
        'Popup login Google Drive diblokir atau dibatasi oleh browser. Izinkan popup atau gunakan tombol "Hubungkan via Redirect" di bawah.',
        { isPopupBlocked: true }
      );
    }

    if (errorCode === 'auth/unauthorized-domain') {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'domain ini';
      throw new DriveApiError(
        `Domain "${host}" belum terdaftar di Firebase Console → Authentication → Settings → Authorized domains.`
      );
    }

    if (errorCode === 'auth/network-request-failed') {
      throw new DriveApiError(
        'Koneksi internet bermasalah saat menghubungi Google OAuth. Periksa koneksi Anda lalu coba lagi.'
      );
    }

    if (error instanceof DriveApiError) {
      throw error;
    }

    console.warn('Google Drive Sign-In notice:', error?.message || error);
    throw new DriveApiError(error?.message || 'Gagal menghubungkan akun Google Drive');
  } finally {
    isSigningIn = false;
  }
};

export const googleSignInRedirect = async (): Promise<void> => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(PENDING_DRIVE_REDIRECT_KEY, '1');
    }
    const provider = createDriveOAuthProvider(true);
    await signInWithRedirect(auth, provider);
  } catch (error: any) {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(PENDING_DRIVE_REDIRECT_KEY);
    }
    const errorCode = String(error?.code || '');
    if (errorCode === 'auth/unauthorized-domain') {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'domain ini';
      throw new DriveApiError(
        `Domain "${host}" belum terdaftar di Firebase Console → Authentication → Settings → Authorized domains.`
      );
    }
    throw new DriveApiError(error?.message || 'Gagal memulai redirect Google Drive OAuth');
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const clearWorkspaceDriveToken = () => {
  cachedAccessToken = null;
  cachedDriveEmail = null;
};

export const googleLogout = async () => {
  await signOut(auth);
  clearWorkspaceDriveToken();
};

// Google Drive API Helpers
export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  iconLink?: string;
}

function parseDriveApiErrorPayload(rawText: string, status: number): DriveApiError {
  let errJson: any = null;
  try {
    errJson = JSON.parse(rawText);
  } catch {
    errJson = null;
  }

  const googleMsg = errJson?.error?.message || '';
  const reason = errJson?.error?.errors?.[0]?.reason || '';
  const statusStr = String(errJson?.error?.status || '');

  if (status === 401 || statusStr === 'UNAUTHENTICATED') {
    clearWorkspaceDriveToken();
    return new DriveApiError(
      'Sesi Google Drive telah berakhir (Token kedaluwarsa). Silakan klik "Masuk dengan Google Drive" untuk menghubungkan ulang.',
      { isAuthError: true, status }
    );
  }

  if (
    status === 403 &&
    (reason === 'insufficientPermissions' ||
      reason === 'insufficientScopes' ||
      googleMsg.toLowerCase().includes('insufficient') ||
      googleMsg.toLowerCase().includes('scope'))
  ) {
    clearWorkspaceDriveToken();
    return new DriveApiError(
      'Izin akses Google Drive (drive.readonly) belum disetujui. Silakan hubungkan ulang akun Google Anda dan centang kotak izin baca Google Drive.',
      { isAuthError: true, status }
    );
  }

  if (status === 403 && (reason === 'accessNotConfigured' || googleMsg.includes('API has not been used'))) {
    return new DriveApiError(
      'Google Drive API belum diaktifkan di Google Cloud Project aplikasi ini. Hubungi administrator sistem atau gunakan unggah file lokal sementara.',
      { status }
    );
  }

  if (status === 404) {
    return new DriveApiError(
      'File tidak ditemukan atau akses ke file tersebut telah dihapus dari Google Drive.',
      { status }
    );
  }

  return new DriveApiError(
    googleMsg
      ? `Google Drive Error (${status}): ${googleMsg}`
      : `HTTP ${status}: Gagal berkomunikasi dengan Google Drive`,
    { status }
  );
}

export const listDriveFiles = async (
  token: string,
  searchQuery?: string
): Promise<DriveFileItem[]> => {
  if (!token) {
    throw new DriveApiError('Token Google Drive tidak tersedia. Silakan login ulang.', { isAuthError: true });
  }

  let q = "trashed = false and mimeType != 'application/vnd.google-apps.folder'";
  if (searchQuery && searchQuery.trim()) {
    const cleanQ = searchQuery.trim().replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    q += ` and name contains '${cleanQ}'`;
  }

  const fields = 'files(id,name,mimeType,size,modifiedTime,iconLink)';
  const params = new URLSearchParams({
    q,
    orderBy: 'modifiedTime desc',
    pageSize: '60',
    fields,
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true'
  });

  // Always call Google Drive v3 directly (supports browser CORS with OAuth Bearer token, works identically in dev & deployed Vercel)
  let res: Response;
  try {
    res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch {
    throw new DriveApiError(
      'Tidak dapat menghubungi Google Drive API. Periksa koneksi internet atau ekstensi pemblokir iklan di browser Anda.'
    );
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw parseDriveApiErrorPayload(errText, res.status);
  }

  if (contentType.includes('text/html')) {
    throw new DriveApiError(
      'Respons tidak valid dari server (menerima HTML alih-alih data Google Drive JSON).'
    );
  }

  const data = await res.json();
  return Array.isArray(data?.files) ? data.files : [];
};

function getXlsxApi(): any {
  const mod: any = XLSX as any;
  if (mod?.read && mod?.utils) return mod;
  if (mod?.default?.read && mod?.default?.utils) return mod.default;
  return mod;
}

const TEXT_EXTENSIONS = ['.csv', '.tsv', '.txt', '.json', '.ndjson'];
const TEXT_MIMES = [
  'text/csv',
  'text/plain',
  'text/tab-separated-values',
  'application/json',
  'text/json'
];

export function isExplicitTextBomFile(mimeType?: string, fileName?: string): boolean {
  const mime = (mimeType || '').toLowerCase().trim();
  const name = (fileName || '').toLowerCase().trim();
  if (TEXT_EXTENSIONS.some(ext => name.endsWith(ext))) {
    return true;
  }
  return TEXT_MIMES.some(t => mime === t || mime.startsWith(`${t};`));
}

export function isExcelMimeOrName(mimeType?: string, fileName?: string): boolean {
  // CRITICAL: On Windows with Microsoft Excel installed, `.csv` files are often
  // reported by the OS/browser with `file.type === 'application/vnd.ms-excel'`.
  // Always honor explicit text file extensions first so CSV/TSV/JSON/TXT are never
  // mangled through binary Excel parsing.
  if (isExplicitTextBomFile(mimeType, fileName)) {
    return false;
  }

  const mime = (mimeType || '').toLowerCase().trim();
  const name = (fileName || '').toLowerCase().trim();
  return (
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.ms-excel.sheet.macroenabled.12' ||
    mime === 'application/vnd.oasis.opendocument.spreadsheet' ||
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.xlsm') ||
    name.endsWith('.xlsb') ||
    name.endsWith('.ods')
  );
}

function decodeTextBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) return '';

  // UTF-16 LE BOM (FF FE) - common from Excel "Unicode Text (*.txt)"
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes).replace(/^\uFEFF/, '');
  }
  // UTF-16 BE BOM (FE FF)
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes).replace(/^\uFEFF/, '');
  }
  // UTF-8 BOM (EF BB BF) or standard UTF-8
  return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
}

function looksLikePlainTextBuffer(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) return false;
  // ZIP magic header (PK\x03\x04) or OLE2 Compound File (.xls) magic (D0 CF 11 E0)
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return false;
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    return false;
  }
  // Check first 512 bytes for unexpected NUL bytes (unless UTF-16 BOM)
  if (
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xff)
  ) {
    return true;
  }
  const sampleLen = Math.min(bytes.length, 512);
  let nulCount = 0;
  for (let i = 0; i < sampleLen; i++) {
    if (bytes[i] === 0) nulCount++;
  }
  return nulCount === 0;
}

function hasMultipleNonEmptyCellsPerRow(csv: string): boolean {
  const lines = csv
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && l.replace(/[,;\t]/g, '').trim().length > 0);
  if (lines.length < 2) return false;
  return lines.some(ln => ln.split(',').filter(c => c.trim().length > 0).length >= 2);
}

function cleanExcelCsvOutput(rawCsv: string): string {
  const cleanedLines = rawCsv
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(line => {
      const stripped = line.replace(/[,"'\s]/g, '');
      return stripped.length > 0;
    });
  return cleanedLines.join('\n');
}

function convertExcelArrayBufferToCsv(buffer: ArrayBuffer): string {
  const xlsxApi = getXlsxApi();
  try {
    const workbook = xlsxApi.read(buffer, { type: 'array' });
    if (!workbook?.SheetNames || workbook.SheetNames.length === 0) {
      throw new DriveApiError('File Excel tidak memiliki sheet/lembar kerja.');
    }

    let firstNonEmptyCsv = '';
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const rawCsv = xlsxApi.utils.sheet_to_csv(sheet, { blankrows: false });
      const cleaned = cleanExcelCsvOutput(rawCsv || '');
      if (cleaned.trim().length > 0) {
        if (!firstNonEmptyCsv) firstNonEmptyCsv = cleaned;
        if (hasMultipleNonEmptyCellsPerRow(cleaned)) {
          return cleaned;
        }
      }
    }

    if (firstNonEmptyCsv) {
      return firstNonEmptyCsv;
    }
    throw new DriveApiError('Seluruh sheet pada file Excel kosong.');
  } catch (err: any) {
    // Some Indonesian ERP exports save plain CSV/TSV text with a `.xls` extension
    if (looksLikePlainTextBuffer(buffer)) {
      const fallbackText = decodeTextBuffer(buffer).trim();
      if (fallbackText.length > 0) {
        return fallbackText;
      }
    }
    if (err instanceof DriveApiError) throw err;
    throw new DriveApiError(
      err?.message
        ? `Gagal membaca file Excel: ${err.message}`
        : 'Format file Excel tidak dapat dibaca. Pastikan file tidak terkunci password atau rusak.'
    );
  }
}

async function resolveShortcutTarget(
  token: string,
  fileId: string
): Promise<{ id: string; mimeType?: string } | null> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=shortcutDetails(targetId,targetMimeType)&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const targetId = data?.shortcutDetails?.targetId;
  const targetMimeType = data?.shortcutDetails?.targetMimeType;
  return targetId ? { id: targetId, mimeType: targetMimeType } : null;
}

export const readDriveFileContent = async (
  token: string,
  fileId: string,
  mimeType?: string,
  fileName?: string
): Promise<string> => {
  if (!token) {
    throw new DriveApiError('Token Google Drive tidak tersedia. Silakan login ulang.', { isAuthError: true });
  }

  const mime = (mimeType || '').toLowerCase();

  // Resolve Google Drive shortcut to its target document
  if (mime === 'application/vnd.google-apps.shortcut') {
    const target = await resolveShortcutTarget(token, fileId);
    if (!target) {
      throw new DriveApiError('Shortcut Google Drive tidak dapat dibuka atau file aslinya tidak dapat diakses.');
    }
    return readDriveFileContent(token, target.id, target.mimeType, fileName);
  }

  const isGoogleSpreadsheet = mime === 'application/vnd.google-apps.spreadsheet';
  const isGoogleDoc = mime === 'application/vnd.google-apps.document';
  const isOtherGoogleApp =
    mime.startsWith('application/vnd.google-apps.') && !isGoogleSpreadsheet && !isGoogleDoc;

  if (isOtherGoogleApp) {
    throw new DriveApiError(
      'Format dokumen Google Workspace ini tidak didukung untuk impor BOM. Gunakan Google Spreadsheet, Google Docs, Excel (.xlsx/.xls), CSV, atau JSON.'
    );
  }

  const isExcel = !isGoogleSpreadsheet && !isGoogleDoc && isExcelMimeOrName(mime, fileName);

  const directUrl = isGoogleSpreadsheet
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/csv`
    : isGoogleDoc
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`
      : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;

  let res: Response;
  try {
    res = await fetch(directUrl, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch {
    throw new DriveApiError(
      'Gagal mengunduh isi file dari Google Drive. Periksa koneksi internet Anda atau coba unggah file lokal.'
    );
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw parseDriveApiErrorPayload(errText, res.status);
  }

  if (isExcel) {
    const buffer = await res.arrayBuffer();
    return convertExcelArrayBufferToCsv(buffer);
  }

  const rawText = await res.text();
  const cleanText = rawText.replace(/^\uFEFF/, '');
  const trimmedLower = cleanText.trim().slice(0, 200).toLowerCase();
  if (trimmedLower.startsWith('<!doctype html') || trimmedLower.startsWith('<html')) {
    throw new DriveApiError(
      'File yang diunduh berupa halaman HTML dan bukan data BOM (CSV/JSON/Spreadsheet).'
    );
  }

  return cleanText;
};

export async function readLocalBomFile(file: File): Promise<string> {
  if (!file) {
    throw new Error('Tidak ada file yang dipilih.');
  }
  if (file.size === 0) {
    throw new Error(`File "${file.name}" kosong (0 byte).`);
  }

  const buffer = await file.arrayBuffer();

  // Check binary Excel / ODS (and ZIP/OLE magic signature in case extension was omitted)
  if (isExcelMimeOrName(file.type, file.name) || !looksLikePlainTextBuffer(buffer)) {
    return convertExcelArrayBufferToCsv(buffer);
  }

  const decoded = decodeTextBuffer(buffer);
  if (!decoded.trim()) {
    throw new Error(`File "${file.name}" tidak memiliki isi teks/data.`);
  }

  // Guard against accidental HTML file disguised as CSV/TXT unless it's an HTML-formatted .xls export
  const headLower = decoded.trim().slice(0, 200).toLowerCase();
  const sampleHtmlLower = decoded.slice(0, 8192).toLowerCase();
  if (
    (headLower.startsWith('<!doctype html') || headLower.startsWith('<html') || headLower.startsWith('<table')) &&
    sampleHtmlLower.includes('<table')
  ) {
    return convertExcelArrayBufferToCsv(buffer);
  }
  if (headLower.startsWith('<!doctype html') || headLower.startsWith('<html')) {
    throw new Error(
      `File "${file.name}" berisi halaman HTML dan bukan data tabel BOM (CSV, Excel, atau JSON).`
    );
  }

  return decoded;
}
