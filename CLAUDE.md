# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Alloflow — Logiciel de Caisse SaaS pour la Restauration

## Vision

Alloflow est un POS (Point of Sale) en mode SaaS conçu pour la restauration. Il remplace SumUp par un système maîtrisé, connecté aux terminaux de paiement CIC (Ingenico), et scalable pour un réseau de franchisés. L'application sert à la fois nos propres restaurants et nos futurs franchisés.

## Stack Technique

- **Frontend** : Next.js 14 + React + TypeScript + Tailwind CSS
- **Frontend Caisse** : React PWA (hors-ligne, installable sur tablette)
- **Backend** : Next.js API Routes (TypeScript)
- **Base de données** : PostgreSQL via Supabase
- **Authentification** : Supabase Auth (rôles : super_admin, admin, caissier)
- **Paiement TPE** : Protocole Caisse Concert V3 (terminaux Ingenico CIC)
- **Impression tickets** : ESC/POS via WebUSB/BLE
- **Hébergement** : Vercel + Supabase Cloud (région EU)
- **Stockage fichiers** : Supabase Storage (photos recettes, PDF SOP)

## Architecture

Multi-tenant : une seule instance sert tous les établissements, isolation des données par organisation.

```
[Tablette Caisse (PWA)] → [API Next.js] → [PostgreSQL / Supabase]
[Dashboard Web]         → [API Next.js] → [PostgreSQL / Supabase]
[API Next.js]           → [TPE CIC via Concert V3] → [Réseau bancaire]
```

## Modèle de Données

### Entités principales
- **Organization** : id, name, type (siege/franchise) — parent multi-tenant
- **Establishment** : id, name, address, org_id — appartient à une Organization
- **User** : id, email, role, establishment_id — rôles : super_admin, admin, caissier
- **Product** : id, name, price, category, tva_rate — catalogue par Establishment
- **Order** : id, total, payment_method, status, customer_id — contient des OrderItems
- **OrderItem** : id, product_id, quantity, unit_price
- **StockItem** : id, ingredient, quantity, unit, alert_threshold — stock par Establishment
- **Recipe / SOP** : id, title, content, media_urls, version — créé par le siège, diffusé aux franchises
- **Transaction** : id, amount, type, tpe_ref, timestamp — traçabilité bancaire

### Entités CRM Fidélité (tables créées dès Phase 1, interface Phase 4)
- **Customer** : id, name, phone, email, points, tier (bronze/argent/or)
- **LoyaltyReward** : id, name, points_required, discount_type, discount_value
- **LoyaltyTransaction** : id, customer_id, order_id, points, type (earn/redeem)

## Modules Fonctionnels

### 1. Caisse (POS) — Phase 2
- Grille produits tactile par catégorie, recherche rapide
- Panier avec quantités, remises (%, fixe, offre spéciale)
- Paiement : CB (TPE CIC Concert), espèces, titre-restaurant, mixte
- Calcul rendu monnaie, identification client fidélité (QR/téléphone)
- Ticket de caisse conforme NF525
- Mode hors-ligne avec sync auto, historique + annulation/remboursement

### 2. Gestion des Stocks — Phase 3
- Inventaire ingrédients (kg, L, pièces), alertes stock bas
- Décrémentation auto à chaque vente (lié aux fiches recettes)
- Historique mouvements, suggestions commande fournisseur
- Rapport food cost % par plat

### 3. Multi-Établissements & Franchise — Phase 4
- Création d'établissement par le siège en quelques clics
- Catalogue : base commune (siège) + personnalisation locale
- Dashboard siège : CA temps réel par point de vente
- Rôles : Super Admin (siège) > Admin (établissement) > Caissier
- Consolidation comptable, comparaison de performances

### 4. Tableau de Bord & Analytics — Phase 4
- CA jour/semaine/mois, top produits, panier moyen, heures de pointe
- Rapports TVA (5.5%, 10%, 20%), export FEC
- Alertes anomalies (écart de caisse, baisse CA)

### 5. SOP & Recettes — Phase 3
- Fiches recettes avec photos, étapes, ingrédients, coûts
- Upload SOP (HACCP, standards service), versioning
- Diffusion ciblée aux établissements, accusé de lecture
- Catégories : nouvelles recettes, collections, méthodes de vente
- Lien direct produit → recette : food cost auto

### 6. CRM & Fidélité Client — Phase 4
- Identification : QR code ou numéro de téléphone
- Cumul points auto (1€ = X points configurable), paliers (Bronze/Argent/Or)
- Récompenses configurables : remise %, produit offert, montant fixe
- Segments auto (VIP, réguliers, occasionnels, inactifs)
- Conformité RGPD : consentement explicite, droit effacement, hébergement EU

