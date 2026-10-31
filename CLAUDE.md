# StudioOS — CLAUDE.md

## Project Overview
- **Name:** StudioOS
- **Purpose:** Music studio admin panel — students & enrolments, teachers, rooms, scheduling, attendance, fees, deposits, payroll, month-end archive
- **Stack:** React 18, Vite 5, pure CSS-in-JS (no UI library). Tests: Vitest (`npm test`).
- **Backend:** Firebase Auth (Google Sign-In) + Firestore (project `ark-music-portal`, region asia-southeast1) + one Cloud Function (`getPublicFees`)
- **All data is in Firestore.** There is no seed/demo data and no in-memory domain state any more (v7). A fresh studio starts empty: add instruments on **Grades & Fees** first, then rooms, teachers, students.

---

## Commands

```bash
npm run dev          # dev server at http://localhost:5173
npm test             # Vitest: domain unit tests + server-render smoke tests of every view (no network)
npm run build        # production build → dist/
firebase deploy --only firestore:rules   # push security rules (REQUIRED after pulling v7 — new collections are rule-protected)
firebase deploy --only hosting           # deploy built app (build first)
firebase deploy --only functions         # deploy getPublicFees
```

There are **no data migrations** to run for v7: the previous students/teachers/rooms lived only in memory (seed data), so nothing persisted needs converting. Old `payroll_months` / `class_deferrals` docs written during development refer to demo ids (`s1`…`s5`); they are ignored by the new code and can be deleted in the Firebase console. Instruments that disappear from Grades & Fees are cleaned out of teachers/rooms/enrolments automatically (`cleanupInstruments`, below). Use **Archive → Download full backup** before any bulk change.

---

## Architecture rule: the Enrolment is the central record

```
students/{id}       the person: name, phone, notes
enrolments/{id}     student + instrument — owns teacher, room, weekly slot, grade, syllabus, fee,
                    billing term, commission, status, deposit (1 student : 1..n enrolments)
deposits/{enrolmentId}   one registration deposit per enrolment (doc id == enrolment id)
```

Never put grade/schedule/fee/commission on the student. A student with two instruments has two enrolments → two calendar cards, two payroll rows, two deposits.

### Layers (keep them separate)
- `src/domain/*` — **pure logic, no React, no Firebase, fully unit-tested.** All business rules live here.
- `src/hooks/useStudio.js` — the only place that writes studio data to Firestore; validates via `domain/`, writes an `activity_log` entry per change. Views call `actions.*`.
- `src/views`, `src/components` — UI only. Pass `T` (theme tokens) everywhere; never hardcode colours.

---

## File Structure

```
src/
  firebase.js                Firebase init
  App.jsx                    Auth gate, nav, notification drawer, wires useStudio → views via `shared` props
  data/
    seed.js                  CONSTANTS ONLY (grade labels, syllabi, days, hours, status meta). No demo data.
    activity.js              logActivity() → activity_log
    backup.js                downloadBackup() — whole-database JSON export
  domain/                    (pure, tested — *.test.js beside each)
    time.js                  "HH:MM"/"YYYY-MM" maths, overlap
    instruments.js           instrument list = keys of fee tables; delete-blocking; dangling-reference cleanup
    enrolments.js            schedule rendering, conflict detection, validation, create/stop, collected-fee warning
    billing.js               billing terms, periods, fees, commission, discounts, fee/term/commission edit patches
    payroll.js               calcLine + buildEnrolmentRow/buildMonthRows + collection snapshot
    deposits.js              deposit lifecycle & reporting
    months.js                finalize snapshot rows, revisions, diffs, affected months
    audit.js                 activity-log entry builder + diff
  hooks/
    useAuth.js useTheme.js useMobile.js useNotifications.js useClassDeferrals.js
    useCollection.js         generic live collection listener
    useStudio.js             ALL studio data + write actions (see below)
    usePayrollMonth.js       ledger for one month: payroll_months/{YYYY-MM}
  components/
    UI.jsx                   Avatar, Badge, Card, Stat, Inp, Sel, Btn, Modal, THead, Checkbox…
    EnrolmentForm.jsx        register student / add instrument / edit enrolment (one form, 3 modes)
  views/
    Dashboard Students CalendarView Payroll PayoutPreview GradesAndFees RoomsView
    DiscountsView ArchiveView ActivityLogView UserManagement Login AccessDenied
    views.test.jsx           server-render smoke tests
docs/                        user guides (see Docs)
firestore.rules              security rules — source of truth
functions/index.js           getPublicFees
```

---

## Roles & Access

