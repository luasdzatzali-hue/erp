import { describe, it, expect } from 'vitest';
import {
  resolveEffectiveRole,
  buildWorkspaceAccessConfigFromState,
  canModifyMasterBom,
  canMutateShiftRecord,
  isSupervisoryOrAdminRole,
  RoleResolvableState,
} from '../roleAccess';

const makeBaseState = (overrides: Partial<RoleResolvableState> = {}): RoleResolvableState => ({
  currentUserRole: 'OPERATOR',
  currentAdminUser: null,
  adminGoogleEmails: ['admin@pabrik.co.id'],
  workspaceAccessConfig: {
    workspaceId: 'ws-main',
    ownerUid: 'uid-owner-1',
    adminEmails: ['admin@pabrik.co.id'],
    operatorEmails: ['operator@pabrik.co.id'],
    managementEmails: ['mgmt@pabrik.co.id'],
  },
  cloudOwnerUid: 'uid-owner-1',
  cloudWorkspaceId: 'ws-main',
  ...overrides,
});

describe('resolveEffectiveRole (single source of truth)', () => {
  it('resolves MANAGEMENT as read-only with zero cloud write capability', () => {
    const state = makeBaseState({ currentUserRole: 'MANAGEMENT' });
    const resolved = resolveEffectiveRole(state);

    expect(resolved.role).toBe('MANAGEMENT');
    expect(resolved.isManagement).toBe(true);
    expect(resolved.isAdmin).toBe(false);
    expect(resolved.canWriteCloudMaster).toBe(false);
    expect(resolved.canWriteCloudOperations).toBe(false);
  });

  it('resolves OPERATOR with operational cloud writes when cloudAuthRole is OPERATOR', () => {
    const state = makeBaseState({ currentUserRole: 'OPERATOR' });
    const resolved = resolveEffectiveRole(state, {
      firebaseUserEmail: 'operator@pabrik.co.id',
      firebaseUid: 'uid-op-1',
      cloudAuthRole: 'OPERATOR',
    });

    expect(resolved.role).toBe('OPERATOR');
    expect(resolved.isOperator).toBe(true);
    expect(resolved.isAdmin).toBe(false);
    expect(resolved.canWriteCloudMaster).toBe(false);
    expect(resolved.canWriteCloudOperations).toBe(true);
  });

  it('blocks OPERATOR operational cloud writes when live Firebase context is MANAGEMENT', () => {
    const state = makeBaseState({ currentUserRole: 'OPERATOR' });
    const resolved = resolveEffectiveRole(state, {
      firebaseUserEmail: 'mgmt@pabrik.co.id',
      firebaseUid: 'uid-mgmt-1',
      cloudAuthRole: 'MANAGEMENT',
    });

    expect(resolved.role).toBe('OPERATOR');
    expect(resolved.canWriteCloudMaster).toBe(false);
    expect(resolved.canWriteCloudOperations).toBe(false);
  });

  it('downgrades local PIN admin without registered Google Admin email to OFFLINE_PIN_ADMIN', () => {
    const state = makeBaseState({
      currentUserRole: 'ADMINISTRATOR',
      currentAdminUser: null,
    });
    const resolved = resolveEffectiveRole(state, {
      firebaseUserEmail: null,
      firebaseUid: null,
      cloudAuthRole: null,
    });

    expect(resolved.role).toBe('OFFLINE_PIN_ADMIN');
    expect(resolved.isAdmin).toBe(true);
    expect(resolved.isOfflinePinAdmin).toBe(true);
    expect(resolved.isCloudAdmin).toBe(false);
    expect(resolved.canWriteCloudMaster).toBe(false);
    expect(resolved.hasRegisteredGoogleAdminEmail).toBe(false);
  });

  it('downgrades PIN admin when signed in with an Operator email instead of Admin email', () => {
    const state = makeBaseState({
      currentUserRole: 'ADMINISTRATOR',
      currentAdminUser: null,
    });
    const resolved = resolveEffectiveRole(state, {
      firebaseUserEmail: 'operator@pabrik.co.id',
      firebaseUid: 'uid-op-1',
      cloudAuthRole: 'OPERATOR',
    });

    expect(resolved.role).toBe('OFFLINE_PIN_ADMIN');
    expect(resolved.isAdmin).toBe(true);
    expect(resolved.isOfflinePinAdmin).toBe(true);
    expect(resolved.canWriteCloudMaster).toBe(false);
    expect(resolved.canWriteCloudOperations).toBe(true);
  });

  it('grants full ADMINISTRATOR and canWriteCloudMaster when Google Admin email matches WorkspaceAccessConfig (case-insensitive)', () => {
    const state = makeBaseState({ currentUserRole: 'ADMINISTRATOR' });
    const resolved = resolveEffectiveRole(state, {
      firebaseUserEmail: 'ADMIN@Pabrik.CO.ID ',
      firebaseUid: 'uid-admin-99',
      cloudAuthRole: 'ADMINISTRATOR',
    });

    expect(resolved.role).toBe('ADMINISTRATOR');
    expect(resolved.isAdmin).toBe(true);
    expect(resolved.isCloudAdmin).toBe(true);
    expect(resolved.isOfflinePinAdmin).toBe(false);
    expect(resolved.canWriteCloudMaster).toBe(true);
    expect(resolved.canWriteCloudOperations).toBe(true);
    expect(resolved.activeGoogleEmail).toBe('admin@pabrik.co.id');
  });

  it('grants full ADMINISTRATOR when Firebase UID matches workspace ownerUid', () => {
    const state = makeBaseState({
      currentUserRole: 'ADMINISTRATOR',
      workspaceAccessConfig: {
        workspaceId: 'ws-main',
        ownerUid: 'uid-owner-1',
        adminEmails: [],
        operatorEmails: [],
        managementEmails: [],
      },
    });
    const resolved = resolveEffectiveRole(state, {
      firebaseUserEmail: 'owner@pabrik.co.id',
      firebaseUid: 'uid-owner-1',
      cloudAuthRole: null,
    });

    expect(resolved.role).toBe('ADMINISTRATOR');
    expect(resolved.canWriteCloudMaster).toBe(true);
  });

  it('never promotes OFFLINE_PIN_ADMIN to cloud master write even if base role is explicit', () => {
    const state = makeBaseState({ currentUserRole: 'OFFLINE_PIN_ADMIN' });
    const resolved = resolveEffectiveRole(state);

    expect(resolved.role).toBe('OFFLINE_PIN_ADMIN');
    expect(resolved.isAdmin).toBe(true);
    expect(resolved.isOfflinePinAdmin).toBe(true);
    expect(resolved.canWriteCloudMaster).toBe(false);
  });

  it('recognizes SUPERVISOR and UNIT_HEAD as supervisory roles distinct from OPERATOR and MANAGEMENT', () => {
    const sup = resolveEffectiveRole(makeBaseState({ currentUserRole: 'SUPERVISOR' }));
    const uh = resolveEffectiveRole(makeBaseState({ currentUserRole: 'UNIT_HEAD' }));

    expect(sup.role).toBe('SUPERVISOR');
    expect(sup.isOperator).toBe(false);
    expect(sup.isManagement).toBe(false);
    expect(uh.role).toBe('UNIT_HEAD');
    expect(isSupervisoryOrAdminRole('SUPERVISOR')).toBe(true);
    expect(isSupervisoryOrAdminRole('UNIT_HEAD')).toBe(true);
    expect(isSupervisoryOrAdminRole('OPERATOR')).toBe(false);
  });
});

