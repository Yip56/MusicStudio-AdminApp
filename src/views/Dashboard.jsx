import { Stat, Card, Avatar, Badge, SectionTitle } from "../components/UI.jsx";
import { getMergedSessionsForDate } from "../utils/helpers.js";
import { TODAY, INSTRUMENTS, STATUS_META } from "../data/seed.js";

export default function Dashboard({ students, teachers, rooms, attendanceOverrides, fees, split, T }) {
  const now = new Date();
  const todaySessions = getMergedSessionsForDate(TODAY, students, attendanceOverrides);
  const present = todaySessions.filter(s => s.status === "present").length;

  const totalGross = students.reduce((sum, s) => {
    const fee = fees[s.instrument]?.[s.grade] ?? 0;
    return sum + fee;
  }, 0);

  const byInst = INSTRUMENTS.map(i => ({ i, n: students.filter(s => s.instrument === i).length })).filter(x => x.n > 0);

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 3, color: T.text }}>Studio Dashboard</h2>
      <p style={{ color: T.muted, fontSize: 13, marginBottom: 22 }}>
        {now.toLocaleDateString("en-MY", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Stat T={T} label="Students"          value={students.length}  sub="Enrolled" />
        <Stat T={T} label="Teachers"          value={teachers.length}  sub="Active"    color="#60a5fa" />
        <Stat T={T} label="Rooms"             value={rooms.length}     sub="Available" color="#a78bfa" />
        <Stat T={T} label="Today's Classes"   value={`${present}/${todaySessions.length}`} sub="Present" color="#4ade80" />
        <Stat T={T} label="Monthly Revenue"   value={`RM ${totalGross.toLocaleString()}`} sub="Full fees (all students)" color="#c084fc" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card T={T}>
          <SectionTitle T={T}>Students by Instrument</SectionTitle>
          {byInst.map(x => (
            <div key={x.i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ width: 68, fontSize: 12, color: T.textSub }}>{x.i}</span>
              <div style={{ flex: 1, height: 6, background: T.dim, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${(x.n / students.length) * 100}%`, height: "100%", background: T.accent, borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 11, color: T.muted, width: 16, textAlign: "right" }}>{x.n}</span>
            </div>
          ))}
        </Card>

        <Card T={T}>
          <SectionTitle T={T}>Today's Sessions</SectionTitle>
          {todaySessions.length === 0 && <p style={{ color: T.muted, fontSize: 13 }}>No sessions scheduled today.</p>}
          {todaySessions.slice(0, 6).map(sess => {
            const st = students.find(s => s.id === sess.studentId);
            const sm = STATUS_META[sess.status] ?? { color: T.muted, bg: T.dim };
            return (
              <div key={sess.id} style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                {st && <Avatar name={st.name} />}
                <span style={{ flex: 1, fontSize: 13, color: T.text }}>{st?.name ?? "?"}</span>
                <span style={{ fontSize: 12, color: T.muted }}>{sess.startTime}</span>
                {sess.status !== "pending"
                  ? <Badge label={sess.status} color={sm.color} bg={sm.bg} />
                  : <span style={{ fontSize: 10, color: T.muted }}>—</span>
                }
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}
