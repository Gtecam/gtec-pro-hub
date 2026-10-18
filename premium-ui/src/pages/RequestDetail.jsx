import React from "react";

export default function RequestDetail() {
  return (
    <div className="app-shell">
      <div className="panel" style={{ maxWidth: 900, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>Demande</div>
            <h1 style={{ fontSize: 32, fontWeight: 900 }}>Maintenance électrique</h1>
          </div>
          <button className="premium-button ghost">Clôturer</button>
        </header>

        <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <div className="panel" style={{ background: "rgba(15,23,42,0.7)" }}>
            <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase" }}>Client</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8 }}>John Doe</div>
            <div style={{ color: "#94a3b8", marginTop: 8 }}>Douala · Rue de la Lumière</div>
          </div>

          <div className="panel" style={{ background: "rgba(15,23,42,0.7)" }}>
            <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase" }}>Budget</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8 }}>420 000 FCFA</div>
            <div style={{ color: "#94a3b8", marginTop: 8 }}>Prestation estimée</div>
          </div>

          <div className="panel" style={{ background: "rgba(15,23,42,0.7)" }}>
            <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase" }}>Statut</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8 }}>En cours</div>
            <div style={{ color: "#94a3b8", marginTop: 8 }}>Suivi actif</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18, marginTop: 22 }}>
          <div className="panel" style={{ background: "rgba(15,23,42,0.7)" }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Description</h3>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>Le client demande une maintenance complète du tableau électrique et du système de sécurité.</p>
          </div>

          <div className="panel" style={{ background: "rgba(15,23,42,0.7)" }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Interventions</h3>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ color: "#94a3b8" }}>• Première visite technique</div>
              <div style={{ color: "#94a3b8" }}>• Vérification du réseau</div>
              <div style={{ color: "#94a3b8" }}>• Diagnostic des disjoncteurs</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
