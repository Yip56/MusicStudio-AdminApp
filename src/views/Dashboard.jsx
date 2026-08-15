import { Stat, Card, Avatar, Badge, SectionTitle, Btn } from "../components/UI.jsx";
import { getMergedSessionsForDate, calcStudentPayroll, getScheduledCountForMonth, getAttendedCountForMonth } from "../utils/helpers.js";
import { TODAY, INSTRUMENTS, STATUS_META } from "../data/seed.js";
import { usePayrollMonth } from "../hooks/usePayrollMonth.js";

function AttendanceBarChart({ data, T }) {
  if (!data.length) return <div style={{ color: T.muted, fontSize: 12, padding: 20, textAlign: "center" }}>No data</div>;
  const barW   = Math.min(60, Math.floor(280 / data.length));
  const gap    = Math.max(4, Math.floor(20 / data.length));
  const chartW = data.length * (barW + gap) - gap;
  const chartH = 160;
  return (
    <svg viewBox={`0 0 ${Math.max(chartW, 200)} ${chartH + 30}`} style={{ width: "100%", maxHeight: 200 }}>
      {data.map((d, i) => {
        const rate  = d.scheduled > 0 ? d.attended / d.scheduled : 0;
        const barH  = rate * chartH;
        const x     = i * (barW + gap);
        const y     = chartH - barH;
        const color = rate >= 0.8 ? "#14CA74" : rate >= 0.5 ? "#FDB52A" : "#FF5A65";
        return (
          <g key={i}>
            <rect x={x} y={0} width={barW} height={chartH} fill={T.border} rx="2" opacity="0.3" />
            <rect x={x} y={y} width={barW} height={barH} fill={color} rx="2" opacity="0.85" />
            <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="9" fill={color} fontWeight="600">
              {Math.round(rate * 100)}%
            </text>
            <text x={x + barW / 2} y={chartH + 14} textAnchor="middle" fontSize="8" fill="#AEB9E1">
              {d.label.length > 8 ? d.label.slice(0, 7) + "…" : d.label}
            </text>
            <text x={x + barW / 2} y={chartH + 24} textAnchor="middle" fontSize="7" fill="#AEB9E1" opacity="0.7">
              {d.attended}/{d.scheduled}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Dashboard({ students, teachers, rooms, attendanceOverrides, fees, adminFlatFee, T, isMobile, currentUser }) {
  const now = new Date();
  const todaySessions = getMergedSessionsForDate(TODAY, students, attendanceOverrides);
  const present = todaySessions.filter(s => s.status === "present").length;

  const byInst = INSTRUMENTS.map(i => ({ i, n: students.filter(s => s.instrument === i).length })).filter(x => x.n > 0);

  const now_year  = now.getFullYear();
  const now_month = now.getMonth();
  const yearMonth = `${now_year}-${String(now_month + 1).padStart(2, "0")}`;
  const { feeStatus } = usePayrollMonth(yearMonth);

  // Attendance stats
  const totalScheduled = students.reduce((a, s) => a + getScheduledCountForMonth(s, now_year, now_month), 0);
  const totalAttended  = students.reduce((a, s) => a + getAttendedCountForMonth(s.id, now_year, now_month, attendanceOverrides), 0);
  const attendanceRate = totalScheduled > 0 ? totalAttended / totalScheduled : 0;

  // Revenue: potential (all collected=true) vs actual collected
  const allCalc = teachers ? teachers.flatMap(t =>
    students.filter(s => s.teacherId === t.id).map(s => {
      const collected = feeStatus[s.id]?.collected ?? false;
      return { collected, ...calcStudentPayroll(s, now_year, now_month, fees, t.commissionPct, adminFlatFee, attendanceOverrides, collected) };
    })
  ) : [];

  const potentialDetails = teachers ? teachers.flatMap(t =>
    students.filter(s => s.teacherId === t.id).map(s =>
      calcStudentPayroll(s, now_year, now_month, fees, t.commissionPct, adminFlatFee, attendanceOverrides, true)
    )
  ) : [];

  const potentialGross  = potentialDetails.reduce((a, d) => a + d.gross, 0);
  const totalCollected  = allCalc.reduce((a, d) => a + d.gross, 0);
  const totalTeacherPay = allCalc.reduce((a, d) => a + d.teacherCut, 0);
  const totalAdminRev   = allCalc.reduce((a, d) => a + d.adminCut, 0);

  // Per-teacher chart data
  const teacherChartData = (teachers ?? []).map(t => {
    const tStudents = students.filter(s => s.teacherId === t.id);
    const sch = tStudents.reduce((a, s) => a + getScheduledCountForMonth(s, now_year, now_month), 0);
    const att = tStudents.reduce((a, s) => a + getAttendedCountForMonth(s.id, now_year, now_month, attendanceOverrides), 0);
    return { label: t.name.split(" ").slice(-1)[0], attended: att, scheduled: sch };
  });

  const firstName = currentUser?.displayName?.split(" ")[0] || "Admin";

  return (
    <div>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{
            fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif",
            fontSize: isMobile ? 20 : 24, fontWeight: 700, color: T.text,
            lineHeight: "32px", marginBottom: 4
          }}>Welcome back, {firstName}</h2>
          <p style={{ color: T.muted, fontSize: 12 }}>
            {now.toLocaleDateString("en-MY", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        {!isMobile && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Btn T={T} variant="ghost">Export data</Btn>
            <Btn T={T} variant="primary">Create report</Btn>
          </div>
        )}
      </div>

      {/* Stat cards */}
      {isMobile ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <Stat T={T} icon="👥" label="Students"        value={students.length}  sub="+0" />
          <Stat T={T} icon="♪"  label="Teachers"        value={teachers.length}  sub="+0" />
          <Stat T={T} icon="✓"  label="Today's Classes" value={`${present}/${todaySessions.length}`} />
          <Stat T={T} icon="₿"  label="Fees Collected"  value={`RM ${totalCollected.toFixed(2)}`} />
        </div>
      ) : (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
          <Stat T={T} icon="👥" label="Total Students"  value={students.length}  sub="+0" />
          <Stat T={T} icon="♪"  label="Teachers"        value={teachers.length}  sub="+0" />
          <Stat T={T} icon="✓"  label="Today's Classes" value={`${present}/${todaySessions.length}`} />
          <Stat T={T} icon="₿"  label="Fees Collected"  value={`RM ${totalCollected.toFixed(2)}`} />
        </div>
      )}

      {/* Main two-column area */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.8fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Revenue / attendance chart card */}
        <div style={{
          background: T.panel, border: `0.6px solid ${T.border2}`, borderRadius: 12,
          padding: 24, boxShadow: "1px 1px 1px 0px rgba(16,25,52,0.4)"
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 500, color: T.text }}>Monthly Attendance Overview</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: T.text }}>
              {Math.round(attendanceRate * 100)}%
            </div>
            <span style={{
              fontSize: 10, fontWeight: 500, padding: "2px 5px", borderRadius: 2,
              background: "rgba(5,193,104,0.2)", color: "#14CA74", border: "0.6px solid rgba(5,193,104,0.2)"
            }}>Attendance this month</span>
          </div>
          <div style={{ height: 200 }}>
            <AttendanceBarChart data={teacherChartData} T={T} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
            {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(m => (
              <span key={m} style={{ fontSize: 10, color: T.muted }}>{m}</span>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 11 }}>
            <span style={{ color: T.muted }}>Potential: RM {potentialGross.toFixed(2)}</span>
            <span style={{ color: "#14CA74" }}>Collected: RM {totalCollected.toFixed(2)}</span>
          </div>
        </div>

        {/* Right mini-cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{
            background: T.panel, border: `0.6px solid ${T.border2}`, borderRadius: 12,
            padding: "20px 24px", boxShadow: "1px 1px 1px 0px rgba(16,25,52,0.4)", flex: 1
          }}>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>Teacher Payouts</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: T.text }}>RM {totalTeacherPay.toFixed(2)}</div>
            <div style={{ fontSize: 12, color: T.muted }}>Total teacher commissions this month</div>
          </div>
          <div style={{
            background: T.panel, border: `0.6px solid ${T.border2}`, borderRadius: 12,
            padding: "20px 24px", boxShadow: "1px 1px 1px 0px rgba(16,25,52,0.4)", flex: 1
          }}>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>Admin Revenue</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: T.text }}>RM {totalAdminRev.toFixed(2)}</div>
            <div style={{ fontSize: 12, color: T.muted }}>{todaySessions.length} sessions today</div>
          </div>
        </div>
      </div>

      {/* Bottom two-column */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        {/* Students by instrument */}
        <div style={{
          background: T.panel, border: `0.6px solid ${T.border2}`, borderRadius: 12,
          padding: 24, boxShadow: "1px 1px 1px 0px rgba(16,25,52,0.4)"
        }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: T.text, marginBottom: 16 }}>Students by Instrument</div>
          {byInst.map(x => (
            <div key={x.i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ width: 68, fontSize: 12, color: T.muted }}>{x.i}</span>
              <div style={{ flex: 1, height: 5, background: T.dim, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${(x.n / students.length) * 100}%`, height: "100%", background: "#CB3CFF", borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 12, color: T.muted, width: 16, textAlign: "right" }}>{x.n}</span>
            </div>
          ))}
          {byInst.length === 0 && <p style={{ fontSize: 12, color: T.muted }}>No students enrolled.</p>}
        </div>

        {/* Today's sessions */}
        <div style={{
          background: T.panel, border: `0.6px solid ${T.border2}`, borderRadius: 12,
          padding: 24, boxShadow: "1px 1px 1px 0px rgba(16,25,52,0.4)"
        }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: T.text, marginBottom: 16 }}>Today's Sessions</div>
          {todaySessions.length === 0 && (
            <p style={{ color: T.muted, fontSize: 12 }}>No sessions scheduled today.</p>
          )}
          {todaySessions.slice(0, 6).map((sess, i) => {
            const st = students.find(s => s.id === sess.studentId);
            const sm = STATUS_META[sess.status] ?? { color: T.muted, bg: T.dim, border: T.border };
            return (
              <div key={sess.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 0",
                borderBottom: i < Math.min(todaySessions.length, 6) - 1 ? `0.6px solid ${T.border}` : "none"
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: sm.color, flexShrink: 0 }} />
                {st && <Avatar name={st.name} size={28} />}
                <span style={{ flex: 1, fontSize: 12, color: T.text }}>{st?.name ?? "?"}</span>
                <span style={{ fontSize: 12, color: T.muted }}>{sess.startTime}</span>
                {sess.status !== "pending"
                  ? <Badge label={sm.label} color={sm.color} bg={sm.bg} border={sm.border} />
                  : <span style={{ fontSize: 10, color: T.muted }}>—</span>
                }
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
