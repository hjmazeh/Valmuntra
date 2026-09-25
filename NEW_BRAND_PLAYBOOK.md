# New Brand Playbook — Building a Complete Brand Like HarmonyFX

HarmonyFX (`harmony-fx` repo, harmonyfx.me) is the reference implementation for
this whole multi-brand system — client portal, KYC, Whish Money payments,
Google Sign-In, legal pages, the works. This doc is the end-to-end checklist
for standing up the *next* brand (e.g. Trateck / trateck.me) as a genuine
clone of it, not just the payments feature.

For the Whish Money deposit/withdrawal feature specifically (Firestore rules,
indexes, EmailJS, staff panel registration), see
[`WHISH_MONEY_BRAND_SETUP.md`](WHISH_MONEY_BRAND_SETUP.md) — this doc covers
everything *around* that feature: the domain, the Firebase project itself,
Google Sign-In, legal pages, and the site's other pages (marketing site,
login, signup, KYC).

Follow this top to bottom — later steps depend on earlier ones.

## 1. Domain & DNS

1. Register the domain (e.g. trateck.me).
2. Point it at GitHub Pages: four **A records** on `@` to GitHub's IPs —
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   — plus a **CNAME** on `www` pointing to `<github-username>.github.io`.
3. If the brand will send email through Google Workspace and/or a
   transactional provider (Resend, etc.), the domain needs a **single**
   merged SPF TXT record covering every sender, not one record per service —
   two competing SPF TXT records breaks SPF entirely rather than combining.
   Example combining Google Workspace + Amazon SES/Resend:
   ```
   v=spf1 include:_spf.google.com include:amazonses.com ~all
   ```
   Some registrars (GoDaddy) auto-generate a "flattened" SPF via an
   intermediate `dc-xxxxx._spfm.yourdomain.com` record instead of listing
   includes directly on `@` — that's fine and works the same way, but if a
   checker (e.g. Google Workspace's own "Email setup status" page) still
   flags a "Caution" for a missing include even though it's present via that
   indirection, it's very likely a false positive from a naive direct-string
   check rather than a real deliverability problem — adding the include
   directly to the root record too (alongside the existing one) satisfies
   both and costs nothing.
4. If using Firebase's own custom-domain email sending (rather than a
   relay), Firebase's domain-verification wizard (Firebase Console →
   Authentication → Templates → Customize domain) asks for its own SPF
   include (`_spf.firebasemail.com`) plus two DKIM CNAMEs and an ownership
   TXT — same "merge into the one SPF record" rule applies.

## 2. Firebase project

Same as [`WHISH_MONEY_BRAND_SETUP.md`](WHISH_MONEY_BRAND_SETUP.md) §1: new
Firebase project, Email/Password auth enabled, Firestore (multi-region
**nam5**, production mode), Storage enabled. Copy the web `firebaseConfig`.

## 3. Google Sign-In (optional but recommended — HarmonyFX has it)

This is a full separate subsystem from email/password auth. In order:

1. **Firebase Console → Authentication → Sign-in method → Google → Enable**,
   set a support email, save.
2. **Firebase Console → Authentication → Settings → Authorized domains** —
   add the brand's real domain (e.g. `trateck.me`) and `www.trateck.me` if
   used. The default `*.firebaseapp.com`/`*.web.app` entries stay.
3. Copy the Google Sign-In code from HarmonyFX's `login.html` and
   `signup.html` (`GoogleAuthProvider`, `signInWithPopup`,
   `startGoogleLogin`/`startGoogleSignup`, `completeGoogleProfile`, the
   "one more step" phone-number box for brand-new Google sign-ups) into the
   new brand's own pages, swapping brand-specific strings and the default
   phone country code.
