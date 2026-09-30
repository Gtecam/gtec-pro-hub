/**
 * CATALOGUE DES INTERVENTIONS GTEC PRO — 2e page « Que souhaitez-vous faire ? »
 *
 * Chaque domaine GTEC PRO (les 12 pôles, ordre fixe) ouvre sur la liste des
 * interventions que le client peut sélectionner. Chaque intervention reçoit
 * un code unique DOMAINE-FAMILLE-NN (ex. CFO-INS-01) et porte ses compétences
 * obligatoires, certifications éventuelles et niveau de diplôme minimal —
 * données consommées par le moteur de matching (voir src/lib/nomenclature.ts).
 */

import type { DegreeLevelKey } from "./nomenclature";

export type Intervention = {
  /** Code unique, ex. CFO-INS-01. */
  code: string;
  label: string;
  /** Compétences obligatoires attendues du technicien. */
  skills?: string[];
  /** Certifications / habilitations éventuellement obligatoires. */
  certifications?: string[];
  /** Diplôme minimal requis (rang nomenclature). */
  minDegree?: DegreeLevelKey;
};

/** Item avant attribution du code par le builder. */
type InterventionSeed = Omit<Intervention, "code">;

export type InterventionFamily = {
  /** Clé courte de famille (INS, TAB…). */
  key: string;
  label: string;
  items: InterventionSeed[];
};

export type InterventionDomain = {
  serviceKey: string;
  /** Familles finalisées (items avec code unique attribué). */
  families: {
    key: string;
    label: string;
    items: Intervention[];
  }[];
};

type RawItem =
  | string
  | {
      label: string;
      skills?: string[];
      certifications?: string[];
      minDegree?: DegreeLevelKey;
    };

type FamilyDefaults = {
  skills?: string[];
  certifications?: string[];
  minDegree?: DegreeLevelKey;
};

/** Préfixes de code par pôle GTEC (ordre des 12 domaines, fixe). */
const DOMAIN_PREFIX: Record<string, string> = {
  cfo: "CFO",
  hta: "HTA",
  industrie: "IND",
  solaire: "ENE",
  cfa: "CFA",
  domotique: "DOM",
  incendie: "INC",
  inspection: "INSP",
  hvac: "HVC",
  batiment: "BAT",
  maintenance: "MNT",
  fourniture: "FRN",
};

/** Construit une famille en appliquant les défauts aux items bruts. */
function fam(
  key: string,
  label: string,
  raw: RawItem[],
  defaults?: FamilyDefaults,
): InterventionFamily {
  return {
    key,
    label,
    items: raw.map((r) => {
      const it = typeof r === "string" ? { label: r } : r;
      return {
        label: it.label,
        skills: it.skills ?? defaults?.skills,
        certifications: it.certifications ?? defaults?.certifications,
        minDegree: it.minDegree ?? defaults?.minDegree,
      };
    }),
  };
}

