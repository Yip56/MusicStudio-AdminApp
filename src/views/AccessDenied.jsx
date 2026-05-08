import { getTokens } from "../utils/tokens.js";

export default function AccessDenied({ email, onSignOut }) {
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
        maxWidth: 420, width: "90%"
      }}>
        <div style={{ fontSize: 52, marginBottom: 18 }}>🚫</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: T.text, marginBottom: 14 }}>Access Denied</div>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.75, marginBottom: 28 }}>
          Your Google account (<strong style={{ color: T.textSub }}>{email}</strong>) is not
          registered in StudioOS. Contact your studio administrator.
        </div>
        <button onClick={onSignOut} style={{
          padding: "11px 24px", borderRadius: 9, border: "none",
          background: T.dim, color: T.text, fontSize: 13, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit"
        }}>
          Sign out and try another account
        </button>
      </div>
    </div>
  );
}
