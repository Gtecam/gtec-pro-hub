/**
 * NOMENCLATURE GTEC PRO — Domaine → Spécialité professionnelle → Métier →
 * Compétences → Diplôme → Spécialité du diplôme → Niveau → Certifications.
 *
 * Structure alignée sur les spécialités techniques recensées par le MINESEC
 * (premier/second cycle technique) et les filières/spécialités supérieures
 * recensées par le MINESUP (BTS/HND, Licence, Ingénieur/Master).
 *
 * Chaque spécialité porte un code unique (ex. ELEC-ELEC-BAT) utilisé par le
 * moteur de matching : le client décrit son besoin via un pôle + spécialité,
 * l'algorithme croise spécialité + métier + diplôme + compétences + zone.
 *
 * NB : la liste n'est pas juridiquement exhaustive des diplômes camerounais
 * (intitulés et habilitations dépendent du ministère, de l'établissement et
 * du régime de formation) ; elle constitue la nomenclature GTEC PRO.
 */

export type NomenDomain = {
  /** Code racine du domaine (ex. ELEC). */
  code: string;
  label: string;
  /** Pôles GTEC existants (serviceKey) servis par ce domaine. */
  poles: string[];
  specialties: NomenSpecialty[];
};

export type NomenSpecialty = {
  /** Code unique complet, ex. ELEC-ELEC-BAT. */
  code: string;
  label: string;
  jobs: string[];
};

// ============================ 1. GÉNIE ÉLECTRIQUE ============================

const ELEC_SPECIALTIES: NomenSpecialty[] = [
  { code: "ELEC-ELEC-BAT", label: "Électricité bâtiment", jobs: ["Électricien bâtiment", "Monteur électricien", "Installateur électrique"] },
  { code: "ELEC-ELEC-IND", label: "Électricité industrielle", jobs: ["Électricien industriel", "Technicien de maintenance électrique", "Technicien groupes électrogènes"] },
  { code: "ELEC-ELEC-TER", label: "Électricité tertiaire", jobs: ["Électricien tertiaire", "Monteur électricien"] },
  { code: "ELEC-ELEC-EQP", label: "Électricité d'équipement", jobs: ["Électricien d'équipement", "Électrotechnicien"] },
  { code: "ELEC-ELT-GEN", label: "Électrotechnique", jobs: ["Électrotechnicien", "Technicien électrotechnique", "Ingénieur électrotechnicien"] },
  { code: "ELEC-INS-BT", label: "Installations électriques basse tension", jobs: ["Installateur électrique", "Monteur électricien"] },
  { code: "ELEC-INS-HTA", label: "Installations électriques haute tension/HTA", jobs: ["Technicien HTA", "Monteur HTA"] },
  { code: "ELEC-DIS-GEN", label: "Distribution électrique", jobs: ["Technicien réseaux électriques", "Technicien HTA"] },
  { code: "ELEC-RES-GEN", label: "Réseaux électriques", jobs: ["Technicien réseaux électriques", "Ingénieur réseaux électriques"] },
  { code: "ELEC-TAB-GEN", label: "Tableaux électriques", jobs: ["Monteur électricien", "Électricien industriel"] },
  { code: "ELEC-ARM-IND", label: "Armoires électriques", jobs: ["Électricien industriel", "Technicien électrotechnique"] },
  { code: "ELEC-PRO-GEN", label: "Protection électrique", jobs: ["Technicien protection électrique", "Technicien diagnostic électrique"] },
  { code: "ELEC-TER-FOU", label: "Mise à la terre et protection contre la foudre", jobs: ["Technicien mise à la terre", "Installateur électrique"] },
  { code: "ELEC-ECL-GEN", label: "Éclairage", jobs: ["Technicien éclairage", "Monteur électricien"] },
  { code: "ELEC-ECL-PUB", label: "Éclairage public", jobs: ["Technicien éclairage", "Électricien tertiaire"] },
  { code: "ELEC-CFO-GEN", label: "Courants forts", jobs: ["Électricien bâtiment", "Électricien industriel"] },
  { code: "ELEC-CFA-GEN", label: "Courants faibles", jobs: ["Électricien tertiaire", "Technicien CCTV"] },
  { code: "ELEC-CCT-GEN", label: "Contrôle et commande électrique", jobs: ["Technicien électrotechnique", "Automaticien"] },
  { code: "ELEC-MNT-ELE", label: "Maintenance électrique", jobs: ["Technicien de maintenance électrique", "Électricien industriel"] },
  { code: "ELEC-MNT-ELT", label: "Maintenance électrotechnique", jobs: ["Technicien électrotechnique", "Électromécanicien"] },
  { code: "ELEC-DIA-GEN", label: "Diagnostic électrique", jobs: ["Technicien diagnostic électrique"] },
  { code: "ELEC-QUA-ENE", label: "Qualité de l'énergie électrique", jobs: ["Technicien diagnostic électrique", "Ingénieur génie électrique"] },
  { code: "ELEC-GRP-GEN", label: "Groupe électrogène", jobs: ["Technicien groupes électrogènes"] },
  { code: "ELEC-UPS-GEN", label: "Onduleurs et systèmes UPS", jobs: ["Technicien UPS/onduleurs"] },
  { code: "ELEC-SEC-GEN", label: "Énergie de secours", jobs: ["Technicien groupes électrogènes", "Technicien UPS/onduleurs"] },
  { code: "ELEC-INS-IND", label: "Installation électrique industrielle", jobs: ["Électricien industriel", "Conducteur de travaux électriques"] },
  { code: "ELEC-INS-RES", label: "Installation électrique résidentielle", jobs: ["Électricien bâtiment", "Installateur électrique"] },
  { code: "ELEC-INS-COM", label: "Installation électrique commerciale", jobs: ["Électricien tertiaire", "Chargé d'affaires électriques"] },
  { code: "ELEC-INS-AGR", label: "Installation électrique agricole", jobs: ["Installateur électrique", "Électricien bâtiment"] },
];

// ========================= 2. HAUTE TENSION / HTA ============================

