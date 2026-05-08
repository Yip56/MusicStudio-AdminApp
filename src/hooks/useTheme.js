import { useState, useEffect } from "react";

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem("studio_theme") || "dark");

  useEffect(() => {
    localStorage.setItem("studio_theme", theme);
  }, [theme]);

  const toggle = () => setTheme(t => t === "dark" ? "light" : "dark");

  return { theme, setTheme, toggle };
}