/** Familles brutes par domaine (sans codes, ajoutés par le builder). */
const RAW: Record<string, { label: string; families: InterventionFamily[] }> = {
  cfo: {
    label: "Courant Fort — CFO",
    families: [
      fam("INS", "Installations électriques", [
        "Installation électrique complète d'une maison",
        "Installation électrique appartement",
        "Installation électrique villa",
        "Installation électrique bureau",
        "Installation électrique commerce",
        "Installation électrique hôtel",
        "Installation électrique restaurant",
        "Installation électrique bâtiment industriel",
        "Installation électrique entrepôt",
        "Extension d'une installation existante",
        "Réfection complète d'une installation",
        "Réhabilitation électrique",
        "Mise en conformité électrique",
        "Mise aux normes d'une installation",
      ]),
      fam("TAB", "Tableaux et protections", [
        "Installation de tableau électrique",
        "Remplacement de tableau électrique",
        "Réorganisation de tableau électrique",
        "Installation de disjoncteurs",
        "Remplacement de disjoncteurs",
        "Installation d'interrupteurs différentiels",
        "Recherche de défaut électrique",
        "Protection contre les surtensions",
        "Installation de parafoudre",
        "Installation de protection contre les surintensités",
      ], { skills: ["Tableau électrique", "Disjoncteur"] }),
      fam("CIR", "Circuits et équipements", [
        "Installation de prises électriques",
        "Installation de prises spécialisées",
        "Installation d'interrupteurs",
        "Installation d'éclairage intérieur",
        "Installation d'éclairage extérieur",
        "Installation d'éclairage de sécurité",
        "Installation de circuits électriques",
        "Tirage de câbles",
        "Remplacement de câbles",
        "Dépannage électrique",
        "Recherche de panne",
        "Réparation de panne électrique",
      ], { skills: ["Câblage", "Éclairage"] }),
      fam("TER", "Terre et sécurité", [
        { label: "Mise à la terre", skills: ["Câblage"] },
        { label: "Réfection de prise de terre", skills: ["Câblage"] },
        { label: "Mesure de résistance de terre" },
        { label: "Installation de liaison équipotentielle" },
        { label: "Protection contre la foudre", skills: ["Parafoudre"] },
        { label: "Contrôle de sécurité électrique" },
      ], { certifications: ["Habilitation électrique (B1V, BR, BC)"] }),
      fam("AUT", "Autre", ["Autre intervention"]),
    ],
  },

  hta: {
    label: "Haute Tension — HTA",
    families: [
      fam("RES", "Réseaux HTA", [
        "Installation de réseau HTA",
        "Extension de réseau HTA",
        "Réhabilitation de réseau HTA",
        "Maintenance de réseau HTA",
        "Dépannage réseau HTA",
        "Diagnostic réseau HTA",
        "Travaux sur lignes HTA",
        "Raccordement HTA",
        "Mise en service HTA",
        "Contrôle d'installation HTA",
      ], { certifications: ["Formation HTA"], minDegree: "BTS / HND" }),
      fam("POS", "Postes de transformation", [
        "Installation de poste de transformation",
        "Maintenance de poste de transformation",
        "Diagnostic de transformateur",
        "Remplacement de transformateur",
        "Installation de transformateur",
        "Contrôle de transformateur",
        "Essais électriques sur transformateur",
        "Entretien de poste",
        "Réhabilitation de poste",
        "Mise en conformité de poste",
      ], { skills: ["Poste de transformation", "Transformateur"], certifications: ["Formation HTA"], minDegree: "BTS / HND" }),
      fam("CEL", "Cellules et protections", [
        "Installation de cellules HTA",
        "Maintenance de cellules HTA",
        "Remplacement de cellules HTA",
        "Réglage des protections",
        "Tests de protections",
        "Essais de relais",
        { label: "Consignation/déconsignation", skills: ["Consignation"] },
        { label: "Manœuvres HTA", skills: ["Consignation"] },
        "Diagnostic de défaut HTA",
      ], { skills: ["Cellule HTA"], certifications: ["Formation HTA"], minDegree: "BTS / HND" }),
      fam("CPT", "Comptage", [
        "Installation de comptage",
        "Modification de comptage",
        "Contrôle du comptage",
        "Diagnostic de comptage",
        "Raccordement au réseau",
        "Audit d'installation HTA",
      ], { skills: ["Comptage"], certifications: ["Formation HTA"], minDegree: "BTS / HND" }),
      fam("AUT", "Autre", ["Autre intervention"]),
    ],
  },

  industrie: {
    label: "Industrie & automatisme",
    families: [
      fam("MOT", "Moteurs", [
        "Installation de moteur",
        "Remplacement de moteur",
        "Maintenance moteur",
        "Diagnostic moteur",
        "Réparation moteur",
        "Raccordement moteur",
        "Protection moteur",
        "Alignement moteur",
        "Essai moteur",
      ], { skills: ["Moteur"] }),
      fam("CMD", "Commande industrielle", [
        { label: "Installation d'armoire de commande", skills: ["Armoire industrielle"] },
        { label: "Câblage d'armoire", skills: ["Armoire industrielle"] },
        { label: "Modification d'armoire", skills: ["Armoire industrielle"] },
        { label: "Réhabilitation d'armoire", skills: ["Armoire industrielle"] },
        { label: "Maintenance d'armoire", skills: ["Armoire industrielle"] },
        { label: "Installation de contacteurs", skills: ["Contacteur"] },
        { label: "Installation de relais thermiques", skills: ["Contacteur"] },
        { label: "Installation de démarreurs", skills: ["Moteur"] },
        { label: "Installation de variateurs", skills: ["Variateur"] },
        { label: "Paramétrage de variateurs", skills: ["Variateur"] },
      ]),
      fam("AUT", "Automatisme", [
        { label: "Installation d'automate", skills: ["Automate (API/PLC)"] },
        { label: "Programmation d'automate", skills: ["Automate (API/PLC)"], certifications: ["Certification constructeur (Siemens / Schneider)"] },
        { label: "Modification de programme automate", skills: ["Automate (API/PLC)"] },
        { label: "Diagnostic automate", skills: ["Automate (API/PLC)"] },
        { label: "Maintenance automate", skills: ["Automate (API/PLC)"] },
        { label: "Installation de capteurs", skills: ["Capteurs"] },
        { label: "Installation d'actionneurs", skills: ["Capteurs"] },
        "Automatisation d'une machine",
        "Automatisation d'un procédé",
        { label: "Supervision industrielle", skills: ["SCADA"] },
        { label: "Installation SCADA", skills: ["SCADA"], minDegree: "Licence / Licence professionnelle" },
        { label: "Programmation HMI", skills: ["SCADA"] },
        "Mise en service d'automatisme",
      ]),
      fam("MAI", "Maintenance", [
        "Maintenance préventive industrielle",
        "Maintenance corrective",
        "Diagnostic de panne industrielle",
        "Dépannage machine",
        "Révision d'équipement industriel",
        "Amélioration d'installation industrielle",
      ], { skills: ["Maintenance industrielle"] }),
      fam("AUT2", "Autre", ["Autre intervention"]),
    ],
  },

  solaire: {
    label: "Solaire & énergie",
    families: [
      fam("ETD", "Étude et dimensionnement", [
        { label: "Audit solaire", skills: ["Audit énergétique"] },
        { label: "Étude de consommation", skills: ["Audit énergétique"] },
        { label: "Dimensionnement photovoltaïque", skills: ["Dimensionnement PV"] },
        "Étude d'autonomie énergétique",
        "Étude de stockage",
        "Conseil en énergie solaire",
      ]),
      fam("INST", "Installation solaire", [
        "Installation solaire résidentielle",
        "Installation solaire commerciale",
        "Installation solaire industrielle",
        { label: "Installation de panneaux photovoltaïques", skills: ["Kit solaire"] },
        { label: "Installation de kits solaires", skills: ["Kit solaire"] },
        { label: "Installation solaire autonome", skills: ["Kit solaire", "Batterie"] },
        { label: "Installation solaire hybride", skills: ["Onduleur", "Batterie"] },
        { label: "Installation solaire raccordée au réseau", skills: ["Onduleur"] },
        "Extension d'installation solaire",
      ], { certifications: ["Formation photovoltaïque"] }),
      fam("BAT", "Batteries et stockage", [
        { label: "Installation de batteries", skills: ["Batterie"] },
        { label: "Remplacement de batteries", skills: ["Batterie"] },
        { label: "Diagnostic de batteries", skills: ["Batterie"] },
        { label: "Maintenance batteries", skills: ["Batterie"] },
        { label: "Installation de système de stockage", skills: ["Batterie"] },
        { label: "Dimensionnement du stockage", skills: ["Dimensionnement PV"] },
      ], { certifications: ["Formation photovoltaïque"] }),
      fam("OND", "Onduleurs", [
        { label: "Installation d'onduleur", skills: ["Onduleur"] },
        { label: "Configuration d'onduleur", skills: ["Onduleur"] },
        { label: "Maintenance d'onduleur", skills: ["Onduleur"] },
        { label: "Dépannage d'onduleur", skills: ["Onduleur"] },
        { label: "Remplacement d'onduleur", skills: ["Onduleur"] },
      ], { certifications: ["Formation photovoltaïque"] }),
      fam("APP", "Applications", [
        { label: "Pompage solaire", skills: ["Pompage solaire"] },
        { label: "Éclairage solaire", skills: ["Kit solaire"] },
        "Alimentation solaire d'une maison",
        "Alimentation solaire d'une entreprise",
        "Système solaire pour site isolé",
        "Installation solaire pour télécommunication",
        "Installation solaire pour agriculture",
      ], { certifications: ["Formation photovoltaïque"] }),
      fam("AUT", "Autre", ["Autre intervention"]),
    ],
  },

  cfa: {
    label: "Courant Faible — CFA",
    families: [
      fam("NET", "Réseaux informatiques", [
        "Installation de réseau informatique",
        { label: "Câblage réseau", skills: ["Baie de brassage"] },
        { label: "Câblage RJ45", skills: ["Baie de brassage"] },
        { label: "Installation de baie informatique", skills: ["Baie de brassage"] },
        { label: "Brassage réseau", skills: ["Baie de brassage"] },
        "Certification de câblage",
        "Extension de réseau",
        "Maintenance réseau",
        "Diagnostic réseau",
      ]),
      fam("FIB", "Fibre optique", [
        { label: "Installation fibre optique", skills: ["Fibre optique"] },
        { label: "Tirage fibre optique", skills: ["Fibre optique"] },
        { label: "Soudure fibre optique", skills: ["Fibre optique"] },
        { label: "Raccordement fibre", skills: ["Fibre optique"] },
        { label: "Test fibre", skills: ["Fibre optique"] },
        { label: "Mesure fibre", skills: ["Fibre optique"] },
        { label: "Réparation fibre", skills: ["Fibre optique"] },
        { label: "Maintenance fibre", skills: ["Fibre optique"] },
      ], { certifications: ["Formation fibre optique"] }),
      fam("TEL", "Téléphonie", [
        "Installation téléphonique",
        "Installation IPBX",
        { label: "Installation VoIP", skills: ["VoIP"] },
        { label: "Configuration téléphones IP", skills: ["VoIP"] },
        "Maintenance téléphonique",
      ]),
      fam("VID", "Vidéosurveillance", [
        { label: "Installation de vidéosurveillance", skills: ["Vidéosurveillance IP"] },
        { label: "Installation de caméras IP", skills: ["Vidéosurveillance IP"] },
        { label: "Installation DVR/NVR", skills: ["Vidéosurveillance IP"] },
        { label: "Configuration caméra", skills: ["Vidéosurveillance IP"] },
        "Configuration accès à distance",
        { label: "Maintenance vidéosurveillance", skills: ["Vidéosurveillance IP"] },
        { label: "Remplacement de caméra", skills: ["Vidéosurveillance IP"] },
        { label: "Diagnostic caméra", skills: ["Vidéosurveillance IP"] },
      ], { certifications: ["Formation CCTV / vidéosurveillance"] }),
      fam("INT", "Interphonie et contrôle", [
        { label: "Installation interphone", skills: ["Interphonie"] },
        { label: "Installation visiophone", skills: ["Interphonie"] },
        { label: "Installation contrôle d'accès", skills: ["Contrôle d'accès"] },
        { label: "Installation lecteur biométrique", skills: ["Contrôle d'accès"] },
        { label: "Installation badge RFID", skills: ["Contrôle d'accès"] },
        { label: "Installation portail automatique", skills: ["Portail automatique"] },
      ]),
      fam("AUT", "Autre", ["Autre intervention"]),
    ],
  },

  domotique: {
    label: "Domotique",
    families: [
      fam("GEN", "Interventions domotique", [
        "Étude domotique",
        "Installation domotique",
        "Automatisation de maison",
        "Automatisation de bâtiment",
        { label: "Éclairage intelligent", skills: ["Éclairage"] },
        { label: "Commande d'éclairage à distance", skills: ["Éclairage"] },
        "Installation interrupteurs connectés",
        "Installation prises connectées",
        { label: "Gestion intelligente de l'énergie", skills: ["Audit énergétique"] },
        "Gestion automatique de la climatisation",
        "Gestion automatique des volets",
        "Automatisation des portes",
        { label: "Automatisation des portails", skills: ["Portail automatique"] },
        "Serrure connectée",
        { label: "Contrôle d'accès connecté", skills: ["Contrôle d'accès"] },
        { label: "Interphone connecté", skills: ["Interphonie"] },
        { label: "Vidéosurveillance connectée", skills: ["Vidéosurveillance IP"] },
        { label: "Alarme connectée", skills: ["Alarme intrusion"] },
        "Détection de présence",
        "Détection de fumée connectée",
        "Gestion intelligente du bâtiment",
        "Installation de capteurs",
        "Configuration système domotique",
        "Programmation domotique",
        "Maintenance domotique",
        "Dépannage domotique",
      ]),
      fam("AUT", "Autre", ["Autre intervention"]),
    ],
  },

  incendie: {
    label: "Sécurité incendie",
    families: [
      fam("DET", "Détection", [
        "Étude de sécurité incendie",
        { label: "Installation de détecteurs de fumée", skills: ["Détection incendie"] },
        { label: "Installation de détecteurs de chaleur", skills: ["Détection incendie"] },
        { label: "Installation de détecteurs de flamme", skills: ["Détection incendie"] },
        { label: "Installation de centrale incendie", skills: ["Détection incendie"] },
        { label: "Installation de déclencheurs manuels", skills: ["Alarme intrusion"] },
        { label: "Installation de sirènes incendie", skills: ["Alarme intrusion"] },
        "Extension de système incendie",
      ]),
      fam("ALA", "Alarme", [
        { label: "Installation d'alarme incendie", skills: ["Alarme intrusion"] },
        { label: "Configuration d'alarme", skills: ["Alarme intrusion"] },
        { label: "Maintenance d'alarme", skills: ["Alarme intrusion"] },
        { label: "Diagnostic d'alarme", skills: ["Alarme intrusion"] },
        { label: "Remplacement de détecteur", skills: ["Détection incendie"] },
        { label: "Remplacement de centrale", skills: ["Détection incendie"] },
      ]),
      fam("DES", "Désenfumage", [
        "Installation de désenfumage",
        "Maintenance du désenfumage",
        "Dépannage du désenfumage",
        "Contrôle du système de désenfumage",
      ]),
      fam("EXT", "Extinction", [
        "Installation d'extincteurs",
        "Vérification d'extincteurs",
        "Maintenance d'extincteurs",
        "Recharge d'extincteurs",
        "Installation de RIA",
        "Installation de système d'extinction automatique",
      ]),
      fam("SEC", "Sécurité", [
        { label: "Audit sécurité incendie" },
        { label: "Mise en conformité incendie" },
        { label: "Signalétique incendie" },
        { label: "Plan d'évacuation" },
        { label: "Contrôle périodique" },
        { label: "Formation/sensibilisation à la sécurité incendie" },
      ]),
      fam("AUT", "Autre", ["Autre intervention"]),
    ],
  },

  inspection: {
    label: "Inspection & diagnostic",
    families: [
      fam("GEN", "Interventions d'inspection", [
        { label: "Diagnostic électrique", skills: ["Diagnostic"] },
        { label: "Audit électrique", skills: ["Diagnostic"] },
        "Inspection d'installation électrique",
        { label: "Contrôle de tableau électrique", skills: ["Tableau électrique", "Diagnostic"] },
        "Mesure de tension",
        "Mesure de courant",
        "Mesure de résistance",
        "Mesure de puissance",
        "Mesure de continuité",
        "Mesure de prise de terre",
        "Contrôle d'isolement",
        "Recherche de défaut",
        "Recherche de panne",
        { label: "Analyse de qualité de l'énergie", skills: ["Diagnostic"] },
        "Analyse de consommation électrique",
        { label: "Thermographie électrique" },
        { label: "Thermographie bâtiment" },
        { label: "Inspection par caméra thermique" },
        { label: "Audit énergétique", skills: ["Audit énergétique"] },
        "Diagnostic de performance énergétique",
        "Étude de consommation",
        "Détection de surconsommation",
        { label: "Diagnostic solaire", skills: ["Kit solaire"] },
        { label: "Diagnostic batteries", skills: ["Batterie"] },
        { label: "Diagnostic onduleur", skills: ["Onduleur"] },
        { label: "Diagnostic moteur", skills: ["Moteur"] },
        { label: "Diagnostic armoire électrique", skills: ["Armoire industrielle"] },
        "Rapport d'inspection",
        "Rapport de conformité",
        "Préconisations de travaux",
      ]),
      fam("AUT", "Autre", ["Autre intervention"]),
    ],
  },

  hvac: {
    label: "Climatisation, HVAC & froid",
    families: [
      fam("CLIM", "Climatisation", [
        { label: "Installation climatiseur Split", skills: ["Split"] },
        { label: "Installation climatiseur cassette", skills: ["Split"] },
        { label: "Installation climatiseur gainable", skills: ["Split"] },
        { label: "Installation climatisation centrale", skills: ["Centrale de traitement d'air"] },
        { label: "Installation système VRV/VRF", skills: ["VRV/VRF"] },
        "Déplacement de climatiseur",
        "Remplacement de climatiseur",
        "Mise en service",
        "Diagnostic climatisation",
        "Dépannage climatisation",
      ]),
      fam("ENT", "Entretien", [
        "Entretien climatiseur",
        "Nettoyage climatiseur",
        "Désinfection climatiseur",
        "Nettoyage filtres",
        { label: "Contrôle circuit frigorifique", skills: ["Charge de fluide"] },
        { label: "Contrôle pression", skills: ["Charge de fluide"] },
        { label: "Recherche de fuite", skills: ["Charge de fluide"] },
        { label: "Recharge fluide frigorigène", skills: ["Charge de fluide"] },
      ], { certifications: ["Formation froid & fluides frigorigènes"] }),
      fam("FRO", "Froid", [
        { label: "Installation chambre froide", skills: ["Chambre froide"] },
        { label: "Maintenance chambre froide", skills: ["Chambre froide"] },
        { label: "Dépannage chambre froide", skills: ["Chambre froide"] },
        { label: "Installation vitrine réfrigérée", skills: ["Groupe frigorifique"] },
        { label: "Maintenance vitrine réfrigérée", skills: ["Groupe frigorifique"] },
        { label: "Installation groupe frigorifique", skills: ["Groupe frigorifique"] },
        { label: "Maintenance groupe frigorifique", skills: ["Groupe frigorifique"] },
        { label: "Froid industriel", skills: ["Groupe frigorifique"] },
        { label: "Froid commercial", skills: ["Groupe frigorifique"] },
        { label: "Froid domestique", skills: ["Split"] },
      ], { certifications: ["Formation froid & fluides frigorigènes"] }),
      fam("VEN", "HVAC", [
        { label: "Installation ventilation", skills: ["Centrale de traitement d'air"] },
        { label: "Maintenance ventilation", skills: ["Centrale de traitement d'air"] },
        { label: "Installation extraction d'air", skills: ["Centrale de traitement d'air"] },
        { label: "Traitement d'air", skills: ["Centrale de traitement d'air"] },
        "Maintenance HVAC",
        "Diagnostic HVAC",
      ]),
      fam("AUT", "Autre", ["Autre intervention"]),
    ],
  },

  batiment: {
    label: "Bâtiment & infrastructures",
    families: [
      fam("GEN", "Bâtiment", [
        "Construction légère",
        "Réhabilitation de bâtiment",
        "Rénovation de bâtiment",
        "Extension de bâtiment",
        { label: "Cloisonnement", skills: ["Plâtrerie"] },
        { label: "Maçonnerie", skills: ["Maçonnerie"] },
        { label: "Bétonnage", skills: ["Coffrage"] },
        { label: "Carrelage", skills: ["Carrelage"] },
        { label: "Plâtrerie", skills: ["Plâtrerie"] },
        { label: "Peinture", skills: ["Peinture"] },
        { label: "Étanchéité", skills: ["Étanchéité"] },
        { label: "Toiture", skills: ["Étanchéité"] },
        { label: "Charpente" },
        { label: "Menuiserie" },
      ]),
      fam("CHC", "Génie électrique associé", [
        { label: "Installation de chemins de câbles", skills: ["Câblage"] },
        { label: "Pose de goulottes", skills: ["Câblage"] },
        { label: "Pose de conduits", skills: ["Câblage"] },
        { label: "Pose de gaines", skills: ["Câblage"] },
        { label: "Installation de supports électriques", skills: ["Câblage"] },
        { label: "Installation de caniveaux techniques", skills: ["Câblage"] },
        { label: "Installation de fourreaux", skills: ["Câblage"] },
        { label: "Réalisation de réservations" },
        { label: "Percement technique" },
        { label: "Réalisation de locaux techniques" },
      ]),
      fam("INF", "Infrastructures", [
        { label: "Terrassement", skills: ["Terrassement"] },
        { label: "Fondation légère", skills: ["Coffrage"] },
        { label: "Dalle béton", skills: ["Coffrage"] },
        { label: "Massif pour équipement", skills: ["Coffrage"] },
        { label: "Socle pour transformateur", skills: ["Coffrage"] },
        { label: "Socle pour groupe électrogène", skills: ["Coffrage"] },
        { label: "Socle pour équipements solaires", skills: ["Coffrage"] },
        { label: "Travaux de voirie légère", skills: ["Terrassement"] },
        { label: "Réhabilitation d'infrastructure" },
      ]),
      fam("AUT", "Autre", ["Autre intervention"]),
    ],
  },

  maintenance: {
    label: "Maintenance & contrats",
    families: [
      fam("PON", "Maintenance ponctuelle", [
        { label: "Diagnostic de panne", skills: ["Diagnostic machines"] },
        "Dépannage",
        "Réparation",
        "Remplacement de matériel",
        "Révision d'équipement",
        "Remise en service",
        "Contrôle après intervention",
      ]),
      fam("PRE", "Maintenance préventive", [
        "Visite préventive",
        { label: "Maintenance électrique", skills: ["Maintenance préventive"] },
        { label: "Maintenance solaire", skills: ["Kit solaire"] },
        { label: "Maintenance industrielle", skills: ["Maintenance industrielle"] },
        { label: "Maintenance climatisation", skills: ["Split"] },
        { label: "Maintenance froid", skills: ["Chambre froide"] },
        { label: "Maintenance informatique" },
        { label: "Maintenance réseau" },
        { label: "Maintenance vidéosurveillance", skills: ["Vidéosurveillance IP"] },
        { label: "Maintenance incendie", skills: ["Détection incendie"] },
        { label: "Maintenance domotique" },
        { label: "Maintenance groupe électrogène" },
      ]),
      fam("CTR", "Contrats", [
        "Contrat de maintenance mensuel",
        "Contrat de maintenance trimestriel",
        "Contrat de maintenance semestriel",
        "Contrat de maintenance annuel",
        "Contrat de maintenance préventive",
        "Contrat de maintenance corrective",
        "Contrat multiservices",
        "Contrat de maintenance d'entreprise",
        "Contrat de maintenance hôtel",
        "Contrat de maintenance industrielle",
      ]),
      fam("SUI", "Suivi", [
        "Planification automatique des visites",
        "Rappel de maintenance",
        "Rapport de maintenance",
        "Historique des interventions",
        "Suivi des équipements",
        "Inventaire technique",
        "Gestion des pièces de rechange",
        "Suivi des garanties",
      ]),
      fam("AUT", "Autre", ["Autre intervention"]),
    ],
  },

  fourniture: {
    label: "Fourniture de matériel — GTEC Store",
    families: [
      fam("ELE", "Électricité", [
        "Câbles électriques",
        "Disjoncteurs",
        "Interrupteurs différentiels",
        "Tableaux électriques",
        "Coffrets électriques",
        "Prises",
        "Interrupteurs",
        "Contacteurs",
        "Relais",
        "Variateurs",
        "Parafoudres",
        "Matériel de mise à la terre",
        "Matériel d'éclairage",
        "Lampes",
        "Projecteurs",
      ]),
      fam("SOL", "Solaire", [
        "Panneaux photovoltaïques",
        "Onduleurs",
        "Batteries",
        "Régulateurs",
        "Kits solaires",
        "Structures de fixation",
        "Câbles solaires",
        "Connecteurs",
        "Protections DC/AC",
      ]),
      fam("RCF", "Réseaux / CFA", [
        "Câbles réseau",
        "Fibre optique",
        "Baies informatiques",
        "Switches",
        "Routeurs",
        "Accessoires réseau",
        "Caméras",
        "DVR/NVR",
        "Interphones",
        "Visiophones",
        "Contrôle d'accès",
        "Alarmes",
      ]),
      fam("CLI", "Climatisation / Froid", [
        "Climatiseurs",
        "Accessoires climatisation",
        "Pièces détachées",
        "Compresseurs",
        "Ventilateurs",
        "Équipements frigorifiques",
      ]),
      fam("SECF", "Sécurité", [
        "Détecteurs incendie",
        "Centrales incendie",
        "Sirènes",
        "Extincteurs",
        "Signalétique",
        "Équipements de sécurité",
      ]),
      fam("SVC", "Services GTEC Store", [
        "Demande de devis matériel",
        "Achat en ligne",
        "Livraison",
        "Retrait en point de vente",
        "Livraison + installation",
        "Fourniture + pose",
        "Fourniture pour chantier",
        "Fourniture en gros",
        "Fourniture pour entreprise",
      ]),
      fam("AUT", "Autre", ["Autre intervention"]),
    ],
  },
};

