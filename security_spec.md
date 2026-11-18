# ProdTrack MES Security Specification & TDD Audit

## 1. Data Invariants
1. **Single First-Time Admin Bootstrap**: `/system/bootstrap` can only be created once (`!exists(/system/bootstrap)`), atomically alongside `/admins/{request.auth.uid}` (`role: 'SUPER_ADMIN'`) via `existsAfter`/`getAfter`, by an authenticated, email-verified user whose `uid` matches `ownerUid`.
2. **Zero-Trust Identity & No Self-Escalation**: Users cannot create or elevate themselves into `/admins/{adminId}` once `/system/bootstrap` exists unless authorized by an existing Admin (`isAdmin()`).
3. **No Client-Trusted Timestamps**: All `createdAt`, `initializedAt`, and `updatedAt` timestamps must match `request.time`.
4. **Admin-Only Master BOM & Secret PIN**: Operators and Management can never read `/workspaces/{id}/config/secrets` (`adminPin`) and can never write `/workspaces/{id}/data/master`, `/workspaces/{id}/config/meta`, or `/workspaces/{id}/config/access`.
5. **Operator Operational Isolation**: Verified active Operators can update `/workspaces/{id}/data/operations` (production runs, tank logs, material requests/receipts/usages, SBL stops) without modifying `ownerUid`, `workspaceId`, or Master BOM.
6. **Management Read-Only Isolation**: Verified Management users with `hasViewAccess == true` (in `managementEmails`) have strict `get`-only access to `config/meta`, `data/master`, and `data/operations` — zero write permissions anywhere.
7. **PII & Secret Isolation**: `/admins/{adminId}` (email PII) is readable only by the profile owner or an Admin. Blanket `list` queries are disabled across all collections.
8. **Payload & ID Hardening**: All path IDs match `^[a-zA-Z0-9_\-]+$` with length `<= 128`, every string enforces `.size()` limits, every list enforces bounded `.size()` limits, and `keys().hasAll` + `keys().hasOnly` blocks shadow/ghost fields.

## 2. The "Dirty Dozen" Attack Payloads
1. **Unauthenticated Bootstrap Hijack**: Unauthenticated request attempting to create `/system/bootstrap`.
2. **Duplicate Bootstrap Overwrite**: Second authenticated user trying to overwrite `/system/bootstrap` after initialization.
3. **Privilege Self-Escalation**: Non-admin authenticated user creating `/admins/{uid}` with `role: 'SUPER_ADMIN'` after bootstrap exists.
4. **Unverified Email Spoofing**: Authenticated user with `email_verified: false` matching an admin email trying to read/write `/workspaces/main/data/master`.
5. **Shadow / Ghost Field Injection**: Admin create/update payload with extra undeclared key `isVerified: true` or `backdoor: 1`.
6. **PIN Exfiltration by Operator/Management**: Authorized Operator attempting `get` on `/workspaces/main/config/secrets`.
7. **Master BOM Tampering by Operator**: Authorized Operator attempting `update` on `/workspaces/main/data/master`.
8. **Management Write Attempt**: Authorized Management user attempting `update` on `/workspaces/main/data/operations`.
9. **Immutable Owner Spoofing**: Operator updating `/workspaces/main/data/operations` while changing `ownerUid` to their own UID.
10. **Client Timestamp Forgery**: Admin writing `updatedAt` as a client string or past Date instead of `request.time`.
11. **Path ID Poisoning**: Request targeting `/admins/../../evil` or 2KB document ID string.
12. **Blanket List Scraping**: Authenticated user running `list` on `/admins` or `/workspaces/main/config`.