describe('Master BOM & Shift Mutation RBAC Guards', () => {
  it('allows Master BOM modification only for Admin roles and blocks Operator/Supervisor/Management', () => {
    const admin = resolveEffectiveRole(makeBaseState({ currentUserRole: 'ADMINISTRATOR' }), {
      firebaseUserEmail: 'admin@pabrik.co.id',
      firebaseUid: 'uid-owner-1',
      cloudAuthRole: 'ADMINISTRATOR',
    });
    const pinAdmin = resolveEffectiveRole(makeBaseState({ currentUserRole: 'OFFLINE_PIN_ADMIN' }));
    const supervisor = resolveEffectiveRole(makeBaseState({ currentUserRole: 'SUPERVISOR' }));
    const operator = resolveEffectiveRole(makeBaseState({ currentUserRole: 'OPERATOR' }));
    const mgmt = resolveEffectiveRole(makeBaseState({ currentUserRole: 'MANAGEMENT' }));

    expect(canModifyMasterBom(admin)).toBe(true);
    expect(canModifyMasterBom(pinAdmin)).toBe(true);
    expect(canModifyMasterBom(supervisor)).toBe(false);
    expect(canModifyMasterBom(operator)).toBe(false);
    expect(canModifyMasterBom(mgmt)).toBe(false);
  });

  it('allows OPERATOR on active date/shift for INPUT & EDIT_TRANSACTION, but blocks closed shifts and OEE downtime edits', () => {
    const operator = resolveEffectiveRole(makeBaseState({ currentUserRole: 'OPERATOR' }));

    const activeEdit = canMutateShiftRecord({
      effectiveRole: operator,
      operation: 'EDIT_TRANSACTION',
      recordDate: '2026-11-28',
      recordShift: 1,
      activeDateStr: '2026-11-28',
      activeShift: 1,
    });
    expect(activeEdit.allowed).toBe(true);
    expect(activeEdit.isClosedShift).toBe(false);

    const closedShiftEdit = canMutateShiftRecord({
      effectiveRole: operator,
      operation: 'EDIT_TRANSACTION',
      recordDate: '2026-11-27',
      recordShift: 1,
      activeDateStr: '2026-11-28',
      activeShift: 1,
    });
    expect(closedShiftEdit.allowed).toBe(false);
    expect(closedShiftEdit.isClosedShift).toBe(true);

    const downtimeDelete = canMutateShiftRecord({
      effectiveRole: operator,
      operation: 'DELETE_DOWNTIME',
      recordDate: '2026-11-28',
      recordShift: 1,
      activeDateStr: '2026-11-28',
      activeShift: 1,
    });
    expect(downtimeDelete.allowed).toBe(false);
  });

  it('requires reasonNote >= 3 chars for SUPERVISOR / UNIT_HEAD / ADMINISTRATOR on closed shifts & OEE downtime mutations', () => {
    const supervisor = resolveEffectiveRole(makeBaseState({ currentUserRole: 'SUPERVISOR' }));

    const missingNote = canMutateShiftRecord({
      effectiveRole: supervisor,
      operation: 'EDIT_DOWNTIME',
      recordDate: '2026-11-27',
      recordShift: 2,
      activeDateStr: '2026-11-28',
      activeShift: 1,
      reasonNote: 'ok',
    });
    expect(missingNote.allowed).toBe(false);
    expect(missingNote.requiresReasonNote).toBe(true);

    const validCorrection = canMutateShiftRecord({
      effectiveRole: supervisor,
      operation: 'EDIT_DOWNTIME',
      recordDate: '2026-11-27',
      recordShift: 2,
      activeDateStr: '2026-11-28',
      activeShift: 1,
      reasonNote: 'Koreksi timer sensor PLC line 1',
    });
    expect(validCorrection.allowed).toBe(true);
    expect(validCorrection.isClosedShift).toBe(true);
    expect(validCorrection.requiresReasonNote).toBe(true);
  });
});

