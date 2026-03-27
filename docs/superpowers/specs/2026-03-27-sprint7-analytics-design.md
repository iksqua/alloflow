# Sprint 7 — Analytics & Reporting — Design Spec

**Date:** 2026-03-27

---

## Objectif

Donner aux gérants une vision claire de leur performance commerciale : CA, tendances, top produits, et détail comptable des ventes. Le module Analytics couvre deux écrans distincts — un tableau de bord synthétique déjà maquetté en Sprint 6, et un rapport de ventes détaillé avec sortie comptable TVA.

---

## Écrans

### 1. Dashboard Analytics (`/dashboard/analytics`)

Basé sur le mockup existant `s6-analytics-dashboard.html`. Vue synthétique de la performance du point de vente sur la période sélectionnée.

**Composants :**
- **Topbar** : sélecteur de période (Aujourd'hui / 7 jours / 30 jours / Mois) en pills, sélecteur de site (dropdown).
- **4 KPI cards** : CA du jour (couleur bleue, tendance vs période précédente), Nombre de transactions (avec delta), Ticket moyen (avec delta), Taux espèces (avec pourcentage carte).
- **Graphique CA 30 jours** : bar chart pur CSS — barres journalières, barre du jour mise en évidence en bleu plein, étiquettes de dates en dessous.
- **Heures de pointe** : horizontal bar chart avec couleur matin (bleu) vs midi (violet), valeur en transactions.
- **Top produits** : liste de 5 produits avec rang, nom, quantité vendue, CA, barre de progression relative, pourcentage du CA.
- **Réseau multi-sites** : snapshot CA du jour par site avec badge de croissance.

**Comportements :**
- Changement de période via pills → rechargement des données (URL param `?period=today|7d|30d|month`).
- Changement de site → filtre les données sur `establishment_id`.
- Pas de temps réel — refresh manuel.

---

### 2. Rapport ventes détaillé (`/dashboard/analytics/report`)

Basé sur le mockup `s7-rapport-ventes.html`. Page de comptabilité commerciale destinée au gérant ou au comptable.

**Composants :**
- **Topbar** : titre "Rapport des ventes", sélecteur de période en pills, sélecteur de dates custom (date début / date fin), bouton "Export CSV".
- **Breadcrumb** : Analytics › Rapport des ventes + indicateur site actif.
- **4 KPI cards** : CA TTC (bleu, tendance), Nb transactions (tendance), Ticket moyen (tendance), Répartition espèces/carte (valeurs % + split bar bicolore amber/bleu).
- **Table des transactions** : colonnes Date/Heure, Ticket#, Produits, Paiement (badge coloré Carte / Espèces), Montant HT, TVA, Montant TTC. En-têtes cliquables (tri). Lignes en zébra (nth-child). Pagination.
- **Footer totaux** : ligne fixe dans le `<tfoot>` — somme HT, détail TVA 3 taux (5,5% / 10% / 20%), somme TTC.
- **Sidebar droite — Récapitulatif TVA** : card verticale avec 3 lignes (5,5% / 10% / 20%) montrant base imposable + TVA collectée par taux + total TVA.
- **Sidebar droite — Répartition paiements** : barres de progression horizontales carte vs espèces avec montants et nb transactions.
- **Sidebar droite — Export** : boutons CSV complet, journal TVA, imprimer.
- **Empty state** : message centré si aucune transaction sur la période.

**Comportements :**
- Filtres période → URL params `?from=YYYY-MM-DD&to=YYYY-MM-DD`.
- Tri des colonnes → local (données déjà chargées côté client).
- Export CSV → génération client-side à partir des données chargées (pas d'appel serveur supplémentaire).

---

### 3. Analytics Multi-sites (`/dashboard/analytics` avec site = "Tous")

Basé sur le mockup `s7-analytics-multisite.html`. Variante de la vue d'ensemble quand le sélecteur de site est positionné sur "Tous les sites".

**Composants supplémentaires :**
- **Filter chips** : pills colorées par site (bleu/vert/amber/violet) pour masquer/afficher des sites individuellement.
- **KPI cards étendues** : valeur agrégée réseau + mini-tableau de breakdown par site avec delta (+x%).
- **Grouped bar chart** : barres groupées par semaine, 4 couleurs = 4 sites.
- **Ticket moyen par site** : barres horizontales comparatives avec delta badge.
- **Tableau de classement** : rang médaille, nom site, CA, transactions, ticket moyen, delta, part réseau avec barre de progression.

---

## Architecture technique

- **Server Components** pour les requêtes Supabase (lecture orders, order_items, products) — pas de useEffect pour les données initiales.
- **Filtres de période** gérés via `searchParams` (URL params), transmis en props aux Server Components → rechargement complet de la page.
- **Tri des colonnes** dans le rapport → `useState` côté client dans un Client Component wrapper.
- **Export CSV** → généré côté client depuis les données déjà présentes dans le DOM (fonction utilitaire `arrayToCsv`).
- **Pas de graphiques en temps réel** — refresh manuel suffisant pour v1. Pas de WebSocket, pas de polling.
- **Composants graphiques** : CSS pur (bar charts en flexbox + height %) — pas de librairie externe (Recharts, Chart.js) pour garder le bundle léger en v1.

---

## Données nécessaires

| Table | Colonnes utilisées | Usage |
|---|---|---|
| `orders` | `id`, `total_ttc`, `total_ht`, `tva_amount`, `payment_method`, `created_at`, `establishment_id` | KPIs CA, transactions, paiements |
| `order_items` | `order_id`, `product_id`, `quantity`, `unit_price_ttc` | Top produits |
| `products` | `id`, `name`, `category` | Nom dans top produits |
| `establishments` | `id`, `name` | Multi-sites |

**Agrégations nécessaires :**
- CA + count transactions par jour (30 jours) → bar chart.
- Count transactions par tranche horaire → heures de pointe.
- Sum quantity + CA par product_id → top produits.
- CA + count transactions par establishment_id → multi-sites.
- Sum TVA par taux (5,5 / 10 / 20) → récapitulatif comptable.

---

## Périmètre Sprint 7 (YAGNI)

**In scope :**
- Dashboard analytics (`/dashboard/analytics`) avec KPIs, bar chart CA, heures de pointe, top produits, snapshot multi-sites.
- Rapport ventes (`/dashboard/analytics/report`) avec table de transactions, totaux TVA, export CSV.
- Filtres période : Aujourd'hui, 7j, 30j, Mois + date range custom.
- Sélecteur de site (par établissement ou "Tous").
- Mise à jour sidebar avec lien Analytics + sous-navigation.

**Out of scope :**
- Graphiques interactifs (zoom, tooltip avancé) — v2.
- Export PDF — v2.
- Dashboard en temps réel (WebSocket) — v3.
- Comparaison de périodes côte à côte — v2.
- Alertes automatiques sur seuils (CA en baisse) — v3.
- Rapport par catégorie de produit — v2.
- Dashboard dédié par rôle (caissier vs gérant) — v2.

---

## Tokens design (rappel)

Tous les composants utilisent les variables établies dans les mockups précédents :
- Fond : `#0a1628` / Sidebar & cards : `#0f2744`
- Bordures : `rgba(255,255,255,0.06)` / Border-radius cartes : `14px`
- Texte principal : `#f1f5f9` / Secondaire : `#94a3b8` / Désactivé : `#64748b`
- Bleu accent : `#3b82f6` / Vert : `#10b981` / Rouge : `#ef4444` / Amber : `#f59e0b`
- Font : `-apple-system, sans-serif`
