import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// Reset base styles
const style = document.createElement("style");
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', 'Segoe UI', sans-serif; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #2e2e3a; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #3e3e4a; }
  input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
