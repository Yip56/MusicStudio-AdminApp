# StudioOS — CLAUDE.md

## Project Overview
- **Name:** StudioOS
- **Purpose:** Music studio admin panel — manage students, teachers, rooms, payroll, attendance, scheduling
- **Stack:** React 18, Vite 5, pure CSS-in-JS (no external UI library)
- **Backend:** Firebase Auth (Google Sign-In) + Firestore (rules deployed, project: `ark-music-portal`)
- **In-memory state:** students, teachers, rooms, attendance, one-off sessions (not yet persisted to Firestore)
- **Firestore-persisted state:** `users`, `notifications`, `invites`, `payroll_months`, `class_deferrals`, **`fees`** (classical + contemporary fee schedules)

---

## Running the Project

```bash
npm run dev          # start dev server at http://localhost:5173
npm run build        # production build → dist/
firebase deploy --only firestore:rules   # push security rules
firebase deploy --only hosting           # deploy built app (run build first)
npm run build && firebase deploy --only hosting  # build + deploy in one go
```

---

## File Structure

```
src/
  firebase.js              Firebase init (auth, db, googleProvider, authSecondary)
  App.jsx                  Root layout, auth gating, sidebar, notification drawer
  data/seed.js             All constants + seed data (GRADE_LABELS, STATUS_META, etc.)
  utils/
    helpers.js             Pure functions: uid(), timesOverlap(), calcStudentPayroll(), etc.
    tokens.js              Dark/light theme token objects + getTokens(theme)
  hooks/
    useTheme.js            Theme toggle, persists to localStorage
    useAuth.js             Google Sign-In, Firestore user doc fetch, role resolution
    useNotifications.js    Real-time Firestore listener for pending notifications
  components/UI.jsx        Shared primitives: Avatar, Badge, Card, Stat, Inp, Sel, Btn, Modal, etc.
  views/
    Login.jsx              Full-screen sign-in card (shown when not authenticated)
    AccessDenied.jsx       Shown when user has no Firestore doc (role = "denied")
    Dashboard.jsx          Overview stats + today's sessions
    Students.jsx           Student CRUD + grade request flow (teacher-scoped)
    CalendarView.jsx       Month+day calendar, room columns, attendance picker, session booking
    Payroll.jsx            Per-teacher commission breakdown (teacher-scoped)
    GradesAndFees.jsx      Grade editor + per-instrument fee table (admin/sysadmin only)
    RoomsView.jsx          Room CRUD, availability panel, free/occupied filter, timeline
    UserManagement.jsx     Sysadmin-only: create/edit/revoke Firebase Auth + Firestore accounts
firestore.rules            Firestore security rules (source of truth — deploy via CLI)
firestore.indexes.json     Firestore composite index definitions
```

---

## Roles & Access

| Role | Views | Permissions |
|---|---|---|
| `teacher` | Calendar, Students | Own students only; mark attendance; book sessions; request grade changes |
| `admin` | All except User Mgmt | Full access to all data |
| `sysadmin` | Everything | Same as admin + create/edit/revoke user accounts |
| `denied` | Access Denied screen | No Firestore `users` doc exists for this Google account |

Auth gate order in App.jsx: **loading spinner → Login → AccessDenied → main app**

---

## Firestore Collections

### `users/{uid}`
| Field | Type | Notes |
|---|---|---|
| `uid` | string | Same as document ID |
| `email` | string | Lowercase |
| `displayName` | string | |
| `photoURL` | string \| null | |
| `role` | string | `teacher`, `admin`, or `sysadmin` |
| `teacherId` | string \| null | Links to in-memory teacher ID — required for teacher role |
| `createdAt` | timestamp | |
| `createdBy` | string | UID of the sysadmin who created this account |

### `invites/{id}`
| Field | Type | Notes |
|---|---|---|
| `email` | string | Lowercase Gmail — matched against `user.email` on first Google sign-in |
| `displayName` | string | Pre-filled name shown before the user claims the invite |
| `role` | string | `teacher`, `admin`, or `sysadmin` |
| `teacherId` | string \| null | Links to in-memory teacher profile — required for teacher role |
| `createdAt` | timestamp | |
| `createdBy` | string | UID of the sysadmin who created the invite |

