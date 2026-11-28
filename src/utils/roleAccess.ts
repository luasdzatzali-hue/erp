import {
  AppState,
  EffectiveRoleResolution,
  ShiftNumber,
  UserRole,
  WorkspaceAccessConfig
} from '../types';
import { normalizeEmail } from './security';
import { getCurrentShift } from './shifts';

export interface ResolveEffectiveRoleContext {
  firebaseUserEmail?: string | null;
  firebaseUid?: string | null;
  cloudAuthRole?: UserRole | null;
  workspaceAccessConfig?: WorkspaceAccessConfig | null;
}

export type RoleResolvableState = Pick<
  AppState,
  | 'currentUserRole'
  | 'currentAdminUser'
  | 'adminGoogleEmails'
  | 'workspaceAccessConfig'
  | 'cloudOwnerUid'
  | 'cloudWorkspaceId'
>;

export function buildWorkspaceAccessConfigFromState(
  state: Pick<
    AppState,
    | 'cloudWorkspaceId'
    | 'cloudOwnerUid'
    | 'adminGoogleEmails'
    | 'registeredOperators'
    | 'registeredManagement'
    | 'workspaceAccessConfig'
  >
): WorkspaceAccessConfig {
  if (state.workspaceAccessConfig) {
    return state.workspaceAccessConfig;
  }

  return {
    workspaceId: state.cloudWorkspaceId,
    ownerUid: state.cloudOwnerUid,
    adminEmails: (state.adminGoogleEmails || []).map(normalizeEmail).filter(Boolean),
    operatorEmails: (state.registeredOperators || [])
      .filter(op => op.status === 'ACTIVE' && op.email)
      .map(op => normalizeEmail(op.email || ''))
      .filter(Boolean),
    managementEmails: (state.registeredManagement || [])
      .filter(m => m.hasViewAccess && m.email)
      .map(m => normalizeEmail(m.email))
      .filter(Boolean)
  };
}

/**
 * Single source of truth for effective RBAC resolution.
 *
 * If an administrator authenticates using only a local PIN without a verified
 * Google Admin email registered in WorkspaceAccessConfig, the role resolves to
 * `OFFLINE_PIN_ADMIN` with `canWriteCloudMaster: false`.
 */
