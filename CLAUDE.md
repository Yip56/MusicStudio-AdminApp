# StudioOS — CLAUDE.md

## Project Overview
- **Name:** StudioOS
- **Purpose:** Music studio admin panel — manage students, teachers, rooms, payroll, attendance, scheduling
- **Stack:** React 18, Vite 5, pure CSS-in-JS (no external UI library), no backend (in-memory state)

## Architecture
- `src/data/seed.js` — all constants (`GRADE_LABELS`, `INSTRUMENTS`, `DAYS_OF_WEEK`, `HOURS`, `STATUS_META`, `ROOM_COLORS`) and seed data (`SEED_ROOMS`, `SEED_FEES`, `SEED_TEACHERS`, `SEED_STUDENTS`, `SEED_ATTENDANCE`)
- `src/utils/helpers.js` — pure calculation functions: `uid()`, `getRecurringDates()`, `getSessionsForDate()`, `getMergedSessionsForDate()`, `getScheduledCountForMonth()`, `getAttendedCountForMonth()`, `calcStudentPayroll()`, `timesOverlap()`, `fmtDate()`
- `src/utils/tokens.js` — dark/light theme token objects (`bg`, `panel`, `border`, `text`, `accent`, etc.) and `getTokens(theme)` selector
- `src/hooks/useTheme.js` — `useTheme()` hook, persists to localStorage
- `src/components/UI.jsx` — shared primitives: `Avatar`, `Badge`, `Card`, `Stat`, `Inp`, `Sel`, `Btn`, `Modal`, `SectionTitle`, `THead`, `Checkbox`
- `src/views/Dashboard.jsx` — overview stats and today's session list
- `src/views/Students.jsx` — student CRUD with recurring schedule (`dayOfWeek`, `startTime`, `endTime`, `roomId`) and `attendanceBased` toggle
- `src/views/CalendarView.jsx` — split month+day calendar, room columns, hover attendance picker on session cards
- `src/views/Payroll.jsx` — per-teacher commission breakdown, admin flat fee config, per-student gross/teacher/admin split
- `src/views/GradesAndFees.jsx` — student grade management and per-instrument fee table editor
- `src/views/RoomsView.jsx` — room CRUD, availability detail panel, free/occupied filter, timeline bar
- `src/App.jsx` — root layout, sidebar nav, theme toggle, global state initialization

## Key Business Logic
- Sessions are generated automatically from student recurring schedules (no manual calendar entry needed)
- Attendance is stored as overrides (`studentId` + `date` + `status`) against the recurring schedule
- Payroll: if `student.attendanceBased` → gross = (attended/scheduled) × fee; else → gross = full fee
- Admin flat fee is deducted from gross first, then remainder is split by `teacher.commissionPct / (100 - commissionPct)`
- Each teacher has their own `commissionPct` (not a global split)
- Rooms support conflict detection via `timesOverlap()`

## Theme System
- All components receive `T` (token object) as a prop from `App.jsx`
- Use `T.bg`, `T.panel`, `T.text`, `T.muted`, `T.accent`, `T.border`, `T.border2`, `T.dim`, `T.input`, `T.rowAlt`, `T.hover`, `T.sidebar`, `T.textSub`
- Never hardcode colors; always use T tokens so light/dark mode works correctly
- Active/selected states: use `T.accent` for color, `T.accent+"22"` for background
- Inactive states: MUST explicitly set `color` to `T.muted` and `background` to `"transparent"` or `"none"`

## Developer Notes
- To add a new view: create `src/views/MyView.jsx`, add it to `NAV` array and `views` object in `App.jsx`, pass shared props
- To add a new token: add to both `dark` and `light` objects in `tokens.js`
- All monetary values in RM (Malaysian Ringgit)
- Dates are `"YYYY-MM-DD"` strings throughout
- Times are `"HH:MM"` 24h strings throughout

## Changelog
- **v1:** Initial build — dashboard, students, attendance, payroll (hours-based), grades
- **v2:** Commission-based payroll, grade fees per instrument, room management, calendar hub
- **v3:** Recurring schedules, attendance-based toggle, per-teacher commission %, admin flat fee, multi-instrument teachers, hover attendance picker, light/dark theme, VSCode project structure
- **v3.1:** Three bug fixes:
  1. **Light-mode inactive nav/button color not resetting** — `tokens.js` had a typo `muted: "#7070888"` (7 hex digits, invalid CSS) causing the inactive text color to be ignored in light mode; corrected to `"#707088"`. Also changed nav inactive `background` from `"none"` to `"transparent"` for an explicit reset on every theme switch.
  2. **Hover attendance picker closing before click registers** — `SessionCard` in `CalendarView.jsx` had its `onMouseEnter`/`onMouseLeave` on the inner card div, and the dropdown positioned with `bottom: "calc(100% + 6px)"` creating a 6px gap. Mouse leaving the card across that gap dismissed the dropdown before any button click could land. Fixed by wrapping the card and dropdown together in a single outer container div that owns the mouse events; the dropdown now uses `bottom: "100%"` (no gap), so the combined element is one connected rectangle and the mouse never exits the hover zone when moving into the picker.
  3. **CLAUDE.md created** — documented project overview, architecture, business logic, theme system, and developer notes for future context.
