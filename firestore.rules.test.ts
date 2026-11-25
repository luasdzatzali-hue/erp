/**
 * Dirty Dozen Security Rule Verification Spec for ProdTrack MES Firestore Rules
 * Verifies all 12 adversarial payloads result in PERMISSION_DENIED under firestore.rules.
 */

export const DIRTY_DOZEN_PAYLOADS = [
  {
    id: 1,
    name: 'Unauthenticated Bootstrap Hijack',
    auth: null,
    operation: 'create',
    path: '/system/bootstrap',
    data: { isInitialized: true, ownerUid: 'attacker', factoryName: 'Evil', initializedAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME' },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 2,
    name: 'Duplicate Bootstrap Overwrite',
    auth: { uid: 'attacker_uid', email: 'evil@example.com', email_verified: true },
    operation: 'create',
    path: '/system/bootstrap',
    precondition: 'system/bootstrap already exists',
    data: { isInitialized: true, ownerUid: 'attacker_uid', factoryName: 'Hijacked', initializedAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME' },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 3,
    name: 'Privilege Self-Escalation',
    auth: { uid: 'non_admin_uid', email: 'user@example.com', email_verified: true },
    operation: 'create',
    path: '/admins/non_admin_uid',
    precondition: 'system/bootstrap already exists',
    data: { uid: 'non_admin_uid', email: 'user@example.com', displayName: 'Hacker', factoryName: 'X', role: 'SUPER_ADMIN', createdAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME' },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 4,
    name: 'Unverified Email Spoofing',
    auth: { uid: 'spoof_uid', email: 'luasdzatzali@gmail.com', email_verified: false },
    operation: 'get',
    path: '/workspaces/main/data/master',
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 5,
    name: 'Shadow / Ghost Field Injection',
    auth: { uid: 'admin_uid', email: 'luasdzatzali@gmail.com', email_verified: true },
    operation: 'update',
    path: '/workspaces/main/config/secrets',
    data: { workspaceId: 'main', ownerUid: 'admin_uid', adminPin: '9999', updatedAt: 'SERVER_TIME', updatedByUid: 'admin_uid', ghostField: true },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 6,
    name: 'PIN Exfiltration by Operator',
    auth: { uid: 'op_uid', email: 'op@factory.com', email_verified: true },
    operation: 'get',
    path: '/workspaces/main/config/secrets',
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 7,
    name: 'Master BOM Tampering by Operator',
    auth: { uid: 'op_uid', email: 'op@factory.com', email_verified: true },
    operation: 'update',
    path: '/workspaces/main/data/master',
    data: { skus: [] },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 8,
    name: 'Management Write Attempt',
    auth: { uid: 'mgt_uid', email: 'mgr@factory.com', email_verified: true },
    operation: 'update',
    path: '/workspaces/main/data/operations',
    data: { cartonProductions: [] },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 9,
    name: 'Immutable Owner Spoofing by Operator',
    auth: { uid: 'op_uid', email: 'op@factory.com', email_verified: true },
    operation: 'update',
    path: '/workspaces/main/data/operations',
    data: { ownerUid: 'op_uid' },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 10,
    name: 'Client Timestamp Forgery',
    auth: { uid: 'admin_uid', email: 'luasdzatzali@gmail.com', email_verified: true },
    operation: 'update',
    path: '/workspaces/main/config/secrets',
    data: { workspaceId: 'main', ownerUid: 'admin_uid', adminPin: '5678', updatedAt: '2026-01-01T00:00:00Z', updatedByUid: 'admin_uid' },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 11,
    name: 'Path ID Poisoning',
    auth: { uid: 'admin_uid', email: 'luasdzatzali@gmail.com', email_verified: true },
    operation: 'get',
    path: '/admins/invalid$id!with*symbols',
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 12,
    name: 'Blanket List Scraping & Cross-Tenant Isolation Breach',
    auth: { uid: 'tenant_2_admin_uid', email: 'tenant2@example.com', email_verified: true },
    operation: 'get',
    path: '/workspaces/main/data/master',
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 13,
    name: 'WorkspaceDirectory Enumeration / Cross-Tenant Hijack',
    auth: { uid: 'tenant_2_admin_uid', email: 'tenant2@example.com', email_verified: true },
    operation: 'get',
    path: '/workspaceDirectory/0000000000000000000000000000000000000000000000000000000000000001',
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 14,
    name: 'Operator Mutating Immutable Transaction Document',
    auth: { uid: 'op_uid', email: 'op@factory.com', email_verified: true },
    operation: 'update',
    path: '/workspaces/main/transactions/tx_req_1',
    data: {
      id: 'tx_req_1',
      type: 'REQUEST',
      timestamp: '2026-11-25T00:00:00.000Z',
      actorEmail: 'op@factory.com',
      payload: { qty: 9999 },
      shift: 1,
      skuCode: 'SKU-01'
    },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 15,
    name: 'Operator Deleting Immutable Transaction Document',
    auth: { uid: 'op_uid', email: 'op@factory.com', email_verified: true },
    operation: 'delete',
    path: '/workspaces/main/transactions/tx_req_1',
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 16,
    name: 'Operator Impersonating Another Actor Email on Transaction Create',
    auth: { uid: 'op_uid', email: 'op@factory.com', email_verified: true },
    operation: 'create',
    path: '/workspaces/main/transactions/tx_spoof_1',
    data: {
      id: 'tx_spoof_1',
      type: 'USAGE',
      timestamp: '2026-11-25T00:00:00.000Z',
      actorEmail: 'luasdzatzali@gmail.com',
      payload: { usageQty: 50 },
      shift: 1,
      skuCode: 'SKU-01'
    },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 17,
    name: 'Management Attempting Transaction Create',
    auth: { uid: 'mgt_uid', email: 'mgr@factory.com', email_verified: true },
    operation: 'create',
    path: '/workspaces/main/transactions/tx_mgt_1',
    data: {
      id: 'tx_mgt_1',
      type: 'ADJUSTMENT',
      timestamp: '2026-11-25T00:00:00.000Z',
      actorEmail: 'mgr@factory.com',
      payload: { deltaKg: 100 },
      shift: 1,
      skuCode: ''
    },
    expected: 'PERMISSION_DENIED'
  }
];

