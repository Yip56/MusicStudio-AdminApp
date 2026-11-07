import { useState, useEffect, useRef } from "react";
import { collection, addDoc, serverTimestamp, doc, getDoc, setDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase.js";
import { useTheme } from "./hooks/useTheme.js";
import { useAuth } from "./hooks/useAuth.js";
import { useNotifications } from "./hooks/useNotifications.js";
import { useMobile } from "./hooks/useMobile.js";
import { useClassDeferrals } from "./hooks/useClassDeferrals.js";
import { useStudio } from "./hooks/useStudio.js";
import { getTokens } from "./utils/tokens.js";
import { diffFields } from "./domain/audit.js";
import { getInstruments } from "./domain/instruments.js";
import { checkGradeRequestLimit, validateGradeResolution, buildGradeReply } from "./domain/gradeRequests.js";

import Dashboard      from "./views/Dashboard.jsx";
import Students       from "./views/Students.jsx";
import CalendarView   from "./views/CalendarView.jsx";
import Payroll        from "./views/Payroll.jsx";
import PayoutPreview  from "./views/PayoutPreview.jsx";
import GradesAndFees  from "./views/GradesAndFees.jsx";
import RoomsView      from "./views/RoomsView.jsx";
import DiscountsView  from "./views/DiscountsView.jsx";
import ArchiveView    from "./views/ArchiveView.jsx";
import ActivityLogView from "./views/ActivityLogView.jsx";
import UserManagement from "./views/UserManagement.jsx";
import Login          from "./views/Login.jsx";
import AccessDenied   from "./views/AccessDenied.jsx";
import { Avatar, Badge, Modal, Btn, Sheet, ShakeBox } from "./components/UI.jsx";
import CommandPalette from "./components/CommandPalette.jsx";
import { spotlight } from "./utils/spotlight.js";

const ALL_NAV = [
  { id: "dashboard", label: "Dashboard",     icon: "◈", roles: ["admin", "sysadmin"] },
  { id: "calendar",  label: "Calendar",      icon: "▦", roles: ["teacher", "admin", "sysadmin"] },
  { id: "students",  label: "Students",      icon: "♪", roles: ["teacher", "admin", "sysadmin"] },
  { id: "payroll",   label: "Payroll",       icon: "₿", roles: ["admin", "sysadmin"] },
  { id: "discounts", label: "Discounts",     icon: "%", roles: ["admin", "sysadmin"] },
  { id: "grades",    label: "Grades & Fees", icon: "★", roles: ["admin", "sysadmin"] },
  { id: "rooms",     label: "Rooms",         icon: "⊞", roles: ["admin", "sysadmin"] },
  { id: "archive",   label: "Archive",       icon: "▤", roles: ["teacher", "admin", "sysadmin"] },
  { id: "activity",  label: "Activity Log",  icon: "≡", roles: ["admin", "sysadmin"] },
  { id: "users",     label: "User Mgmt",     icon: "⚙", roles: ["sysadmin"] },
];

const MOBILE_PRIMARY = 4; // number of nav items shown in the floating tab bar before "More"

export default function App() {
  const { theme, toggle } = useTheme();
  const T = getTokens(theme);
  const { user, firestoreUser, role, loading, authError, signInWithGoogle, switchAccount, signOut } = useAuth();
  const { notifications, pendingCount, resolveNotification, dismissNotification } = useNotifications(firestoreUser);
  const [gradeNotes,        setGradeNotes]        = useState({});   // admin's note per pending grade request
  const [gradeNoteErr,      setGradeNoteErr]      = useState({});   // { [notifId]: shake count } once a reject was blocked
  const isMobile = useMobile();

  const [view,              setView]              = useState(null);
  const [notifOpen,         setNotifOpen]         = useState(false);
  const [moreOpen,          setMoreOpen]          = useState(false);
  const [profileOpen,       setProfileOpen]       = useState(false);
  const [paletteOpen,       setPaletteOpen]       = useState(false);
  const [focusStudentId,    setFocusStudentId]    = useState(null);
  const [intent,            setIntent]            = useState(null);   // quick-search target: { page, id, open, arg, nonce }
  const [dirty,             setDirty]             = useState(false);
  const [pendingNav,        setPendingNav]        = useState(null);
  const [payoutPreviewCtx,  setPayoutPreviewCtx]  = useState(null);
  const [fees,             setFees]             = useState({});
  const [contemporaryFees, setContemporaryFees] = useState({});
  const [feesLoaded,       setFeesLoaded]       = useState(false);
  const feesBaseline = useRef({ fees: {}, contemporaryFees: {} });
  // role is only set once the users/{uid} doc is read or the invite claimed — Firestore rules require that doc
  const signedIn = !!user && !!role && role !== "denied" && !loading;
  const { deferrals, addDeferral, removeDeferral, updateDeferralStatus } = useClassDeferrals(signedIn);
  const currentUser = user ? {
    uid:         user.uid,
    role,
    teacherId:   firestoreUser?.teacherId ?? null,
    displayName: user.displayName ?? firestoreUser?.displayName ?? "",
    photoURL:    user.photoURL    ?? firestoreUser?.photoURL    ?? null,
    email:       user.email,
  } : null;

  // All studio data (students, enrolments, deposits, teachers, rooms, attendance…) lives in Firestore
  const studio = useStudio({ enabled: signedIn, actor: currentUser, fees, contemporaryFees });
  const { students, enrolments, deposits, teachers, rooms, attendance, oneOffSessions, discounts,
          monthSnapshots, monthRevisions, adminFlatFee, instruments, tables, calendar, actions, log } = studio;

  // Theme -> CSS variables (hover/selection/solid fallbacks used by index.css) and the browser's status-bar colour
  useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty("--sos-hover", T.hover);
    r.setProperty("--sos-sel", "rgba(203,60,255,0.08)");
    r.setProperty("--sos-accent", "#CB3CFF");
    r.setProperty("--sos-solid", T.panel);
    r.colorScheme = theme;
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", T.bg));
  }, [theme]);

  // Ctrl/Cmd+K opens quick search
  useEffect(() => {
    const h = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(o => !o); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // Quick search picked something: once its page has rendered, scroll to it and pulse a ring around it
  useEffect(() => (intent?.id ? spotlight(intent.id) : undefined), [intent?.nonce]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dirty) return;
    const h = e => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // Load fees from Firestore once authenticated. The fee tables ARE the instrument list.
  useEffect(() => {
    if (!user?.uid || !signedIn) return;
    let cancelled = false;
    async function loadFees() {
      try {
        const [cs, co] = await Promise.all([
          getDoc(doc(db, "fees", "classical")),
          getDoc(doc(db, "fees", "contemporary")),
        ]);
        if (cancelled) return;
        const c = cs.exists() ? cs.data() : {};
        const t = co.exists() ? co.data() : {};
        setFees(c); setContemporaryFees(t);
        feesBaseline.current = { fees: c, contemporaryFees: t };
      } catch (e) {
        console.error("[fees] load failed:", e.message);
      }
      if (!cancelled) setFeesLoaded(true);
    }
    loadFees();
    return () => { cancelled = true; };
  }, [user?.uid, signedIn]);

  // Instruments removed from Grades & Fees → drop dangling references (admins only, once fees + data are loaded)
  const cleaned = useRef(false);
  useEffect(() => {
    if (cleaned.current || !feesLoaded || !studio.loaded || instruments.length === 0) return;
    if (role !== "admin" && role !== "sysadmin") return;
    cleaned.current = true;
    actions.cleanupInstruments().catch(e => console.error("[instrument cleanup]", e.message));
  }, [feesLoaded, studio.loaded, instruments.length, role]);

  function navigateTo(id) {
    if (dirty) { setPendingNav(id); return; }
    setView(id);
  }

  // ── Auth gates ──────────────────────────────────────────────────────────────
  const spinner = (
    <div style={{ minHeight: "100vh", background: "#081028", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`@keyframes _spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ width: 40, height: 40, border: "3px solid #212C4D", borderTop: "3px solid #CB3CFF", borderRadius: "50%", animation: "_spin 0.8s linear infinite" }} />
    </div>
  );
  if (loading) return spinner;

  if (!user)            return <Login onSignIn={signInWithGoogle} error={authError} />;
  if (role === "denied") return <AccessDenied email={user.email} onSignOut={signOut} />;
  if (!feesLoaded || !studio.loaded) return spinner;

  // ── Derived state ────────────────────────────────────────────────────────────
  const nav          = ALL_NAV.filter(n => n.roles.includes(role));
  const effectiveView = (view && (nav.some(n => n.id === view) || view === "payout_preview")) ? view : nav[0]?.id;

  // ── Firestore write helpers ──────────────────────────────────────────────────
  async function saveFees() {
    const before = feesBaseline.current;
    await Promise.all([
      setDoc(doc(db, "fees", "classical"),    fees),
      setDoc(doc(db, "fees", "contemporary"), contemporaryFees),
    ]);
    const was = getInstruments(before.fees, before.contemporaryFees);
    const now = getInstruments(fees, contemporaryFees);
    const changedCells = (a, b) => {
      let n = 0;
      for (const inst of new Set([...Object.keys(a), ...Object.keys(b)])) {
        for (const g of new Set([...Object.keys(a[inst] ?? {}), ...Object.keys(b[inst] ?? {})])) {
          for (const d of ["30", "45", "60"]) if ((a[inst]?.[g]?.[d] ?? null) !== (b[inst]?.[g]?.[d] ?? null)) n++;
        }
      }
      return n;
    };
    const cells = changedCells(before.fees, fees) + changedCells(before.contemporaryFees, contemporaryFees);
    const added = now.filter(i => !was.includes(i)), removed = was.filter(i => !now.includes(i));
    await log({
      type: "fee", action: "schedule",
      summary: `Fee schedule saved: ${cells} price(s) changed${added.length ? `, added ${added.join(", ")}` : ""}${removed.length ? `, removed ${removed.join(", ")}` : ""}`,
      changes: [
        ...(added.length || removed.length ? diffFields({ instruments: was }, { instruments: now }) : []),
      ],
    });
    feesBaseline.current = { fees: structuredClone(fees), contemporaryFees: structuredClone(contemporaryFees) };
    setDirty(false);
  }

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
    // Anti-spam: max 3 requests per teacher per student per hour (checked against what is stored)
    const prev = await getDocs(query(collection(db, "notifications"), where("fromTeacherId", "==", data.fromTeacherId), where("studentId", "==", data.studentId)));
    const limit = checkGradeRequestLimit(prev.docs.map(d => d.data()).filter(d => d.type === "grade_request"));
    if (!limit.ok) throw new Error(limit.message);
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
    const isGradeReq = notif.type === "grade_request";
    const note = isGradeReq ? (gradeNotes[notif.id] ?? "").trim() : "";
    if (isGradeReq) {
      const problem = validateGradeResolution(status, note);
      if (problem) { setGradeNoteErr(m => ({ ...m, [notif.id]: (m[notif.id] ?? 0) + 1 })); return; }
    }
    await resolveNotification(notif.id, status, currentUser.uid, note);
    if (isGradeReq) {
      // Reply to the teacher who asked: approved/rejected, with the admin's note
      const e = enrolments.find(x => x.id === notif.enrolmentId);
      await addDoc(collection(db, "notifications"), { ...buildGradeReply(notif, { outcome: status, note, fromGrade: e?.grade }), createdAt: serverTimestamp(), resolvedAt: null, resolvedBy: null });
      setGradeNotes(m => { const { [notif.id]: _, ...rest } = m; return rest; });
      setGradeNoteErr(m => { const { [notif.id]: _, ...rest } = m; return rest; });
    }
    if (notif.type === "clash_request") {
      if (status === "approved") await actions.updateOneOff(notif.sessionId, { status: "pending" }).catch(() => {});
      else                       await actions.deleteOneOff(notif.sessionId).catch(() => {});
    }
    if (notif.type === "grade_request" && status === "approved") {
      const e = enrolments.find(x => x.id === notif.enrolmentId);
      if (e) await actions.updateEnrolment(e, { grade: notif.requestedGrade });
    }
    log({
      type: "notification", action: status,
      summary: `${status === "approved" ? "Approved" : "Rejected"} ${notif.type === "clash_request" ? "room clash request" : notif.type === "grade_request" ? "grade update" : notif.type}${note ? ` — "${note}"` : ""}`,
      entity: { kind: "notification", id: notif.id },
    });
  }

  // ── Shared props ─────────────────────────────────────────────────────────────
  const shared = {
    students, enrolments, deposits, teachers, rooms, attendance, oneOffSessions, discounts,
    monthSnapshots, monthRevisions, adminFlatFee, instruments, tables, calendar, actions, log,
    fees,     setFees,
    contemporaryFees, setContemporaryFees,
    deferrals, addDeferral, removeDeferral, updateDeferralStatus,
    saveFees,
    T,
    currentUser,
    isMobile,
    setDirty,
    goTo: navigateTo,
    intent,
  };

  function openPayoutPreview(teacher, year, month) {
    setPayoutPreviewCtx({ teacher, year, month });
    setView("payout_preview");
  }

  const views = {
    dashboard:      <Dashboard    {...shared} />,
    calendar:       <CalendarView {...shared} sendClashRequest={sendClashRequest} />,
    students:       <Students     {...shared} sendGradeRequest={sendGradeRequest} focusStudentId={focusStudentId} onFocusHandled={() => setFocusStudentId(null)} />,
    payroll:        <Payroll      {...shared} openPayoutPreview={openPayoutPreview} />,
    discounts:      <DiscountsView {...shared} />,
    grades:         <GradesAndFees {...shared} />,
    rooms:          <RoomsView    {...shared} />,
    archive:        <ArchiveView  {...shared} />,
    activity:       <ActivityLogView {...shared} />,
    users:          <UserManagement {...shared} />,
    payout_preview: payoutPreviewCtx
      ? <PayoutPreview
          {...shared}
          teacher={payoutPreviewCtx.teacher}
          year={payoutPreviewCtx.year}
          month={payoutPreviewCtx.month}
          onBack={() => { setPayoutPreviewCtx(null); setView("payroll"); }}
        />
      : null,
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
          const enrol       = enrolments.find(e => e.id === n.enrolmentId);
          const room        = rooms.find(r => r.id === n.requestedRoomId);
          const isClash     = n.type === "clash_request";
          const isGrade     = n.type === "grade_request";
          const isTrial     = n.type === "trial_booking";
          const isReply     = n.type === "grade_reply";
          return (
            <div key={n.id} style={{ background: T.bg, border: `1px solid ${T.border2}`, borderRadius: 12, padding: "13px 14px" }}>
              <div style={{ marginBottom: 9 }}>
                <Badge
                  label={isClash ? "Room Clash Request" : isGrade ? "Update Grade" : isReply ? "Grade Update Reply" : "Free Trial Booking"}
                  color={isClash ? "#fb923c" : isGrade || isReply ? "#60a5fa" : "#4ade80"}
                  bg={isClash ? "#451a03" : isGrade || isReply ? "#0c1a2e" : "#052e16"}
                />
              </div>
              <div style={{ fontSize: 12, color: T.text, lineHeight: 1.7, marginBottom: 11 }}>
                {isClash && (
                  <>
                    <strong>{currentUser?.role === "teacher" ? "Another teacher" : (fromTeacher?.name ?? "A teacher")}</strong> wants to book{" "}
                    <strong>{room?.name ?? "a room"}</strong> on {n.requestedDate}{" "}
                    {n.requestedStartTime}–{n.requestedEndTime}. This conflicts with your student{" "}
                    <strong>{student?.name ?? "a student"}</strong>.
                  </>
                )}
                {isGrade && (
                  <>
                    Teacher <strong>{fromTeacher?.name ?? "—"}</strong> wants to update the grade for{" "}
                    <strong>{student?.name ?? "—"}</strong>:{" "}
                    {enrol?.instrument && <>({enrol.instrument}) </>}
                    <strong>{enrol?.grade}</strong> → <strong>{n.requestedGrade}</strong>.{" "}
                    Reason: {n.reason}
                    <div style={{ marginTop: 6, color: T.muted, fontSize: 11 }}>
                      Approving changes the grade for future fees only — a fee that is already collected keeps its amount.
                    </div>
                  </>
                )}
                {isGrade && (
                  <div style={{ marginTop: 8 }}>
                    <textarea
                      value={gradeNotes[n.id] ?? ""} rows={2}
                      onChange={ev => setGradeNotes(m => ({ ...m, [n.id]: ev.target.value }))}
                      placeholder="Note to the teacher (required if rejecting)"
                      style={{ width: "100%", boxSizing: "border-box", background: T.input, border: `0.6px solid ${T.border2}`, borderRadius: 6, color: T.text, padding: "7px 9px", fontSize: 12, fontFamily: "inherit", outline: "none", resize: "vertical" }} />
                    {gradeNoteErr[n.id] > 0 && !(gradeNotes[n.id] ?? "").trim() && (
                      <ShakeBox shake={gradeNoteErr[n.id]} style={{ fontSize: 11, color: "#FF5A65", marginTop: 4 }}>Add a note explaining why the request is rejected.</ShakeBox>
                    )}
                  </div>
                )}
                {isReply && (
                  <>
                    Your grade update for <strong>{student?.name ?? "a student"}</strong>
                    {enrol?.instrument && <> ({enrol.instrument})</>}{n.fromGrade && <> — <strong>{n.fromGrade}</strong> → <strong>{n.requestedGrade}</strong></>} was{" "}
                    <strong style={{ color: n.outcome === "approved" ? "#4ade80" : "#f87171" }}>{n.outcome}</strong>.
                    {n.note && <div style={{ marginTop: 6, color: T.muted }}>Note from admin: {n.note}</div>}
                  </>
                )}
                {isTrial && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <div><strong>{n.name}</strong> wants to book a free trial.</div>
                    {n.email      && <div style={{ color: T.muted }}>✉ {n.email}</div>}
                    {n.phone      && <div style={{ color: T.muted }}>📞 {n.phone}</div>}
                    {n.program    && <div style={{ color: T.muted }}>Program: {n.program}</div>}
                    {n.instrument && <div style={{ color: T.muted }}>Instrument: {n.instrument}</div>}
                    {n.experience && <div style={{ color: T.muted }}>Level: {n.experience}</div>}
                    {n.ageGroup   && <div style={{ color: T.muted }}>Age: {n.ageGroup}</div>}
                    {n.message    && <div style={{ color: T.muted, fontStyle: "italic", marginTop: 4 }}>"{n.message}"</div>}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 7 }}>
                {isReply ? (
                  <button onClick={() => dismissNotification(n.id)} style={{
                    flex: 1, padding: "7px 0", borderRadius: 7, border: "none", cursor: "pointer",
                    fontFamily: "inherit", fontSize: 12, fontWeight: 700, background: T.dim, color: T.text
                  }}>OK</button>
                ) : isTrial ? (
                  <button onClick={() => handleResolve(n, "approved")} style={{
                    flex: 1, padding: "7px 0", borderRadius: 7, border: "none", cursor: "pointer",
                    fontFamily: "inherit", fontSize: 12, fontWeight: 700, background: "#052e16", color: "#4ade80"
                  }}>Mark as Contacted</button>
                ) : (
                  <>
                    <button onClick={() => handleResolve(n, "approved")} style={{
                      flex: 1, padding: "7px 0", borderRadius: 7, border: "none", cursor: "pointer",
                      fontFamily: "inherit", fontSize: 12, fontWeight: 700, background: "#052e16", color: "#4ade80"
                    }}>Approve</button>
                    <button onClick={() => handleResolve(n, "rejected")} style={{
                      flex: 1, padding: "7px 0", borderRadius: 7, border: "none", cursor: "pointer",
                      fontFamily: "inherit", fontSize: 12, fontWeight: 700, background: "#2d0a0a", color: "#f87171"
                    }}>Reject</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  // Go to the result's page, then let the view open anything it needs (tab, blank form) and highlight the target
  // Profile-picture dropdown (desktop sidebar footer, mobile top bar); `pos` places it
  const accountMenu = pos => (
    <div role="menu" className="sos-pop" style={{
      position: "absolute", zIndex: 250, ...pos,
      background: T.panel, border: `0.6px solid ${T.border2}`, borderRadius: 8, padding: 4,
      boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
    }}>
      <div style={{ padding: "8px 10px", fontSize: 11, color: T.muted, wordBreak: "break-all" }}>{currentUser.email}</div>
      {[
        { label: "Switch account", icon: "⇄", run: switchAccount },
        { label: "Sign out",       icon: "↩", run: signOut },
      ].map(m => (
        <button key={m.label} role="menuitem" onClick={() => { setProfileOpen(false); m.run(); }}
          style={{
            display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", border: "none",
            borderRadius: 6, background: "transparent", color: T.text, fontSize: 13, fontFamily: "inherit",
            cursor: "pointer", textAlign: "left", minHeight: 36,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = T.hover; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
          <span style={{ width: 16, textAlign: "center", color: T.muted }}>{m.icon}</span>{m.label}
        </button>
      ))}
    </div>
  );

  function pickSearch(entry) {
    if (entry.kind === "student") setFocusStudentId(entry.studentId);
    if (entry.page === "payout_preview") {
      const t = teachers[0];
      if (t) { const d = new Date(); openPayoutPreview(t, d.getFullYear(), d.getMonth()); }
      else navigateTo("payroll");
    } else navigateTo(entry.page);
    setIntent({ page: entry.page, id: entry.kind === "page" ? null : entry.id, open: entry.open ?? null, arg: entry.arg ?? null, nonce: Date.now() });
  }

  const palette = paletteOpen && (
    <CommandPalette T={T} nav={nav} students={students} enrolments={enrolments} teachers={teachers} rooms={rooms}
      discounts={discounts} instruments={instruments} currentUser={currentUser}
      onClose={() => setPaletteOpen(false)}
      onPick={pickSearch} />
  );
  const unsavedModal = pendingNav !== null && (
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
  );
  const page = <div key={effectiveView} className="sos-view">{views[effectiveView]}</div>;

  // ── Mobile layout ─────────────────────────────────────────────────────────────
  if (isMobile) {
    const mobileNavItems = nav.length <= MOBILE_PRIMARY ? nav : nav.slice(0, MOBILE_PRIMARY);
    const moreNavItems   = nav.length > MOBILE_PRIMARY  ? nav.slice(MOBILE_PRIMARY) : [];
    const iconBtn = { background: "none", border: "none", cursor: "pointer", minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", color: T.text };

    return (
      <div style={{ minHeight: "100dvh", background: T.bg, color: T.text, fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif" }}>

        {/* Translucent top bar — content scrolls underneath */}
        <div className="sos-glass" style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
          height: "calc(52px + env(safe-area-inset-top))", padding: "env(safe-area-inset-top) 12px 0 16px",
          background: T.sidebar + "b8", borderBottom: `0.6px solid ${T.border}`,
          display: "flex", alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, background: T.accent, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: T.onAccent }}>♬</div>
            <span style={{ fontSize: 15, fontWeight: 700, color: T.text, fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif", letterSpacing: "-0.01em" }}>StudioOS</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 0, alignItems: "center" }}>
            <button onClick={() => setPaletteOpen(true)} aria-label="Search" style={{ ...iconBtn, fontSize: 17 }}>🔍</button>
            <button onClick={toggle} aria-label="Toggle theme" style={{ ...iconBtn, fontSize: 18 }}>{theme === "dark" ? "☀️" : "🌙"}</button>
            <button onClick={() => setNotifOpen(o => !o)} aria-label="Notifications" style={{ ...iconBtn, fontSize: 19 }}>
              🔔
              {pendingCount > 0 && (
                <span style={{
                  position: "absolute", top: 4, right: 3, minWidth: 16, height: 16,
                  background: "#ef4444", borderRadius: 99, fontSize: 9, fontWeight: 700,
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px"
                }}>{pendingCount}</span>
              )}
            </button>
            <div style={{ marginLeft: 4, position: "relative" }}>
              {profileOpen && (
                <>
                  <div onClick={() => setProfileOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 249 }} />
                  {accountMenu({ top: "calc(100% + 8px)", right: 0, width: 220 })}
                </>
              )}
              <button onClick={() => setProfileOpen(o => !o)} aria-label="Account" aria-haspopup="menu" aria-expanded={profileOpen}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "block", borderRadius: "50%" }}>
                {currentUser.photoURL
                  ? <img src={currentUser.photoURL} alt="" style={{ width: 30, height: 30, borderRadius: "50%", display: "block" }} />
                  : <Avatar name={currentUser.displayName || currentUser.email || "?"} size={30} />}
              </button>
            </div>
          </div>
        </div>

        {/* Main content */}
        <main style={{ paddingTop: "calc(52px + env(safe-area-inset-top))", paddingBottom: "calc(96px + env(safe-area-inset-bottom))", minHeight: "100dvh" }}>
          <div style={{ padding: 16 }}>{page}</div>
        </main>

        {/* Floating glass tab bar */}
        <nav className="sos-glass" style={{
          position: "fixed", left: 12, right: 12, bottom: "calc(10px + env(safe-area-inset-bottom))", height: 62, zIndex: 100,
          background: T.panel + "b8", border: `0.6px solid ${T.border2}`, borderRadius: 22,
          boxShadow: "0 12px 30px rgba(0,0,0,0.35)", display: "flex", padding: 4, gap: 2,
        }}>
          {[...mobileNavItems.map(n => ({ ...n, on: effectiveView === n.id, go: () => navigateTo(n.id) })),
            { id: "__more", label: "More", icon: "⋯", on: moreOpen, go: () => setMoreOpen(true) }].map(n => (
            <button key={n.id} onClick={n.go} aria-label={n.label} aria-current={n.on ? "page" : undefined}
              style={{
                flex: 1, border: "none", borderRadius: 18, minWidth: 0,
                background: n.on ? "rgba(203,60,255,0.14)" : "transparent", color: n.on ? "#CB3CFF" : T.muted,
                cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
                fontFamily: "inherit", transition: "transform 0.1s ease-out, background-color 0.15s, color 0.15s",
              }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>{n.icon}</span>
              <span style={{ fontSize: 10, fontWeight: n.on ? 700 : 500, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{n.label}</span>
            </button>
          ))}
        </nav>

        {/* "More" sheet — also holds Sign Out, which every role needs */}
        {moreOpen && (
          <Sheet T={T} title="More" onClose={() => setMoreOpen(false)}>
            {dismiss => (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {moreNavItems.map(n => {
                  const active = effectiveView === n.id;
                  return (
                    <button key={n.id} onClick={() => { dismiss(); navigateTo(n.id); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 14, width: "100%", minHeight: 50,
                        padding: "0 12px", border: "none", borderRadius: 12,
                        background: active ? "rgba(203,60,255,0.12)" : "transparent", cursor: "pointer", fontFamily: "inherit",
                        color: active ? "#CB3CFF" : T.text, fontSize: 15, fontWeight: active ? 700 : 500, textAlign: "left",
                      }}>
                      <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{n.icon}</span>
                      {n.label}
                    </button>
                  );
                })}
                <div style={{ borderTop: moreNavItems.length ? `0.6px solid ${T.border}` : "none", marginTop: moreNavItems.length ? 8 : 0, paddingTop: moreNavItems.length ? 8 : 0 }}>
                  <button onClick={() => { dismiss(); switchAccount(); }} style={{
                    display: "flex", alignItems: "center", gap: 14, width: "100%", minHeight: 50, padding: "0 12px",
                    border: "none", borderRadius: 12, background: "transparent", cursor: "pointer", fontFamily: "inherit",
                    color: T.muted, fontSize: 15, fontWeight: 500, textAlign: "left",
                  }}><span style={{ fontSize: 18, width: 24, textAlign: "center" }}>⇄</span>Switch Account</button>
                  <button onClick={signOut} style={{
                    display: "flex", alignItems: "center", gap: 14, width: "100%", minHeight: 50, padding: "0 12px",
                    border: "none", borderRadius: 12, background: "transparent", cursor: "pointer", fontFamily: "inherit",
                    color: T.muted, fontSize: 15, fontWeight: 500, textAlign: "left",
                  }}><span style={{ fontSize: 18, width: 24, textAlign: "center" }}>↩</span>Sign Out</button>
                </div>
              </div>
            )}
          </Sheet>
        )}

        {unsavedModal}

        {/* Notification drawer — full screen on mobile */}
        {notifOpen && (
          <>
            <div onClick={() => setNotifOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 149 }} />
            <div className="sos-fade" style={{
              position: "fixed", inset: 0, background: T.panel, paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)",
              zIndex: 150, display: "flex", flexDirection: "column"
            }}>
              {notifDrawerContent}
            </div>
          </>
        )}
        {palette}
      </div>
    );
  }

  // ── Desktop layout ────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh", background: T.bg, color: T.text,
      fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif", display: "flex"
    }}>
      {/* Sidebar */}
      <aside style={{
        width: 260, background: T.sidebar, borderRight: `0.6px solid ${T.border2}`,
        boxShadow: "0px 8px 28px 0px rgba(1,5,17,0.3)",
        display: "flex", flexDirection: "column", flexShrink: 0,
        position: "sticky", top: 0, height: "100vh"
      }}>
        {/* Logo */}
        <div style={{ padding: "32px 28px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 26, height: 26, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 18, color: "#CB3CFF"
            }}>♬</div>
            <span style={{ fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif", fontSize: 20, fontWeight: 600, color: T.text }}>StudioOS</span>
          </div>
        </div>

        {/* Quick search (Ctrl/Cmd+K) */}
        <button onClick={() => setPaletteOpen(true)} aria-label="Quick search" style={{
          margin: "0 28px 24px", width: "calc(100% - 56px)", display: "flex", alignItems: "center", gap: 8,
          background: T.input, border: `0.6px solid ${T.border2}`, borderRadius: 4, color: T.muted,
          padding: "9px 10px", fontSize: 12, fontFamily: "inherit", cursor: "pointer", textAlign: "left",
        }}>
          <span style={{ fontSize: 13 }}>🔍</span>
          <span style={{ flex: 1 }}>Search for…</span>
          <kbd style={{ fontFamily: "inherit", fontSize: 10, border: `0.6px solid ${T.border2}`, borderRadius: 4, padding: "1px 5px" }}>Ctrl K</kbd>
        </button>

        <nav style={{ flex: 1, padding: "0 8px" }}>
          {nav.map(n => {
            const active = effectiveView === n.id;
            return (
              <button key={n.id} onClick={() => navigateTo(n.id)} className="sos-nav" aria-current={active ? "page" : undefined} style={{
                display: "flex", alignItems: "center", width: "100%",
                height: 42, padding: "0 0 0 14px", border: "none",
                borderLeft: active ? "2px solid #CB3CFF" : "2px solid transparent",
                ...(active ? { background: "rgba(203,60,255,0.12)" } : {}),
                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                color: active ? "#CB3CFF" : T.muted, fontWeight: active ? 600 : 500, fontSize: 14,
                borderRadius: 7
              }}>
                <span style={{ fontSize: 14, width: 14, textAlign: "center", flexShrink: 0, marginRight: 20 }}>{n.icon}</span>
                {n.label}
              </button>
            );
          })}
        </nav>

        <div style={{ borderTop: `0.6px solid ${T.border2}`, margin: "0 8px" }} />

        {/* Footer user area */}
        <div style={{ padding: "16px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, position: "relative" }}>
            {profileOpen && (
              <>
                <div onClick={() => setProfileOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 249 }} />
                {accountMenu({ bottom: "calc(100% + 8px)", left: 0, right: 0 })}
              </>
            )}
            <button onClick={() => setProfileOpen(o => !o)} aria-haspopup="menu" aria-expanded={profileOpen} title="Account"
              style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              <div style={{ flexShrink: 0 }}>
                {currentUser.photoURL
                  ? <img src={currentUser.photoURL} alt="" style={{ width: 32, height: 32, borderRadius: "50%", display: "block" }} />
                  : <Avatar name={currentUser.displayName || currentUser.email || "?"} size={32} />
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {currentUser.displayName || currentUser.email}
                </div>
                <div style={{ fontSize: 12, color: T.muted }}>{role}</div>
              </div>
            </button>
            <button onClick={() => setNotifOpen(o => !o)} title="Notifications"
              style={{ background: "none", border: "none", cursor: "pointer", position: "relative", padding: 4, flexShrink: 0, color: T.muted, fontSize: 16 }}>
              🔔
              {pendingCount > 0 && (
                <span style={{
                  position: "absolute", top: 0, right: 0, minWidth: 16, height: 16,
                  background: "#FF5A65", borderRadius: 99, fontSize: 9, fontWeight: 700,
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px"
                }}>{pendingCount}</span>
              )}
            </button>
            <span style={{ fontSize: 18, color: T.muted, flexShrink: 0 }}>›</span>
          </div>

          <button onClick={toggle} style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            background: T.panel2, border: "none", borderRadius: 4, padding: "8px 12px",
            cursor: "pointer", fontFamily: "inherit", marginBottom: 8, color: T.text, fontSize: 12, fontWeight: 500
          }}>
            <span style={{ fontSize: 14 }}>{theme === "dark" ? "☀️" : "🌙"}</span>
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>

          <button onClick={signOut} style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            background: "none", border: `0.6px solid ${T.border2}`, borderRadius: 4, padding: "8px 12px",
            cursor: "pointer", fontFamily: "inherit", color: T.muted, fontSize: 12, fontWeight: 500
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
            background: T.panel, borderLeft: `0.6px solid ${T.border2}`,
            boxShadow: "0px 17px 17px 0px rgba(1,5,17,0.1)",
            zIndex: 300, display: "flex", flexDirection: "column"
          }}>
            {notifDrawerContent}
          </div>
        </>
      )}

      {/* Main content */}
      <main style={{ flex: 1, padding: 28, overflowY: "auto", maxHeight: "100vh" }}>
        {page}
      </main>

      {unsavedModal}
      {palette}
    </div>
  );
}
