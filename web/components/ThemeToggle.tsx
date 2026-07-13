"use client";

export default function ThemeToggle() {
  const toggle = () => {
    const cur =
      document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("gmat_theme", next);
    } catch {}
  };
  return (
    <button className="themebtn" type="button" onClick={toggle} aria-label="Toggle dark mode">
      ☾
    </button>
  );
}
