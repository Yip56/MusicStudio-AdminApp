import { useState, useEffect } from "react";
import { collection, onSnapshot, doc, updateDoc, deleteDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { createUserWithEmailAndPassword, updateProfile, signOut } from "firebase/auth";
import { db, authSecondary } from "../firebase.js";
import { Avatar, Badge, Card, Inp, Sel, Btn, Modal, Stat, SectionTitle, THead } from "../components/UI.jsx";

function randPassword() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  return Array.from({ length: 20 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const ROLE_COLOR = {
  teacher:  { color: "#60a5fa", bg: "#60a5fa18" },
  admin:    { color: "#c084fc", bg: "#c084fc18" },
  sysadmin: { color: "#e8b84b", bg: "#e8b84b18" },
};

export default function UserManagement({ teachers, T, currentUser, isMobile }) {
  const [users,      setUsers]      = useState([]);
  const [form,       setForm]       = useState({ displayName: "", email: "", role: "teacher", linkedTeacherId: "" });
  const [creating,   setCreating]   = useState(false);
  const [success,    setSuccess]    = useState(null);
  const [error,      setError]      = useState(null);
  const [editModal,  setEditModal]  = useState(null);
  const [editForm,   setEditForm]   = useState({});

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), snap =>
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, []);

  async function createAccount() {
    if (!form.displayName.trim() || !form.email.trim()) { setError("Name and email are required."); return; }
    if (form.role === "teacher" && !form.linkedTeacherId) { setError("Select a teacher profile to link."); return; }
    setCreating(true); setError(null); setSuccess(null);
    try {
      const cred = await createUserWithEmailAndPassword(authSecondary, form.email.toLowerCase().trim(), randPassword());
      await updateProfile(cred.user, { displayName: form.displayName.trim() });
      await setDoc(doc(db, "users", cred.user.uid), {
        uid:         cred.user.uid,
        email:       form.email.toLowerCase().trim(),
        displayName: form.displayName.trim(),
        photoURL:    null,
        role:        form.role,
        teacherId:   form.role === "teacher" ? form.linkedTeacherId : null,
        createdAt:   serverTimestamp(),
        createdBy:   currentUser.uid,
      });
      await signOut(authSecondary);
      setSuccess(`Account created. Tell ${form.displayName.trim()} to sign in with Google using ${form.email.trim()}.`);
      setForm({ displayName: "", email: "", role: "teacher", linkedTeacherId: "" });
    } catch (err) {
      setError(err.message);
    }
    setCreating(false);
  }

  async function saveEdit() {
    await updateDoc(doc(db, "users", editModal.id), {
      displayName: editForm.displayName,
      role:        editForm.role,
      teacherId:   editForm.role === "teacher" ? (editForm.teacherId || null) : null,
    });
    setEditModal(null);
  }

  async function revokeUser(userId, name) {
    if (!confirm(`Revoke access for ${name}? They will be immediately locked out.`)) return;
    await deleteDoc(doc(db, "users", userId));
  }

  const counts = users.reduce((acc, u) => { acc[u.role] = (acc[u.role] || 0) + 1; return acc; }, {});

  // Mobile: prompt to use desktop
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

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 18 }}>User Management</h2>

      <div style={{ display: "flex", gap: 12, marginBottom: 22, flexWrap: "wrap" }}>
        <Stat T={T} label="Total Users"  value={users.length} />
        <Stat T={T} label="Teachers"     value={counts.teacher  ?? 0} color="#60a5fa" />
        <Stat T={T} label="Admins"       value={counts.admin    ?? 0} color="#c084fc" />
        <Stat T={T} label="Sysadmins"    value={counts.sysadmin ?? 0} color={T.accent} />
      </div>

      <Card T={T} style={{ marginBottom: 22 }}>
        <SectionTitle T={T}>Create Account</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          <div style={{ display: "flex", gap: 11 }}>
            <Inp T={T} label="Full Name" value={form.displayName}
              onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
            <Inp T={T} label="Gmail Address" type="email" value={form.email}
              onChange={e => { setError(null); setForm(f => ({ ...f, email: e.target.value })); }} />
          </div>

          {form.email && !form.email.toLowerCase().includes("@gmail.com") && (
            <div style={{ fontSize: 11, color: "#fbbf24", background: "#451a0340", borderRadius: 7, padding: "7px 11px" }}>
              Note: not a @gmail.com address — Google Sign-In requires a Gmail account.
            </div>
          )}

          <div style={{ display: "flex", gap: 11 }}>
            <Sel T={T} label="Role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </Sel>
            {form.role === "teacher" && (
              <Sel T={T} label="Link Teacher Profile" value={form.linkedTeacherId}
                onChange={e => setForm(f => ({ ...f, linkedTeacherId: e.target.value }))}>
                <option value="">— Select teacher —</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Sel>
            )}
          </div>

          {error   && <div style={{ fontSize: 12, color: "#f87171" }}>{error}</div>}
          {success && <div style={{ fontSize: 12, color: "#4ade80", lineHeight: 1.6 }}>{success}</div>}

          <Btn T={T} onClick={createAccount} style={{ alignSelf: "flex-start" }}>
            {creating ? "Creating…" : "Create Account"}
          </Btn>
        </div>
      </Card>

      <Card T={T} style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <THead T={T} cols={["User", "Email", "Role", "Linked Teacher", "Created", "Actions"]} />
          <tbody>
            {users.map((u, i) => {
              const tc = teachers.find(t => t.id === u.teacherId);
              const rc = ROLE_COLOR[u.role] ?? { color: T.muted, bg: T.dim };
              return (
                <tr key={u.id} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 ? T.rowAlt : "transparent" }}>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      {u.photoURL
                        ? <img src={u.photoURL} alt="" style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0 }} />
                        : <Avatar name={u.displayName || u.email || "?"} size={30} />
                      }
                      <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{u.displayName}</span>
                    </div>
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: T.muted }}>{u.email}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <Badge label={u.role} color={rc.color} bg={rc.bg} />
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: T.textSub }}>{tc?.name ?? "—"}</td>
                  <td style={{ padding: "11px 14px", fontSize: 11, color: T.muted }}>
                    {u.createdAt?.toDate?.()?.toLocaleDateString("en-MY") ?? "—"}
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn T={T} variant="ghost" style={{ padding: "4px 9px", fontSize: 11 }}
                        onClick={() => { setEditModal(u); setEditForm({ ...u }); }}>Edit</Btn>
                      {u.id !== currentUser.uid && (
                        <Btn T={T} variant="danger" style={{ padding: "4px 9px", fontSize: 11 }}
                          onClick={() => revokeUser(u.id, u.displayName || u.email)}>Revoke</Btn>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr><td colSpan={6} style={{ padding: "20px 14px", textAlign: "center", color: T.muted, fontSize: 13 }}>No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {editModal && (
        <Modal T={T} title="Edit User" onClose={() => setEditModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Inp T={T} label="Display Name" value={editForm.displayName ?? ""}
              onChange={e => setEditForm(f => ({ ...f, displayName: e.target.value }))} />
            <Sel T={T} label="Role" value={editForm.role}
              onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
              <option value="sysadmin">Sysadmin</option>
            </Sel>
            {editForm.role === "teacher" && (
              <Sel T={T} label="Linked Teacher" value={editForm.teacherId ?? ""}
                onChange={e => setEditForm(f => ({ ...f, teacherId: e.target.value }))}>
                <option value="">— None —</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Sel>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
              <Btn T={T} variant="ghost" onClick={() => setEditModal(null)}>Cancel</Btn>
              <Btn T={T} onClick={saveEdit}>Save Changes</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