const HTA_SPECIALTIES: NomenSpecialty[] = [
  { code: "HTA-RES-GEN", label: "Réseaux HTA", jobs: ["Technicien réseaux HTA", "Technicien HTA"] },
  { code: "HTA-POS-TRA", label: "Postes de transformation", jobs: ["Technicien postes de transformation", "Monteur HTA"] },
  { code: "HTA-CEL-GEN", label: "Cellules HTA", jobs: ["Monteur HTA", "Électricien HTA"] },
  { code: "HTA-TRA-GEN", label: "Transformateurs", jobs: ["Technicien postes de transformation"] },
  { code: "HTA-PRO-GEN", label: "Protection HTA", jobs: ["Technicien protection électrique", "Technicien essais électriques"] },
  { code: "HTA-MAN-CON", label: "Manœuvre et consignation", jobs: ["Électricien HTA", "Technicien HTA"] },
  { code: "HTA-MNT-GEN", label: "Maintenance HTA", jobs: ["Technicien maintenance HTA", "Responsable maintenance HTA"] },
  { code: "HTA-DIA-GEN", label: "Diagnostic HTA", jobs: ["Technicien essais électriques"] },
  { code: "HTA-DIS-GEN", label: "Distribution électrique", jobs: ["Technicien réseaux HTA"] },
  { code: "HTA-RES-IND", label: "Réseaux industriels", jobs: ["Électricien HTA", "Technicien maintenance HTA"] },
  { code: "HTA-POS-LIV", label: "Postes de livraison", jobs: ["Technicien postes de transformation", "Monteur HTA"] },
  { code: "HTA-MES-SER", label: "Mise en service", jobs: ["Technicien HTA", "Électricien HTA"] },
  { code: "HTA-ESS-ELE", label: "Essais électriques", jobs: ["Technicien essais électriques"] },
];

// ===================== 3. INDUSTRIEL & AUTOMATISME ==========================

const IND_SPECIALTIES: NomenSpecialty[] = [
  { code: "IND-ELM-GEN", label: "Électromécanique", jobs: ["Électromécanicien", "Technicien électromécanique"] },
  { code: "IND-AUT-GEN", label: "Automatisme industriel", jobs: ["Automaticien", "Technicien automatisme"] },
  { code: "IND-API-GEN", label: "Automates programmables industriels", jobs: ["Programmeur automate", "Technicien automatisme"] },
  { code: "IND-API-PLC", label: "API/PLC", jobs: ["Programmeur automate"] },
  { code: "IND-API-SIE", label: "Siemens", jobs: ["Programmeur automate", "Technicien automatisme"] },
  { code: "IND-API-SCH", label: "Schneider", jobs: ["Programmeur automate", "Technicien automatisme"] },
  { code: "IND-API-ABR", label: "Allen-Bradley/Rockwell", jobs: ["Programmeur automate"] },
  { code: "IND-VAR-GEN", label: "Variateurs de vitesse", jobs: ["Technicien variateurs"] },
  { code: "IND-MOT-DEM", label: "Démarreurs moteurs", jobs: ["Technicien moteurs industriels", "Électromécanicien"] },
  { code: "IND-MOT-CMD", label: "Commande moteur", jobs: ["Technicien moteurs industriels"] },
  { code: "IND-MOT-CON", label: "Contacteurs", jobs: ["Électricien industriel", "Technicien moteurs industriels"] },
  { code: "IND-CAP-REL", label: "Relais", jobs: ["Électricien industriel", "Technicien automatisme"] },
  { code: "IND-INS-GEN", label: "Capteurs", jobs: ["Technicien instrumentation"] },
  { code: "IND-INS-REG", label: "Instrumentation", jobs: ["Technicien instrumentation"] },
  { code: "IND-REG-GEN", label: "Régulation", jobs: ["Technicien régulation"] },
  { code: "IND-SUP-GEN", label: "Supervision", jobs: ["Technicien SCADA", "Automaticien"] },
  { code: "IND-SCA-GEN", label: "SCADA", jobs: ["Technicien SCADA", "Ingénieur automaticien"] },
  { code: "IND-ROB-GEN", label: "Robotique industrielle", jobs: ["Ingénieur automaticien"] },
  { code: "IND-MNT-IND", label: "Maintenance industrielle", jobs: ["Technicien maintenance industrielle", "Responsable maintenance"] },
  { code: "IND-MNT-ELM", label: "Maintenance électromécanique", jobs: ["Technicien électromécanique", "Électromécanicien"] },
];

// ================ 4. ÉNERGIES RENOUVELABLES & SOLAIRE =======================

const ENE_SPECIALTIES: NomenSpecialty[] = [
  { code: "ENE-SOL-PV", label: "Solaire photovoltaïque", jobs: ["Installateur solaire", "Technicien photovoltaïque"] },
  { code: "ENE-SOL-TH", label: "Solaire thermique", jobs: ["Installateur solaire"] },
  { code: "ENE-SOL-AUT", label: "Systèmes solaires autonomes", jobs: ["Technicien photovoltaïque", "Concepteur photovoltaïque"] },
  { code: "ENE-SOL-HYB", label: "Systèmes solaires hybrides", jobs: ["Concepteur photovoltaïque", "Technicien onduleurs"] },
  { code: "ENE-SOL-RAC", label: "Systèmes solaires raccordés réseau", jobs: ["Concepteur photovoltaïque", "Ingénieur énergies renouvelables"] },
  { code: "ENE-BAT-SOL", label: "Batteries solaires", jobs: ["Technicien batteries"] },
  { code: "ENE-STO-ENE", label: "Stockage d'énergie", jobs: ["Technicien batteries", "Ingénieur énergie"] },
  { code: "ENE-OND-SOL", label: "Onduleurs solaires", jobs: ["Technicien onduleurs"] },
  { code: "ENE-REG-SOL", label: "Régulateurs", jobs: ["Technicien photovoltaïque"] },
  { code: "ENE-DIM-PV", label: "Dimensionnement photovoltaïque", jobs: ["Dimensionneur solaire", "Concepteur photovoltaïque"] },
  { code: "ENE-POM-SOL", label: "Pompage solaire", jobs: ["Installateur solaire", "Technicien photovoltaïque"] },
  { code: "ENE-ECL-SOL", label: "Éclairage solaire", jobs: ["Installateur solaire"] },
  { code: "ENE-MIC-RES", label: "Micro-réseaux", jobs: ["Ingénieur énergies renouvelables"] },
  { code: "ENE-EOL-GEN", label: "Énergie éolienne", jobs: ["Technicien énergie renouvelable"] },
  { code: "ENE-HYD-PET", label: "Petite hydroélectricité", jobs: ["Ingénieur énergie"] },
  { code: "ENE-BIO-MAS", label: "Biomasse", jobs: ["Technicien énergie renouvelable"] },
  { code: "ENE-EFF-ENE", label: "Efficacité énergétique", jobs: ["Technicien efficacité énergétique"] },
  { code: "ENE-AUD-ENE", label: "Audit énergétique", jobs: ["Auditeur énergétique"] },
  { code: "ENE-MAN-ENE", label: "Management de l'énergie", jobs: ["Auditeur énergétique", "Ingénieur énergie"] },
];