| Role | Views | Permissions |
|---|---|---|
| `teacher` | Calendar, Students, Archive (notification archive only) | Own classes only; mark attendance; book one-off sessions; request grade changes. **No payroll/fee/commission screens.** |
| `admin` | All except User Mgmt | Full data access; collect fees; finalize months; deposits; discounts |
| `sysadmin` | Everything | Admin + user accounts + **revising finalized months** |
| `denied` | Access Denied | No `users` doc for this Google account |

Auth gate order in App.jsx: **spinner → Login → AccessDenied → (spinner until fees + studio data load) → main app**.
Teachers don't subscribe to admin-only collections (`deposits`, `discounts`, `month_snapshots`, `month_revisions`, `activity_log`).

---

## Firestore collections

| Collection | Notes |
|---|---|
| `users/{uid}`, `invites/{id}` | Accounts. Invite-based: sysadmin creates an invite for a Gmail; first Google sign-in claims it (see Runbook). `teacherId` links a user to a `teachers` doc. |
| `notifications/{id}` | `clash_request` (to a teacher) and `grade_request` (to admin; carries `enrolmentId`). `status` pending → approved/rejected. Resolved ones are listed in **Archive → Notification Archive**. |
| `fees/classical`, `fees/contemporary` | `{ Instrument: { Level: { "30": RM, "45": RM, "60": RM } } }`. **The keys of these two docs ARE the studio's instruments.** Edited on Grades & Fees. Read publicly via `getPublicFees`. |
| `students`, `enrolments`, `teachers`, `rooms` | See schema below. Read: signed in. Write: admin/sysadmin. |
| `attendance/{enrolmentId_YYYY-MM-DD}` | `{ enrolmentId, date, status, notes }`. Signed-in read/write (teachers mark attendance). Absence of a doc = not marked. |
| `one_off_sessions/{id}` | Extra bookings from the calendar. |
| `class_deferrals/{id}` | Make-up classes `{ enrolmentId, studentId, teacherId, originalDate, makeupDate, … }`. |
| `deposits/{enrolmentId}` | Deposit lifecycle (below). Admin only. Rules block edits once applied/forfeited. |
| `payroll_months/{YYYY-MM}` | The monthly **ledger** (below). Admin write, **frozen once the month is finalized**. |
| `month_snapshots/{YYYY-MM}` | Immutable finalized month. Create once; no update/delete. |
| `month_revisions/{id}` | Corrections to a finalized month. Sysadmin create; append-only. |
| `discounts/{id}` | Promotions. Admin only. |
| `settings/studio` | `{ adminFlatFee }` |
| `activity_log/{id}` | Append-only audit trail; admin read. |

### `rooms`
`{ name, types: string[], color }` — **multiple types** (must be instruments from Grades & Fees; ≥1 required). A class may only use a room whose `types` include the enrolment's instrument.

### `teachers`
`{ name, instruments: string[], commissionPct }` — `commissionPct` is the **default** rate; commission 0–100 validated. Instruments must exist on Grades & Fees.

### `enrolments`
```
studentId, instrument (null if no longer offered), syllabus "classical"|"contemporary", grade, teacherId,
attendanceBased, status "active"|"stopped",
schedule { dayOfWeek, startTime, endTime, duration "30"|"45"|"60", roomId },
startDate "YYYY-MM-DD", endDate (last day of the final lesson month) | null,
feeOverride { amount, effectiveFrom "YYYY-MM" } | null      // null → standard fee from the Grades & Fees table
billingTerm (display copy), termChanges [{ from "YYYY-MM", term }]   // term history; only "monthly" | "quarterly"
commissionPct | null                                         // null → teacher's default
```

---