When the invited person signs in with Google for the first time, `useAuth.js` queries this collection by email, creates `users/{uid}` from the invite data, and deletes the invite doc. Pending invites appear in the User Management table with a "Pending Sign-in" badge.

### `notifications/{id}`
| Field | Type | Notes |
|---|---|---|
| `type` | string | `clash_request` or `grade_request` |
| `fromTeacherId` | string | In-memory teacher ID of requester |
| `toTeacherId` | string | For clash: teacher whose slot is affected |
| `toRole` | string | For grade: `"admin"` |
| `studentId` | string | Relevant student |
| `requestedDate` | string | `YYYY-MM-DD` |
| `requestedStartTime` | string | `HH:MM` |
| `requestedEndTime` | string | `HH:MM` |
| `requestedRoomId` | string | For clash requests |
| `requestedGrade` | string | For grade requests |
| `sessionId` | string | ID of the oneOffSession in App state (clash only) |
| `reason` | string | |
| `status` | string | `pending`, `approved`, or `rejected` |
| `createdAt` | timestamp | |
| `resolvedAt` | timestamp \| null | |
| `resolvedBy` | string \| null | UID of resolver |

### `fees/classical` and `fees/contemporary`

Fee schedule documents — one per syllabus type. Each document has the same shape:

```
{
  "<Instrument>": {
    "<Level>": { "30": <RM>, "45": <RM>, "60": <RM> },
    ...
  },
  ...
}
```

- **Instruments:** Piano, Drum, Guitar, Violin, Vocals, Flute
- **Classical levels:** Beginner, Grade 1 – Grade 8 (9 levels)
- **Contemporary levels:** Beginner, Intermediate, Advanced (3 levels)
- **Prices:** RM per month for weekly lessons at the given session length (30/45/60 min)

Edited via **Grades & Fees** view → Save Changes button. Firestore rules: authenticated read, admin/sysadmin write.

**To add a new instrument:** Add it to `INSTRUMENTS` in `src/data/seed.js`, add default fee rows to `SEED_FEES` and `SEED_CONTEMPORARY_FEES`, then open Grades & Fees and save. The website fees page reads instruments dynamically from the Cloud Function response — no website changes needed.

---

## Cloud Function — `getPublicFees`

- **Source:** `functions/index.js`
- **Region:** `asia-southeast1` (same as Firestore database)
- **Runtime:** Node 20, firebase-functions v6 (v2 HTTPS)
- **Purpose:** Serves the full fee schedule as JSON to the public lead-gen website. Uses Firebase Admin SDK server-side — Firestore client security rules are bypassed.
- **Response shape:** `{ classical: { Piano: { Beginner: { "30": N, "45": N, "60": N }, ... }, ... }, contemporary: { ... } }`
- **Caching:** `Cache-Control: public, max-age=600` (10 minutes) — reduces Firestore reads on page load
- **Auth:** None required (public endpoint). CORS `*` allowed.
- **Deploy:** `cd studio-os && firebase deploy --only functions`
- **URL:** Shown in terminal after first deploy. Copy it into the website's `VITE_FEES_API_URL` env var.
  Find it later with: `firebase functions:list`

---

## Theme System
- All views receive `T` (token object) as a prop from App.jsx
- Tokens: `T.bg`, `T.panel`, `T.panel2`, `T.text`, `T.textSub`, `T.muted`, `T.accent`, `T.border`, `T.border2`, `T.dim`, `T.input`, `T.rowAlt`, `T.hover`, `T.sidebar`
- Never hardcode colors — always use T tokens
- Active state: `color: T.accent`, `background: T.accent + "22"`
- Inactive state: MUST explicitly set `color: T.muted`, `background: "transparent"`

---

## Key Business Logic
- Sessions generated automatically from student recurring schedules — no manual calendar entries needed
- Attendance stored as overrides (`studentId + date + status`) in `attendanceOverrides` state
- Payroll: `attendanceBased` → gross = (attended/scheduled) × fee; else → gross = full fee
- Admin flat fee deducted from gross first, then split by `commissionPct`
- One-off sessions (CalendarView bookings) stored in `oneOffSessions` App state — not yet in Firestore
- Clash detection uses `timesOverlap(startA, endA, startB, endB)` from helpers.js