## Connexion TPE CIC

### Terminaux
Le CIC fournit des Ingenico sous la marque Monetico Proximity :
- **TETRA (Telium)** : Move 5000 (portable), Desk 5000 (fixe)
- **AXIUM (Android)** : DX6000 (portable), DX4000 + Desk 1700 (fixe + pinpad), DX8000

### Protocole Caisse (Concert V3)
- Connexion USB/Série (RS232), TCP/IP (port 8888), ou Bluetooth
- Flux : ENQ → ACK → trame paiement → réponse TPE (accepté/refusé + référence)
- Trame : numéro caisse (2 car.) + montant x100 (8 car.) + devise 978 (EUR) + type (0=débit, 1=crédit)
- Activation sur TPE : F > 0-TELIUM MANAGER > 5-Initialisation > 1-Paramètres > Connexion caisse > On

### Ressources
- **pypostelium** : bibliothèque Python open-source (GitHub: akretion/pypostelium)
- **Association du Paiement** : documentation officielle Concert V3, exemples C#/C++/Java
- **C3Driver** : SDK Ingenico (à demander au CIC)
- Socket TCP depuis JS confirmé possible pour Concert V3.20

## Conformité Légale France

### NF525
- Inaltérabilité : données de vente non modifiables/supprimables
- Sécurisation : chaînage cryptographique SHA-256
- Conservation : archivage 6 ans minimum
- Clôtures périodiques (journalières, mensuelles, annuelles)
- Traçabilité : journal des événements

### RGPD
- Consentement explicite pour le CRM fidélité
- Hébergement UE (Supabase région EU)
- Droit à l'effacement et portabilité

## Roadmap

- **Phase 1 (Sem. 1-4)** : Fondations — setup projet, BDD complète (dont tables CRM vides), auth, CRUD produits, déploiement Vercel
- **Phase 2 (Sem. 5-8)** : Caisse & Encaissement — interface tactile, paiement CB+espèces, tickets NF525, connexion TPE Concert, PWA offline
- **Phase 3 (Sem. 9-12)** : Stocks & SOP — inventaire, décrémentation auto, fiches recettes, module SOP, food cost
- **Phase 4 (Sem. 13-18)** : Multi-sites, Analytics & CRM — multi-tenant, dashboard siège, graphiques, TVA/FEC, CRM fidélité
- **Phase 5 (Sem. 19-22)** : Certification & Lancement — NF525, audit sécurité, tests de charge, documentation, pilote

## Structure de Fichiers

```
alloflow/
  ├─ app/                    → Pages et routes (Next.js App Router)
  │   ├─ (auth)/             → Login, Register
  │   ├─ (dashboard)/        → Tableau de bord + Analytics
  │   ├─ (pos)/              → Interface caisse
  │   ├─ (stocks)/           → Gestion stocks
  │   ├─ (sop)/              → SOP & Recettes
  │   ├─ (crm)/              → CRM Fidélité (Phase 4)
  │   └─ api/                → Routes API backend
  ├─ components/              → Composants réutilisables
  ├─ lib/                     → Utilitaires, Supabase client, types
  │   └─ concert/            → Driver protocole Concert V3
  ├─ supabase/                → Migrations SQL, seed data
  └─ public/                  → Assets statiques (logo Alloflow...)
```

## Conventions de Code

- TypeScript strict partout, pas de `any`
- Composants React en functional components avec hooks
- Nommage fichiers : kebab-case pour les fichiers, PascalCase pour les composants
- Chaque composant dans son propre fichier
- API Routes : validation des entrées avec Zod
- Tests avec Vitest, écrits AVANT le code (TDD via Superpowers)
- Commits en français, format : `type(scope): description` (ex: `feat(caisse): ajout panier`)
- Commentaires en français dans le code

## Environnement de Développement

- IDE : AntiGravity
- IA : Claude Code avec plugin Obra Superpowers
- Agent Teams activé (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1)
- Workflow : /superpowers:brainstorm → /superpowers:write-plan → /superpowers:execute-plan
- Versioning : Git + GitHub

## Tarification SaaS (cible)

- **Starter** (1 établissement) : 49€/mois — Caisse + stocks + 2 users
- **Pro** (1-3 établissements) : 99€/mois — Multi-sites + analytics + SOP + CRM + 10 users
- **Franchise** (illimité) : Sur devis — Tout inclus + support dédié + personnalisation