export function resolveEffectiveRole(
  state: RoleResolvableState,
  context?: ResolveEffectiveRoleContext
): EffectiveRoleResolution {
  const accessConfig = context?.workspaceAccessConfig ?? state.workspaceAccessConfig;
  const rawAdminEmails = Array.isArray(accessConfig?.adminEmails)
    ? accessConfig.adminEmails
    : state.adminGoogleEmails || [];

  const registeredAdminEmails = new Set(
    rawAdminEmails.map(e => normalizeEmail(e)).filter(Boolean)
  );
  const ownerUid = accessConfig?.ownerUid || state.cloudOwnerUid;

  const hasLiveFirebaseContext =
    context !== undefined &&
    (context.firebaseUserEmail !== undefined ||
      context.firebaseUid !== undefined ||
      context.cloudAuthRole !== undefined);

  const candidateEmail = hasLiveFirebaseContext
    ? normalizeEmail(context?.firebaseUserEmail || '')
    : normalizeEmail(state.currentAdminUser?.email || '');

  const isEmailRegisteredAdmin = Boolean(
    candidateEmail && registeredAdminEmails.has(candidateEmail)
  );
  const isOwnerMatch = Boolean(
    hasLiveFirebaseContext && context?.firebaseUid && ownerUid && context.firebaseUid === ownerUid
  );
  const isCloudVerifiedAdmin = Boolean(
    hasLiveFirebaseContext &&
      context?.cloudAuthRole === 'ADMINISTRATOR' &&
      Boolean(candidateEmail || isOwnerMatch)
  );

  const hasRegisteredGoogleAdminEmail = Boolean(
    isEmailRegisteredAdmin || isOwnerMatch || isCloudVerifiedAdmin
  );

  const baseRole: UserRole = state.currentUserRole || 'OPERATOR';

  if (baseRole === 'MANAGEMENT') {
    return {
      role: 'MANAGEMENT',
      isAdmin: false,
      isCloudAdmin: false,
      isOfflinePinAdmin: false,
      isOperator: false,
      isManagement: true,
      canWriteCloudMaster: false,
      canWriteCloudOperations: false,
      hasRegisteredGoogleAdminEmail,
      activeGoogleEmail: candidateEmail || undefined
    };
  }

  if (baseRole === 'OPERATOR') {
    return {
      role: 'OPERATOR',
      isAdmin: false,
      isCloudAdmin: false,
      isOfflinePinAdmin: false,
      isOperator: true,
      isManagement: false,
      canWriteCloudMaster: false,
      canWriteCloudOperations: hasLiveFirebaseContext
        ? context?.cloudAuthRole === 'ADMINISTRATOR' || context?.cloudAuthRole === 'OPERATOR'
        : true,
      hasRegisteredGoogleAdminEmail,
      activeGoogleEmail: candidateEmail || undefined
    };
  }

  if (baseRole === 'SUPERVISOR' || baseRole === 'UNIT_HEAD') {
    return {
      role: baseRole,
      isAdmin: false,
      isCloudAdmin: hasRegisteredGoogleAdminEmail,
      isOfflinePinAdmin: false,
      isOperator: false,
      isManagement: false,
      canWriteCloudMaster: hasRegisteredGoogleAdminEmail,
      canWriteCloudOperations: hasLiveFirebaseContext
        ? context?.cloudAuthRole === 'ADMINISTRATOR' || context?.cloudAuthRole === 'OPERATOR'
        : true,
      hasRegisteredGoogleAdminEmail,
      activeGoogleEmail: candidateEmail || undefined
    };
  }

  if (baseRole === 'OFFLINE_PIN_ADMIN') {
    return {
      role: 'OFFLINE_PIN_ADMIN',
      isAdmin: true,
      isCloudAdmin: false,
      isOfflinePinAdmin: true,
      isOperator: false,
      isManagement: false,
      canWriteCloudMaster: false,
      canWriteCloudOperations: hasLiveFirebaseContext
        ? context?.cloudAuthRole === 'OPERATOR'
        : false,
      hasRegisteredGoogleAdminEmail: false,
      activeGoogleEmail: candidateEmail || undefined
    };
  }

  // baseRole === 'ADMINISTRATOR'
  if (hasRegisteredGoogleAdminEmail) {
    return {
      role: 'ADMINISTRATOR',
      isAdmin: true,
      isCloudAdmin: true,
      isOfflinePinAdmin: false,
      isOperator: false,
      isManagement: false,
      canWriteCloudMaster: true,
      canWriteCloudOperations: true,
      hasRegisteredGoogleAdminEmail: true,
      activeGoogleEmail: candidateEmail || undefined
    };
  }

  // Fallback: entered Admin mode via local PIN without a registered Google Admin email
  return {
    role: 'OFFLINE_PIN_ADMIN',
    isAdmin: true,
    isCloudAdmin: false,
    isOfflinePinAdmin: true,
    isOperator: false,
    isManagement: false,
    canWriteCloudMaster: false,
    canWriteCloudOperations: hasLiveFirebaseContext
      ? context?.cloudAuthRole === 'OPERATOR'
      : false,
    hasRegisteredGoogleAdminEmail: false,
    activeGoogleEmail: candidateEmail || undefined
  };
}

export type ShiftMutationOperation =
  | 'INPUT'
  | 'EDIT_TRANSACTION'
  | 'DELETE_TRANSACTION'
  | 'EDIT_DOWNTIME'
  | 'DELETE_DOWNTIME'
  | 'OVERRIDE';

export interface ShiftMutationPermissionResult {
  allowed: boolean;
  isClosedShift: boolean;
  requiresReasonNote: boolean;
  denialReason?: string;
}

