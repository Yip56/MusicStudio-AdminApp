import { useState, useEffect } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase.js";
import { useTheme } from "./hooks/useTheme.js";
import { useAuth } from "./hooks/useAuth.js";
import { useNotifications } from "./hooks/useNotifications.js";
import { useMobile } from "./hooks/useMobile.js";
import { getTokens } from "./utils/tokens.js";
import {
  SEED_STUDENTS, SEED_TEACHERS, SEED_ROOMS, SEED_FEES, SEED_ATTENDANCE
} from "./data/seed.js";

import Dashboard      from "./views/Dashboard.jsx";
import Students       from "./views/Students.jsx";
import CalendarView   from "./views/CalendarView.jsx";
import Payroll        from "./views/Payroll.jsx";
import GradesAndFees  from "./views/GradesAndFees.jsx";
import RoomsView      from "./views/RoomsView.jsx";
import UserManagement from "./views/UserManagement.jsx";
import Login          from "./views/Login.jsx";
import AccessDenied   from "./views/AccessDenied.jsx";
import { Avatar, Badge, Modal, Btn } from "./components/UI.jsx";

const ALL_NAV = [
  { id: "dashboard", label: "Dashboard",     icon: "◈", roles: ["admin", "sysadmin"] },
  { id: "calendar",  label: "Calendar",      icon: "▦", roles: ["teacher", "admin", "sysadmin"] },
  { id: "students",  label: "Students",      icon: "♪", roles: ["teacher", "admin", "sysadmin"] },
  { id: "payroll",   label: "Payroll",       icon: "₿", roles: ["admin", "sysadmin"] },
  { id: "grades",    label: "Grades & Fees", icon: "★", roles: ["admin", "sysadmin"] },
  { id: "rooms",     label: "Rooms",         icon: "⊞", roles: ["admin", "sysadmin"] },
  { id: "users",     label: "User Mgmt",     icon: "⚙", roles: ["sysadmin"] },
];

const MOBILE_PRIMARY = 3; // number of nav items shown in bottom bar before "More"