4. **Google Cloud Console** (console.cloud.google.com — same underlying
   project as Firebase, but a genuinely separate console; if it's not in
   the project switcher, search by the exact project ID, not the Firebase
   display name, since they can differ):
   - **APIs & Services → OAuth consent screen → Branding**: set **App name**
     (this is what shows in the "X will allow ___ to access your info"
     popup — a Firebase project display-name rename does *not* update
     this), support email, and optionally a logo.
   - **Audience** tab (in the newer "Google Auth Platform" UI) or the
     consent screen's own domain/links section: fill in **Application home
     page**, **Application privacy policy link**, **Application terms of
     service link** (see §5 below — these must exist and be publicly
     reachable *before* verification will accept them), and add the brand's
     domain to **Authorized domains** here too (this is separate from
     Firebase's own authorized-domains list). This field only accepts the
     top-level registrable domain (`trateck.me`), not a subdomain like
     `www.trateck.me` — the top-level entry already covers all subdomains
     for this field, so don't bother trying to add the `www` form
     separately here.
   - Click **Verify branding**. If the three link fields above are empty,
     this stays disabled — that's the single most common reason it "does
     nothing."
   - Once Google returns "Your branding has been verified, but is not yet
     being shown to users," go to the **Audience** tab and **Publish App**
     (move from Testing to In production) — verification alone doesn't
     show the branding until it's published, and the verified result
     expires in **7 days** if you don't publish it in time.
   - A generic Google Cloud Console error ("An error occurred when saving
     the branding information... tracking number...") when saving is
     usually transient or caused by leftover invalid input in a field
     (e.g. an attempted `www.` entry in Authorized domains) — clear the
     field, refresh, and retry before assuming something is broken.
5. **Known gotcha — same email across providers.** If someone signs in with
   Google using an email that already has a password-based account on this
   *same* project (including your own staff/admin account!), Firebase
   matches it to the *existing* account rather than creating a new one —
   the `if (snap.exists())` check in `startGoogleLogin`/`startGoogleSignup`
   sends them straight past the "new user" phone-collection step into
   whatever that existing account already is. This is correct behavior, not
   a bug, but it means: never test "brand-new Google sign-up" with an email
   that's already an admin/staff account on the project, or you'll submit
   KYC etc. onto your own staff document by mistake (harmless to clean up,
   just confusing to debug if you forget this).

## 4. Client-facing pages

Copy these from `harmony-fx` into the new brand's own repo, then do a
find-and-replace pass for brand name, colors/logo, `firebaseConfig`,
WhatsApp number, default phone country code, and domain references:

- `index.html` — the public marketing site.
- `login.html`, `signup.html`, `kyc.html` — auth + identity verification.
- `portal.html` — the client dashboard (accounts, referral, Whish
  Money/USDT deposit-withdraw, transaction history, live status updates).
  See [`WHISH_MONEY_BRAND_SETUP.md`](WHISH_MONEY_BRAND_SETUP.md) for what's
  brand-agnostic vs. what needs wiring per brand.
- `privacy-policy.html`, `terms-of-service.html` — see §5.

All of these share the same bilingual (EN/AR) pattern: `lang-en`/`lang-ar`
spans toggled by a `body.en` (portal/login/signup/kyc) or `body.arabic`
(index/legal pages — inconsistent naming between the two page families,
inherited from how they were originally built; not worth unifying unless
touching both anyway) class, persisted across pages via a single shared
`localStorage` key (`preferred_lang`), defaulting to **English** for a
first-time visitor and only switching to Arabic if that was explicitly
saved. Two things easy to miss when porting:
- A `placeholder` attribute can't hold `lang-ar`/`lang-en` spans (it's plain
  text, not HTML) — any example text in a placeholder needs to be swapped
  explicitly inside the `setLang()` function, not just left as static HTML.
- Every page that reads/writes `preferred_lang` needs the *exact* same
  restore-on-load snippet, or a language choice made on one page won't
  survive navigating to another.

## 5. Legal pages

`privacy-policy.html` and `terms-of-service.html` are required for Google
Sign-In branding verification (§3) even before considering real legal
compliance. Copy HarmonyFX's versions as a starting structural template,
then rewrite the actual content for the new brand — do not just find-and-
replace the brand name, since the business model details matter (e.g.
HarmonyFX's Terms describe it as an **introducing broker** partnered with
Harmonic, not itself a trading platform — get this right for whatever the
new brand's actual arrangement is). Both pages should say clearly whether
they're an unreviewed draft until actual legal counsel signs off — remove
that disclaimer once they are actually reviewed/approved, not before.

If the homepage doesn't already have a **Risk Warning** section (not just
buried in the Terms), add one — see HarmonyFX's `index.html`, right above
the footer.

## 6. Whish Money payment feature

See [`WHISH_MONEY_BRAND_SETUP.md`](WHISH_MONEY_BRAND_SETUP.md) in full —
Firestore/Storage rules, the 4 composite indexes (and the exact field mode
each needs), EmailJS setup, and registering the brand in the shared staff
panel (`tratech-staff`, staff.tratech.me).

If the new brand can't use Whish Money (e.g. it's not available in that
market), the settings-box label and the deposit/withdrawal method field are
already built to branch per brand (see how Valmuntra's "ShamCash" method
was added alongside HarmonyFX's Whish Money) — copy that pattern rather
than hardcoding a new payment method's name throughout.

## 7. Deployment

GitHub Pages, same as the other brands. After every push, allow **30–90s**
(occasionally longer) for propagation before trusting a "still broken"
report — verify with a cache-busted URL (`?cachebust=<anything>`) first.

## 8. Known pitfalls (hit these once already across this whole build)

- **Missing Firestore imports fail silently.** A `ReferenceError` inside an
  `async` function whose promise nobody awaits with `.catch()` just
  vanishes — always double check the import line matches every Firestore
  function actually called in the file (`limit`, `startAfter`, `addDoc`,
  etc. are easy to forget when copy-pasting a query).
- **`setDoc` + `merge: true` does not support dot-path keys** as nested-
  field shorthand (only `updateDoc` does) — build a real nested object
  instead.
- **A brand-new account's own `createUserWithEmailAndPassword` (or
  `createUser`) call signs the *admin* out** and into the new account if
  run on the admin's main `auth` instance — always use a throwaway
  secondary `initializeApp()` instance for any staff-triggered account
  creation, then `deleteApp()` it afterward.