export function isSupervisoryOrAdminRole(role: UserRole): boolean {
  return (
    role === 'ADMINISTRATOR' ||
    role === 'OFFLINE_PIN_ADMIN' ||
    role === 'SUPERVISOR' ||
    role === 'UNIT_HEAD'
  );
}

export function canModifyMasterBom(
  effective: Pick<EffectiveRoleResolution, 'role' | 'isAdmin' | 'isOperator' | 'isManagement'>
): boolean {
  if (effective.isManagement || effective.role === 'MANAGEMENT') return false;
  if (effective.isOperator || effective.role === 'OPERATOR') return false;
  return effective.isAdmin || effective.role === 'ADMINISTRATOR' || effective.role === 'OFFLINE_PIN_ADMIN';
}

export function canMutateShiftRecord(params: {
  effectiveRole: Pick<EffectiveRoleResolution, 'role' | 'isOperator' | 'isManagement' | 'isAdmin'>;
  operation: ShiftMutationOperation;
  recordDate?: string;
  recordShift?: ShiftNumber;
  reasonNote?: string;
  now?: Date;
  activeDateStr?: string;
  activeShift?: ShiftNumber;
}): ShiftMutationPermissionResult {
  const { effectiveRole, operation, recordDate, recordShift, reasonNote } = params;
  const nowDate = params.now ?? new Date();
  const currentDate = params.activeDateStr || nowDate.toISOString().slice(0, 10);
  const currentShift = params.activeShift || getCurrentShift(nowDate).shift;

  const isClosedByDate = Boolean(recordDate && recordDate !== currentDate);
  const isClosedByShift = Boolean(recordShift && recordShift !== currentShift);
  const isClosedShift = isClosedByDate || isClosedByShift;

  if (effectiveRole.isManagement || effectiveRole.role === 'MANAGEMENT') {
    return {
      allowed: false,
      isClosedShift,
      requiresReasonNote: false,
      denialReason: 'Akses ditolak: Akun Management hanya memiliki izin lihat (Read-Only).'
    };
  }

  if (effectiveRole.isOperator || effectiveRole.role === 'OPERATOR') {
    if (isClosedShift) {
      return {
        allowed: false,
        isClosedShift: true,
        requiresReasonNote: false,
        denialReason:
          'Akses ditolak: Operator dilarang mengedit atau menghapus data shift yang sudah tertutup. Hubungi Supervisor, Unit Head, atau Administrator.'
      };
    }
    if (operation === 'DELETE_DOWNTIME' || operation === 'EDIT_DOWNTIME' || operation === 'OVERRIDE') {
      return {
        allowed: false,
        isClosedShift,
        requiresReasonNote: false,
        denialReason:
          'Akses ditolak: Perubahan atau penghapusan log downtime OEE / override hanya dapat dilakukan oleh Supervisor, Unit Head, atau Administrator.'
      };
    }
    return {
      allowed: true,
      isClosedShift: false,
      requiresReasonNote: false
    };
  }

  // ADMINISTRATOR / OFFLINE_PIN_ADMIN / SUPERVISOR / UNIT_HEAD
  const requiresReasonNote =
    isClosedShift ||
    operation === 'EDIT_TRANSACTION' ||
    operation === 'DELETE_TRANSACTION' ||
    operation === 'EDIT_DOWNTIME' ||
    operation === 'DELETE_DOWNTIME' ||
    operation === 'OVERRIDE';

  if (requiresReasonNote && (!reasonNote || reasonNote.trim().length < 3)) {
    return {
      allowed: false,
      isClosedShift,
      requiresReasonNote: true,
      denialReason:
        'Catatan alasan wajib diisi (minimal 3 karakter) untuk koreksi data shift, override, atau edit/hapus log OEE.'
    };
  }

  return {
    allowed: true,
    isClosedShift,
    requiresReasonNote
  };
}

