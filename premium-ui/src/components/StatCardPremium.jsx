import React from "react";

export function StatCardPremium({ title, value, tone = "blue" }) {
  const toneClass = tone === "green" ? "green" : tone === "amber" ? "amber" : tone === "purple" ? "purple" : "blue";
  return (
    <div className={`stat-card ${toneClass}`}>
      <div className="kpi-title">{title}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}
