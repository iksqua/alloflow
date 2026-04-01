# Dashboard Home Page — Spec Design

**Date :** 2026-03-29
**Statut :** Validé
**Sprint :** 12

---

## Contexte

`/dashboard/` n'a pas de `page.tsx`. Les utilisateurs (rôle `admin`) arrivent sur un écran vide après connexion. Cette page comble ce manque en offrant une vue d'ensemble opérationnelle et analytique du business au quotidien.

Toute la data nécessaire existe déjà en base (vues SQL analytics, tables orders, stock_items, customers, loyalty_transactions). Aucune migration requise.

---

## Objectif

Afficher dès la connexion les indicateurs clés du jour, les alertes actionnables et l'activité récente — permettant au gérant de prendre le pouls de son établissement en un coup d'œil.

---

## Layout

Structure en 3 rangées :

1. **KPI row** — 4 stat cards en grille 4 colonnes
2. **Middle row** — graphique activité horaire (2/3) + panneau alertes (1/3)
3. **Bottom row** — top produits du jour (1/2) + activité récente (1/2)

Design system : dark theme Alloflow (`--bg: #0f172a`, `--surface: #1e293b`, `--blue: #1d4ed8`). Pattern pages existant : `page.tsx` (SSR) → `dashboard-page-client.tsx` (client shell) → `_components/`.

---

## Composants

### 1. KPI Cards (×4)

| Carte | Source | Delta |
|-------|--------|-------|
| CA du jour | `v_daily_ca` | vs hier (même vue, date J-1) |
| Nb commandes | `orders` COUNT | vs hier |
| Ticket moyen | CA / nb commandes | vs hier |
| Clients fidèles | `loyalty_transactions` COUNT DISTINCT | aujourd'hui |

Chaque carte affiche : label, valeur principale, delta coloré (vert ↑ / rouge ↓).
Barre colorée de 2px en haut : bleu / vert / amber / purple.

### 2. Graphique activité horaire

Source : `v_hourly_tx` — nombre de transactions par heure pour aujourd'hui.
Barres verticales, heures 8h–20h. Barre courante mise en évidence (bleu plein), heures passées en bleu atténué, heures futures en gris très léger. Badge "● En direct" en haut à droite.

### 3. Panneau alertes (`alerts-panel.tsx`)

Source : `stock_items` WHERE `quantity <= alert_threshold`.
- Dot rouge : `quantity <= alert_threshold * 0.4` (critique)
- Dot amber : `quantity <= alert_threshold` (bas)
- Dot bleu : `purchase_orders` WHERE `status = 'received'` non validées

Bouton d'action rapide : "Commander" → `/dashboard/stocks` | "Valider" → `/dashboard/stocks`.
Si 0 alerte : état vide "Tout est en ordre ✓".

### 4. Top produits du jour

Source : `v_top_products` (limitée à aujourd'hui, TOP 5).
Colonnes : rang, nom + catégorie, CA, quantité vendue, mini barre de progression relative au #1.

### 5. Activité récente

Source : `orders` JOIN `customers` (LEFT), ORDER BY `created_at DESC`, LIMIT 8.
Par ligne : avatar initiale du client (ou "—" si anonyme), numéro commande, détail produits tronqué, montant, tier fidélité si applicable, temps relatif ("3 min", "1h").

---

## API

### `GET /api/dashboard/summary`

Route SSR — appelée côté serveur dans `page.tsx`. Authentification requise (cookie session Supabase). Renvoie toutes les données en une seule requête parallélisée.

**Response :**
```ts
{
  kpis: {
    caToday: number
    caYesterday: number
    ordersToday: number
    ordersYesterday: number
    avgTicketToday: number
    avgTicketYesterday: number
    loyalCustomersToday: number
  }
  hourlyActivity: { hour: number; count: number }[]   // 8–20
  stockAlerts: {
    id: string
    name: string
    quantity: number
    alertThreshold: number
    level: 'critical' | 'low'
  }[]
  pendingDeliveries: { id: string; supplierName: string; receivedAt: string }[]
  topProducts: {
    rank: number
    name: string
    category: string
    revenue: number
    quantity: number
  }[]
  recentOrders: {
    id: string
    orderNumber: number
    customerName: string | null
    customerTier: 'standard' | 'silver' | 'gold' | null
    totalAmount: number
    itemsSummary: string   // formaté côté API (ex: "Flat White × 2, Cookie") — pas de traitement côté composant
    createdAt: string
  }[]
}
```

Codes HTTP : 200 succès, 401 non authentifié (redirect login), 500 erreur serveur.

---

## Fichiers à créer

| Fichier | Description |
|---------|-------------|
| `src/app/dashboard/page.tsx` | Page SSR, fetch `/api/dashboard/summary`, passe data au client |
| `src/app/dashboard/dashboard-page-client.tsx` | Client shell, reçoit les props, compose les sections |
| `src/app/dashboard/_components/kpi-cards.tsx` | 4 stat cards |
| `src/app/dashboard/_components/hourly-chart.tsx` | Barres activité horaire |
| `src/app/dashboard/_components/alerts-panel.tsx` | Liste alertes stock + livraisons en attente |
| `src/app/dashboard/_components/top-products.tsx` | Tableau top produits |
| `src/app/dashboard/_components/recent-orders.tsx` | Feed activité récente |
| `src/app/api/dashboard/summary/route.ts` | API route, requêtes parallèles Supabase |

---

## États de chargement & erreurs

- Le fetch est **SSR** : `page.tsx` appelle `/api/dashboard/summary` côté serveur et passe les données en props. Pas de skeleton sur le chargement initial.
- `dashboard-page-client.tsx` est un client shell pour l'interactivité (ex: lien "Commander" → navigation), pas pour re-fetcher les données.
- Si la route API renvoie une erreur, afficher un état dégradé par section (état vide discret, pas de crash global).
- Si 0 vente aujourd'hui : KPIs à zéro, graphique vide avec message "Aucune vente pour le moment".

---

## Hors scope

- Comparaison semaine/mois (couvert par Analytics sprint 7)
- Filtres de période
- Export PDF
- Notifications push
- Vue franchise multi-sites (couvert par Franchise Command Center sprint 10)
