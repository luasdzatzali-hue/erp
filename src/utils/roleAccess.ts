import {
  AppState,
  EffectiveRoleResolution,
  UserRole,
  WorkspaceAccessConfig
} from '../types';
import { normalizeEmail } from './security';

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
