import { useState } from "react";
import { useTheme } from "./hooks/useTheme.js";
import { getTokens } from "./utils/tokens.js";
import {
  SEED_STUDENTS, SEED_TEACHERS, SEED_ROOMS, SEED_FEES, SEED_ATTENDANCE
} from "./data/seed.js";

import Dashboard    from "./views/Dashboard.jsx";
import Students     from "./views/Students.jsx";
import CalendarView from "./views/CalendarView.jsx";
import Payroll      from "./views/Payroll.jsx";
import GradesAndFees from "./views/GradesAndFees.jsx";
import RoomsView    from "./views/RoomsView.jsx";

const NAV = [
  { id: "dashboard", label: "Dashboard",     icon: "◈" },
  { id: "calendar",  label: "Calendar",      icon: "▦" },
  { id: "students",  label: "Students",      icon: "♪" },
  { id: "payroll",   label: "Payroll",       icon: "₿" },
  { id: "grades",    label: "Grades & Fees", icon: "★" },
  { id: "rooms",     label: "Rooms",         icon: "⊞" },
];

export default function App() {
  const { theme, toggle } = useTheme();
  const T = getTokens(theme);

  const [view,               setView]               = useState("dashboard");
  const [students,           setStudents]            = useState(SEED_STUDENTS);
  const [teachers,           setTeachers]            = useState(SEED_TEACHERS);
  const [rooms,              setRooms]               = useState(SEED_ROOMS);
  const [fees,               setFees]                = useState(SEED_FEES);
  const [attendanceOverrides, setAttendanceOverrides] = useState(SEED_ATTENDANCE);
  const [adminFlatFee,       setAdminFlatFee]        = useState(5);

  const shared = {
    students, setStudents,
    teachers, setTeachers,
    rooms,    setRooms,
    fees,     setFees,
    attendanceOverrides, setAttendanceOverrides,
    adminFlatFee, setAdminFlatFee,
    T,
  };

  const views = {
    dashboard: <Dashboard  {...shared} />,
    calendar:  <CalendarView {...shared} />,
    students:  <Students   {...shared} />,
    payroll:   <Payroll    {...shared} />,
    grades:    <GradesAndFees {...shared} />,
    rooms:     <RoomsView  {...shared} />,
  };

  return (
    <div style={{
      minHeight: "100vh", background: T.bg, color: T.text,
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif", display: "flex"
    }}>
      {/* Sidebar */}
      <aside style={{
        width: 210, background: T.sidebar, borderRight: `1px solid ${T.border}`,
        display: "flex", flexDirection: "column", padding: "22px 0", flexShrink: 0,
        position: "sticky", top: 0, height: "100vh"
      }}>
        {/* Logo */}
        <div style={{ padding: "0 18px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, background: T.accent, borderRadius: 10,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, color: "#0b0b0f" }}>♬</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text, lineHeight: 1.1 }}>StudioOS</div>
              <div style={{ fontSize: 10, color: T.muted, fontWeight: 600 }}>Admin Panel</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1 }}>
          {NAV.map(n => {
            const active = view === n.id;
            return (
              <button key={n.id} onClick={() => setView(n.id)} style={{
                display: "flex", alignItems: "center", gap: 9, width: "100%",
                padding: "9px 18px", border: "none",
                background: active ? (theme === "dark" ? "#1a1a28" : "#f0f0fa") : "transparent",
                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                color: active ? T.accent : T.muted, fontWeight: active ? 700 : 400, fontSize: 13,
                borderRight: active ? `2px solid ${T.accent}` : "2px solid transparent",
                transition: "color 0.12s, background 0.12s"
              }}>
                <span style={{ fontSize: 15, width: 18, textAlign: "center" }}>{n.icon}</span>
                {n.label}
              </button>
            );
          })}
        </nav>

        {/* Footer: theme toggle + stats */}
        <div style={{ padding: "14px 18px", borderTop: `1px solid ${T.border}` }}>
          {/* Theme toggle */}
          <button onClick={toggle} style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            background: T.dim, border: "none", borderRadius: 8, padding: "7px 11px",
            cursor: "pointer", fontFamily: "inherit", marginBottom: 12, color: T.text, fontSize: 12, fontWeight: 600
          }}>
            <span style={{ fontSize: 15 }}>{theme === "dark" ? "☀️" : "🌙"}</span>
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>

          <div style={{ fontSize: 11, color: T.muted }}>
            <div style={{ marginBottom: 2 }}>{students.length} students · {teachers.length} teachers</div>
            <div>{rooms.length} rooms · RM{adminFlatFee} admin fee</div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, padding: 28, overflowY: "auto", maxHeight: "100vh" }}>
        {views[view]}
      </main>
    </div>
  );
}