## Schedule & conflict logic (`domain/enrolments.js`)
- One session per enrolment per matching weekday between `startDate`/`endDate` — `getSessionsForDate`. Calendar, Rooms, Dashboard and Students all render from this, so a two-instrument student appears once per instrument, at each class's own time.
- `findScheduleConflicts(candidate, existing, {ignoreId, asOf})`: same weekday + overlapping times (`09:00–10:00` and `10:00–11:00` don't overlap) → **student** (can't be in two classes), **room** (double-booked), **teacher** (double-booked). Stopped enrolments past their last day are ignored.
- Enforced in `useStudio.checkEnrolment` (every enrolment create/edit, in app code — at this studio's scale no rules-level check is needed) and shown live in `EnrolmentForm`. `validateEnrolment` also requires: instrument on Grades & Fees, grade valid for the syllabus, teacher teaches it, room type includes it.
- Calendar one-off bookings: student/teacher overlap and wrong room type are **hard blocks**; a room already taken by another teacher still goes through the existing **clash-request** approval flow.

## Grade changes (no grade lock)
v7 originally planned a "grade lock"; it was **replaced by Finalize Month**. Grade/duration edits are always allowed. `needsCollectedFeeWarning` makes `EnrolmentForm` require an "I understand" tick when the current period's fee is already collected; the grade-request drawer shows an equivalent note. A collected fee keeps its amount (snapshot, below), so a grade change only affects future fees. If an admin override/lock is ever wanted, it belongs in `EnrolmentForm.submit` and `useStudio.updateEnrolment`.

## Fee model & billing terms (`domain/billing.js`)
- Standard monthly fee = `fees[syllabus][instrument][grade][duration]`; an enrolment can override it with `feeOverride` **from an effective month onward** (earlier months keep the standard fee).
- **Billing term: only `monthly` or `quarterly`** (`BILLING_TERMS`; `assertBillingTerm` throws on anything else; the UI offers only those two). Quarterly = one fee covering 3 months, counted from the enrolment's start month (or the month a term change takes effect). `getBillingPeriod(enrolment, ym)` returns `{isFeeMonth, months, startYM, coveredBy}`: the fee lives in the period's first month; months 2–3 show "Covered by <month> fee". A period is cut short if the enrolment stops inside it.
- Term / fee / commission changes go through `buildBillingPatch` (validates, builds `termChanges` / `feeOverride`) and only affect fees not yet collected.
- Admin flat fee is per month of the period (`adminFlatFee × months`, capped at gross).

## Commission snapshot rule
Rate = `enrolment.commissionPct ?? teacher.commissionPct ?? 60` (`resolveCommissionPct`). **When a fee is marked collected, `snap` is written to the ledger entry** (`periodFee, discountAmount, commissionPct, adminFlatFee, term, periodMonths, periodStart` via `buildCollectionSnapshot`). `buildEnrolmentRow` reads `snap` for collected fees, so later fee/grade/discount/commission/teacher-default edits never change a collected fee or past commission. Un-collecting clears `snap`.

## Ledger entry (`payroll_months/{ym}.feeStatus[enrolmentId]`)
`collected, collectedAt, collectedBy, snap, discount {id,name,type,value,note}, depositApplied {depositId, amount}, deferredToMonth, deferredFromMonths[], deferredFromAmounts{}`. Payroll rules: nothing counts until collected; attendance-based with 0 attended → 0; gross = fee after discount (prorated by attended/scheduled if attendance-based); flat fee first, then commission split; deferred payouts move teacher/admin amounts to the target month.

## Discounts
`discounts/{id}`: name, `percent|amount`, value, `startMonth`, `durationMonths`, note. Selectable only for fee months inside its window; applied per student per fee month from **Payroll → Discount** (below FEE). Capped at the fee (`calcDiscountAmount`). Frozen into `snap` on collection. Payroll shows the original fee struck through and the discounted fee larger.

## Deposit model & lifecycle (`domain/deposits.js`)
- One per enrolment (`deposits/{enrolmentId}`): `amount` (snapshot), `status`, `payment`, applied/forfeited details.
- Created at registration (`registerStudent` / `addEnrolment`). **Default amount = the first month's fee for the starting grade/duration** (even for quarterly billing), editable; a higher amount shows a warning, not a block.
- `pending` (registration incomplete — flagged on Students & Dashboard) → `held` (collected) → `applied` | `forfeited`. **Not refundable** (no refund state).
- **Stopping an enrolment** (`Students → Stop`, choose last lesson month) runs one Firestore transaction (`applyDepositTx`): sets `endDate`, applies the held deposit to the **final billing period's** net fee (`planDepositApplication`: equal → pays nothing; smaller → student pays the difference; larger → fee covered, excess `forfeitedAmount`), writes `depositApplied` into that month's ledger entry, and auto-marks the fee collected (with a snapshot) if nothing is left to pay. If the final fee is already collected, nothing is applied and the UI says to un-collect first, then use **Apply deposit**.
- **Single use** is enforced at the data layer: every domain transition throws unless the state is right, transactions re-read the doc, and `firestore.rules` rejects updates/deletes of `applied`/`forfeited` records and changes to `amount` at that moment.
- Existing enrolments have no deposit; admins backfill from **Students → Deposit** ("Record as pending/collected").

## Reporting treatment of deposits
Held deposits = **liability** (`summariseDeposits().liability`, shown on Dashboard and Payroll as "Deposits Held"). Never added to revenue while held. An applied deposit becomes revenue **once**, as part of the final fee's gross (commission uses that fee's snapshot rate); it is never counted again. Forfeited remainder is recorded on the deposit record.

