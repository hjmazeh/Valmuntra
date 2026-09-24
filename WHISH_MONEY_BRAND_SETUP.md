# Whish Money Payment Automation — New Brand Setup

How to bring the client-portal deposit/withdrawal feature (built for HarmonyFX,
shared across the staff panel) to a new brand. Follow this top to bottom in
order — later steps depend on earlier ones.

## 0. Architecture recap

- Every brand is its **own separate Firebase project** (own Auth, Firestore,
  Storage). No brand ever reads another brand's data directly.
- The **staff panel** (`tratech-staff` repo, deployed to staff.tratech.me) is
  the one exception: it holds a `PROJECTS` registry keyed by brand name and
  loops over every brand a logged-in staff member has access to. Adding a
  brand there is a registry entry, not a rewrite.
- MT5 deposits/withdrawals stay **fully manual** — the panel only tracks the
  request lifecycle (pending → sent to GoogleCell → resolved). Staff still do
  the actual MT5 balance operation by hand in the Backoffice.
- GoogleCell (the cash-handling partner) has no API. "Send to GoogleCell"
  copies a formatted message to the clipboard for pasting into their WhatsApp
  group from the desktop app — never a wa.me deep link.

## 1. Firebase project

1. Create a new Firebase project for the brand (or reuse one if it already
   exists for other reasons).
2. Enable **Authentication → Email/Password**.
3. Create a **Firestore database** — multi-region **nam5**, production mode.
4. Enable **Storage**.
5. Copy the web app config (`firebaseConfig` object) — you'll need it in two
   places: the brand's own `portal.html`/`login.html`/`signup.html`, and the
   staff panel's `PROJECTS` registry.

## 2. Firestore rules

Paste the contents of [`firestore.rules`](firestore.rules) (this repo, root)
into the new project's Firestore Console → Rules, published as-is. It already
contains everything this feature needs:

- `/funding_requests/{requestId}` — client creates (`pending` only), staff
  resolves.
- `/withdrawal_requests/{requestId}` — same pattern.
- `/settings/{settingId}` — the Whish Money collection phone number, staff-
  editable, readable by any signed-in client.
- `/admin_logs/{logId}` — the staff activity log (item 15). Staff-only both
  ways.
- `/users/{userId}` — has the `isAdmin() ||` bypass on `allow create` needed
  for "Create Client Manually" from the staff panel, and the specific
  self-service status transitions clients are allowed to make themselves
  (`kyc_submitted`, `mt5_requested`).

**Do not hand-edit per brand** — if a brand needs something the others don't,
change the master file here and re-paste into every project, so the rules
never drift out of sync silently.

## 3. Storage rules

Paste [`storage.rules`](storage.rules) into the new project's Storage Console
→ Rules. Covers `/kyc/{userId}/...`, `/funding_receipts/{userId}/...`,
`/withdrawal_receipts/{requestId}/...`.

## 4. Composite indexes

Firestore auto-creates single-field indexes, but every query here that
combines a filter with `orderBy` on a different field needs an explicit
composite index. Create these 4 in the new project (Firestore Console →
Indexes → Composite → Add Index), or just use the app once as a client + once
as staff and click through the `create_composite` links Firestore throws in
the console error (fastest way — each error names the exact fields needed).

| Collection | Fields | Used by |
|---|---|---|
| `funding_requests` | `status` (Arrays), `created_at` (Desc) | staff pending queue + staff history |
| `withdrawal_requests` | `status` (Arrays), `created_at` (Desc) | staff pending queue + staff history |
| `funding_requests` | `uid` (Asc), `created_at` (Desc) | client portal's own history |
| `withdrawal_requests` | `uid` (Asc), `created_at` (Desc) | client portal's own history |

`admin_logs` and `users` only ever use a single-field `orderBy`, so they need
no composite index.

**Gotcha already hit once:** a live `onSnapshot` listener that fails due to a
missing index does **not** auto-retry once the index finishes building — the
page needs a fresh load/re-subscribe after the index is ready.

## 5. EmailJS