// ===================== Builder : codes uniques ==============================

const CATALOGUE: Record<string, InterventionDomain> = Object.fromEntries(
  Object.entries(RAW).map(([serviceKey, domain]) => {
    const prefix = DOMAIN_PREFIX[serviceKey] ?? serviceKey.toUpperCase().slice(0, 3);
    const counters = new Map<string, number>();
    const families = domain.families.map((f) => ({
      key: f.key,
      label: f.label,
      items: f.items.map((it) => {
        const n = (counters.get(f.key) ?? 0) + 1;
        counters.set(f.key, n);
        const nn = f.key === "AUT" ? "99" : String(n).padStart(2, "0");
        const withCode: Intervention = { ...it, code: `${prefix}-${f.key}-${nn}` };
        return withCode;
      }),
    }));
    return [serviceKey, { serviceKey, families } satisfies InterventionDomain];
  }),
);

/** Domaine d'interventions d'un pôle (undefined si pôle custom sans catalogue). */
export function interventionsForService(serviceKey: string): InterventionDomain | undefined {
  return CATALOGUE[serviceKey];
}

/** Toutes les interventions d'un pôle (liste plate). */
export function flatInterventions(serviceKey: string): Intervention[] {
  return (CATALOGUE[serviceKey]?.families ?? []).flatMap((f) => f.items);
}

