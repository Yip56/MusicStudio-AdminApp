export const dark = {
  bg:      "#0b0b0f",
  panel:   "#111118",
  panel2:  "#16161f",
  border:  "#1e1e2a",
  border2: "#262634",
  text:    "#e8e8f0",
  textSub: "#a0a0b8",
  muted:   "#6b6b80",
  dim:     "#2e2e3a",
  accent:  "#e8b84b",
  accentD: "#c49a30",
  rowAlt:  "#0d0d14",
  input:   "#0d0d14",
  sidebar: "#0e0e16",
  hover:   "#1a1a28",
};

export const light = {
  bg:      "#f4f4f8",
  panel:   "#ffffff",
  panel2:  "#f0f0f5",
  border:  "#e0e0ea",
  border2: "#d4d4e0",
  text:    "#1a1a2e",
  textSub: "#4a4a60",
  muted:   "#707088",
  dim:     "#c8c8d8",
  accent:  "#c49a30",
  accentD: "#a07c20",
  rowAlt:  "#f8f8fc",
  input:   "#f0f0f6",
  sidebar: "#ffffff",
  hover:   "#eaeaf4",
};

export function getTokens(theme) {
  return theme === "dark" ? dark : light;
}