// ======================= 5. FROID & CLIMATISATION ===========================

const FROID_SPECIALTIES: NomenSpecialty[] = [
  { code: "FROID-DOM", label: "Froid domestique", jobs: ["Frigoriste", "Technicien frigoriste"] },
  { code: "FROID-COM", label: "Froid commercial", jobs: ["Technicien froid commercial", "Frigoriste"] },
  { code: "FROID-IND", label: "Froid industriel", jobs: ["Technicien froid industriel"] },
  { code: "FROID-CLI-RES", label: "Climatisation résidentielle", jobs: ["Technicien climatisation", "Installateur climatisation"] },
  { code: "FROID-CLI-COM", label: "Climatisation commerciale", jobs: ["Climaticien", "Installateur climatisation"] },
  { code: "FROID-CLI-IND", label: "Climatisation industrielle", jobs: ["Technicien HVAC", "Climaticien"] },
  { code: "FROID-REF-GEN", label: "Réfrigération", jobs: ["Frigoriste"] },
  { code: "FROID-CHA-FRO", label: "Chambres froides", jobs: ["Technicien chambre froide"] },
  { code: "FROID-GRP-FRI", label: "Groupes frigorifiques", jobs: ["Technicien froid industriel", "Frigoriste"] },
  { code: "FROID-PAC-GEN", label: "Pompes à chaleur", jobs: ["Technicien HVAC"] },
  { code: "FROID-VEN-GEN", label: "Ventilation", jobs: ["Technicien HVAC"] },
  { code: "FROID-TRA-AIR", label: "Traitement d'air", jobs: ["Technicien HVAC"] },
  { code: "FROID-VRV-GEN", label: "VRV/VRF", jobs: ["Climaticien", "Technicien HVAC"] },
  { code: "FROID-MNT-GEN", label: "Maintenance frigorifique", jobs: ["Technicien maintenance frigorifique"] },
  { code: "FROID-INS-GEN", label: "Installation frigorifique", jobs: ["Technicien frigoriste", "Installateur climatisation"] },
  { code: "FROID-DIA-GEN", label: "Diagnostic frigorifique", jobs: ["Technicien maintenance frigorifique"] },
];

// ====================== 6. GÉNIE INFORMATIQUE ===============================

const INFO_SPECIALTIES: NomenSpecialty[] = [
  { code: "INFO-GSL-GEN", label: "Génie logiciel", jobs: ["Ingénieur logiciel", "Développeur logiciel"] },
  { code: "INFO-DEV-WEB", label: "Développement Web", jobs: ["Développeur Web"] },
  { code: "INFO-DEV-MOB", label: "Développement mobile", jobs: ["Développeur mobile"] },
  { code: "INFO-DEV-AND", label: "Applications Android", jobs: ["Développeur mobile"] },
  { code: "INFO-DEV-IOS", label: "Applications iOS", jobs: ["Développeur mobile"] },
  { code: "INFO-DEV-MUL", label: "Applications multiplateformes", jobs: ["Développeur mobile"] },
  { code: "INFO-BDD-GEN", label: "Bases de données", jobs: ["Administrateur base de données"] },
  { code: "INFO-ADM-SYS", label: "Administration systèmes", jobs: ["Administrateur système"] },
  { code: "INFO-MNT-GEN", label: "Maintenance informatique", jobs: ["Technicien maintenance informatique"] },
  { code: "INFO-SUP-GEN", label: "Support informatique", jobs: ["Technicien informatique"] },
  { code: "INFO-IND-GEN", label: "Informatique industrielle", jobs: ["Technicien informatique", "Automaticien"] },
  { code: "INFO-IA-GEN", label: "Intelligence artificielle", jobs: ["Ingénieur IA"] },
  { code: "INFO-CYS-GEN", label: "Cybersécurité", jobs: ["Ingénieur cybersécurité", "Analyste cybersécurité"] },
  { code: "INFO-CLD-GEN", label: "Cloud", jobs: ["Ingénieur systèmes"] },
  { code: "INFO-DVO-GEN", label: "DevOps", jobs: ["DevOps"] },
  { code: "INFO-DAT-GEN", label: "Data", jobs: ["Data analyst", "Data engineer"] },
  { code: "INFO-IOT-GEN", label: "IoT", jobs: ["Technicien IoT"] },
  { code: "INFO-EMB-GEN", label: "Systèmes embarqués", jobs: ["Ingénieur systèmes embarqués"] },
];

// ============== 7. RÉSEAUX & TÉLÉCOMMUNICATIONS =============================

