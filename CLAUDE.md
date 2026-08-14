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