export default function App() {
  const { theme, toggle } = useTheme();
  const T = getTokens(theme);
  const { user, firestoreUser, role, loading, authError, signInWithGoogle, signOut } = useAuth();
  const { notifications, pendingCount, resolveNotification } = useNotifications(firestoreUser);
  const isMobile = useMobile();

  const [view,           setView]           = useState(null);
  const [notifOpen,      setNotifOpen]      = useState(false);
  const [moreOpen,       setMoreOpen]       = useState(false);
  const [dirty,          setDirty]          = useState(false);
  const [pendingNav,     setPendingNav]     = useState(null);
  const [students,       setStudents]       = useState(SEED_STUDENTS);
  const [teachers,       setTeachers]       = useState(SEED_TEACHERS);
  const [rooms,          setRooms]          = useState(SEED_ROOMS);
  const [fees,           setFees]           = useState(SEED_FEES);
  const [attendanceOverrides, setAttendanceOverrides] = useState(SEED_ATTENDANCE);
  const [adminFlatFee,   setAdminFlatFee]   = useState(5);
  const [oneOffSessions, setOneOffSessions] = useState([]);

  useEffect(() => {
    if (!dirty) return;
    const h = e => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  function navigateTo(id) {
    if (dirty) { setPendingNav(id); return; }
    setView(id);
  }

  // ── Auth gates ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0b0b0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`@keyframes _spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ width: 40, height: 40, border: "3px solid #1e1e2a", borderTop: "3px solid #e8b84b", borderRadius: "50%", animation: "_spin 0.8s linear infinite" }} />
    </div>
  );

  if (!user)            return <Login onSignIn={signInWithGoogle} error={authError} />;
  if (role === "denied") return <AccessDenied email={user.email} onSignOut={signOut} />;

  // ── Derived state ────────────────────────────────────────────────────────────
  const nav          = ALL_NAV.filter(n => n.roles.includes(role));
  const effectiveView = (view && nav.some(n => n.id === view)) ? view : nav[0]?.id;

  const currentUser = {
    uid:         user.uid,
    role,
    teacherId:   firestoreUser?.teacherId ?? null,
    displayName: user.displayName ?? firestoreUser?.displayName ?? "",
    photoURL:    user.photoURL    ?? firestoreUser?.photoURL    ?? null,
    email:       user.email,
  };

  // ── Firestore write helpers ──────────────────────────────────────────────────
  async function sendClashRequest(data) {
    await addDoc(collection(db, "notifications"), {
      ...data,
      type:       "clash_request",
      status:     "pending",
      createdAt:  serverTimestamp(),
      resolvedAt: null,
      resolvedBy: null,
    });
  }

  async function sendGradeRequest(data) {
    await addDoc(collection(db, "notifications"), {
      ...data,
      type:       "grade_request",
      toRole:     "admin",
      status:     "pending",
      createdAt:  serverTimestamp(),
      resolvedAt: null,
      resolvedBy: null,
    });
  }

  async function handleResolve(notif, status) {
    await resolveNotification(notif.id, status, currentUser.uid);
    if (notif.type === "clash_request") {
      if (status === "approved") {
        setOneOffSessions(prev => prev.map(s => s.id === notif.sessionId ? { ...s, status: "pending" } : s));
      } else {
        setOneOffSessions(prev => prev.filter(s => s.id !== notif.sessionId));
      }
    }
    if (notif.type === "grade_request" && status === "approved") {
      setStudents(prev => prev.map(s => s.id === notif.studentId ? { ...s, grade: notif.requestedGrade } : s));
    }
  }

  // ── Shared props ─────────────────────────────────────────────────────────────
  const shared = {
    students, setStudents,
    teachers, setTeachers,
    rooms,    setRooms,
    fees,     setFees,
    attendanceOverrides, setAttendanceOverrides,
    adminFlatFee, setAdminFlatFee,
    oneOffSessions, setOneOffSessions,
    T,
    currentUser,
    isMobile,
    setDirty,
  };

  const views = {
    dashboard: <Dashboard    {...shared} />,
    calendar:  <CalendarView {...shared} sendClashRequest={sendClashRequest} />,
    students:  <Students     {...shared} sendGradeRequest={sendGradeRequest} />,
    payroll:   <Payroll      {...shared} />,
    grades:    <GradesAndFees {...shared} />,
    rooms:     <RoomsView    {...shared} />,
    users:     <UserManagement {...shared} />,
  };

  const ROLE_COLOR = {
    teacher:  { color: "#60a5fa", bg: "#60a5fa18" },
    admin:    { color: "#c084fc", bg: "#c084fc18" },
    sysadmin: { color: T.accent,  bg: T.accent + "18" },
  };
  const rc = ROLE_COLOR[role] ?? { color: T.muted, bg: T.dim };

  // ── Notification drawer content (shared between mobile/desktop) ──────────────
  const notifDrawerContent = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 18px 14px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: T.text }}>Notifications</span>
        <button onClick={() => setNotifOpen(false)} style={{ background: "none", border: "none", color: T.muted, fontSize: 18, cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ flex: 1, padding: 14, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
        {notifications.length === 0 && (
          <p style={{ color: T.muted, fontSize: 13, textAlign: "center", marginTop: 20 }}>No pending requests.</p>
        )}
        {notifications.map(n => {
          const fromTeacher = teachers.find(t => t.id === n.fromTeacherId);
          const student     = students.find(s => s.id === n.studentId);
          const room        = rooms.find(r => r.id === n.requestedRoomId);
          const isClash     = n.type === "clash_request";
          const isGrade     = n.type === "grade_request";
          return (
            <div key={n.id} style={{ background: T.bg, border: `1px solid ${T.border2}`, borderRadius: 12, padding: "13px 14px" }}>
              <div style={{ marginBottom: 9 }}>
                <Badge
                  label={isClash ? "Room Clash Request" : "Grade Update Request"}
                  color={isClash ? "#fb923c" : "#60a5fa"}
                  bg={isClash ? "#451a03" : "#0c1a2e"}
                />
              </div>
              <div style={{ fontSize: 12, color: T.text, lineHeight: 1.7, marginBottom: 11 }}>
                {isClash && (
                  <>
                    <strong>{fromTeacher?.name ?? "A teacher"}</strong> wants to book{" "}
                    <strong>{room?.name ?? "a room"}</strong> on {n.requestedDate}{" "}
                    {n.requestedStartTime}–{n.requestedEndTime}. This conflicts with your student{" "}
                    <strong>{student?.name ?? "a student"}</strong>.
                  </>
                )}
                {isGrade && (
                  <>
                    Teacher <strong>{fromTeacher?.name ?? "—"}</strong> requests grade update for{" "}
                    <strong>{student?.name ?? "—"}</strong>:{" "}
                    <strong>{student?.grade}</strong> → <strong>{n.requestedGrade}</strong>.{" "}
                    Reason: {n.reason}
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 7 }}>
                <button onClick={() => handleResolve(n, "approved")} style={{
                  flex: 1, padding: "7px 0", borderRadius: 7, border: "none", cursor: "pointer",
                  fontFamily: "inherit", fontSize: 12, fontWeight: 700, background: "#052e16", color: "#4ade80"
                }}>Approve</button>
                <button onClick={() => handleResolve(n, "rejected")} style={{
                  flex: 1, padding: "7px 0", borderRadius: 7, border: "none", cursor: "pointer",
                  fontFamily: "inherit", fontSize: 12, fontWeight: 700, background: "#2d0a0a", color: "#f87171"
                }}>Reject</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  // ── Mobile layout ─────────────────────────────────────────────────────────────
  if (isMobile) {
    const mobileNavItems = nav.length <= MOBILE_PRIMARY ? nav : nav.slice(0, MOBILE_PRIMARY);
    const moreNavItems   = nav.length > MOBILE_PRIMARY  ? nav.slice(MOBILE_PRIMARY) : [];
    const showMoreBtn    = moreNavItems.length > 0;

    return (
      <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>

        {/* Top strip */}
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, height: 52,
          background: T.sidebar, borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", padding: "0 16px", zIndex: 100
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 30, height: 30, background: T.accent, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: "#0b0b0f" }}>♬</div>
            <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>StudioOS</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
            {/* Theme toggle */}
            <button onClick={toggle} style={{ background: "none", border: "none", cursor: "pointer", padding: 8, fontSize: 18 }}>
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            {/* Bell */}
            <button onClick={() => setNotifOpen(o => !o)} style={{ background: "none", border: "none", cursor: "pointer", position: "relative", padding: 8 }}>
              <span style={{ fontSize: 20 }}>🔔</span>
              {pendingCount > 0 && (
                <span style={{
                  position: "absolute", top: 4, right: 4, minWidth: 16, height: 16,
                  background: "#ef4444", borderRadius: 99, fontSize: 9, fontWeight: 700,
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px"
                }}>{pendingCount}</span>
              )}
            </button>
            {/* Avatar */}
            {currentUser.photoURL
              ? <img src={currentUser.photoURL} alt="" style={{ width: 32, height: 32, borderRadius: "50%", display: "block" }} />
              : <Avatar name={currentUser.displayName || currentUser.email || "?"} size={32} />
            }
          </div>
        </div>

        {/* Main content */}
        <main style={{ paddingTop: 52, paddingBottom: 60, minHeight: "100vh", overflowY: "auto" }}>
          <div style={{ padding: 16 }}>
            {views[effectiveView]}
          </div>
        </main>

        {/* Bottom nav */}
        <nav style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          background: T.sidebar, borderTop: `1px solid ${T.border}`,
          display: "flex", zIndex: 100, height: 60
        }}>
          {mobileNavItems.map(n => {
            const active = effectiveView === n.id;
            return (
              <button key={n.id} onClick={() => { navigateTo(n.id); setMoreOpen(false); }}
                style={{
                  flex: 1, padding: "8px 4px", border: "none",
                  background: active ? T.accent + "15" : "transparent",
                  cursor: "pointer", display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 3, color: active ? T.accent : T.muted,
                  fontFamily: "inherit", borderTop: active ? `2px solid ${T.accent}` : "2px solid transparent"
                }}>
                <span style={{ fontSize: 17 }}>{n.icon}</span>
                <span style={{ fontSize: 10, fontWeight: active ? 700 : 400, lineHeight: 1 }}>{n.label}</span>
              </button>
            );
          })}
          {showMoreBtn && (
            <button onClick={() => setMoreOpen(o => !o)}
              style={{
                flex: 1, padding: "8px 4px", border: "none",
                background: moreOpen ? T.accent + "15" : "transparent",
                cursor: "pointer", display: "flex", flexDirection: "column",
                alignItems: "center", gap: 3, color: moreOpen ? T.accent : T.muted,
                fontFamily: "inherit", borderTop: moreOpen ? `2px solid ${T.accent}` : "2px solid transparent"
              }}>
              <span style={{ fontSize: 17 }}>⋯</span>
              <span style={{ fontSize: 10, fontWeight: moreOpen ? 700 : 400, lineHeight: 1 }}>More</span>
            </button>
          )}
        </nav>

        {/* "More" drawer */}
        {moreOpen && (
          <>
            <div onClick={() => setMoreOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 98 }} />
            <div style={{
              position: "fixed", bottom: 60, left: 0, right: 0,
              background: T.sidebar, borderTop: `1px solid ${T.border2}`,
              zIndex: 99, paddingBottom: 4
            }}>
              {moreNavItems.map(n => {
                const active = effectiveView === n.id;
                return (
                  <button key={n.id} onClick={() => { navigateTo(n.id); setMoreOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 13, width: "100%",
                      padding: "14px 20px", border: "none",
                      background: active ? T.accent + "18" : "transparent",
                      cursor: "pointer", fontFamily: "inherit",
                      color: active ? T.accent : T.text, fontSize: 14, fontWeight: active ? 700 : 400
                    }}>
                    <span style={{ fontSize: 18 }}>{n.icon}</span>
                    {n.label}
                  </button>
                );
              })}
              <div style={{ padding: "10px 20px 6px", borderTop: `1px solid ${T.border}`, marginTop: 4 }}>
                <button onClick={signOut} style={{
                  display: "flex", alignItems: "center", gap: 10, background: "none",
                  border: "none", cursor: "pointer", fontFamily: "inherit", color: T.muted, fontSize: 13
                }}>↩ Sign Out</button>
              </div>
            </div>
          </>
        )}

        {pendingNav !== null && (
          <Modal T={T} title="Unsaved Changes" onClose={() => setPendingNav(null)}>
            <p style={{ fontSize: 14, color: T.text, lineHeight: 1.7, marginBottom: 20 }}>
              You have unsaved changes that will be lost if you navigate away. Are you sure you want to leave?
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
              <Btn T={T} variant="ghost" onClick={() => setPendingNav(null)}>Stay and Keep Editing</Btn>
              <Btn T={T} variant="danger" onClick={() => { setView(pendingNav); setPendingNav(null); setDirty(false); setMoreOpen(false); }}>
                Leave Without Saving
              </Btn>
            </div>
          </Modal>
        )}

        {/* Notification drawer — full screen on mobile */}
        {notifOpen && (
          <>
            <div onClick={() => setNotifOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 149 }} />
            <div style={{
              position: "fixed", inset: 0, background: T.panel,
              zIndex: 150, display: "flex", flexDirection: "column"
            }}>
              {notifDrawerContent}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Desktop layout ────────────────────────────────────────────────────────────
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

        <nav style={{ flex: 1 }}>
          {nav.map(n => {
            const active = effectiveView === n.id;
            return (
              <button key={n.id} onClick={() => navigateTo(n.id)} style={{
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

        <div style={{ padding: "14px 18px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ flexShrink: 0 }}>
              {currentUser.photoURL
                ? <img src={currentUser.photoURL} alt="" style={{ width: 28, height: 28, borderRadius: "50%", display: "block" }} />
                : <Avatar name={currentUser.displayName || currentUser.email || "?"} size={28} />
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 3 }}>
                {currentUser.displayName || currentUser.email}
              </div>
              <Badge label={role} color={rc.color} bg={rc.bg} />
            </div>
            <button onClick={() => setNotifOpen(o => !o)} title="Notifications"
              style={{ background: "none", border: "none", cursor: "pointer", position: "relative", padding: 4, flexShrink: 0 }}>
              <span style={{ fontSize: 16 }}>🔔</span>
              {pendingCount > 0 && (
                <span style={{
                  position: "absolute", top: 0, right: 0, minWidth: 16, height: 16,
                  background: "#ef4444", borderRadius: 99, fontSize: 9, fontWeight: 700,
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px"
                }}>{pendingCount}</span>
              )}
            </button>
          </div>

          <button onClick={toggle} style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            background: T.dim, border: "none", borderRadius: 8, padding: "7px 11px",
            cursor: "pointer", fontFamily: "inherit", marginBottom: 8, color: T.text, fontSize: 12, fontWeight: 600
          }}>
            <span style={{ fontSize: 15 }}>{theme === "dark" ? "☀️" : "🌙"}</span>
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>

          <button onClick={signOut} style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            background: "none", border: `1px solid ${T.border2}`, borderRadius: 8, padding: "7px 11px",
            cursor: "pointer", fontFamily: "inherit", color: T.muted, fontSize: 12, fontWeight: 600
          }}>
            ↩ Sign Out
          </button>
        </div>
      </aside>

      {/* Notification Drawer */}
      {notifOpen && (
        <>
          <div onClick={() => setNotifOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 299 }} />
          <div style={{
            position: "fixed", top: 0, right: 0, width: 340, height: "100vh",
            background: T.panel, borderLeft: `1px solid ${T.border2}`,
            zIndex: 300, display: "flex", flexDirection: "column"
          }}>
            {notifDrawerContent}
          </div>
        </>
      )}

      {/* Main content */}
      <main style={{ flex: 1, padding: 28, overflowY: "auto", maxHeight: "100vh" }}>
        {views[effectiveView]}
      </main>

      {pendingNav !== null && (
        <Modal T={T} title="Unsaved Changes" onClose={() => setPendingNav(null)}>
          <p style={{ fontSize: 14, color: T.text, lineHeight: 1.7, marginBottom: 20 }}>
            You have unsaved changes that will be lost if you navigate away. Are you sure you want to leave?
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
            <Btn T={T} variant="ghost" onClick={() => setPendingNav(null)}>Stay and Keep Editing</Btn>
            <Btn T={T} variant="danger" onClick={() => { setView(pendingNav); setPendingNav(null); setDirty(false); }}>
              Leave Without Saving
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
