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

export function isExcelMimeOrName(mimeType?: string, fileName?: string): boolean {
  const mime = (mimeType || '').toLowerCase();
  const name = (fileName || '').toLowerCase();
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

function convertExcelArrayBufferToCsv(buffer: ArrayBuffer): string {
  const workbook = XLSX.read(buffer, { type: 'array' });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new DriveApiError('File Excel tidak memiliki sheet/lembar kerja.');
  }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv && csv.trim().length > 0) {
      return csv.replace(/^\uFEFF/, '');
    }
  }

  throw new DriveApiError('Seluruh sheet pada file Excel kosong.');
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
  if (isExcelMimeOrName(file.type, file.name)) {
    const buffer = await file.arrayBuffer();
    return convertExcelArrayBufferToCsv(buffer);
  }
  const text = await file.text();
  return text.replace(/^\uFEFF/, '');
}
