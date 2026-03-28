# Sprint 11 — Fidélité cross-réseau : Design Spec

## Contexte

Le système de fidélité actuel est strictement per-établissement : chaque boutique a ses propres clients, points, tiers et rewards. Un client qui fréquente plusieurs boutiques du réseau Allocookie repart de zéro à chaque nouvelle boutique.

Sprint 11 ajoute une couche réseau par-dessus le système existant :
- Une **identité réseau** (`network_customers`) par client unique (déduplication par téléphone)
- Les points s'**accumulent** sur l'identité réseau (somme de tous les établissements liés)
- Le **tier** (Standard/Silver/Gold) est calculé sur les points réseau totaux
- Le `franchise_admin` configure une **règle partagée** pour tout le réseau
- Le customer fiche et le Command Center exposent ces données réseau

Le système per-établissement existant reste intact et continue de fonctionner pour les orgs indépendantes.

## Hors scope Sprint 11

- Rédemption cross-boutique (dépenser les points de Boutique A chez Boutique B) → Sprint 12
- Merge manuel de clients (UI de déduplication) → Sprint 12
- Catalogue rewards réseau partagé → Sprint 13
- Expiration des points
- Bonus inscription au niveau réseau
- Portail client self-service

---

## Architecture

```
network_customers (org-level, phone-dedup)
  ├── total_points = SUM(customers.points) where network_customer_id = id
  ├── tier = calculé depuis total_points + network_loyalty_config.levels
  └── linked_customers: customers[] via FK customers.network_customer_id

network_loyalty_config (org-level, géré par franchise_admin)
  ├── pts_per_euro, min_redemption_pts
  └── levels (jsonb) : seuils Standard/Silver/Gold

customers (per-establishment, inchangé)
  └── network_customer_id (nullable FK → network_customers)
```

