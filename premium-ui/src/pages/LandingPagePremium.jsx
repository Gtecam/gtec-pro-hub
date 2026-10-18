import React from "react";
import { PremiumButton } from "../components/PremiumButton";

export default function LandingPage() {
  return (
    <div className="app-shell">
      <div style={{ display: "grid", gap: 24 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg,#60a5fa,#22d3ee)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 900 }}>G</div>
            <div style={{ fontWeight: 900, fontSize: 20 }}>GTEC PRO</div>
          </div>

          <nav style={{ display: "flex", gap: 12 }}>
            <a href="/auth" style={{ color: "#cbd5e1", fontWeight: 700 }}>Connexion</a>
            <a href="/auth" style={{ color: "#cbd5e1", fontWeight: 700 }}>Inscription</a>
          </nav>
        </header>

        <main style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 24 }}>
          <div>
            <div style={{ display: "inline-flex", padding: "6px 12px", borderRadius: 999, background: "rgba(148,163,184,0.05)", color: "#dbeafe", textTransform: "uppercase", fontSize: 12 }}>SaaS Platform</div>
            <h1 style={{ marginTop: 18, fontSize: "clamp(2.7rem,4vw,3.5rem)", fontWeight: 900 }}>Des opérations plus intelligentes.</h1>
            <p style={{ marginTop: 18, color: "#cbd5e1" }}>Une plateforme premium pour gérer demandes, devis, paiements et supervision.</p>

            <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
              <PremiumButton>Commencer</PremiumButton>
              <PremiumButton variant="ghost">Zone admin</PremiumButton>
            </div>
          </div>

          <div className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase" }}>Ce mois</div>
                <div style={{ fontSize: 28, fontWeight: 900, marginTop: 8 }}>1 240 000 FCFA</div>
              </div>
              <div style={{ color: "#67e8f9", fontWeight: 700 }}>+12%</div>
            </div>

            <div style={{ marginTop: 20, height: 140, borderRadius: 12, background: "linear-gradient(135deg, rgba(96,165,250,0.12), rgba(34,211,238,0.08))" }} />
          </div>
        </main>
      </div>
    </div>
  );
}