/** Résout une intervention par son code unique (toutes familles confondues). */
export function interventionByCode(code: string | undefined): Intervention | undefined {
  if (!code) return undefined;
  const [prefix] = code.split("-");
  const serviceKey = Object.entries(DOMAIN_PREFIX).find(
    ([, p]) => p === prefix,
  )?.[0];
  if (!serviceKey) return undefined;
  return flatInterventions(serviceKey).find((i) => i.code === code);
}

// ========================= NIVEAUX D'URGENCE ================================

export const URGENCY_LEVELS = [
  { key: "normale", label: "Normale", hint: "Intervention planifiée dans les prochains jours." },
  { key: "urgente", label: "Urgente", hint: "Intervention sous 24 à 48 h." },
  { key: "critique", label: "Critique", hint: "Danger ou arrêt d'activité — intervention immédiate." },
] as const;

export type UrgencyKey = (typeof URGENCY_LEVELS)[number]["key"];

export function urgencyLabel(key: string | undefined): string {
  return URGENCY_LEVELS.find((u) => u.key === key)?.label ?? "Normale";
}

/** Badges d'affichage de l'urgence (couleurs Tailwind). */
export const URGENCY_BADGE: Record<string, string> = {
  normale: "bg-muted text-muted-foreground ring-border",
  urgente: "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400",
  critique: "bg-destructive/10 text-destructive ring-destructive/20",
};
