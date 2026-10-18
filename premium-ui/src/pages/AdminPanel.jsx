import React from "react";

export default function AdminPanel() {
  const items = [
    { id: 1, title: "Maintenance électrique", status: "nouvelle" },
    { id: 2, title: "Inspection HVAC", status: "en cours" },
    { id: 3, title: "Installation solaire", status: "validée" },
  ];

  return (
    <div className="app-shell">
      <div className="panel" style={{ maxWidth: 1100, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase" }}>Admin</div>
            <h1 style={{ fontSize: 34, fontWeight: 900 }}>Console d’administration</h1>
          </div>
          <button className="premium-button ghost">Exporter</button>
        </header>

        <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginTop: 24 }}>
          <div className="panel" style={{ background: "rgba(15,23,42,0.7)" }}>
            <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase" }}>Utilisateurs</div>
            <div style={{ fontSize: 28, fontWeight: 900, marginTop: 10 }}>1 245</div>
          </div>
          <div className="panel" style={{ background: "rgba(15,23,42,0.7)" }}>
            <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase" }}>Demandes</div>
            <div style={{ fontSize: 28, fontWeight: 900, marginTop: 10 }}>328</div>
          </div>
          <div className="panel" style={{ background: "rgba(15,23,42,0.7)" }}>
            <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase" }}>Paiements</div>
            <div style={{ fontSize: 28, fontWeight: 900, marginTop: 10 }}>14 820</div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", marginTop: 22 }}>
          <div className="panel" style={{ background: "rgba(15,23,42,0.7)" }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Demandes récentes</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {items.map(item => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>#{item.id}</div>
                  </div>
                  <span className="badge blue">{item.status}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel" style={{ background: "rgba(15,23,42,0.7)" }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Flux de paiement</h3>
            <div className="chart-bars" style={{ marginTop: 16 }}>
              <div className="bar" style={{ height: "35%" }} />
              <div className="bar" style={{ height: "53%" }} />
              <div className="bar" style={{ height: "67%" }} />
              <div className="bar" style={{ height: "58%" }} />
              <div className="bar" style={{ height: "80%" }} />
              <div className="bar" style={{ height: "72%" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
