import { getTokens } from "../utils/tokens.js";

export default function Login({ onSignIn, error }) {
  const T = getTokens("dark");

  return (
    <div style={{
      minHeight: "100vh", background: T.bg, display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif"
    }}>
      <div style={{
        background: T.panel, border: `0.6px solid ${T.border2}`,
        borderRadius: 12, padding: 40, textAlign: "center",
        maxWidth: 400, width: "90%",
        boxShadow: "0px 17px 17px 0px rgba(1,5,17,0.1)"
      }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{
            width: 40, height: 40, background: "#CB3CFF", borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, color: "#fff", margin: "0 auto 16px"
          }}>♬</div>
          <div style={{
            fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif",
            fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 8
          }}>Welcome back</div>
          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.65 }}>
            Sign in with your Google account to continue.
          </div>
        </div>

        <button onClick={onSignIn} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
          width: "100%", padding: "12px 20px", borderRadius: 4, border: "none",
          background: "#CB3CFF", cursor: "pointer", fontFamily: "inherit",
          fontSize: 14, fontWeight: 500, color: "#fff", marginBottom: 16
        }}>
          <div style={{
            width: 24, height: 24, background: "#fff", borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 900, color: "#2563eb", flexShrink: 0
          }}>G</div>
          Sign in with Google
        </button>

        {error && (
          <div style={{
            fontSize: 11, color: "#FF5A65", background: "rgba(255,90,101,0.1)",
            border: "0.6px solid rgba(255,90,101,0.3)",
            borderRadius: 4, padding: "9px 12px", marginBottom: 12,
            wordBreak: "break-all", textAlign: "left"
          }}>{error}</div>
        )}

        <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
          Access is managed by your studio administrator.
        </div>
      </div>
    </div>
  );
}
