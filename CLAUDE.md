# StudioOS — CLAUDE.md

## Project Overview
- **Name:** StudioOS
- **Purpose:** Music studio admin panel — manage students, teachers, rooms, payroll, attendance, scheduling
- **Stack:** React 18, Vite 5, pure CSS-in-JS (no external UI library)
- **Backend:** Firebase Auth (Google Sign-In) + Firestore (rules deployed, project: `ark-music-portal`)
- **In-memory state:** students, teachers, rooms, fees, attendance, one-off sessions (not yet persisted to Firestore — only `users` and `notifications` collections are in Firestore)

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
2. Fill in Full Name, Gmail address, Role, and (if teacher) link a Teacher Profile
3. Click **Create Account**
4. Tell the person to open the app and click **Sign in with Google** using that Gmail — they are in immediately, no password needed

> The Teacher Profile (name, instruments, commission %) must already exist in **Payroll → Add Teacher** before you can link it to a user account.

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

### Edit or revoke a user
- **Edit** (change name, role, linked teacher): User Mgmt → Edit button on their row
- **Revoke** (immediate lockout): User Mgmt → Revoke button → confirm. Their Firestore doc is deleted; next sign-in attempt shows Access Denied

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