**Auto-linking** : à la création d'un client (`POST /api/customers`), si l'org de l'établissement est de type `siege` ou `franchise` et qu'un téléphone est fourni :
- Résout `root_org_id` : si `org.parent_org_id` est non null → `root_org_id = org.parent_org_id` (franchise → utiliser le siège), sinon `root_org_id = org.id` (c'est déjà le siège)
- Cherche un `network_customers` existant pour `(root_org_id, phone)` — garantit une identité réseau unique scoped au siège
- Trouvé → `customers.network_customer_id = found.id`
- Pas trouvé → crée le `network_customers` avec `org_id = root_org_id`, puis lie

**Points sync** : trigger PostgreSQL `AFTER UPDATE OF points ON customers`. Si `network_customer_id` présent et points ont changé → recalcule `network_customers.total_points` (SUM) + recalcule tier depuis les seuils de `network_loyalty_config` ou defaults.

---

## DB Schema

### 1. `network_customers`

```sql
create table public.network_customers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  phone        text not null,
  first_name   text not null default '',
  last_name    text,
  email        text,
  total_points int not null default 0,
  tier         text not null default 'standard'
               check (tier in ('standard', 'silver', 'gold')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(org_id, phone)
);

alter table public.network_customers enable row level security;

-- franchise_admin voit tous les network_customers de son org
create policy "franchise_admin_reads_network_customers"
  on public.network_customers for select
  using (
    org_id in (
      select org_id from public.profiles
      where id = auth.uid() and role = 'franchise_admin' and org_id is not null
    )
  );

-- admin d'un établissement voit les network_customers liés à ses clients
-- Note: profiles.establishment_id existe (ajouté Sprint 1, utilisé par tous les admins établissement)
-- Restreint au rôle 'admin' pour éviter que les caissiers accèdent aux données réseau (téléphone, tier global)
create policy "admin_reads_linked_network_customers"
  on public.network_customers for select
  using (
    id in (
      select c.network_customer_id
      from public.customers c
      join public.profiles p on p.establishment_id = c.establishment_id
      where p.id = auth.uid()
        and p.role = 'admin'
        and c.network_customer_id is not null
    )
  );
```

### 2. `customers` — ajouter `network_customer_id`

```sql
alter table public.customers
  add column if not exists network_customer_id uuid
  references public.network_customers(id) on delete set null;

create index if not exists idx_customers_network_customer_id
  on public.customers(network_customer_id);
```

### 3. `network_loyalty_config`

```sql
create table public.network_loyalty_config (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null unique references public.organizations(id) on delete cascade,
  active             boolean not null default true,
  pts_per_euro       numeric(8,2) not null default 1,
  min_redemption_pts int not null default 100,
  levels             jsonb not null default '[
    {"key":"standard","name":"Standard","min":0,"max":499},
    {"key":"silver","name":"Silver","min":500,"max":1999},
    {"key":"gold","name":"Gold","min":2000,"max":null}
  ]'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.network_loyalty_config enable row level security;

-- franchise_admin gère la config de son org
create policy "franchise_admin_manages_network_config"
  on public.network_loyalty_config for all
  using (
    org_id in (
      select org_id from public.profiles
      where id = auth.uid() and role = 'franchise_admin' and org_id is not null
    )
  )
  with check (
    org_id in (
      select org_id from public.profiles
      where id = auth.uid() and role = 'franchise_admin' and org_id is not null
    )
  );

-- admin d'établissement peut lire la config réseau de son org (siège)
-- network_loyalty_config.org_id est toujours le root_org_id (siège), pas l'org franchisée.
-- La policy résout parent_org_id pour matcher correctement.
create policy "admin_reads_network_config"
  on public.network_loyalty_config for select
  using (
    org_id in (
      select coalesce(o.parent_org_id, o.id)
      from public.establishments e
      join public.organizations o on o.id = e.org_id
      join public.profiles p on p.establishment_id = e.id
      where p.id = auth.uid()
    )
  );
```

### 4. Trigger `sync_network_customer_points`

Fires `AFTER UPDATE OF points ON customers`. Si `network_customer_id` n'est pas null et que les points ont changé :
1. `total_points = SUM(c.points) WHERE network_customer_id = NEW.network_customer_id`
2. Récupère `levels` depuis `network_loyalty_config` de l'org (join via `network_customers.org_id`)
3. Si absent, utilise les seuils defaults (0/500/2000)
4. Calcule `tier` : le level dont `total_points >= level.min` (le plus élevé)
5. UPDATE `network_customers SET total_points, tier, updated_at`

```sql
create or replace function public.sync_network_customer_points()
returns trigger language plpgsql security definer as $$
declare
  v_total   int;
  v_tier    text;
  v_levels  jsonb;
  v_level   jsonb;
begin
  if NEW.network_customer_id is null then return new; end if;
  if OLD.points = NEW.points then return new; end if;

  -- Recalcule total
  select coalesce(sum(points), 0) into v_total
  from public.customers
  where network_customer_id = NEW.network_customer_id;

  -- Récupère les seuils de la config réseau
  select nlc.levels into v_levels
  from public.network_customers nc
  join public.network_loyalty_config nlc on nlc.org_id = nc.org_id
  where nc.id = NEW.network_customer_id;

  -- Defaults si pas de config
  if v_levels is null then
    v_levels := '[
      {"key":"standard","min":0,"max":499},
      {"key":"silver","min":500,"max":1999},
      {"key":"gold","min":2000,"max":null}
    ]'::jsonb;
  end if;

  -- Tier = le level le plus élevé dont min <= total
  -- ORDER BY min ASC garantit que le dernier match est bien le tier le plus élevé,
  -- indépendamment de l'ordre dans lequel l'admin a saisi les seuils.
  v_tier := 'standard';
  for v_level in
    select elem from jsonb_array_elements(v_levels) elem
    order by (elem->>'min')::int asc
  loop
    if v_total >= (v_level->>'min')::int then
      v_tier := v_level->>'key';
    end if;
  end loop;

  update public.network_customers
  set total_points = v_total, tier = v_tier, updated_at = now()
  where id = NEW.network_customer_id;

  return new;
end;
$$;

drop trigger if exists sync_network_customer_points_trigger on public.customers;
create trigger sync_network_customer_points_trigger
  after update of points on public.customers
  for each row execute function public.sync_network_customer_points();
```

### 5. updated_at trigger pour `network_customers` et `network_loyalty_config`

Réutilise `public.handle_updated_at()` existant.

```sql
create trigger set_network_customers_updated_at
  before update on public.network_customers
  for each row execute function public.handle_updated_at();

create trigger set_network_loyalty_config_updated_at
  before update on public.network_loyalty_config
  for each row execute function public.handle_updated_at();
```

---

## TypeScript Types

Ajouter dans `src/lib/types/database.ts` :
- `network_customers` Row/Insert/Update/Relationships
- `network_loyalty_config` Row/Insert/Update/Relationships
- `customers.network_customer_id: string | null` dans Row (et optionnel dans Insert/Update)

---

## Routes API

### `GET /api/loyalty/network-config` (nouveau)

Accès : `franchise_admin` uniquement.

Retourne la config réseau pour l'org du franchiseur (ou defaults si non configurée) :
```typescript
{
  active: boolean
  ptsPerEuro: number
  minRedemptionPts: number
  levels: Array<{ key: string; name: string; min: number; max: number | null }>
  networkCustomersCount: number  // total network_customers pour cette org
  goldCount: number
  silverCount: number
  points_issued_month: number
  // SUM(loyalty_transactions.points) WHERE type='earn' AND created_at >= monthStart
  // AND customer_id IN (SELECT id FROM customers WHERE network_customer_id IN
  //   (SELECT id FROM network_customers WHERE org_id = profile.org_id))
}
```

### `PUT /api/loyalty/network-config` (nouveau)

Accès : `franchise_admin` uniquement. Upsert `network_loyalty_config` sur `org_id`.

Body Zod :
```typescript
{
  active?: boolean
  ptsPerEuro: z.number().min(0).max(10)
  minRedemptionPts: z.number().min(0)
  levels: z.array(z.object({
    key: z.string(),
    name: z.string(),
    min: z.number().min(0),
    max: z.number().nullable()
  })).min(1)
  .refine(
    levels => levels.every((l, i) => i === 0 || l.min > levels[i - 1].min),
    { message: 'Les seuils doivent être en ordre croissant de min' }
  )
}
```

**Note :** la validation Zod enforce l'ordre croissant des `min`, ce qui garantit que le trigger SQL (qui fait `ORDER BY min ASC`) produit toujours un tier correct.

### `POST /api/customers` (modifié)

Après insertion du client, si `phone` fourni et `org.type !== 'independent'` :

**Résolution de `root_org_id` (l'org racine = siège) :**
- Récupère `establishments.org_id` → charge l'org correspondante via `supabaseAdmin`
- Si `org.parent_org_id` est non null → `root_org_id = org.parent_org_id` (org franchisée → utiliser le siège)
- Sinon → `root_org_id = org.id` (c'est déjà le siège)
- **Toujours utiliser `root_org_id`** pour `network_customers.org_id` — garantit que toutes les boutiques du réseau partagent la même table de clients réseau (scoped au siège), et non une par franchisé.

**Auto-linking :**
1. Résoudre `root_org_id` comme ci-dessus
2. Cherche `network_customers` où `org_id = root_org_id AND phone = phone` via `supabaseAdmin`
3. Trouvé → `UPDATE customers SET network_customer_id = found.id`
4. Pas trouvé → `INSERT INTO network_customers (org_id: root_org_id, phone, first_name, last_name, email)` → `UPDATE customers SET network_customer_id = new.id`

**Note :** le trigger `sync_network_customer_points` ne s'active pas ici (points = 0 au départ). Le `total_points` du `network_customers` reste 0 jusqu'à la première commande.

### `GET /api/customers/[id]` (modifié)

Si le client a `network_customer_id` non null : joindre `network_customers` et inclure dans la réponse :
```typescript
{
  // ...champs existants...
  network: {
    id: string
    total_points: number
    tier: 'standard' | 'silver' | 'gold'
  } | null
}
```

Utilise `supabaseAdmin` pour le join `network_customers` (cross-tenant read).

### `GET /api/franchise/network-stats` (modifié)

Ajouter section `loyalty` :
```typescript
loyalty: {
  total_network_customers: number
  gold_count: number
  silver_count: number
  points_issued_month: number
  // SUM(loyalty_transactions.points) WHERE type='earn' AND created_at >= monthStart
  // Scoping: loyalty_transactions JOIN customers WHERE customers.establishment_id IN (network establishment ids)
  // La table loyalty_transactions existe (Sprint 6) : customer_id, order_id, points int, type ('earn'|'redeem'), created_at
}
```

---

## Pages

### `/dashboard/franchise/loyalty/page.tsx` (nouveau)

Server component. Charge `/api/loyalty/network-config` (retourne config + stats membres en une seule requête). Passe à `NetworkLoyaltyClient`.

**Note :** la page loyalty n'appelle PAS `/api/franchise/network-stats`. Les stats membres (total, gold, silver) sont incluses directement dans la réponse de `/api/loyalty/network-config` pour éviter une double requête. La section `loyalty` de `network-stats` est réservée au Command Center.

### `/dashboard/franchise/loyalty/_components/network-loyalty-client.tsx` (nouveau)

`'use client'`. Deux sections :

**1. Config réseau** — éditeur :
- pts_per_euro (input numérique)
- min_redemption_pts (input numérique)
- Seuils de tiers (Standard max, Silver max) — le Gold n'a pas de max
- Bouton "Enregistrer"

**2. Stats réseau** — lecture seule :
- Total membres réseau
- Distribution par tier (Gold / Silver / Standard)
- Points émis ce mois

### `FranchiseSidebar` (modifié)

Ajouter un 3ème lien : `{ href: '/dashboard/franchise/loyalty', label: '🎁 Fidélité' }`.

### `customer-loyalty-panel.tsx` (modifié)

Si `network` présent dans les données client :
- Ajouter bloc "Points réseau" sous les points établissement :
  ```
  🌐 Points réseau : 1 847 pts  ·  Tier réseau : Silver
  ```
- Petit badge "Membre réseau" à côté du nom client

---

## Flux complet

```
Caissier crée un client (avec téléphone)
  → POST /api/customers
    → Insert customers (establishment_id)
    → Check network: org.type != 'independent' + phone fourni?
      → YES: résoudre root_org_id (parent_org_id si non null, sinon org.id)
        → chercher network_customers (root_org_id, phone)
          → Trouvé: UPDATE customers.network_customer_id = existing
          → Pas trouvé: CREATE network_customers (org_id = root_org_id) + UPDATE customers.network_customer_id

Client passe commande → trigger credit_loyalty_points() → UPDATE customers.points
  → trigger sync_network_customer_points()
    → recalcule network_customers.total_points
    → recalcule network_customers.tier

Admin ouvre fiche client → GET /api/customers/[id]
  → résponse inclut network: { total_points: 1847, tier: 'silver' }
  → customer-loyalty-panel.tsx affiche "Points réseau : 1 847 pts · Silver"

Franchise admin ouvre /dashboard/franchise/loyalty
  → voit stats réseau + peut modifier la config
```

---

## Sécurité

- **Auto-linking** : utilise `supabaseAdmin` (service role) pour les lookups/créations dans `network_customers` (cross-establishment)
- **RLS** : `franchise_admin` voit tous les `network_customers` de son org ; `admin` établissement voit uniquement ceux liés à ses clients
- **`network_loyalty_config`** : seul le `franchise_admin` peut modifier ; les admins établissement ont accès lecture
- Les établissements indépendants (`org.type = 'independent'`) ne participent pas au réseau — aucune création de `network_customers` pour eux
