# Alloflow — Phase 1 : Fondations

**Date :** 2026-03-25
**Scope :** Scaffold Next.js, BDD complète, Auth Supabase, CRUD Produits, déploiement Vercel

---

## Objectif

Poser les fondations techniques d'Alloflow : une application Next.js deployée sur Vercel, connectée à Supabase, avec authentification par rôles, et un CRUD produits fonctionnel. Toutes les tables BDD sont créées dès Phase 1 (y compris celles des phases suivantes) pour éviter des migrations destructives en production.

---

## Stack

- **Framework :** Next.js 14 (App Router, TypeScript, Tailwind CSS)
- **UI :** shadcn/ui
- **BDD :** PostgreSQL via Supabase CLI (migrations versionnées)
- **Auth :** Supabase Auth + `@supabase/ssr` (SSR-compatible)
- **Validation :** Zod
- **Hébergement :** Vercel + Supabase Cloud (région EU)

---

## Architecture

```
alloflow/
  src/
    app/
      (auth)/login/         → Page login
      (dashboard)/          → Layout protégé par middleware
        products/           → CRUD produits
    components/             → Composants réutilisables
    lib/
      supabase/             → Client browser + server
      types/                → Types générés Supabase
  supabase/
    migrations/             → Fichiers SQL versionnés
```

**Middleware Next.js** protège toutes les routes `(dashboard)/` — redirige vers `/login` si non authentifié.

---

## Base de Données

### Migration 001 — Core multi-tenant
```sql
organizations (id, name, type: 'siege'|'franchise', created_at)
establishments (id, name, address, org_id → organizations, created_at)
```

### Migration 002 — Auth & utilisateurs
```sql
profiles (id → auth.users, role: 'super_admin'|'admin'|'caissier',
          establishment_id → establishments, org_id → organizations)
```
Row Level Security activé : chaque utilisateur ne voit que les données de son établissement.

### Migration 003 — Catalogue
```sql
products (id, name, price, category: 'entree'|'plat'|'dessert'|'boisson'|'autre',
          tva_rate: 5.5|10|20, establishment_id, active, created_at)
```

### Migration 004 — Commandes & transactions *(Phase 2)*
```sql
orders (id uuid PK, establishment_id → establishments, total numeric,
        payment_method text, status text, customer_id → customers nullable, created_at)
order_items (id uuid PK, order_id → orders, product_id → products,
             quantity int, unit_price numeric)
transactions (id uuid PK, order_id → orders, amount numeric,
              type text, tpe_ref text, created_at)
```

### Migration 005 — Stocks & recettes *(Phase 3)*
```sql
stock_items (id uuid PK, establishment_id → establishments,
             ingredient text, quantity numeric, unit text, alert_threshold numeric)
recipes (id uuid PK, establishment_id → establishments,
         title text, content text, media_urls text[], version int)
sops (id uuid PK, establishment_id → establishments,
      title text, content text, media_urls text[], version int)
```

### Migration 006 — CRM fidélité *(Phase 4)*
```sql
customers (id uuid PK, establishment_id → establishments,
           name text, phone text, email text, points int, tier text)
loyalty_rewards (id uuid PK, establishment_id → establishments,
                 name text, points_required int, discount_type text, discount_value numeric)
loyalty_transactions (id uuid PK, customer_id → customers, order_id → orders,
                      points int, type text, created_at)
```

---

## Authentification

- Page `/login` : email + mot de passe
- À la connexion : lecture du profil (`profiles`) pour récupérer rôle et établissement
- Rôles :
  - `super_admin` — accès tous établissements
  - `admin` — accès son établissement uniquement
  - `caissier` — redirigé vers `/login` avec message d'erreur "Accès non autorisé" en Phase 1
- Déconnexion depuis le header du dashboard

---

## CRUD Produits

**Interface** (`/dashboard/products`) :
- Tableau (shadcn/ui) : nom, prix, catégorie, TVA, statut actif/inactif
- Créer : formulaire modal (Dialog shadcn/ui)
- Modifier : même formulaire pré-rempli
- Supprimer : soft delete (`active = false`) — pas de suppression physique (NF525)

**API Routes :**
```
GET    /api/products        → liste filtrée par establishment_id
POST   /api/products        → créer un produit
PATCH  /api/products/[id]   → modifier un produit
DELETE /api/products/[id]   → désactiver (soft delete)
```

Toutes les routes API sont validées avec Zod et protégées par vérification de session.

---

## Déploiement

**Variables d'environnement :**
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

**Workflow dev :**
```bash
supabase start      # Supabase local (Docker)
npm run dev         # Next.js sur localhost:3000
supabase db push    # Applique les migrations sur Supabase Cloud
```

**Vercel :** repo GitHub connecté, auto-deploy sur push `main`.

---

## Livrables Phase 1

- [ ] App Next.js deployée sur Vercel avec URL publique
- [ ] Supabase project créé (région EU), toutes les migrations appliquées
- [ ] Login fonctionnel avec les 3 rôles
- [ ] CRUD produits opérationnel pour un admin

---

## Hors scope Phase 1

- Interface caisse (Phase 2)
- Connexion TPE (Phase 2)
- Tickets NF525 (Phase 2)
- Gestion stocks (Phase 3)
- Multi-établissements UI (Phase 4)
- CRM fidélité (Phase 4)
