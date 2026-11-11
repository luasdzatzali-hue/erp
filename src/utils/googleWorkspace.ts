import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App singleton
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

const provider = new GoogleAuthProvider();
SCOPES.forEach(scope => provider.addScope(scope));

// Flags & in-memory token cache (Do NOT store in localStorage per security guidelines)
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Token might not be directly available on page refresh without popup
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan token akses dari Google OAuth');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    const errorCode = error?.code || '';
    // Gracefully handle user cancellation / closed popup without logging console.error
    if (
      errorCode === 'auth/popup-closed-by-user' ||
      errorCode === 'auth/cancelled-popup-request' ||
      errorCode === 'auth/user-cancelled'
    ) {
      // User closed the popup window voluntarily, no error or warning needed
      return null;
    }

    if (errorCode === 'auth/popup-blocked') {
      console.warn('Google Sign-In popup diblokir oleh browser.');
      throw new Error('Jendela popup login diblokir oleh browser. Harap izinkan popup di pengaturan browser Anda.');
    }

    if (errorCode === 'auth/network-request-failed') {
      console.warn('Google Sign-In gagal: masalah jaringan.');
      throw new Error('Koneksi internet bermasalah saat login dengan Google. Silakan periksa jaringan Anda.');
    }

    console.warn('Google Sign-In notice:', error?.message || error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const googleLogout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
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

export const listDriveFiles = async (
  token: string,
  searchQuery?: string
): Promise<DriveFileItem[]> => {
  try {
    let q = "trashed = false";
    if (searchQuery && searchQuery.trim()) {
      const cleanQ = searchQuery.replace(/'/g, "\\'");
      q += ` and name contains '${cleanQ}'`;
    }

    const fields = 'files(id,name,mimeType,size,modifiedTime,iconLink)';
    const queryParams = `q=${encodeURIComponent(
      q
    )}&orderBy=modifiedTime desc&pageSize=50&fields=${encodeURIComponent(fields)}`;

    // Try proxy route first to avoid browser CORS/iframe restrictions, then fallback to direct
    let res: Response | null = null;
    try {
      res = await fetch(`/api/google-drive/files?${queryParams}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    } catch {
      // If local proxy failed, attempt direct Google API endpoint
      try {
        res = await fetch(`https://www.googleapis.com/drive/v3/files?${queryParams}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
      } catch (directErr: any) {
        throw new Error(
          'Tidak dapat terhubung ke Google Drive (pembatasan CORS / jaringan browser). Silakan gunakan tab Unggah File Lokal untuk mengimpor CSV atau JSON.'
        );
      }
    }

    if (!res || !res.ok) {
      const errJson = await res?.json().catch(() => ({}));
      const errMsg = errJson?.error?.message || `HTTP ${res?.status || '500'}: Gagal mengambil daftar file dari Google Drive`;
      throw new Error(errMsg);
    }

    const data = await res.json();
    return data.files || [];
  } catch (err: any) {
    console.warn('listDriveFiles error:', err);
    throw err;
  }
};

export const readDriveFileContent = async (
  token: string,
  fileId: string,
  mimeType?: string
): Promise<string> => {
  try {
    const isSpreadsheet = mimeType === 'application/vnd.google-apps.spreadsheet';
    const subPath = isSpreadsheet ? `${fileId}/export?mimeType=text/csv` : `${fileId}?alt=media`;

    let res: Response | null = null;
    try {
      res = await fetch(`/api/google-drive/files/${subPath}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    } catch {
      try {
        const directUrl = isSpreadsheet
          ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`
          : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        res = await fetch(directUrl, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
      } catch (directErr: any) {
        throw new Error(
          'Gagal mengunduh isi file dari Google Drive (pembatasan jaringan browser). Silakan unggah file secara langsung dari tab Penyimpanan Lokal.'
        );
      }
    }

    if (!res || !res.ok) {
      const errText = await res?.text().catch(() => '');
      throw new Error(`HTTP ${res?.status || '500'}: Gagal mengunduh isi file dari Google Drive (${errText})`);
    }

    const content = await res.text();
    return content;
  } catch (err: any) {
    console.warn('readDriveFileContent error:', err);
    throw err;
  }
};
