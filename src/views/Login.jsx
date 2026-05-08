import { getTokens } from "../utils/tokens.js";

export default function Login({ onSignIn, error }) {
  const T = getTokens("dark");

  return (
    <div style={{
      minHeight: "100vh", background: T.bg, display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif"
    }}>
      <div style={{
        background: T.panel, border: `1px solid ${T.border2}`,
        borderRadius: 20, padding: "44px 52px", textAlign: "center",
        maxWidth: 380, width: "90%"
      }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{
            width: 60, height: 60, background: T.accent, borderRadius: 18,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 30, color: "#0b0b0f", margin: "0 auto 18px"
          }}>♬</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: T.text, marginBottom: 10 }}>StudioOS</div>
          <div style={{ fontSize: 14, color: T.muted, lineHeight: 1.65 }}>
            Sign in with your Google account to continue.
          </div>
        </div>

        <button onClick={onSignIn} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
          width: "100%", padding: "14px 20px", borderRadius: 11, border: "none",
          background: T.accent, cursor: "pointer", fontFamily: "inherit",
          fontSize: 15, fontWeight: 700, color: "#0b0b0f", marginBottom: 18
        }}>
          <div style={{
            width: 28, height: 28, background: "#fff", borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 900, color: "#2563eb", flexShrink: 0
          }}>G</div>
          Sign in with Google
        </button>

        {error && (
          <div style={{ fontSize: 11, color: "#f87171", background: "#2d0a0a", borderRadius: 8, padding: "9px 12px", marginBottom: 12, wordBreak: "break-all", textAlign: "left" }}>
            {error}
          </div>
        )}

        <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
          Access is managed by your studio administrator.
        </div>
      </div>
    </div>
  );
}
