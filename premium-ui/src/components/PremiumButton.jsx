import React from "react";

export function PremiumButton({ children, variant = "primary", onClick }) {
  return (
    <button
      className={`premium-button ${variant === "primary" ? "primary" : "ghost"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