const RES_SPECIALTIES: NomenSpecialty[] = [
  { code: "RES-RES-IND", label: "Réseaux informatiques", jobs: ["Technicien réseau", "Administrateur réseau"] },
  { code: "RES-TEL-GEN", label: "Télécommunications", jobs: ["Technicien télécom", "Ingénieur télécom"] },
  { code: "RES-FO-GEN", label: "Fibre optique", jobs: ["Installateur fibre optique", "Technicien fibre"] },
  { code: "RES-RAD-GEN", label: "Réseaux radio", jobs: ["Technicien radio"] },
  { code: "RES-WIFI-GEN", label: "Wi-Fi", jobs: ["Technicien Wi-Fi"] },
  { code: "RES-VOIP-GEN", label: "VoIP", jobs: ["Technicien VoIP"] },
  { code: "RES-IP-GEN", label: "Réseaux IP", jobs: ["Technicien réseau"] },
  { code: "RES-ADM-RES", label: "Administration réseau", jobs: ["Administrateur réseau"] },
  { code: "RES-SEC-RES", label: "Sécurité réseau", jobs: ["Ingénieur réseau", "Analyste cybersécurité"] },
  { code: "RES-VSR-IP", label: "Vidéosurveillance IP", jobs: ["Technicien vidéosurveillance IP"] },
  { code: "RES-CA-IP", label: "Contrôle d'accès IP", jobs: ["Technicien contrôle d'accès"] },
  { code: "RES-INT-GEN", label: "Interphonie", jobs: ["Technicien contrôle d'accès"] },
  { code: "RES-TEL-FIX", label: "Téléphonie", jobs: ["Technicien télécom"] },
  { code: "RES-ANT-GEN", label: "Antennes", jobs: ["Technicien radio"] },
  { code: "RES-TRA-DON", label: "Transmission de données", jobs: ["Ingénieur télécom"] },
];

// ===================== 8. BTP / GÉNIE CIVIL =================================

const BTP_SPECIALTIES: NomenSpecialty[] = [
  { code: "BTP-BAT-GEN", label: "Bâtiment", jobs: ["Technicien bâtiment", "Conducteur de travaux"] },
  { code: "BTP-TP-GEN", label: "Travaux publics", jobs: ["Technicien travaux publics", "Chef de chantier"] },
  { code: "BTP-MAC-GEN", label: "Maçonnerie", jobs: ["Maçon", "Chef maçon"] },
  { code: "BTP-BA-GEN", label: "Béton armé", jobs: ["Coffreur", "Ferrailleur"] },
  { code: "BTP-GO-GEN", label: "Gros œuvre", jobs: ["Coffreur", "Chef maçon"] },
  { code: "BTP-SO-GEN", label: "Second œuvre", jobs: ["Carreleur", "Plâtrier"] },
  { code: "BTP-CAR-GEN", label: "Carrelage", jobs: ["Carreleur"] },
  { code: "BTP-PLA-GEN", label: "Plâtrerie", jobs: ["Plâtrier"] },
  { code: "BTP-PEI-GEN", label: "Peinture bâtiment", jobs: ["Peintre bâtiment"] },
  { code: "BTP-ETA-GEN", label: "Étanchéité", jobs: ["Étancheur"] },
  { code: "BTP-VOI-GEN", label: "Voirie", jobs: ["Technicien travaux publics"] },
  { code: "BTP-TER-GEN", label: "Terrassement", jobs: ["Conducteur de travaux"] },
  { code: "BTP-TOP-GEN", label: "Topographie", jobs: ["Géomètre-topographe"] },
  { code: "BTP-GEO-TEC", label: "Géotechnique", jobs: ["Ingénieur génie civil"] },
  { code: "BTP-DES-BAT", label: "Dessin bâtiment", jobs: ["Dessinateur bâtiment"] },
  { code: "BTP-ARC-TEC", label: "Architecture technique", jobs: ["Dessinateur bâtiment", "Conducteur de travaux"] },
  { code: "BTP-INS-SAN", label: "Installation sanitaire", jobs: ["Installateur sanitaire"] },
  { code: "BTP-MEN-GEN", label: "Menuiserie", jobs: ["Menuisier"] },
  { code: "BTP-CHA-GEN", label: "Charpente", jobs: ["Charpentier"] },
 { code: "BTP-COU-GEN", label: "Couverture", jobs: ["Couvreur"] },
];

// ========== 9. PLOMBERIE / INSTALLATIONS SANITAIRES =========================

const PLB_SPECIALTIES: NomenSpecialty[] = [
  { code: "PLB-BAT-GEN", label: "Plomberie bâtiment", jobs: ["Plombier", "Technicien plomberie"] },
  { code: "PLB-INS-SAN", label: "Installation sanitaire", jobs: ["Installateur sanitaire"] },
  { code: "PLB-AE-GEN", label: "Adduction d'eau", jobs: ["Technicien réseaux hydrauliques"] },
  { code: "PLB-RE-EAU", label: "Réseaux d'eau", jobs: ["Technicien réseaux hydrauliques"] },
  { code: "PLB-EV-EU", label: "Évacuation eaux usées", jobs: ["Plombier"] },
  { code: "PLB-POM-GEN", label: "Pompage", jobs: ["Technicien pompage"] },
  { code: "PLB-RES-GEN", label: "Réservoirs", jobs: ["Technicien plomberie"] },
  { code: "PLB-CHE-EAU", label: "Chauffe-eau", jobs: ["Installateur sanitaire"] },
  { code: "PLB-IND-GEN", label: "Plomberie industrielle", jobs: ["Technicien plomberie"] },
  { code: "PLB-DET-FUI", label: "Détection de fuite", jobs: ["Plombier", "Technicien plomberie"] },
  { code: "PLB-TRA-EAU", label: "Traitement d'eau", jobs: ["Technicien traitement d'eau"] },
];

// ==================== 10. MAINTENANCE INDUSTRIELLE ==========================

const MNT_SPECIALTIES: NomenSpecialty[] = [
  { code: "MNT-PRE-GEN", label: "Maintenance préventive", jobs: ["Technicien maintenance industrielle"] },
  { code: "MNT-COR-GEN", label: "Maintenance corrective", jobs: ["Technicien maintenance"] },
  { code: "MNT-PRE-IND", label: "Maintenance prédictive", jobs: ["Technicien maintenance industrielle", "Ingénieur maintenance"] },
  { code: "MNT-ELE-GEN", label: "Maintenance électrique", jobs: ["Technicien maintenance électrique"] },
  { code: "MNT-MEC-GEN", label: "Maintenance mécanique", jobs: ["Technicien maintenance mécanique"] },
  { code: "MNT-ELM-GEN", label: "Maintenance électromécanique", jobs: ["Électromécanicien"] },
  { code: "MNT-HYD-GEN", label: "Maintenance hydraulique", jobs: ["Technicien hydraulique"] },
  { code: "MNT-PNE-GEN", label: "Maintenance pneumatique", jobs: ["Technicien pneumatique"] },
  { code: "MNT-INS-GEN", label: "Maintenance instrumentation", jobs: ["Technicien instrumentation"] },
  { code: "MNT-EQP-IND", label: "Maintenance équipements industriels", jobs: ["Technicien maintenance industrielle", "Ingénieur maintenance"] },
  { code: "MNT-DIA-MAC", label: "Diagnostic machines", jobs: ["Technicien maintenance industrielle"] },
  { code: "MNT-GMAO-GEN", label: "GMAO", jobs: ["Responsable maintenance"] },
];

