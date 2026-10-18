import React from "react";
import { NavLink } from "react-router-dom";

const items = [
  { to: "/dashboard", label: "Overview" },
  { to: "/dashboard/requests", label: "Demandes" },
  { to: "/dashboard/analytics", label: "Analytics" },
  { to: "/dashboard/admin", label: "Admin" },
  { to: "/dashboard/settings", label: "Settings" },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">G</div>
        <div>
          <div className="brand-name">GTEC PRO</div>
          <div className="brand-sub">Enterprise</div>
        </div>
      </div>

      <nav className="nav">
        {items.map((item, idx) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
