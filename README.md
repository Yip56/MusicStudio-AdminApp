# StudioOS — Music Studio Admin Panel

A full-featured admin system for music studios. Handles students, teachers, attendance, room scheduling, payroll with commission splits, and grade/fee management.

## Quick Start

```bash
npx @anthropic-ai/claude-code
npm install
npm run dev
```

Open http://localhost:5173

## Tech Stack
- React 18
- Vite 5
- Pure CSS-in-JS (no external UI library)

## Features
- **Dashboard** — at-a-glance stats
- **Calendar & Rooms** — month + day view with per-room columns, auto-sessions from recurring schedules, hover attendance marking
- **Students** — recurring class schedules, attendance-based commission toggle
- **Payroll** — per-teacher commission splits, admin fee, flat vs attendance-based calculation
- **Grades & Fees** — per-instrument fee tables (No Grade, Debut, Grade 1–8)
- **Room Management** — room availability view, free/occupied filter
- **Settings** — rooms config, theme (light/dark)

## Project Structure
```
src/
  data/         seed data & constants
  utils/        calculation helpers
  hooks/        useTheme, useAuth, useNotifications
  components/   shared UI primitives
  views/        one file per page
  firebase.js   Firebase app + auth + Firestore exports
  main.jsx      entry
  App.jsx       root layout & routing
```

---

## Firebase Setup

### 1. Create a Firebase project
Go to [https://console.firebase.google.com](https://console.firebase.google.com), click **Add project**, follow the wizard.

### 2. Enable Google Sign-In
Firebase Console → **Authentication** → **Sign-in method** → enable **Google** → Save.

### 3. Create Firestore Database
Firebase Console → **Firestore Database** → **Create database** → start in **test mode** for now.

### 4. Register the web app and paste config
Firebase Console → **Project Settings** → **General** → scroll to **Your apps** → click **Add app** → Web → copy the config object → paste into `src/firebase.js`, replacing the `YOUR_*` placeholders.

### 5. Add localhost to Authorized Domains
Firebase Console → **Authentication** → **Settings** → **Authorized domains** → **Add domain** → `localhost`.

---

### Firestore Security Rules

Paste these into Firebase Console → **Firestore** → **Rules** tab → Publish:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSysadmin() {
      return request.auth != null
        && exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "sysadmin";
    }
    function isOwner(uid) {
      return request.auth != null && request.auth.uid == uid;
    }
    match /users/{uid} {
      allow read: if isOwner(uid) || isSysadmin();
      allow write: if isSysadmin();
    }
    match /notifications/{notifId} {
      allow read:   if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null;
      allow delete: if isSysadmin();
    }
  }
}
```

---

### Bootstrap: creating the first sysadmin

No sysadmin exists yet, so you must create the first one manually:

1. Open the app in your browser and sign in with your Google account — you will see **Access Denied**.
2. Firebase Console → **Authentication** → **Users** tab → copy your **UID**.
3. Firebase Console → **Firestore** → `users` collection → **Add document**.
4. Set **Document ID** to your UID, then add these fields:

| Field | Type | Value |
|---|---|---|
| `uid` | string | *(your UID)* |
| `email` | string | *(your gmail)* |
| `displayName` | string | *(your name)* |
| `role` | string | `sysadmin` |
| `teacherId` | null | — |
| `createdAt` | timestamp | *(now)* |

5. Refresh the app — you now have full sysadmin access.

---

### Creating user accounts (sysadmin only)

After signing in as sysadmin, go to **User Mgmt** in the sidebar. Fill in the name, Gmail address, role, and (for teachers) link a teacher profile. Click **Create Account**. The user then signs in via the normal **Sign in with Google** button — they never need a password.
