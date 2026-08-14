import { useState, useEffect, useRef } from "react";
import { collection, onSnapshot, doc, updateDoc, deleteDoc, setDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase.js";
import { Avatar, Badge, Card, Inp, Sel, Btn, Modal, Stat, SectionTitle, THead, Checkbox } from "../components/UI.jsx";
import { GRADE_LABELS, INSTRUMENTS, DAYS_OF_WEEK, HOURS } from "../data/seed.js";
import { uid } from "../utils/helpers.js";

const ROLE_COLOR = {
  teacher:  { color: "#60a5fa", bg: "#60a5fa18" },
  admin:    { color: "#c084fc", bg: "#c084fc18" },
  sysadmin: { color: "#e8b84b", bg: "#e8b84b18" },
  student:  { color: "#4ade80", bg: "#4ade8018" },
};

const BLANK_AUTH    = { displayName: "", email: "", linkedTeacherId: "" };
const BLANK_TEACHER = { displayName: "", email: "", instruments: ["Piano"], commissionPct: 60 };
const BLANK_STUDENT = {
  name: "", instrument: "Piano", grade: "No Grade", teacherId: "",
  attendanceBased: false,
  schedule: { dayOfWeek: 6, startTime: "09:00", endTime: "10:00", roomId: "" },
};

function blankForRole(role, teachers, rooms) {
  if (role === "teacher") return { ...BLANK_TEACHER };
  if (role === "student") return {
    ...BLANK_STUDENT,
    teacherId: teachers[0]?.id ?? "",
    schedule: { ...BLANK_STUDENT.schedule, roomId: rooms[0]?.id ?? "" },
  };
  return { ...BLANK_AUTH };
}

export default function UserManagement({ teachers, setTeachers, students, setStudents, rooms, T, currentUser, isMobile, setDirty }) {
  const [users,           setUsers]           = useState([]);
  const [invites,         setInvites]         = useState([]);
  const [formRole,        setFormRole]        = useState("admin");
  const [form,            setForm]            = useState({ ...BLANK_AUTH });
  const [saving,          setSaving]          = useState(false);
  const [success,         setSuccess]         = useState(null);
  const [error,           setError]           = useState(null);
  const [editModal,       setEditModal]       = useState(null);
  const [editForm,        setEditForm]        = useState({});
  const [deleteModal,     setDeleteModal]     = useState(null);
  const [transferTarget,  setTransferTarget]  = useState(null);
  const [transferConfirm, setTransferConfirm] = useState(null);

  const formCardRef = useRef(null);

  useEffect(() => {
    const unsubUsers   = onSnapshot(collection(db, "users"),   snap => setUsers(snap.docs.map(d => ({ id: d.id, ...d.data(), _type: "user" }))));
    const unsubInvites = onSnapshot(collection(db, "invites"), snap => setInvites(snap.docs.map(d => ({ id: d.id, ...d.data(), _type: "invite" }))));
    return () => { unsubUsers(); unsubInvites(); };
  }, []);

  function handleRoleChange(role) {
    setFormRole(role);
    setForm(blankForRole(role, teachers, rooms));
    setTransferTarget(null);
    setError(null);
    setSuccess(null);
  }

  function markDirty() { setDirty?.(true); }

  function setSched(key, val) {
    markDirty();
    setForm(f => ({ ...f, schedule: { ...f.schedule, [key]: val } }));
  }

  function toggleInstrument(inst) {
    markDirty();
    setForm(f => {
      const has = f.instruments?.includes(inst);
      return { ...f, instruments: has ? f.instruments.filter(i => i !== inst) : [...f.instruments, inst] };
    });
  }

  function startTransfer(entry) { setTransferConfirm(entry); }

  function confirmTransfer(entry) {
    const role = entry.role;
    setFormRole(role);
    setTransferTarget(entry);
    setError(null);
    setSuccess(null);

    if (role === "teacher") {
      const profile = teachers.find(t => t.id === entry.teacherId);
      setForm({
        displayName:   entry.displayName ?? "",
        email:         "",
        instruments:   profile?.instruments  ?? ["Piano"],
        commissionPct: profile?.commissionPct ?? 60,
      });
    } else {
      setForm({ displayName: entry.displayName ?? "", email: "", linkedTeacherId: entry.teacherId ?? "" });
    }

    setTransferConfirm(null);
    markDirty();
    setTimeout(() => formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function cancelTransfer() {
    setTransferTarget(null);
    setForm(blankForRole(formRole, teachers, rooms));
    setError(null);
    setSuccess(null);
    setDirty?.(false);
  }

  async function createAccount() {
    setError(null); setSuccess(null);

    // ── Student: no account needed, just add to state ────────────────────────
    if (formRole === "student") {
      if (!form.name?.trim()) { setError("Name is required."); return; }
      setStudents(prev => [...prev, { ...form, id: uid(), name: form.name.trim() }]);
      setSuccess(`Student "${form.name.trim()}" added.`);
      setForm(blankForRole("student", teachers, rooms));
      setDirty?.(false);
      return;
    }

    // ── Teacher / Admin / Sysadmin: create invite in Firestore ───────────────
    const name  = form.displayName?.trim();
    const email = form.email?.trim().toLowerCase();
    if (!name || !email) { setError("Name and email are required."); return; }
    if (formRole === "teacher" && (!form.instruments || form.instruments.length === 0)) {
      setError("Select at least one instrument."); return;
    }

    // Check email not already active or pending
    const emailTaken = [...users, ...invites].some(u => u.email?.toLowerCase() === email);
    if (emailTaken && !transferTarget) { setError("An account with this email already exists."); return; }

    setSaving(true);
    try {
      let teacherId = null;

      if (formRole === "teacher") {
        if (transferTarget?.teacherId) {
          // Reuse and update existing teacher profile
          teacherId = transferTarget.teacherId;
          setTeachers(prev => prev.map(t => t.id === teacherId
            ? { ...t, name, instruments: form.instruments, commissionPct: Number(form.commissionPct) || 60 }
            : t
          ));
        } else {
          teacherId = uid();
          setTeachers(prev => [...prev, {
            id: teacherId, name,
            instruments:   form.instruments,
            commissionPct: Number(form.commissionPct) || 60,
          }]);
        }
      } else {
        teacherId = form.linkedTeacherId || null;
      }

      // Write invite to Firestore (no Firebase Auth account created)
      await addDoc(collection(db, "invites"), {
        email, displayName: name,
        role:      formRole,
        teacherId,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid,
      });

      // If transfer: delete old account
      if (transferTarget) {
        if (transferTarget._type === "user") {
          await deleteDoc(doc(db, "users", transferTarget.id));
        } else {
          await deleteDoc(doc(db, "invites", transferTarget.id));
        }
        setSuccess(`Transfer complete. Invite sent to ${email}. They sign in with Google using their new Gmail — the old account has been removed.`);
        setTransferTarget(null);
      } else {
        setSuccess(`Invite created for ${email}. They sign in with Google using that Gmail to activate their account.`);
      }

      setForm(blankForRole(formRole, teachers, rooms));
      setDirty?.(false);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  async function saveEdit() {
    const isInvite = editModal._type === "invite";
    const ref = isInvite
      ? doc(db, "invites", editModal.id)
      : doc(db, "users",   editModal.id);
    await updateDoc(ref, {
      displayName: editForm.displayName,
      role:        editForm.role,
      teacherId:   editForm.teacherId || null,
    });
    setEditModal(null);
    setDirty?.(false);
  }

  async function deleteAccount() {
    const isInvite = deleteModal._type === "invite";
    await deleteDoc(doc(db, isInvite ? "invites" : "users", deleteModal.id));
    setDeleteModal(null);
  }

  const counts = users.reduce((acc, u) => { acc[u.role] = (acc[u.role] || 0) + 1; return acc; }, {});
  const allRows = [...users, ...invites].sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🖥️</div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 10 }}>Desktop Required</h2>
        <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.7, maxWidth: 280 }}>
          User Management is only available on desktop. Please open StudioOS on a larger screen to manage accounts.
        </p>
      </div>
    );
  }

  const isAdminOrSys = formRole === "admin" || formRole === "sysadmin";

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 18 }}>User Management</h2>

      <div style={{ display: "flex", gap: 12, marginBottom: 22, flexWrap: "wrap" }}>
        <Stat T={T} label="Active Users"  value={users.length} />
        <Stat T={T} label="Teachers"      value={counts.teacher  ?? 0} color="#60a5fa" />
        <Stat T={T} label="Admins"        value={counts.admin    ?? 0} color="#c084fc" />
        <Stat T={T} label="Sysadmins"     value={counts.sysadmin ?? 0} color={T.accent} />
        <Stat T={T} label="Pending Invites" value={invites.length} color="#94a3b8" />
      </div>

      {/* ── Create / Transfer Account ────────────────────────────────────────── */}
      <Card T={T} style={{ marginBottom: 22 }} ref={formCardRef}>

        {transferTarget ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#1a2a1a", border: "1px solid #4ade8040", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#4ade80", marginBottom: 2 }}>Transferring account</div>
              <div style={{ fontSize: 12, color: T.muted }}>
                Info from <strong style={{ color: T.text }}>{transferTarget.displayName || transferTarget.email}</strong> is pre-filled.
                Enter the new Gmail, review everything, then click Create &amp; Transfer. The old account is removed automatically.
              </div>
            </div>
            <button onClick={cancelTransfer}
              style={{ background: "none", border: "none", color: T.muted, fontSize: 16, cursor: "pointer", flexShrink: 0, marginLeft: 14 }}>✕</button>
          </div>
        ) : (
          <SectionTitle T={T}>Create Account</SectionTitle>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>

          <Sel T={T} label="Role" value={formRole} onChange={e => handleRoleChange(e.target.value)} disabled={!!transferTarget}>
            <option value="admin">Admin</option>
            <option value="sysadmin">Sysadmin</option>
            <option value="teacher">Teacher</option>
            <option value="student">Student</option>
          </Sel>

          {/* ── Admin / Sysadmin ─────────────────────────────────────────────── */}
          {isAdminOrSys && (
            <>
              <div style={{ display: "flex", gap: 11 }}>
                <Inp T={T} label="Full Name" value={form.displayName}
                  onChange={e => { markDirty(); setForm(f => ({ ...f, displayName: e.target.value })); }} />
                <div style={{ flex: 1 }}>
                  <Inp T={T} label="Gmail Address" type="email" value={form.email}
                    style={transferTarget ? { border: `1px solid ${T.accent}` } : {}}
                    onChange={e => { markDirty(); setError(null); setForm(f => ({ ...f, email: e.target.value })); }} />
                  {transferTarget && <div style={{ fontSize: 11, color: T.accent, marginTop: 4 }}>Enter the new Gmail address above</div>}
                </div>
              </div>
              {form.email && !form.email.toLowerCase().includes("@gmail.com") && (
                <div style={{ fontSize: 11, color: "#fbbf24", background: "#451a0340", borderRadius: 7, padding: "7px 11px" }}>
                  Note: not a @gmail.com address — Google Sign-In requires a Gmail account.
                </div>
              )}
              <Sel T={T} label="Link Teacher Profile (optional)" value={form.linkedTeacherId}
                onChange={e => { markDirty(); setForm(f => ({ ...f, linkedTeacherId: e.target.value })); }}>
                <option value="">— None —</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Sel>
            </>
          )}

          {/* ── Teacher ──────────────────────────────────────────────────────── */}
          {formRole === "teacher" && (
            <>
              <div style={{ display: "flex", gap: 11 }}>
                <Inp T={T} label="Full Name" value={form.displayName}
                  onChange={e => { markDirty(); setForm(f => ({ ...f, displayName: e.target.value })); }} />
                <div style={{ flex: 1 }}>
                  <Inp T={T} label="Gmail Address" type="email" value={form.email}
                    style={transferTarget ? { border: `1px solid ${T.accent}` } : {}}
                    onChange={e => { markDirty(); setError(null); setForm(f => ({ ...f, email: e.target.value })); }} />
                  {transferTarget && <div style={{ fontSize: 11, color: T.accent, marginTop: 4 }}>Enter the new Gmail address above</div>}
                </div>
              </div>
              {form.email && !form.email.toLowerCase().includes("@gmail.com") && (
                <div style={{ fontSize: 11, color: "#fbbf24", background: "#451a0340", borderRadius: 7, padding: "7px 11px" }}>
                  Note: not a @gmail.com address — Google Sign-In requires a Gmail account.
                </div>
              )}
              <div>
                <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  Instruments (select all that apply)
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {INSTRUMENTS.map(inst => {
                    const active = form.instruments?.includes(inst);
                    return (
                      <button key={inst} onClick={() => toggleInstrument(inst)}
                        style={{
                          padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer",
                          fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                          background: active ? T.accent + "22" : T.dim,
                          color: active ? T.accent : T.muted,
                          outline: active ? `1px solid ${T.accent}55` : "none",
                        }}>{inst}</button>
                    );
                  })}
                </div>
              </div>
              <Inp T={T} label="Commission %" type="number" min={0} max={100}
                value={form.commissionPct}
                onChange={e => { markDirty(); setForm(f => ({ ...f, commissionPct: e.target.value })); }} />
            </>
          )}

          {/* ── Student ──────────────────────────────────────────────────────── */}
          {formRole === "student" && (
            <>
              <Inp T={T} label="Full Name" value={form.name}
                onChange={e => { markDirty(); setForm(f => ({ ...f, name: e.target.value })); }} />
              <div style={{ display: "flex", gap: 11 }}>
                <Sel T={T} label="Instrument" value={form.instrument}
                  onChange={e => { markDirty(); setForm(f => ({ ...f, instrument: e.target.value })); }}>
                  {INSTRUMENTS.map(i => <option key={i}>{i}</option>)}
                </Sel>
                <Sel T={T} label="Grade" value={form.grade}
                  onChange={e => { markDirty(); setForm(f => ({ ...f, grade: e.target.value })); }}>
                  {GRADE_LABELS.map(g => <option key={g}>{g}</option>)}
                </Sel>
              </div>
              <Sel T={T} label="Teacher" value={form.teacherId}
                onChange={e => { markDirty(); setForm(f => ({ ...f, teacherId: e.target.value })); }}>
                <option value="">— Select teacher —</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.instruments.join(", ")})</option>)}
              </Sel>
              <div style={{ background: T.panel2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14 }}>
                <SectionTitle T={T}>Recurring Class Schedule</SectionTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                  <Sel T={T} label="Day of Week" value={form.schedule?.dayOfWeek ?? 6}
                    onChange={e => setSched("dayOfWeek", Number(e.target.value))}>
                    {DAYS_OF_WEEK.map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </Sel>
                  <div style={{ display: "flex", gap: 11 }}>
                    <Sel T={T} label="Start Time" value={form.schedule?.startTime ?? "09:00"}
                      onChange={e => setSched("startTime", e.target.value)}>
                      {HOURS.map(h => <option key={h}>{h}</option>)}
                    </Sel>
                    <Sel T={T} label="End Time" value={form.schedule?.endTime ?? "10:00"}
                      onChange={e => setSched("endTime", e.target.value)}>
                      {HOURS.map(h => <option key={h}>{h}</option>)}
                    </Sel>
                  </div>
                  <Sel T={T} label="Room" value={form.schedule?.roomId ?? ""}
                    onChange={e => setSched("roomId", e.target.value)}>
                    <option value="">— Select room —</option>
                    {rooms.map(r => <option key={r.id} value={r.id}>{r.name} ({r.type})</option>)}
                  </Sel>
                </div>
              </div>
              <Checkbox T={T}
                label="Attendance-based commission (fee prorated by classes attended)"
                checked={form.attendanceBased}
                onChange={() => { markDirty(); setForm(f => ({ ...f, attendanceBased: !f.attendanceBased })); }}
              />
            </>
          )}

          {error   && <div style={{ fontSize: 12, color: "#f87171" }}>{error}</div>}
          {success && <div style={{ fontSize: 12, color: "#4ade80", lineHeight: 1.6 }}>{success}</div>}

          <div style={{ display: "flex", gap: 9 }}>
            <Btn T={T} onClick={createAccount}>
              {saving ? "Saving…" : transferTarget ? "Create & Transfer" : formRole === "student" ? "Add Student" : "Create Invite"}
            </Btn>
            {transferTarget && <Btn T={T} variant="ghost" onClick={cancelTransfer}>Cancel Transfer</Btn>}
          </div>
        </div>
      </Card>

      {/* ── Users + Invites table ────────────────────────────────────────────── */}
      <Card T={T} style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <THead T={T} cols={["User", "Email", "Role", "Status", "Linked Teacher", "Actions"]} />
          <tbody>
            {allRows.map((entry, i) => {
              const tc       = teachers.find(t => t.id === entry.teacherId);
              const rc       = ROLE_COLOR[entry.role] ?? { color: T.muted, bg: T.dim };
              const isPending = entry._type === "invite";
              const isTransferSource = transferTarget?.id === entry.id;
              return (
                <tr key={entry.id} style={{
                  borderBottom: `1px solid ${T.border}`,
                  background: isTransferSource ? "#4ade8010" : i % 2 ? T.rowAlt : "transparent",
                }}>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      {!isPending && entry.photoURL
                        ? <img src={entry.photoURL} alt="" style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0 }} />
                        : <Avatar name={entry.displayName || entry.email || "?"} size={30} />
                      }
                      <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{entry.displayName}</span>
                    </div>
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: T.muted }}>{entry.email}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <Badge label={entry.role} color={rc.color} bg={rc.bg} />
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    {isPending
                      ? <Badge label="Pending Sign-in" color="#94a3b8" bg="#1e293b" />
                      : <Badge label="Active" color="#4ade80" bg="#052e16" />
                    }
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: T.textSub }}>{tc?.name ?? "—"}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn T={T} variant="ghost" style={{ padding: "4px 9px", fontSize: 11 }}
                        onClick={() => { setEditModal(entry); setEditForm({ ...entry }); }}>Edit</Btn>
                      {(isPending || entry.id !== currentUser.uid) && (
                        <Btn T={T} variant="ghost" style={{ padding: "4px 9px", fontSize: 11, color: "#4ade80", borderColor: "#4ade8030" }}
                          onClick={() => startTransfer(entry)}>Transfer</Btn>
                      )}
                      {(isPending || entry.id !== currentUser.uid) && (
                        <Btn T={T} variant="danger" style={{ padding: "4px 9px", fontSize: 11 }}
                          onClick={() => setDeleteModal(entry)}>Delete</Btn>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {allRows.length === 0 && (
              <tr><td colSpan={6} style={{ padding: "20px 14px", textAlign: "center", color: T.muted, fontSize: 13 }}>No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* ── Transfer confirm modal ───────────────────────────────────────────── */}
      {transferConfirm && (
        <Modal T={T} title="Transfer Account" onClose={() => setTransferConfirm(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: T.panel2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "13px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <Avatar name={transferConfirm.displayName || transferConfirm.email || "?"} size={34} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{transferConfirm.displayName}</div>
                  <div style={{ fontSize: 12, color: T.muted }}>{transferConfirm.email}</div>
                </div>
                <Badge label={transferConfirm.role} color={ROLE_COLOR[transferConfirm.role]?.color} bg={ROLE_COLOR[transferConfirm.role]?.bg} />
              </div>
              <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
                Their info will be pre-filled. Enter the new Gmail address, review everything, then click Create &amp; Transfer.
                The old account is removed automatically once the invite is created.
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
              <Btn T={T} variant="ghost" onClick={() => setTransferConfirm(null)}>Cancel</Btn>
              <Btn T={T} onClick={() => confirmTransfer(transferConfirm)}>Continue to Form</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Edit modal ───────────────────────────────────────────────────────── */}
      {editModal && (
        <Modal T={T} title={editModal._type === "invite" ? "Edit Invite" : "Edit User"} onClose={() => { setEditModal(null); setDirty?.(false); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Inp T={T} label="Display Name" value={editForm.displayName ?? ""}
              onChange={e => { setDirty?.(true); setEditForm(f => ({ ...f, displayName: e.target.value })); }} />
            {editModal._type === "invite" && (
              <Inp T={T} label="Gmail Address" type="email" value={editForm.email ?? ""}
                onChange={e => { setDirty?.(true); setEditForm(f => ({ ...f, email: e.target.value })); }} />
            )}
            <Sel T={T} label="Role" value={editForm.role ?? "teacher"}
              onChange={e => { setDirty?.(true); setEditForm(f => ({ ...f, role: e.target.value })); }}>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
              <option value="sysadmin">Sysadmin</option>
            </Sel>
            <Sel T={T}
              label={editForm.role === "teacher" ? "Linked Teacher Profile" : "Link Teacher Profile (optional)"}
              value={editForm.teacherId ?? ""}
              onChange={e => { setDirty?.(true); setEditForm(f => ({ ...f, teacherId: e.target.value })); }}>
              <option value="">— None —</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Sel>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
              <Btn T={T} variant="ghost" onClick={() => { setEditModal(null); setDirty?.(false); }}>Cancel</Btn>
              <Btn T={T} onClick={saveEdit}>Save Changes</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete modal ─────────────────────────────────────────────────────── */}
      {deleteModal && (
        <Modal T={T} title={deleteModal._type === "invite" ? "Cancel Invite" : "Delete Account"} onClose={() => setDeleteModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#2d0a0a", border: "1px solid #f8717140", borderRadius: 10, padding: "13px 16px" }}>
              <div style={{ fontSize: 13, color: "#f87171", fontWeight: 600, marginBottom: 6 }}>
                {deleteModal._type === "invite" ? "This will cancel the pending invite." : "This will permanently remove their access."}
              </div>
              <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
                <strong style={{ color: T.text }}>{deleteModal.displayName || deleteModal.email}</strong>
                {deleteModal._type === "invite"
                  ? " will no longer be able to activate their account by signing in."
                  : " will be immediately locked out of StudioOS. Their Google account is not affected."
                }
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
              <Btn T={T} variant="ghost" onClick={() => setDeleteModal(null)}>Cancel</Btn>
              <Btn T={T} variant="danger" onClick={deleteAccount}>
                {deleteModal._type === "invite" ? "Cancel Invite" : "Delete Account"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
