import React from "react";
import { Sidebar } from "../components/Sidebar";
import { StatCardPremium } from "../components/StatCardPremium";

export default function Dashboard() {
  const requests = [
    { id: 1, title: "Maintenance électrique", city: "Douala", status: "nouvelle" },
    { id: 2, title: "Inspection HVAC", city: "Yaoundé", status: "en cours" },
    { id: 3, title: "Réseau solaire", city: "Bafoussam", status: "validée" },
  ];

  return (
    <div className="app-shell">
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <Sidebar />

        <main style={{ flex: 1, minWidth: 0 }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 34, fontWeight: 900 }}>Tableau de bord</h1>
              <div style={{ color: "#94a3b8", marginTop: 6 }}>Vue d’ensemble · demandes · paiements</div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button className="premium-button primary">Créer demande</button>
              <button className="premium-button ghost">Déconnexion</button>
            </div>
          </header>

          <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 24 }}>
            <StatCardPremium title="Demandes" value="128" tone="blue" />
            <StatCardPremium title="Devis" value="48" tone="green" />
            <StatCardPremium title="Paiements" value="154" tone="amber" />
            <StatCardPremium title="Interventions" value="36" tone="purple" />
          </section>

          <section style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            <div className="panel">
              <h3>Demandes récentes</h3>
              <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                {requests.map((r) => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderRadius: 14, background: "rgba(148,163,184,0.04)", border: "1px solid rgba(148,163,184,0.12)" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{r.title}</div>
                      <div style={{ color: "#94a3b8", fontSize: 13 }}>{r.city}</div>
                    </div>
                    <div className={`badge ${r.status === 'nouvelle' ? 'blue' : r.status === 'en cours' ? 'amber' : 'green'}`}>{r.status}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <h3>Performance</h3>
              <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>Conversion</div>
                  <div style={{ fontWeight: 800, fontSize: 26, marginTop: 6 }}>67.4%</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>Taux de paiement</div>
                  <div style={{ fontWeight: 800, fontSize: 26, marginTop: 6 }}>92.1%</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>Satisfaction</div>
                  <div style={{ fontWeight: 800, fontSize: 26, marginTop: 6 }}>96%</div>
                </div>
              </div>
            </div>
          </section>

          <section style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", marginTop: 20 }}>
            <div className="panel">
              <h3>Analytics</h3>
              <div className="chart-bars" style={{ marginTop: 12 }}>
                <div className="bar" style={{ height: "35%" }} />
                <div className="bar" style={{ height: "53%" }} />
                <div className="bar" style={{ height: "67%" }} />
                <div className="bar" style={{ height: "58%" }} />
                <div className="bar" style={{ height: "80%" }} />
                <div className="bar" style={{ height: "72%" }} />
              </div>
            </div>

            <div className="panel">
              <h3>Finance</h3>
              <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ color: "#94a3b8" }}>Ventes</div>
                  <div style={{ fontWeight: 800 }}>1 240 000 FCFA</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ color: "#94a3b8" }}>Dépenses</div>
                  <div style={{ fontWeight: 800 }}>340 000 FCFA</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ color: "#94a3b8" }}>Marge</div>
                  <div style={{ fontWeight: 800 }}>900 000 FCFA</div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
