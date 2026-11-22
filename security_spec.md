# Security Specification for OG TRADE (`gamelog-21c7d`)

## 1. Data Invariants
- `/admins/{adminId}` contains trusted admin role records (`role: "admin"`). Clients can NEVER create, update, delete, or list `/admins`; a signed-in user may only `get` their own `/admins/$(request.auth.uid)` document to check UI role state.
- `/users/{userId}` is readable via `get` only by the authenticated owner (`request.auth.uid == userId`) or a verified admin (`isAdmin()`). Clients may NEVER `create` or `delete` `/users/{userId}`, and may NEVER modify `balance`, `publicUid`, streaks, bonus flags, or any financial field. Client-side updates are restricted to verified users updating only `displayName` + `updatedAt`. All wallet balances, 6-digit `publicUid` assignments, and game states are mutated exclusively server-side via Firebase Admin SDK (`server.ts`).
- `/users/{userId}/gameHistory/{historyId}` and `/users/{userId}/transactions/{txId}` are read-only (`get` and owner-scoped `list` checking `resource.data.uid == request.auth.uid`) for the owning user; all client writes (`create`, `update`, `delete`) are denied.
- `/users/{userId}/chickenSessions/{sessionId}` denies ALL client reads and writes so active trap positions remain strictly server-secret.
- `/adminTransactions/{txId}` denies ALL client writes (`create`, `update`, `delete`) and denies non-admin reads; admin dashboard reads/queries are served and verified server-side via `/api/admin/*` and `requireAdmin()`.
- `/referrals/{code}` denies all client reads and writes so referral codes never expose user UIDs or PII.
- `/publicUserIds/{publicUid}` denies all client reads and writes so 6-digit numeric UID reservation remains strictly server-controlled and collision-safe.

## 2. Adversarial Payloads Blocked by Rules
1. Unauthenticated read/write on `/users/{userId}` -> `PERMISSION_DENIED`
2. Cross-user `get` or `list` on `/users/otherUid` or `/users/otherUid/transactions` by a normal user -> `PERMISSION_DENIED`
3. Normal user attempting `list` on `/users` -> `PERMISSION_DENIED`
4. Normal user attempting `get` or `list` on `/adminTransactions` -> `PERMISSION_DENIED`
5. Normal user attempting `create` or `update` on `/admins/{uid}` with `{ role: "admin" }` -> `PERMISSION_DENIED`
6. Client attempt to `create` `/users/{uid}` with inflated `balance: 9999999` -> `PERMISSION_DENIED`
7. Client attempt to `update` `/users/{uid}` changing `balance`, `followBonusClaimed`, or `lastResetAtMs` -> `PERMISSION_DENIED`
8. Client attempt to inject shadow fields (`role: "admin"`, `isAdmin: true`) into `/users/{uid}` -> `PERMISSION_DENIED`
9. Client attempt to forge a transaction in `/users/{uid}/transactions/{txId}` or `/adminTransactions/{txId}` -> `PERMISSION_DENIED`
10. Client attempt to read hidden Chicken Road traps in `/users/{uid}/chickenSessions/current` -> `PERMISSION_DENIED`
11. Client attempt to update `displayName` with oversized string (`> 40` chars) or forged `updatedAt` -> `PERMISSION_DENIED`
12. Deleting `/users/{uid}`, `/admins/{uid}`, or accessing arbitrary unmapped collections -> `PERMISSION_DENIED`