// ================ 11. MÉCANIQUE & PRODUCTIQUE ===============================

const MEC_SPECIALTIES: NomenSpecialty[] = [
  { code: "MEC-IND-GEN", label: "Mécanique industrielle", jobs: ["Mécanicien industriel"] },
  { code: "MEC-COM-IND", label: "Construction mécanique", jobs: ["Usineur", "Tourneur"] },
  { code: "MEC-FAB-GEN", label: "Fabrication mécanique", jobs: ["Fraiseur", "Usineur"] },
  { code: "MEC-USI-GEN", label: "Usinage", jobs: ["Usineur", "Tourneur", "Fraiseur"] },
  { code: "MEC-MNT-MEC", label: "Maintenance mécanique", jobs: ["Technicien maintenance mécanique"] },
  { code: "MEC-SOU-GEN", label: "Soudure", jobs: ["Soudeur"] },
  { code: "MEC-CHD-GEN", label: "Chaudronnerie", jobs: ["Chaudronnier"] },
  { code: "MEC-MET-GEN", label: "Métallerie", jobs: ["Métallier"] },
  { code: "MEC-COM-MET", label: "Construction métallique", jobs: ["Métallier", "Chaudronnier"] },
  { code: "MEC-AUT-IND", label: "Mécanique automobile", jobs: ["Mécanicien automobile", "Technicien automobile"] },
  { code: "MEC-ELE-AUT", label: "Électricité automobile", jobs: ["Électricien automobile"] },
  { code: "MEC-DIA-AUT", label: "Diagnostic automobile", jobs: ["Technicien diagnostic automobile"] },
  { code: "MEC-INJ-DIE", label: "Injection diesel", jobs: ["Technicien véhicules lourds"] },
  { code: "MEC-VHL-LOUR", label: "Maintenance véhicules lourds", jobs: ["Technicien véhicules lourds"] },
];

// ====== 12. SÉCURITÉ TECHNIQUE & SYSTÈMES DE SÛRETÉ ========================

const SEC_SPECIALTIES: NomenSpecialty[] = [
  { code: "SEC-VSR-GEN", label: "Vidéosurveillance", jobs: ["Installateur vidéosurveillance", "Technicien CCTV"] },
  { code: "SEC-CCTV-GEN", label: "CCTV", jobs: ["Technicien CCTV"] },
  { code: "SEC-ALA-GEN", label: "Alarme intrusion", jobs: ["Technicien alarme"] },
  { code: "SEC-DIA-INC", label: "Détection incendie", jobs: ["Technicien détection incendie"] },
  { code: "SEC-CA-GEN", label: "Contrôle d'accès", jobs: ["Technicien contrôle d'accès"] },
  { code: "SEC-INT-GEN", label: "Interphonie", jobs: ["Installateur interphonie"] },
  { code: "SEC-POR-AUT", label: "Portails automatiques", jobs: ["Technicien sécurité électronique"] },
  { code: "SEC-SER-ELE", label: "Serrurerie électronique", jobs: ["Technicien sécurité électronique"] },
  { code: "SEC-SYS-SEC", label: "Systèmes de sécurité", jobs: ["Technicien sécurité électronique"] },
  { code: "SEC-RES-SEC", label: "Sécurité réseau", jobs: ["Analyste cybersécurité"] },
  { code: "SEC-ELE-SEC", label: "Sécurité électrique", jobs: ["Technicien protection électrique"] },
  { code: "SEC-INC-SEC", label: "Sécurité incendie", jobs: ["Technicien sécurité incendie"] },
  { code: "SEC-MEC-CONF", label: "Mise en conformité", jobs: ["Technicien sécurité incendie", "Technicien protection électrique"] },
  { code: "SEC-AUD-SEC", label: "Audit sécurité technique", jobs: ["Auditeur sécurité technique"] },
];

// ============= 13. ENTRETIEN & SERVICES TECHNIQUES ==========================

const ENT_SPECIALTIES: NomenSpecialty[] = [
  { code: "ENT-NET-PRO", label: "Nettoyage professionnel", jobs: ["Agent de nettoyage", "Technicien nettoyage"] },
  { code: "ENT-NET-IND", label: "Nettoyage industriel", jobs: ["Nettoyeur industriel"] },
  { code: "ENT-NET-BUR", label: "Nettoyage bureaux", jobs: ["Agent de nettoyage"] },
  { code: "ENT-NET-HOT", label: "Nettoyage hôtels", jobs: ["Agent de nettoyage"] },
  { code: "ENT-DES-GEN", label: "Désinfection", jobs: ["Agent de désinfection"] },
  { code: "ENT-ENT-BAT", label: "Entretien bâtiments", jobs: ["Technicien multiservice"] },
  { code: "ENT-ENT-EQP", label: "Entretien équipements", jobs: ["Technicien multiservice"] },
  { code: "ENT-ESP-VER", label: "Espaces verts", jobs: ["Jardinier"] },
  { code: "ENT-MUL-SER", label: "Maintenance multiservice", jobs: ["Responsable entretien", "Technicien multiservice"] },
];

// ============================ DOMAINE GLOBAL ================================

