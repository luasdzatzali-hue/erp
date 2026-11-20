import { SecurityAuditLog, UserRole } from '../types';

const PBKDF2_PREFIX = 'pbkdf2_sha256';
const PBKDF2_ITERATIONS = 210000;

const COMMON_BREACHED_PASSWORDS = new Set([
  'password',
  'password123',
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  '87654321',
  'admin123',
  'admin1234',
  'administrator',
  'qwerty123',
  'qwertyui',
  'abc12345',
  'iloveyou',
  'letmein1',
  'welcome1',
  'prodtrack',
  '00000000',
  '11111111'
]);

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function isHashedSecret(value?: string | null): boolean {
  return typeof value === 'string' && value.startsWith(`${PBKDF2_PREFIX}$`);
}

export async function hashPasswordSlow(password: string): Promise<string> {
  const clean = password.trim();
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const salt = new Uint8Array(16);
    window.crypto.getRandomValues(salt);
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(clean),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const derived = await window.crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );
    const hashHex = bytesToHex(new Uint8Array(derived));
    return `${PBKDF2_PREFIX}$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${hashHex}`;
  }
  throw new Error('Web Crypto API tidak tersedia untuk hashing password yang aman.');
}

export async function verifyPasswordSlow(input: string, stored: string): Promise<boolean> {
  const cleanInput = input.trim();
  if (!cleanInput || !stored) return false;

  if (isHashedSecret(stored)) {
    const parts = stored.split('$');
    if (parts.length !== 4) return false;
    const iterations = Number(parts[1]);
    const saltHex = parts[2];
    const expectedHashHex = parts[3];
    if (!Number.isFinite(iterations) || iterations < 10000 || !saltHex || !expectedHashHex) {
      return false;
    }

    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(cleanInput),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const salt = hexToBytes(saltHex);
    const derived = await window.crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt.buffer as ArrayBuffer,
        iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );
    const actualHex = bytesToHex(new Uint8Array(derived));
    return constantTimeEqual(actualHex, expectedHashHex);
  }

  // Legacy plaintext compatibility with constant-time comparison
  return constantTimeEqual(cleanInput, stored);
}

export function validatePasswordStrength(pwd: string): { isValid: boolean; message?: string } {
  const clean = pwd.trim();
  if (clean.length < 8) {
    return { isValid: false, message: 'Password/PIN keamanan minimal harus 8 karakter.' };
  }
  if (clean.length > 128) {
    return { isValid: false, message: 'Password/PIN maksimal 128 karakter.' };
  }
  const lower = clean.toLowerCase();
  if (COMMON_BREACHED_PASSWORDS.has(lower)) {
    return {
      isValid: false,
      message: 'Password/PIN ini terlalu umum dan masuk daftar kata sandi bocor. Gunakan kombinasi yang lebih unik.'
    };
  }
  if (/^(.)\1+$/.test(clean)) {
    return {
      isValid: false,
      message: 'Password/PIN tidak boleh hanya berisi karakter berulang yang sama.'
    };
  }
  return { isValid: true };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, 160);
}

export function sanitizeTextInput(value: string, maxLength = 120): string {
  return value
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, maxLength);
}

export async function computeEmailLookupId(email: string): Promise<string> {
  const normalized = normalizeEmail(email);
  const enc = new TextEncoder();
  const digest = await window.crypto.subtle.digest('SHA-256', enc.encode(normalized));
  return bytesToHex(new Uint8Array(digest));
}

export function enforceHttpsTransport(): void {
  if (typeof window === 'undefined') return;
  const { protocol, hostname, host, pathname, search, hash } = window.location;
  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local');
  if (protocol === 'http:' && !isLocal) {
    window.location.replace(`https://${host}${pathname}${search}${hash}`);
  }
}

export function createSecurityAuditEntry(params: {
  eventType: SecurityAuditLog['eventType'];
  userEmail: string;
  role: UserRole;
  notes?: string;
}): SecurityAuditLog {
  return {
    id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    eventType: params.eventType,
    userEmail: normalizeEmail(params.userEmail || 'anonymous'),
    role: params.role,
    ipOrDevice: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 80) : 'web',
    notes: params.notes ? sanitizeTextInput(params.notes, 200) : undefined
  };
}