describe('buildWorkspaceAccessConfigFromState', () => {
  it('filters inactive operators and disabled management entries and normalizes emails', () => {
    const config = buildWorkspaceAccessConfigFromState({
      cloudWorkspaceId: 'ws-1',
      cloudOwnerUid: 'owner-1',
      adminGoogleEmails: [' Admin@Pabrik.id ', ''],
      registeredOperators: [
        {
          id: 'op1',
          name: 'Op Active',
          nik: 'OP-001',
          email: ' OP1@Pabrik.id ',
          assignedLine: 'Line A',
          assignedShift: 1,
          status: 'ACTIVE',
          registeredAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'op2',
          name: 'Op Inactive',
          nik: 'OP-002',
          email: 'op2@pabrik.id',
          assignedLine: 'Line B',
          assignedShift: 2,
          status: 'INACTIVE',
          registeredAt: '2026-01-01T00:00:00Z',
        },
      ],
      registeredManagement: [
        {
          id: 'm1',
          name: 'Mgr Allowed',
          email: ' MGR@Pabrik.id ',
          title: 'Factory Manager',
          department: 'Produksi',
          hasViewAccess: true,
          registeredAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'm2',
          name: 'Mgr Revoked',
          email: 'revoked@pabrik.id',
          title: 'Auditor',
          department: 'QA',
          hasViewAccess: false,
          registeredAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    expect(config.adminEmails).toEqual(['admin@pabrik.id']);
    expect(config.operatorEmails).toEqual(['op1@pabrik.id']);
    expect(config.managementEmails).toEqual(['mgr@pabrik.id']);
  });
});