export const NOMENCLATURE: NomenDomain[] = [
  { code: "ELEC", label: "Génie électrique", poles: ["cfo", "domotique", "fourniture"], specialties: ELEC_SPECIALTIES },
  { code: "HTA", label: "Haute tension / HTA", poles: ["hta"], specialties: HTA_SPECIALTIES },
  { code: "IND", label: "Industriel & automatisme", poles: ["industrie"], specialties: IND_SPECIALTIES },
  { code: "ENE", label: "Énergies renouvelables & solaire", poles: ["solaire", "inspection"], specialties: ENE_SPECIALTIES },
  { code: "FROID", label: "Froid & climatisation", poles: ["hvac"], specialties: FROID_SPECIALTIES },
  { code: "INFO", label: "Génie informatique", poles: ["cfa"], specialties: INFO_SPECIALTIES },
  { code: "RES", label: "Réseaux & télécommunications", poles: ["cfa"], specialties: RES_SPECIALTIES },
  { code: "BTP", label: "BTP / génie civil", poles: ["batiment"], specialties: BTP_SPECIALTIES },
  { code: "PLB", label: "Plomberie / installations sanitaires", poles: ["batiment"], specialties: PLB_SPECIALTIES },
  { code: "MNT", label: "Maintenance industrielle", poles: ["maintenance", "industrie"], specialties: MNT_SPECIALTIES },
  { code: "MEC", label: "Mécanique & productique", poles: ["industrie"], specialties: MEC_SPECIALTIES },
  { code: "SEC", label: "Sécurité technique & systèmes de sûreté", poles: ["incendie", "cfa"], specialties: SEC_SPECIALTIES },
  { code: "ENT", label: "Entretien & services techniques", poles: ["maintenance"], specialties: ENT_SPECIALTIES },
];

/** Recherche un domaine par son code (ELEC, HTA…). */
export function nomenDomainByCode(code: string | undefined): NomenDomain | undefined {
  return NOMENCLATURE.find((d) => d.code === code);
}

/** Recherche une spécialité par son code unique (ELEC-ELEC-BAT…). */
export function nomenSpecialtyByCode(
  code: string | undefined,
): { domain: NomenDomain; specialty: NomenSpecialty } | undefined {
  for (const domain of NOMENCLATURE) {
    const specialty = domain.specialties.find((s) => s.code === code);
    if (specialty) return { domain, specialty };
  }
  return undefined;
}

// ============================ DIPLÔMES ======================================

/** Niveaux de diplômes GTEC PRO (formation pro → ingénieur/master). */
export const DEGREE_LEVELS = [
  "Formation professionnelle",
  "BTS / HND",
  "Licence / Licence professionnelle",
  "Ingénieur / Master",
] as const;

export type DegreeLevelKey = (typeof DEGREE_LEVELS)[number];

/** Diplômes détaillés par niveau (intitulés MINESEC / MINESUP usuels). */
export const DEGREES: Record<
  DegreeLevelKey,
  { key: string; label: string; level: string }[]
> = {
  "Formation professionnelle": [
    { key: "CAP", label: "CAP", level: "BEPC + formation" },
    { key: "CQP", label: "Certificat de qualification professionnelle", level: "Formation pro" },
    { key: "CFP", label: "Certificat de formation professionnelle", level: "Formation pro" },
    { key: "BP", label: "Brevet professionnel (selon filière)", level: "Formation pro" },
    { key: "BT", label: "Brevet de technicien", level: "Bac pro" },
    { key: "BAC_TECH", label: "Baccalauréat technique / professionnel", level: "Bac" },
  ],
  "BTS / HND": [
    { key: "BTS_GE", label: "BTS Génie électrique", level: "Bac+2" },
    { key: "BTS_ELTO", label: "BTS Électrotechnique", level: "Bac+2" },
    { key: "BTS_ELEC", label: "BTS Électronique", level: "Bac+2" },
    { key: "BTS_FCL", label: "BTS Froid et Climatisation", level: "Bac+2" },
    { key: "BTS_MSE", label: "BTS Maintenance des systèmes électroniques", level: "Bac+2" },
    { key: "BTS_ER", label: "BTS Énergies renouvelables", level: "Bac+2" },
    { key: "BTS_MEI", label: "BTS Maintenance des équipements industriels", level: "Bac+2" },
    { key: "BTS_CIR", label: "BTS Contrôle, instrumentation et régulation", level: "Bac+2" },
    { key: "BTS_GTE", label: "BTS Génie thermique et énergie", level: "Bac+2" },
    { key: "BTS_MSF", label: "BTS Maintenance des systèmes fluides", level: "Bac+2" },
    { key: "BTS_GSL", label: "BTS Génie logiciel", level: "Bac+2" },
    { key: "BTS_MSI", label: "BTS Maintenance des systèmes informatiques", level: "Bac+2" },
    { key: "BTS_IIA", label: "BTS Informatique industrielle", level: "Bac+2" },
    { key: "BTS_AUT", label: "BTS Automatisme", level: "Bac+2" },
    { key: "BTS_INFOWEB", label: "BTS Infographie et Web-design", level: "Bac+2" },
    { key: "BTS_ECOM", label: "BTS E-commerce et marketing numérique", level: "Bac+2" },
    { key: "BTS_TEL", label: "BTS Télécommunications", level: "Bac+2" },
    { key: "BTS_RES", label: "BTS Réseaux", level: "Bac+2" },
    { key: "BTS_RESS", label: "BTS Réseaux et sécurité", level: "Bac+2" },
    { key: "BTS_BAT", label: "BTS Bâtiment", level: "Bac+2" },
    { key: "BTS_TP", label: "BTS Travaux publics", level: "Bac+2" },
    { key: "BTS_GEO", label: "BTS Géotechnique / Géologie appliquée", level: "Bac+2" },
    { key: "BTS_GT", label: "BTS Géomètre-topographe", level: "Bac+2" },
    { key: "BTS_ISAN", label: "BTS Installation sanitaire", level: "Bac+2" },
    { key: "BTS_MEN", label: "BTS Menuiserie / ébénisterie", level: "Bac+2" },
    { key: "BTS_CM", label: "BTS Construction mécanique", level: "Bac+2" },
    { key: "BTS_FM", label: "BTS Fabrication mécanique", level: "Bac+2" },
    { key: "BTS_CMET", label: "BTS Construction métallique", level: "Bac+2" },
    { key: "BTS_CHS", label: "BTS Chaudronnerie et soudure", level: "Bac+2" },
    { key: "BTS_MSI2", label: "BTS Maintenance des systèmes industriels", level: "Bac+2" },
    { key: "BTS_MEA", label: "BTS Mécanique et électronique automobiles", level: "Bac+2" },
  ],
  "Licence / Licence professionnelle": [
    { key: "LIC_GE", label: "Licence Génie électrique", level: "Bac+3" },
    { key: "LIC_ELTO", label: "Licence Électrotechnique", level: "Bac+3" },
    { key: "LIC_AUT", label: "Licence Automatique / Automatique et informatique industrielle", level: "Bac+3" },
    { key: "LIC_ER", label: "Licence Énergies renouvelables", level: "Bac+3" },
    { key: "LIC_MINT", label: "Licence Maintenance industrielle", level: "Bac+3" },
    { key: "LIC_IR", label: "Licence Instrumentation et régulation", level: "Bac+3" },
    { key: "LIC_GENEG", label: "Licence Génie énergétique / Énergétique", level: "Bac+3" },
    { key: "LIC_GTH", label: "Licence Génie thermique", level: "Bac+3" },
    { key: "LIC_GSL", label: "Licence Génie logiciel", level: "Bac+3" },
    { key: "LIC_INFO", label: "Licence Informatique", level: "Bac+3" },
    { key: "LIC_SR", label: "Licence Systèmes et réseaux", level: "Bac+3" },
    { key: "LIC_CYB", label: "Licence Cybersécurité", level: "Bac+3" },
    { key: "LIC_IA", label: "Licence Intelligence artificielle", level: "Bac+3" },
    { key: "LIC_DATA", label: "Licence Data", level: "Bac+3" },
    { key: "LIC_II", label: "Licence Informatique industrielle", level: "Bac+3" },
    { key: "LIC_GC", label: "Licence Génie civil / Bâtiment / Travaux publics", level: "Bac+3" },
    { key: "LIC_GEO", label: "Licence Géotechnique / Topographie", level: "Bac+3" },
    { key: "LIC_GM", label: "Licence Génie mécanique / Productique", level: "Bac+3" },
    { key: "LIC_MECAT", label: "Licence Mécatronique", level: "Bac+3" },
  ],
  "Ingénieur / Master": [
    { key: "ING_GE", label: "Ingénieur Génie électrique / Électrotechnique", level: "Bac+5" },
    { key: "ING_ELEC", label: "Ingénieur Électronique", level: "Bac+5" },
    { key: "ING_AUT", label: "Ingénieur Automatique", level: "Bac+5" },
    { key: "ING_ELM", label: "Ingénieur Électromécanique", level: "Bac+5" },
    { key: "ING_MINT", label: "Ingénieur Maintenance industrielle", level: "Bac+5" },
    { key: "ING_ER", label: "Ingénieur Énergétique / Énergies renouvelables", level: "Bac+5" },
    { key: "ING_GTH", label: "Ingénieur Génie thermique", level: "Bac+5" },
    { key: "ING_GC", label: "Ingénieur Génie civil / BTP", level: "Bac+5" },
    { key: "ING_MEC", label: "Ingénieur Mécanique / Mécatronique", level: "Bac+5" },
    { key: "ING_INFO", label: "Ingénieur Informatique / Logiciel", level: "Bac+5" },
    { key: "ING_RES", label: "Ingénieur Réseaux / Télécommunications", level: "Bac+5" },
    { key: "ING_CYB", label: "Ingénieur Cybersécurité / Systèmes", level: "Bac+5" },
  ],
};

