import { useState } from "react";
import { jsPDF } from "jspdf";
import { usePayrollMonth } from "../hooks/usePayrollMonth.js";
import { calcStudentPayroll } from "../utils/helpers.js";

export default function PayoutPreview({
  teacher, year, month,
  students, fees, attendanceOverrides, adminFlatFee,
  T, isMobile, onBack, currentUser
}) {
  const yearMonth = `${year}-${String(month + 1).padStart(2, "0")}`;
  const { feeStatus, payoutStatus, markPayoutPaid } = usePayrollMonth(yearMonth);
  const isPaid = payoutStatus[teacher.id]?.paid   ?? false;
  const paidAt = payoutStatus[teacher.id]?.paidAt;

  const [hoveredRow, setHoveredRow] = useState(null);

  const myStudents = students.filter(s => s.teacherId === teacher.id);
  const details = myStudents.map(s => {
    const collected          = feeStatus[s.id]?.collected          ?? false;
    const collectedAt        = feeStatus[s.id]?.collectedAt;
    const deferredToMonth    = feeStatus[s.id]?.deferredToMonth    ?? null;
    const deferredFromMonths  = feeStatus[s.id]?.deferredFromMonths  ?? [];
    const deferredFromAmounts = feeStatus[s.id]?.deferredFromAmounts ?? {};

    const deferredGrossExtra = deferredFromMonths.reduce((sum, ym) => {
      if (ym in deferredFromAmounts) return sum + deferredFromAmounts[ym];
      const [y, m] = ym.split("-").map(Number);
      return sum + calcStudentPayroll(s, y, m - 1, fees, teacher.commissionPct, adminFlatFee, attendanceOverrides, true).gross;
    }, 0);

    return {
      student: s,
      collected,
      collectedAt,
      deferredToMonth,
      deferredFromMonths,
      deferredGrossExtra,
      ...calcStudentPayroll(s, year, month, fees, teacher.commissionPct, adminFlatFee, attendanceOverrides, collected, deferredGrossExtra)
    };
  });

  const totalPayout = details.reduce((a, d) => a + (d.deferredToMonth ? 0 : d.teacherCut), 0);
  const monthName   = new Date(year, month, 1).toLocaleDateString("en-MY", { month: "long", year: "numeric" });

  function downloadCSV() {
    const monthLabel = new Date(year, month, 1).toLocaleDateString("en-MY", { month: "long" }).toUpperCase();
    const esc = v => `"${String(v).replace(/"/g, '""')}"`;
    const comHeader = `COM (TOTAL x ${teacher.commissionPct}%)`;

    const fmtYM = ym => {
      const [y, m] = ym.split("-");
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-MY", { month: "long", year: "numeric" });
    };

    const dataRows = details.map((d, i) => {
      const deferredAmt = d.deferredGrossExtra > 0 ? d.deferredGrossExtra.toFixed(2) : "-";
      if (!d.collected) {
        return [i + 1, d.student.name, d.student.grade, "-", "-", "-", d.deferredToMonth ? fmtYM(d.deferredToMonth) : "-", deferredAmt];
      }
      return [
        i + 1,
        d.student.name,
        d.student.grade,
        d.gross.toFixed(2),
        d.deferredToMonth ? "-" : d.flatDeducted.toFixed(2),
        d.deferredToMonth ? "Deferred" : d.teacherCut.toFixed(2),
        d.deferredToMonth ? fmtYM(d.deferredToMonth) : "-",
        deferredAmt,
      ];
    });

    const lines = [
      ["Teacher's Name", teacher.name],
      ["Month", monthLabel],
      [],
      ["NO", "STUDENT'S NAME", "GRADE", "FEES", "ADMIN FEES", comHeader, "DEFERRED TO", "DEFERRED AMOUNT"],
      ...dataRows,
      [],
      ["", "", "", "TOTAL SALARY", "", totalPayout.toFixed(2), "", ""],
    ];

    const csv = lines
      .map(r => r.map(c => c === "" || c === undefined ? "" : esc(c)).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `Payout_${teacher.name.replace(/\s+/g, "_")}_${year}-${String(month + 1).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadInvoice(d) {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const studentSlug = d.student.name.replace(/\s+/g, "");
    const invoiceNo   = `INV-${studentSlug}-${dateStr}`;
    const issuedDate  = now.toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" });
    const issuedTime  = now.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" });
    const collectedDate = d.collectedAt?.toDate
      ? d.collectedAt.toDate().toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" })
      : null;
    const issuedBy     = currentUser?.displayName ?? currentUser?.email ?? "Admin";
    const sessionType  = d.student.attendanceBased ? "Attendance-Based" : "Full Fee";
    const sessionLength = d.student.schedule?.duration ?? null;
    const instrument   = d.student.instrument ?? "—";

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = 210;
    const M = 20;
    let y = 0;

    // ── Helpers ───────────────────────────────────────────────────────────────
    const BLK  = [0, 0, 0];
    const GRY  = [120, 120, 120];
    const LGRY = [190, 190, 190];

    function sf(size, style = "normal", face = "helvetica", color = BLK) {
      doc.setFont(face, style);
      doc.setFontSize(size);
      doc.setTextColor(...color);
    }

    function hLine(ly, thickness = 0.25, color = LGRY) {
      doc.setDrawColor(...color);
      doc.setLineWidth(thickness);
      doc.line(M, ly, W - M, ly);
    }

    // ── Studio name (top-left) + "Invoice" serif title (top-right) ─────────────
    y = 18;
    sf(18, "bold", "helvetica", BLK);
    doc.text("Ark Music Studio", M, y + 6);

    sf(30, "normal", "times", BLK);
    doc.text("Invoice", W - M, y + 9, { align: "right" });

    y += 26;
    hLine(y, 0.4, BLK);
    y += 10;

    // ── Billed To (left) / Invoice meta (right) ───────────────────────────────
    sf(9, "bold", "helvetica", BLK);
    doc.text("Billed to:", M, y);

    sf(8.5, "normal", "helvetica", GRY);
    doc.text(`Invoice No.  ${invoiceNo}`, W - M, y, { align: "right" });

    y += 6;
    sf(9, "normal", "helvetica", BLK);
    doc.text(d.student.name, M, y);

    sf(8.5, "normal", "helvetica", GRY);
    doc.text(issuedDate, W - M, y, { align: "right" });

    y += 5;
    sf(8, "normal", "helvetica", GRY);
    const billedLine2Parts = [instrument, d.student.grade, sessionLength ? `${sessionLength} min` : null].filter(Boolean);
    doc.text(billedLine2Parts.join("  ·  "), M, y);

    y += 5;
    doc.text(`Teacher: ${teacher.name}`, M, y);

    y += 5;
    doc.text(`Issued by: ${issuedBy}  ·  ${issuedTime}`, M, y);

    y += 12;

    // ── Items table ───────────────────────────────────────────────────────────
    const amtX  = W - M;          // right-align amounts here
    const detX  = M + 90;         // detail column start
    const rowH  = 10;

    // Table header
    sf(8.5, "bold", "helvetica", BLK);
    doc.text("Item", M, y);
    doc.text("Details", detX, y);
    doc.text("Amount", amtX, y, { align: "right" });
    y += 2;
    hLine(y, 0.5, BLK);
    y += rowH - 1;

    function tableRow(item, detail, amount) {
      sf(8.5, "normal", "helvetica", BLK);
      doc.text(item, M, y);
      sf(8.5, "normal", "helvetica", GRY);
      doc.text(String(detail), detX, y);
      sf(8.5, "normal", "helvetica", BLK);
      if (amount) doc.text(String(amount), amtX, y, { align: "right" });
      y += 2;
      hLine(y);
      y += rowH - 2;
    }

    tableRow("Billing Period",         monthName,    "");
    tableRow("Session Type",           sessionType,  "");
    if (sessionLength) tableRow("Session Length", `${sessionLength} min`, "");
    tableRow("Monthly Tuition Fee",    `${instrument} · ${d.student.grade}`, `RM ${Number(d.fee || 0).toFixed(2)}`);

    if (d.student.attendanceBased) {
      tableRow(
        `Attendance Adjustment`,
        `${d.attended} of ${d.scheduled} sessions attended`,
        `RM ${d.gross.toFixed(2)}`
      );
    }

    if (d.deferredGrossExtra > 0) {
      tableRow("Deferred Fee (carried in)", "From prior month(s)", `+ RM ${d.deferredGrossExtra.toFixed(2)}`);
    }

    // Payment status row
    const statusText = d.collected
      ? `Collected${collectedDate ? `  (${collectedDate})` : ""}`
      : "Pending";
    tableRow("Payment Status", statusText, "");

    if (d.deferredToMonth) {
      tableRow("Payout Deferred To", d.deferredToMonth, "");
    }

    y += 4;

    // ── Black total bar (full width) ──────────────────────────────────────────
    doc.setFillColor(...BLK);
    doc.rect(0, y, W, 14, "F");
    sf(11, "bold", "helvetica", [255, 255, 255]);
    doc.text("Total", M, y + 9.5);
    doc.text(`RM ${d.gross.toFixed(2)}`, W - M, y + 9.5, { align: "right" });

    y += 22;

    // ── Thank You (cursive-style) ─────────────────────────────────────────────
    sf(22, "bolditalic", "times", BLK);
    doc.text("Thank You!", M, y);

    y += 8;
    sf(8, "normal", "helvetica", GRY);
    doc.text(
      "We appreciate your trust in Ark Music Studio. We are grateful for the opportunity",
      M, y
    );
    y += 5;
    doc.text(
      "to be part of your musical journey. See you at the next session!",
      M, y
    );

    y += 14;

    // ── Footer: issuer + studio address ──────────────────────────────────────
    sf(14, "italic", "times", BLK);
    doc.text(issuedBy, W - M, y, { align: "right" });

    sf(8.5, "bold", "helvetica", BLK);
    doc.text("Ark Music Studio", M, y);

    y += 6;
    sf(7.5, "normal", "helvetica", GRY);
    doc.text("Issued by the studio administration", W - M, y, { align: "right" });
    doc.text("4-2, Jalan 3/114, Kuchai Business Centre,", M, y);

    y += 5;
    doc.text("58200 Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur", M, y);

    y += 5;
    sf(7.5, "bold", "helvetica", BLK);
    doc.text("017-930 1751", M, y);
    sf(7.5, "normal", "helvetica", GRY);
    doc.text(`Generated: ${issuedDate}`, W - M, y, { align: "right" });

    y += 10;
    hLine(y, 0.3, LGRY);
    y += 5;
    sf(7, "normal", "helvetica", LGRY);
    doc.text(`${invoiceNo}  ·  Ark Music Studio`, W / 2, y, { align: "center" });

    doc.save(`${invoiceNo}.pdf`);
  }

  const COL_HEADS = [
    "Student", "Grade", "Type", "Comm %",
    "Attendance", "Gross", "Teacher Payout", "Fees Collected", ""
  ];
  const COL_WIDTHS = ["16%", "7%", "9%", "7%", "7%", "9%", "11%", "13%", "8%"];

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: T.muted, fontSize: 13, fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 5,
          marginBottom: 16, padding: 0
        }}
      >
        ← Back to Payroll
      </button>

      {/* Card container */}
      <div style={{
        background: T.panel, border: `0.6px solid ${T.border2}`,
        borderRadius: 12, padding: 24,
        boxShadow: "1px 1px 1px 0px rgba(16,25,52,0.4)"
      }}>
        {/* Page header */}
        <div style={{ marginBottom: 16 }}>
          <h2 style={{
            fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif",
            fontSize: isMobile ? 18 : 22, fontWeight: 700,
            color: T.text, marginBottom: 4, lineHeight: 1.3
          }}>
            Payout for {teacher.name} — {monthName}
          </h2>
          <div style={{ fontSize: 12, color: T.muted }}>
            {teacher.instruments.join(", ")} · {teacher.commissionPct}% commission
          </div>
        </div>

        {/* Paid status bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 0", borderBottom: `0.6px solid ${T.border}`,
          marginBottom: 20
        }}>
          <div style={{ flex: 1 }}>
            {isPaid
              ? (
                <span style={{ color: "#14CA74", fontSize: 13, fontWeight: 500 }}>
                  ✓ Payout marked as paid
                  {paidAt?.toDate
                    ? ` on ${paidAt.toDate().toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" })}`
                    : ""}
                </span>
              )
              : <span style={{ color: T.muted, fontSize: 13 }}>Payout not yet sent</span>
            }
          </div>
          <button
            onClick={() => markPayoutPaid(teacher.id, !isPaid)}
            style={{
              padding: "7px 14px", borderRadius: 4, border: "none", cursor: "pointer",
              fontFamily: "inherit", fontSize: 12, fontWeight: 500,
              background: isPaid ? "rgba(255,90,101,0.15)" : "rgba(5,193,104,0.15)",
              color: isPaid ? "#FF5A65" : "#14CA74",
            }}
          >
            {isPaid ? "Unmark Paid" : "Mark as Paid"}
          </button>
        </div>

        {/* No students message */}
        {myStudents.length === 0 && (
          <p style={{ color: T.muted, fontSize: 13 }}>No students assigned to this teacher.</p>
        )}

        {/* Table */}
        {myStudents.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                {COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}
              </colgroup>
              <thead>
                <tr style={{ background: T.panel2 }}>
                  {COL_HEADS.map(h => (
                    <th key={h} style={{
                      padding: "10px 14px", textAlign: "left",
                      fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                      letterSpacing: "0.06em", color: T.muted,
                      borderBottom: `0.6px solid ${T.border2}`
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {details.map((d, i) => (
                  <tr
                    key={d.student.id}
                    onMouseEnter={() => setHoveredRow(i)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      background: hoveredRow === i ? T.hover : "transparent",
                      borderBottom: `0.6px solid ${T.border}`,
                      transition: "background 0.1s"
                    }}
                  >
                    <td style={{ padding: "11px 14px", fontSize: 12, color: T.text, fontWeight: 500 }}>
                      {d.student.name}
                    </td>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: T.muted }}>
                      {d.student.grade}
                    </td>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: T.muted }}>
                      {d.student.attendanceBased ? "Att. Based" : "Full Fee"}
                    </td>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: T.muted }}>
                      {teacher.commissionPct}%
                    </td>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: T.muted }}>
                      {d.student.attendanceBased ? `${d.attended}/${d.scheduled}` : "N/A"}
                    </td>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: T.text }}>
                      RM {d.gross.toFixed(2)}
                    </td>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: "#60a5fa", fontWeight: 600 }}>
                      RM {d.teacherCut.toFixed(2)}
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      {d.collected
                        ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{
                              width: 6, height: 6, borderRadius: "50%",
                              background: "#14CA74", flexShrink: 0, display: "inline-block"
                            }} />
                            <div>
                              <div style={{ fontSize: 12, color: "#14CA74", fontWeight: 500 }}>Collected</div>
                              {d.collectedAt?.toDate && (
                                <div style={{ fontSize: 10, color: T.muted }}>
                                  {d.collectedAt.toDate().toLocaleDateString("en-MY")}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                        : (
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{
                              width: 6, height: 6, borderRadius: "50%",
                              background: "#FDB52A", flexShrink: 0, display: "inline-block"
                            }} />
                            <span style={{ fontSize: 12, color: "#FDB52A" }}>Pending</span>
                          </div>
                        )
                      }
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <button
                        onClick={() => downloadInvoice(d)}
                        title="Download invoice for this student"
                        style={{
                          padding: "4px 10px", borderRadius: 4, cursor: "pointer",
                          fontFamily: "inherit", fontSize: 11, fontWeight: 500,
                          background: "rgba(203,60,255,0.12)", color: "#CB3CFF",
                          border: "0.6px solid rgba(203,60,255,0.3)",
                        }}
                      >
                        Invoice
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `0.6px solid ${T.border2}`, background: T.panel2 }}>
                  <td colSpan={5} style={{
                    padding: "11px 14px", fontSize: 12,
                    fontWeight: 600, color: T.muted
                  }}>Total Payout</td>
                  <td style={{ padding: "11px 14px" }} />
                  <td style={{
                    padding: "11px 14px", fontSize: 14,
                    fontWeight: 700, color: "#CB3CFF"
                  }}>
                    RM {totalPayout.toFixed(2)}
                  </td>
                  <td style={{ padding: "11px 14px" }} />
                  <td style={{ padding: "11px 14px" }} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button
            onClick={downloadCSV}
            style={{
              padding: "8px 16px", borderRadius: 4, border: "none", cursor: "pointer",
              fontFamily: "inherit", fontSize: 12, fontWeight: 500,
              background: T.panel2, color: T.text
            }}
          >
            Download CSV
          </button>
        </div>
      </div>
    </div>
  );
}
