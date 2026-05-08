# StudioOS — Music Studio Admin Panel

A full-featured admin system for music studios. Handles students, teachers, attendance, room scheduling, payroll with commission splits, and grade/fee management.

## Quick Start

```bash
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
  hooks/        useTheme, useStudio (global state)
  components/   shared UI primitives
  views/        one file per page
  main.jsx      entry
  App.jsx       root layout & routing
```