/** Recherche un diplôme par sa clé (retourne aussi son niveau). */
export function degreeByKey(key: string): { label: string; level: string; group: DegreeLevelKey } | undefined {
  for (const [group, list] of Object.entries(DEGREES)) {
    const found = (list as { key: string; label: string; level: string }[]).find((d) => d.key === key);
    if (found) return { ...found, group: group as DegreeLevelKey };
  }
  return undefined;
}

/** Classement des diplômes : plus le rang est haut, plus le diplôme est élevé. */
export const DEGREE_RANK: Record<DegreeLevelKey, number> = {
  "Formation professionnelle": 1,
  "BTS / HND": 2,
  "Licence / Licence professionnelle": 3,
  "Ingénieur / Master": 4,
};

// ======================= EXPÉRIENCE (paliers §I) ============================

export const EXPERIENCE_BANDS = [
  { key: "0-1", label: "0–1 an", min: 0, max: 1 },
  { key: "2-3", label: "2–3 ans", min: 2, max: 3 },
  { key: "4-5", label: "4–5 ans", min: 4, max: 5 },
  { key: "6-10", label: "6–10 ans", min: 6, max: 10 },
  { key: "10+", label: "+10 ans", min: 11, max: 99 },
] as const;

export function experienceBandLabel(years: number): string {
  return EXPERIENCE_BANDS.find((b) => years >= b.min && years <= b.max)?.label ?? `${years} an(s)`;
}

// ======================= CERTIFICATIONS COURANTES ===========================

export const CERTIFICATION_SUGGESTIONS = [
  "Formation HTA",
  "Formation photovoltaïque",
  "Formation sécurité électrique",
  "Habilitation électrique (B1V, BR, BC)",
  "Certification constructeur (Siemens / Schneider)",
  "Formation froid & fluides frigorigènes",
  "Formation CCTV / vidéosurveillance",
  "Formation fibre optique",
  "Premiers secours (SST)",
  "Autre (préciser)",
] as const;

// ===================== COMPÉTENCES PAR DOMAINE ==============================

/** Compétences proposées à la sélection (§D) — éditable librement ensuite. */
export const SKILLS_BY_DOMAIN: Record<string, string[]> = {
  ELEC: ["Tableau électrique", "Armoire industrielle", "Moteur", "Contacteur", "Variateur", "Diagnostic", "Maintenance", "Câblage", "Disjoncteur", "Éclairage"],
  HTA: ["Poste de transformation", "Cellule HTA", "Transformateur", "Consignation", "Essais", "Comptage"],
  IND: ["Automate (API/PLC)", "SCADA", "Variateur", "Capteurs", "Instrumentation", "Régulation", "Moteur", "Maintenance industrielle"],
  ENE: ["Kit solaire", "Onduleur", "Batterie", "Régulateur", "Dimensionnement PV", "Pompage solaire", "Audit énergétique"],
  FROID: ["Split", "Centrale de traitement d'air", "Chambre froide", "Groupe frigorifique", "Charge de fluide", "VRV/VRF"],
  INFO: ["Développement Web", "Développement mobile", "Base de données", "Réseaux", "Cybersécurité", "Dépannage PC"],
  RES: ["Fibre optique", "Baie de brassage", "Wi-Fi", "VoIP", "Vidéosurveillance IP", "Contrôle d'accès"],
  BTP: ["Maçonnerie", "Coffrage", "Ferraillage", "Carrelage", "Plâtrerie", "Peinture", "Étanchéité", "Terrassement"],
  PLB: ["Tuyauterie", "Chauffe-eau", "Pompe", "Réservoir", "Détection de fuite", "Traitement d'eau"],
  MNT: ["Maintenance préventive", "Maintenance prédictive", "GMAO", "Lubrification", "Diagnostic machines"],
  MEC: ["Soudure", "Chaudronnerie", "Usinage", "Mécanique moteur", "Diagnostic automobile"],
  SEC: ["CCTV", "Alarme intrusion", "Détection incendie", "Contrôle d'accès", "Interphonie", "Portail automatique"],
  ENT: ["Nettoyage industriel", "Désinfection", "Entretien bâtiment", "Espaces verts", "Multiservice"],
};

