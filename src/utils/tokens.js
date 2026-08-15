export const dark = {
  bg:        "#081028",
  panel:     "#0B1739",
  panel2:    "#0A1330",
  border:    "#212C4D",
  border2:   "#343B4F",
  text:      "#FFFFFF",
  textSub:   "#D9E1FA",
  muted:     "#AEB9E1",
  dim:       "#37446B",
  accent:    "#CB3CFF",
  accentAlt: "#8951FF",
  cyan:      "#00C2FF",
  violet:    "#9A91FB",
  amber:     "#FDB52A",
  green:     "#14CA74",
  red:       "#FF5A65",
  rowAlt:    "#080F25",
  input:     "#0A1330",
  sidebar:   "#081028",
  hover:     "#212C4D",
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