## Finalize Month & Archive
- **Payroll → Finalize Month** (admin): confirmation modal (counts, totals, uncollected list — a warning, not a block) + acknowledgement tick → writes `month_snapshots/{ym}` (all rows, totals, payout status). From then `payroll_months/{ym}` is rule-locked and Payroll renders the month from the snapshot (latest revision if any; toggle to original).
- **Archive → Finalized Months**: originals and revisions. **Sysadmin** can *Revise*: edit collected / fee / discount / commission % / deferral per row, totals recompute (`months.reviseRow`), a reason is required, saved as `month_revisions` (original untouched). Months referenced by a changed deferral are listed in `affectedMonths` and highlighted. Revisions do not rewrite other months' ledgers — the highlight tells admins to check them.
- **Archive → Notification Archive**: all approved/rejected notifications. **Archive → Download full backup**.

## Activity log
`useStudio` writes `activity_log` entries for: student register/edit/delete, enrolment create/edit/stop, **fee override, billing term and commission changes (with from/to)**, fee schedule saves, payroll collect/un-collect, discounts, deferrals, deposit create/collect/edit/apply/forfeit/backfill, month finalize/revise, teacher/room/instrument/settings changes, notification resolutions. View: **Activity Log** (admin). Append-only in rules.

## Instruments (single source of truth)
`getInstruments(fees, contemporaryFees)` — every instrument picker (teachers, enrolments, rooms) uses it. Deleting an instrument on Grades & Fees is **blocked for everyone, sysadmin included**, while a teacher or live enrolment uses it (message: "Un-attach all students and teachers that are linked to this instrument before deleting it."). References to instruments that no longer exist are replaced with `null` / dropped once on admin login (`cleanupInstruments`): null instrument ⇒ fee 0.

---

## Cloud Function — `getPublicFees`
- **Source:** `functions/index.js` · region `asia-southeast1` · Node 20, firebase-functions v6 (HTTPS v2)
- Serves the fee schedule as JSON to the public lead-gen website (Admin SDK, bypasses rules): `{ classical: { Piano: { Beginner: { "30": N, "45": N, "60": N } } }, contemporary: {…} }`. `Cache-Control: public, max-age=600`, CORS `*`, no auth.
- Deploy: `firebase deploy --only functions`; URL via `firebase functions:list` → website `VITE_FEES_API_URL`. New instruments appear automatically.

---

## Theme System
- All views receive `T` (token object) as a prop. Tokens: `T.bg`, `T.panel`, `T.panel2`, `T.text`, `T.textSub`, `T.muted`, `T.accent`, `T.border`, `T.border2`, `T.dim`, `T.input`, `T.rowAlt`, `T.hover`, `T.sidebar`
- Never hardcode colours — use `T` tokens (semantic status colours already used in views are the exception). Active: `color: T.accent`, `background: T.accent + "22"`. Inactive: explicitly `color: T.muted`, `background: "transparent"`.

---

## Testing
`npm test` (Vitest, node env, no network). Covers: multi-instrument schedule rendering, conflict detection, billing terms & term-based fee generation, historical amount immutability, commission at different rates, discounts, deposit creation/snapshot immutability, deposit applied to the final month (equal / greater / smaller / quarterly), single-use enforcement, separate deposits per instrument, month finalize/revisions, instrument rules, activity-log entries, and `views.test.jsx` server-renders every view (admin, teacher, mobile, empty studio, finalized month). **Not covered:** Firestore rules and live Firestore transactions (no emulator in the repo) — verify those manually after `firebase deploy --only firestore:rules`.

## Docs
- `docs/design-decisions.md` — why v7 works the way it does: owner decisions, assumptions, open questions, deploy checklist. Read it before changing deposits, grade rules, discounts or Finalize Month.
- `docs/README.md` — index. `docs/user-guide-teacher.md` — non-technical teacher guide. Admin guide: not written yet (add `docs/user-guide-admin.md` and list it in the index).
- **Project convention: whenever a teacher-facing feature changes (Calendar, Students as seen by a teacher, attendance, grade requests, notifications, login), update `docs/user-guide-teacher.md` in the same change.** Only document features that exist. Screenshots are `![description](TODO)` placeholders.

---

## Operational Runbook