// ========================= MOTEUR DE MATCHING ===============================

export type MatchProfile = {
  /** Code spécialité nomenclature (ELEC-ELEC-IND…), undefined si profil legacy. */
  specialtyCode?: string;
  /** Métier déclaré (ex. "Électricien industriel"). */
  job?: string;
  /** Clé diplôme (BTS_ELTO…), undefined si profil legacy. */
  degreeKey?: string;
  /** Compétences déclarées. */
  skills?: string[];
  /** Niveau d'études libellé (ex. "Bac+2"). */
  degreeLevel?: string;
};

export type MatchNeed = {
  /** Spécialité attendue (code nomenclature OU libellé). */
  specialtyCode?: string;
  /** Pôle GTEC de la demande (cfo, hta, solaire…). */
  serviceKey: string;
  /** Compétences requises (issues de la demande client). */
  skills?: string[];
};

/**
 * Score de correspondance nomenclature (0-40) — vient s'ajouter au score géo
 * du moteur existant. Spécialité (20) + métier (8) + diplôme (7) + compétences (5).
 */
export function nomenMatchScore(profile: MatchProfile, need: MatchNeed): number {
  let score = 0;

  // 1. Spécialité (dominant) : correspondance exacte par code ou par libellé.
  const needLabel = need.specialtyCode
    ? (nomenSpecialtyByCode(need.specialtyCode)?.specialty.label ?? "")
    : "";
  const specExact =
    (need.specialtyCode && profile.specialtyCode === need.specialtyCode) ||
    (!!needLabel && profile.specialtyCode !== undefined &&
      nomenSpecialtyByCode(profile.specialtyCode)?.specialty.label.toLowerCase() === needLabel.toLowerCase());
  if (specExact) {
    score += 20;
  } else if (profile.specialtyCode && need.specialtyCode) {
    // Même domaine : pertinence partielle.
    const a = profile.specialtyCode.split("-")[0];
    const b = need.specialtyCode.split("-")[0];
    if (a && a === b) score += 8;
  } else {
    // Repli legacy : mots-clés du pôle dans la spécialité libellée.
    const legacyHints: Record<string, string[]> = {
      cfo: ["électric", "courant", "cfo", "bâtiment"],
      hta: ["hta", "haute tension", "réseaux"],
      industrie: ["automat", "industri", "électromécan"],
      solaire: ["solaire", "photovolta", "énergie"],
      cfa: ["courant faible", "réseau", "cctv", "fibre"],
      domotique: ["domotique", "éclairage"],
      incendie: ["incendie", "sécurité", "alarme"],
      inspection: ["diagnostic", "audit", "thermograph"],
      hvac: ["froid", "climat", "hvac"],
      batiment: ["bâtiment", "génie civil", "maçon"],
      maintenance: ["maintenance"],
      fourniture: [],
    };
    const hints = legacyHints[need.serviceKey] ?? [];
    const hay = `${profile.job ?? ""} ${profile.specialtyCode ? nomenSpecialtyByCode(profile.specialtyCode)?.specialty.label ?? "" : ""}`.toLowerCase();
    if (hints.some((h) => hay.includes(h))) score += 6;
  }

  // 2. Métier officiel de la nomenclature de la spécialité demandée.
  if (need.specialtyCode && profile.job) {
    const spec = nomenSpecialtyByCode(need.specialtyCode)?.specialty;
    if (spec?.jobs.some((j) => j.toLowerCase() === profile.job?.toLowerCase())) score += 8;
  }

  // 3. Diplôme : rang >= BTS valorisé, ingénieur/Licence encore plus.
  if (profile.degreeKey) {
    const rank = DEGREE_RANK[degreeByKey(profile.degreeKey)?.group ?? "Formation professionnelle"];
    if (rank >= 4) score += 7;
    else if (rank >= 2) score += 5;
  } else if (profile.degreeLevel && /bac\s*\+\s*[345]/i.test(profile.degreeLevel)) {
    score += 5;
  }

  // 4. Compétences : chaque compétence requise couverte vaut un bonus (cap 5).
  if (need.skills?.length) {
    const hay = (profile.skills ?? []).map((s) => s.toLowerCase());
    const covered = need.skills.filter((s) => hay.some((h) => h.includes(s.toLowerCase()) || s.toLowerCase().includes(h)));
    score += Math.min(5, covered.length * 2);
  }

  return Math.min(40, score);
}

/** Compétences suggérées pour un domaine (repli : liste générique). */
export function suggestedSkillsFor(domainCode: string | undefined): string[] {
  return (domainCode && SKILLS_BY_DOMAIN[domainCode]) || SKILLS_BY_DOMAIN.ELEC;
}

/** Libellés d'affichage d'un profil nomenclature (badge, dossier admin…). */
export function nomenProfileSummary(profile: {
  domainCode?: string;
  specialtyCode?: string;
  job?: string;
  degreeKey?: string;
}): string {
  const spec = nomenSpecialtyByCode(profile.specialtyCode);
  const deg = profile.degreeKey ? degreeByKey(profile.degreeKey) : undefined;
  const domain = spec?.domain.label ?? profile.domainCode ?? "";
  return [domain, spec?.specialty.label, profile.job, deg?.label]
    .filter(Boolean)
    .join(" · ");
}