- **TDZ (temporal dead zone) crashes**: a `let`/`const` used inside a
  function that gets called *before* the script's top-to-bottom execution
  reaches that variable's own declaration line throws "Cannot access X
  before initialization" — happened twice in `portal.html` as new state
  variables got added without being declared up at the top alongside the
  other history-related state. If a live listener or an immediately-invoked
  render function references a variable, that variable needs to be
  declared before the first place it could possibly run, not just
  "somewhere logically nearby" in the file.
- **This local dev preview's browser pane can silently serve a stale
  cached copy of a bare URL** (no query string) even across full page
  reloads and dev-server restarts — if a fix doesn't seem to take effect
  locally, add a throwaway query string (`?v=2`) to force a genuinely fresh
  fetch before concluding the fix is wrong. The live production site
  (GitHub Pages) does not have this specific issue — that one really is
  just normal CDN propagation lag (see §7).
- **A domain's SPF record can only have one entry** — merge every service's
  `include:` into the single existing record; never add a second separate
  SPF TXT record for a new service.
- **Google's OAuth "Authorized domains" field ≠ Firebase's own "Authorized
  domains" list** — they're two separate settings in two separate consoles,
  both need the domain added, and Google's version only accepts top-level
  registrable domains (rejects a `www.` subdomain entry, but the top-level
  entry already covers it).
- **Same email, different sign-in provider, same project → same account.**
  See §3's gotcha above. Don't test a "new Google sign-up" flow with an
  email that already exists on the project in any form.
- **PowerShell here-string commit messages**: a literal `...` ellipsis or
  certain punctuation combos in a `git commit -m @'...'@` message can break
  argument parsing and cause `git add`/`git commit` to silently misfire on
  unrelated pathspecs — keep commit message punctuation simple, or write
  the message to a temp file and use `git commit -F` if it keeps happening.

## 9. Launch checklist

- [ ] Domain resolves, SPF/DKIM verified with no "Caution" warnings.
- [ ] Email/password sign-up, KYC submission, approval, MT5 request/
      credentialing all work end to end with live status updates (no
      manual refresh needed).
- [ ] Google Sign-In works for both a genuinely new email and an existing
      account; branding shows "the brand name," not the raw
      `*.firebaseapp.com` domain, in the consent popup.
- [ ] Privacy Policy and Terms of Service are live, linked from the
      footer, and match the brand's actual business model.
- [ ] Deposit and withdrawal both work for every payment method the brand
      actually offers; staff sees pending requests without refreshing and
      can resolve them; resolution shows up in both Transaction History
      and the Activity Log.
- [ ] EN/AR toggle persists across every page, defaulting to English.
- [ ] Staff panel shows the new brand in its sidebar/brand filters and
      pending-action badges.