---

## Operational Runbook

### Add a new user account (teacher or admin)
1. Sign in as **sysadmin** → go to **User Mgmt** in the sidebar
2. Select the Role — the form changes accordingly:
   - **Teacher**: fill in Full Name, Gmail, instruments, commission % — teacher profile is created automatically
   - **Admin / Sysadmin**: fill in Full Name, Gmail, and optionally link an existing teacher profile
   - **Student**: fill in student profile fields — no Gmail needed (students don't sign in)
3. Click **Create Invite**
4. Tell the person to open the app and click **Sign in with Google** using that Gmail — their account activates automatically on first sign-in

> No Firebase Auth account is pre-created. The invite is just a Firestore doc. The user's Google Sign-In creates the actual Auth record when they first sign in.

### Add a teacher profile (separate from their user account)
1. Sign in as **admin** or **sysadmin** → go to **Payroll**
2. Click **+ Add Teacher** → fill in name, instruments, commission %
3. Save — the teacher now appears in the payroll breakdown and can be linked to a user account in User Mgmt

### Bootstrap the very first sysadmin (one-time setup)
No sysadmin exists yet, so you must create the first one manually in Firestore:
1. Open the app → click **Sign in with Google** → you will see Access Denied (expected)
2. Firebase Console → **Authentication** → **Users** tab → copy your **UID**
3. Firebase Console → **Firestore** → `users` collection → **Add document**
4. Set Document ID = your UID, then add these fields:

| Field | Type | Value |
|---|---|---|
| `uid` | string | your UID |
| `email` | string | your gmail (lowercase) |
| `displayName` | string | your name |
| `role` | string | `sysadmin` |
| `teacherId` | null | — |
| `createdAt` | timestamp | now |

5. Refresh the app — full sysadmin access granted

### Edit or delete a user
- **Edit** (change name, role, linked teacher): User Mgmt → Edit button on their row. For pending invites, email can also be edited.
- **Delete Account** (immediate lockout): User Mgmt → Delete button → confirm. Their Firestore `users` doc is deleted; next sign-in attempt shows Access Denied. Their Google account is unaffected.
- **Cancel Invite** (pending invite): User Mgmt → Delete button on a Pending row → confirm. The invite doc is deleted; they can no longer activate an account with that Gmail.

### Transfer an account (user switching Gmail)
1. User Mgmt → Transfer button on the user's row
2. Confirm the transfer modal
3. The form pre-fills with the old account's info — enter the new Gmail address
4. Click **Create & Transfer** — a new invite is created for the new Gmail, old account is removed
5. Tell the user to sign in with their new Gmail — their role and teacher profile carry over automatically

### User sees "Access Denied" unexpectedly
Their Firestore `users` doc is missing or was deleted. Options:
- If legitimate user: go to User Mgmt → Create Account again (they get a new UID → new doc)
- Or: Firebase Console → Firestore → `users` collection → find/add their doc manually

### Change a user's role
User Mgmt → Edit → change Role dropdown → Save. Takes effect on their next page load (or immediate if they reload).

### Update Firestore security rules
1. Edit `firestore.rules` in the project root
2. Run: `firebase deploy --only firestore:rules`
3. Rules are live instantly — no app restart needed

### Deploy the app to Firebase Hosting
```bash
npm run build
firebase deploy --only hosting
```
The live URL will be shown in the terminal after deploy (e.g. `https://ark-music-portal.web.app`).

### Add a new view/page to the app
1. Create `src/views/MyView.jsx`
2. In `App.jsx`: import it, add to `ALL_NAV` array with `{ id, label, icon, roles }`, add to `views` object
3. Pass `shared` props (includes `T`, `currentUser`, all state)

### Add a new theme color token
1. Add to both `dark` and `light` objects in `src/utils/tokens.js`
2. Use as `T.myNewToken` in any component

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