Each brand needs its own EmailJS service + templates so client-facing email
never leaks another brand's name/domain:

1. Create an EmailJS account (or a new service under an existing account) for
   the brand's own support inbox.
2. Templates needed: deposit-confirmed, deposit-rejected, withdrawal-
   completed, withdrawal-rejected, MT5-credentials, KYC-submitted-staff-alert,
   MT5-requested-staff-alert. Copy an existing brand's templates and swap
   wording/branding.
3. Add the brand to the `BRANDS` config object in `tratech-staff/index.html`
   (`serviceId`, `templateId`, `publicKey`, `supportEmail`, `teamName`) — this
   is what `sendClientEmail()` looks up per brand.
4. Staff-side internal alerts (KYC submitted, MT5 requested) are sent through
   Valmuntra's own EmailJS account on purpose — they're staff-only, never
   client-facing, so there's no brand-leak risk, and it avoids needing a
   separate internal-alert template per brand.

## 6. Client-facing files (per brand's own static site)

Copy `portal.html`, `login.html`, `signup.html` from `harmony-fx` (the
reference implementation) into the new brand's repo, then:

- Swap `firebaseConfig` for the new project's config.
- Swap hardcoded brand name/logo/colors/WhatsApp number/domain references.
- Nothing else in the Whish Money flow itself needs to change — the deposit/
  withdrawal forms, history reveal-button gating, live status listener, and
  banner system are all brand-agnostic.

## 7. Staff panel (`tratech-staff`, shared — one repo for every brand)

1. Add an entry to the `PROJECTS` registry object with the new brand's
   `config`, and let the existing `Object.keys(PROJECTS)` loops pick it up
   automatically for login, client list, KYC/MT5 admin, transactions, and the
   activity log.
2. Add the brand to `BRANDS` (EmailJS config, see step 5).
3. Add the brand to `brandLabel()` / `brandBadge()` display helpers.
4. Grant staff access: use "Provision Staff" (super-admin only) with the new
   brand checked, or manually set `is_admin: true` on a `/users/{uid}` doc in
   the new project's Firestore Console.
5. Set the brand's Whish Money collection number once via the Transactions
   page's settings box (writes to `/settings/whish_money` in that brand's own
   project) — no redeploy needed to change it later.

## 8. Known pitfalls (hit these once already, don't re-hit them)

- **Missing Firestore imports fail silently.** `fetchTxnHistoryPage` once
  used `limit()`/`startAfter()` without importing them from the Firestore SDK
  — a `ReferenceError` inside an `async` function whose promise nobody awaits
  with a `.catch()` just vanishes, so the whole History section looked
  "permanently empty" with zero visible error. If a new query added later
  does the same thing, it'll fail the same silent way — always check the
  import line matches every Firestore function actually called in the file.
- **`setDoc` + `merge: true` does not support dot-path keys** as nested-field
  shorthand (only `updateDoc` does) — build a real nested object instead.
- **A brand-new account's own `createUserWithEmailAndPassword` call signs the
  *admin* out** and into the new account if run on the admin's main `auth`
  instance — always use a throwaway secondary `initializeApp()` instance for
  "Create Client Manually" and "Provision Staff", then `deleteApp()` it.
- **GitHub Pages propagation lag** — allow 30–90s (occasionally longer) after
  a push before trusting a "still broken" report; verify with a cache-busted
  fetch/reload first.

## 9. Testing checklist before calling a new brand "live"

- [ ] Client can sign up, submit KYC, get approved, request MT5, get
      credentialed — status updates live without a manual refresh.
- [ ] Client can submit a deposit and withdrawal; receipt uploads work.
- [ ] Staff sees the pending request appear without refreshing.
- [ ] Staff can resolve (confirm/reject) both types; client gets emailed and
      sees a banner; the resolved item shows up in both Transaction History
      and the Activity Log.
- [ ] "Send to GoogleCell" copies the right message (phone-first for
      withdrawals, receipt-only for deposits) to clipboard.
- [ ] Toggling EN/AR persists across a refresh.
- [ ] Requesting a 2nd MT5 account while already active does not hide the
      existing account view.