### First-time setup of a new studio (empty database)
1. Bootstrap the first sysadmin (below).
2. **Grades & Fees** → `+ Add` each instrument, fill fees (or import the Excel template), **Save Changes**.
3. **Rooms** → add rooms and tick every instrument each room can host.
4. **Payroll → + Add Teacher** (name, instruments, default commission %), then **User Mgmt → Teacher** to invite their Gmail linked to that profile (creating a teacher in User Mgmt makes both).
5. **Students → + Register Student**: name, instrument, grade, teacher, weekly slot, term, optional fee/commission override, and the **deposit** (default = first month's fee; tick "received now" once paid). Add a second instrument with **+ Instrument** on the student's row.

### Add a user account (teacher / admin / sysadmin)
1. Sysadmin → **User Mgmt** → pick Role; fill name + Gmail (teachers: instruments + default commission).
2. **Create Invite**. They sign in with Google using that Gmail; `useAuth.js` claims the invite, creates `users/{uid}`, deletes the invite. No Firebase Auth account is pre-created. Students are **not** accounts — they're registered on the Students page (User Mgmt lists them read-only with a link).

### Bootstrap the very first sysadmin (one-time)
1. Open the app → Sign in with Google → Access Denied (expected). 2. Firebase console → Authentication → copy your **UID**. 3. Firestore → `users` → add document with ID = UID and fields: `uid`, `email` (lowercase), `displayName`, `role: "sysadmin"`, `teacherId: null`, `createdAt` (timestamp). 4. Refresh.

### Edit / delete / transfer a user
- **Edit**: User Mgmt → Edit (invites: email editable too). **Delete / Cancel Invite**: removes the `users`/`invites` doc; next sign-in is Access Denied. **Transfer** (user changed Gmail): Transfer → enter new Gmail → Create & Transfer; role and teacher profile carry over.
- "Access Denied unexpectedly" ⇒ their `users` doc is missing; recreate via invite or add it in the console. Role changes apply on next page load.

### Month-end
Collect fees on **Payroll** (apply discounts, defer payouts as needed) → check every row → **Finalize Month**. Mistakes later: sysadmin → **Archive → Revise**. Pay teachers via **Payroll → Pay Out** (CSV + per-student invoice PDF).

### Stop a student / use their deposit
**Students → Stop** on that instrument → choose the last lesson month → confirm. The deposit is deducted from the final fee automatically; check **Payroll** for that month (shows "Deposit −RM x · pays RM y"). Use **Deposit → Apply deposit** if it couldn't apply automatically.

### Update Firestore security rules
Edit `firestore.rules` → `firebase deploy --only firestore:rules` (live immediately).

### Deploy the app
`npm run build && firebase deploy --only hosting` (e.g. https://ark-music-portal.web.app).

### Add a new view
Create `src/views/MyView.jsx`; in `App.jsx` import it, add to `ALL_NAV` (`{ id, label, icon, roles }`) and to `views`. It receives the `shared` props (`T`, `currentUser`, store data, `actions`, `log`, `goTo`, `setDirty`…).

### Add a new theme token
Add to both `dark` and `light` in `src/utils/tokens.js`; use as `T.myToken`.

### Add a new business rule
Put it in `src/domain/` with a test next to it; call it from `useStudio` (writes) and the view (display). Don't re-implement rules in views.

---

## Changelog
- **v1:** Initial build — dashboard, students, attendance, payroll (hours-based), grades
- **v2:** Commission-based payroll, grade fees per instrument, room management, calendar hub
- **v3:** Recurring schedules, attendance-based toggle, per-teacher commission %, admin flat fee, multi-instrument teachers, hover attendance picker, light/dark theme
- **v3.1:** Bug fixes — light mode inactive nav color (token typo `#7070888` → `#707088`), hover attendance picker gap fix (outer wrapper pattern), CLAUDE.md created
- **v4:** Firebase Auth + RBAC — Google Sign-In, role system (teacher/admin/sysadmin/denied), notification drawer (clash + grade requests), room booking with clash detection, grade request flow, UserManagement view, authSecondary for account creation, Firestore security rules deployed to `ark-music-portal`
- **v5:** User Management overhaul + invite-based auth architecture
  - **Invite-based account creation** — removed `createUserWithEmailAndPassword` and `authSecondary`. Sysadmin now creates a Firestore `invites` doc (no Firebase Auth account pre-created). When the invited person first signs in with Google, `useAuth.js` finds their invite by email, auto-creates `users/{uid}`, and deletes the invite. Delete account is now just `deleteDoc` — no Cloud Functions or Blaze plan needed.
  - **Dynamic create form** — Role is the first field and drives the entire form: Teacher (name, Gmail, instruments, commission % — also creates teacher profile inline), Admin/Sysadmin (name, Gmail, optional teacher link), Student (full student profile — no Gmail/Auth needed)
  - **Transfer Account** — Transfer button on each row pre-fills the create form with the old account's info (name, role, instruments, commission %). Admin enters new Gmail, clicks Create & Transfer — old account is removed automatically. Teacher profile (`teacherId`) is reused, so payroll and student assignments carry over.
  - **Delete Account / Cancel Invite** — active users show Delete Account, pending invites show Cancel Invite. Both are simple Firestore deletes. Deleted users see AccessDenied on next sign-in; re-inviting the same Gmail works because same Google account = same UID = new Firestore doc.
  - **Table shows Active + Pending** — users and pending invites appear in the same table with status badges (Active / Pending Sign-in). Edit modal allows email editing on pending invites (not on active users).
  - **Unsaved changes warning** — global dirty-state system in App.jsx. Navigating away while a form has unsaved input shows a confirmation modal ("Stay and Keep Editing" / "Leave Without Saving"). Browser tab close also triggers the native beforeunload warning. Applied to: UserManagement, Students, Payroll, Rooms, CalendarView.
  - **Firestore rules** — added `invites` collection (sysadmin write, authenticated read, self-delete on claim). Users collection now allows `create` by the owner (for invite claiming) while keeping `update`/`delete` sysadmin-only.
  - **`Card` component** — added `forwardRef` support for scroll-to-form on Transfer.
- **v6:** Full Figma design system applied from "Free Dark Admin Dashboards" community template (Sidebar, Dashboard-1, User Section nodes)
  - **Color palette** — dark token object fully replaced: deep navy bg `#081028`, panel `#0B1739`, panel2 `#0A1330`, accent `#CB3CFF` (purple), plus semantic tokens: green `#14CA74`, red `#FF5A65`, amber `#FDB52A`, cyan `#00C2FF`, violet `#9A91FB`. Light token object unchanged.
  - **Typography** — Google Fonts updated: "Red Hat Display" (700) for all page/section headings; "Plus Jakarta Sans" (400/500/600/700) as body/UI font replacing DM Sans. All h2 page titles use `fontFamily: "'Red Hat Display'..."`.
  - **Sidebar** — 260px wide, `#081028` bg, `0.6px solid #343B4F` right border, box-shadow. Logo uses ♬ icon + Red Hat Display "StudioOS". Decorative search bar below logo. Active nav item uses left `2px solid #CB3CFF` border accent (no background fill). Footer: user avatar, name, role, notification bell, theme toggle (panel2 bg), sign-out button.
  - **Stat cards** — 8px border-radius, `0.6px solid #343B4F` border, three-dot menu (⋯) top-right, icon+label row at top, large value with inline percentage badge (green/red semi-transparent).
  - **Card** — borderRadius 12px, `0.6px solid #343B4F` border, `1px 1px 1px rgba(16,25,52,0.4)` box-shadow.
  - **Badge** — dot indicator (3px circle) before label text; borderRadius 2px; semi-transparent rgba backgrounds from Figma badge system. STATUS_META updated: present `#14CA74`, absent `#FF5A65`, late/pending `#FDB52A` with matching rgba bg/border.
  - **Btn** — primary `#CB3CFF` flat (no gradient), secondary `#0A1330`, ghost with `0.6px` border, danger `#2d0a1a`, borderRadius 4px, fontSize 12px.
  - **Inp/Sel** — borderRadius 4px, `0.6px solid #343B4F`, focus state: purple border `#CB3CFF` + `0 0 0 2px rgba(203,60,255,0.15)` glow via useState isFocused.
  - **Modal** — borderRadius 12px, `0.6px solid #343B4F`, `0px 17px 17px rgba(1,5,17,0.1)` shadow, `rgba(0,0,0,0.8)` backdrop.
  - **THead** — background T.panel2, fontSize 10px, fontWeight 600, `0.6px solid #343B4F` bottom border.
  - **Table rows** — hover via `onMouseEnter/onMouseLeave` setting T.hover bg, `0.6px solid T.border` row dividers, `11px 14px` td padding, fontSize 12px in all tables across Students, GradesAndFees, UserManagement views.
  - **Dashboard** — "Welcome back, [name]" heading with Red Hat Display, 4 stat cards row, two-column main area (attendance chart placeholder + two mini-cards), two-column bottom (instrument bars + today's sessions list with dot indicators and `0.6px` row dividers).
  - **Login** — centered card with borderRadius 12px and box-shadow, ♬ in 40px purple circle, "Welcome back" in Red Hat Display, full-width purple Google button.
  - **Search bars** — relative wrapper with 🔍 icon positioned left at 10px, `padding-left: 36px`, height 42px, matching Inp spec applied across Students and other list views.
- **v6.1 — Phase 1: Payroll accuracy, Fees Collected, Payout Preview**
  - **`calcStudentPayroll` rewrite** (`helpers.js`) — added `collected` param (default `false`); 0-attendance rule: if `!collected` OR (`attendanceBased && attended===0`) → all zeros; `adminFlatFee` capped at gross (`flatDeducted = Math.min(adminFlatFee, gross)`); `adminCut` now = total admin take (`gross − teacherCut`), eliminating the separate `adminFlatFee` return field (renamed to `flatDeducted`). Decimal accuracy throughout (no rounding in calculation layer).
  - **`usePayrollMonth` hook** (`src/hooks/usePayrollMonth.js`) — Firestore-backed state for `payroll_months/{yearMonth}` document. Tracks `feeStatus[studentId].{collected, collectedAt}` and `payoutStatus[teacherId].{paid, paidAt}`. Uses `updateDoc` with dot-notation keys to update individual entries without overwriting siblings; falls back to `setDoc` on first write.
  - **Firestore rules** — `payroll_months/{yearMonth}` collection added: authenticated read, admin/sysadmin write.
  - **Payroll view** — Integrated `usePayrollMonth`; each student row has a "Collected / Pending" toggle (interactive for admin/sysadmin, read-only for teachers) with `collectedAt` date display. Totals (Teacher Payouts, Admin Revenue, Total Collected) now only count collected students. Payout badge (Paid/Unpaid) shown per teacher card. **Export button** per teacher navigates to PayoutPreview route.
  - **PayoutPreview view** (`src/views/PayoutPreview.jsx`) — New route (sidebar visible, back button to payroll). Shows per-teacher payout table for the selected month: Student | Grade | Commission Type | Comm % | Attendance | Gross | Teacher Payout | Fees Collected. "Mark as Paid / Unmark Paid" button (Firestore-backed, shows paid date). **Download CSV** button exports the table as a properly escaped `.csv` file named `Payout_{Teacher}_{YYYY-MM}.csv`.
  - **Dashboard revenue sync** — Monthly Revenue stat now shows `totalCollected` (sum of gross for collected students only, using `calcStudentPayroll`). Teacher Payouts and Admin Revenue mini-cards show real computed values.
  - **Dashboard charts** — `AttendanceBarChart` SVG component (file-local): per-teacher bars coloured green ≥80%, amber ≥50%, red <50%, with % label, teacher name, and attended/scheduled count. Overall attendance rate shown as a percentage badge. Potential vs Collected revenue comparison row below chart.
  - **App.jsx** — `payoutPreviewCtx` state + `openPayoutPreview(teacher, year, month)` function; `payout_preview` added to views object (not in sidebar nav); `openPayoutPreview` passed to Payroll.
- **v6.2 — Phase 2: Fee deferral, Makeup scheduling, Payout CSV format**
  - **Fee deferral (Payroll)** — Admin can defer a student's teacher payout to any of the next 12 months. Fee collection (`collected`) and payout deferral (`deferredToMonth`) are independent — fee can be collected while payout is still deferred. When deferred: Teacher column shows "Deferred" (amber), Admin column shows "—", both excluded from month totals. Undo removes the deferral from both source and target month docs.
  - **Fee deferral UI** — Dedicated 9-column layout in Payroll desktop view. 9th column "Payout" (admin-only) shows: `Defer payout →` button on every student row; inline month picker (dropdown of next 12 months) on click; amber `→ Sep 2026` badge + Undo when already deferred; violet `+ from Aug 2026` when this month is receiving deferred payouts. Controls are inline within each grid row (no sub-row) to avoid `overflow: hidden` clipping.
  - **`usePayrollMonth` updates** — Added `deferFee(studentId, targetYearMonth)` and `undeferFee(studentId, targetYearMonth)`. Uses `arrayUnion`/`arrayRemove` for `deferredFromMonths` on the target doc. `deferFee` no longer forces `collected: false` — the two states are fully decoupled.
  - **`deferredGrossExtra`** — Target month computes extra gross from all `deferredFromMonths` by calling `calcStudentPayroll` with `collected=true` for each deferred month; added as 9th parameter to `calcStudentPayroll`. Multi-month deferral chains supported.
  - **Makeup class scheduling (CalendarView)** — When marking a non-attendance-based student absent, teacher/admin can schedule a makeup class on a specific date. Makeup sessions appear in CalendarView on the target date with a purple "Makeup · from YYYY-MM-DD" badge. Remove makeup button removes the `class_deferrals` doc. Uses `useClassDeferrals` hook (real-time listener on entire `class_deferrals` collection).
  - **`useClassDeferrals` hook** (`src/hooks/useClassDeferrals.js`) — Firestore-backed: `addDeferral({ studentId, teacherId, originalDate, makeupDate, createdBy })`, `removeDeferral(id)`. Collection shape: `{ studentId, teacherId, originalDate, makeupDate, feeYearMonth, createdBy, createdAt }`.
  - **Firestore rules** — `class_deferrals/{deferralId}` collection added: authenticated read/create/delete. Rules deployed to `ark-music-portal`.
  - **PayoutPreview CSV format** — Reformatted to match studio spreadsheet layout: header rows (`Teacher's Name`, `Month`), column headers `NO | STUDENT'S NAME | GRADE | FEES | ADMIN FEES | COM (TOTAL x N%) | DEFERRED TO | DEFERRED AMOUNT`, data rows with `-` for uncollected/non-deferred cells, `TOTAL SALARY` footer row. CSV filename: `Payout_{Teacher}_{YYYY-MM}.csv`. `DEFERRED AMOUNT` shows gross carried in from prior deferred months; `DEFERRED TO` shows target month when payout was deferred out. Deferred students show `-` for ADMIN FEES and `Deferred` for COM. `totalPayout` in footer excludes deferred students.
  - **Bug fix — Export button** (`App.jsx:85`) — `effectiveView` guard only allowed views present in the sidebar nav array; `payout_preview` (intentionally nav-less) was silently falling back to the dashboard. Fixed by adding `|| view === "payout_preview"` to the guard condition.
  - **Bug fix — Defer controls per row** — Previous sub-row approach (separate `<div>` after each grid row) was clipped by `overflow: hidden` on the card for all rows except the last, making it appear the control only worked on the bottom student. Fixed by moving all deferral controls inline within each student's grid row in the Collected/Payout column.
- **v6.3 — Grades & Fees redesign: syllabus types**
  - **Grades table removed** — The Grades tab (student grade editor table) has been removed from the Grades & Fees view entirely; grade editing remains available in the Students view.
  - **"No Grade" removed, "Debut" renamed "Beginner"** — `GRADE_LABELS` in `seed.js` updated: "No Grade" dropped, "Debut" → "Beginner". `SEED_FEES` keys updated accordingly. Seed student Diana Foo's grade updated from "Debut" → "Beginner".
  - **Syllabus types: Classical and Contemporary** — `CONTEMPORARY_GRADE_LABELS = ["Beginner","Intermediate","Advanced"]` added to `seed.js`. `SEED_CONTEMPORARY_FEES` added with default fees RM 160 / 200 / 250 per instrument (same defaults across all instruments). `contemporaryFees` / `setContemporaryFees` state added to `App.jsx` and spread into `shared` props.
  - **GradesAndFees view** — Top buttons replaced: **Classical** | **Contemporary** | **Both** (replacing the old Grades/Fees tabs). Instrument picker row remains. A single Card renders: classical fee grid (all `GRADE_LABELS`), contemporary fee grid (3 levels), or both sections stacked with their own `SectionTitle` labels — depending on the selected syllabus button. All fees remain editable inline.
- **v7 — Enrolment-centred rebuild (persistence, fees, deposits, month close)**
  - **Everything persisted in Firestore**; all demo/seed data removed. New collections: `students`, `enrolments`, `deposits`, `teachers`, `rooms`, `attendance`, `one_off_sessions`, `discounts`, `settings`, `month_snapshots`, `month_revisions`, `activity_log`. Rules rewritten (finalized-month freeze, deposit immutability, append-only logs).
  - **Enrolment model**: a student can learn several instruments; each enrolment has its own teacher, room, slot, grade/syllabus, fee, term, commission. Calendar/Rooms/Payroll/Dashboard render per enrolment.
  - **Rooms** have multiple types; classes can only use rooms whose types include the instrument. **Conflict checks** for student/room/teacher overlaps.
  - **Instruments** come only from Grades & Fees; deletion blocked while linked; dangling references nulled.
  - **Fees**: per-enrolment fee override (effective-from month), **billing term monthly | quarterly**, per-enrolment commission override, all snapshotted on collection and recorded in the activity log.
  - **Deposit**: per enrolment, default = first month's fee at the starting grade, non-refundable, auto-applied to the final fee when an enrolment is stopped, single-use, shown as a liability.
  - **Discounts page** + per-student discount on Payroll; Payroll table redesigned to two rows per student with a **Collection** column (collected + defer payout).
  - **Finalize Month** (immutable snapshot) and **Archive** (finalized months, sysadmin revisions with affected-month highlighting, notification archive, full backup). **Activity Log** page.
  - Grade lock was dropped in favour of Finalize Month + a collected-fee warning.
  - Vitest added (domain tests + view smoke tests); `docs/user-guide-teacher.md` added.
