# Sprint 10 — Infrastructure Franchise & Command Center : Design Spec

## Contexte

Alloflow est développé en interne par Allocookie (1 labo + 2 boutiques en propre + franchisés à venir). L'objectif immédiat est de permettre au président d'Allocookie de piloter tout son réseau depuis un seul écran, d'onboarder des franchisés en quelques clics, et de voir en temps réel ce que chaque franchisé lui rapporte (royalties, marketing, ventes labo).

**Structure légale :**
- **Alloflow** = société SaaS indépendante (produit, abonnements)
- **Allocookie** = franchise réseau, premier client d'Alloflow
- Les franchisés ont deux contrats séparés : un avec Allocookie (royalties + marketing) et un avec Alloflow (abonnement SaaS)

## Hors scope Sprint 10

- Fidélité cross-réseau → Sprint 11
- Marges automatiques (recettes → ventes) → Sprint 12
- Templates produits/SOPs/recettes pour franchisés → Sprint 13

---

## Architecture

### Nouveau rôle : `franchise_admin`

Ajout de `franchise_admin` dans l'enum `user_role`. Ce rôle est réservé au siège franchiseur. Un `franchise_admin` a `org_id` renseigné et `establishment_id` NULL — il gère le réseau, pas un point de vente spécifique.

**Hiérarchie des rôles :**
```
franchise_admin → admin → caissier
```

**Routing :**
- `franchise_admin` → redirigé vers `/dashboard/franchise/`
- `admin` / `super_admin` → comportement actuel inchangé
- `caissier` → `/caisse/pos` (inchangé)

### Hiérarchie organisations

```
organizations (franchiseur)
  parent_org_id = NULL
  type = 'siege'
    └── organizations (franchisé A)
          parent_org_id = franchiseur.id
          type = 'franchise'
            └── establishments (boutique franchisée)
    └── organizations (franchisé B)
          ...
    └── establishments (boutiques en propre du franchiseur)
```

La colonne `type` sur `organizations` doit avoir une contrainte CHECK :
```sql
alter table public.organizations
  add column if not exists type text check (type in ('siege', 'franchise', 'independent')) default 'independent';
```

---

## DB Schema

### 1. `user_role` enum — ajouter `franchise_admin`

```sql
alter type public.user_role add value 'franchise_admin';
```

### 2. `organizations` — ajouter `parent_org_id` et restreindre RLS

```sql
alter table public.organizations
  add column if not exists parent_org_id uuid references public.organizations(id) on delete set null;
```

Les organisations franchisées ont `parent_org_id = <id_du_franchiseur>`. Les boutiques en propre du franchiseur sont directement rattachées à son org via `establishments.org_id`.

**RLS sur `organizations` :** Par défaut, les utilisateurs authentifiés peuvent lire toutes les organisations (risque de fuite cross-tenant). Ajouter une policy restrictive. **Important :** éviter les sous-requêtes auto-référentielles sur `organizations` (récursion PostgreSQL RLS). On se limite à la hiérarchie à 2 niveaux :

```sql
-- Supprime toute policy SELECT permissive existante sur organizations, puis ajoute :
create policy "orgs_visible_to_own_network"
  on public.organizations for select
  using (
    -- L'utilisateur voit sa propre org
    id = (select org_id from public.profiles where id = auth.uid() and org_id is not null)
    or
    -- Le franchiseur voit les orgs de ses franchisés (parent_org_id = son org)
    parent_org_id = (select org_id from public.profiles where id = auth.uid() and org_id is not null)
  );
```

Note : cette policy couvre la hiérarchie à 2 niveaux (siège → franchisé). Un franchisé ne peut voir que sa propre org (pas le siège), ce qui est suffisant pour Sprint 10.

### 3. Nouvelle table `franchise_contracts`

Stocke les conditions négociées pour chaque établissement franchisé.

```sql
create table public.franchise_contracts (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade, -- org du franchiseur
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  royalty_rate     numeric(5,2) not null default 0   check (royalty_rate >= 0 and royalty_rate <= 100),
  marketing_rate   numeric(5,2) not null default 0   check (marketing_rate >= 0 and marketing_rate <= 100),
  start_date       date not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique(org_id, establishment_id)
);

alter table public.franchise_contracts enable row level security;

-- franchise_admin peut tout faire sur ses contrats
create policy "franchise_admin_manages_contracts"
  on public.franchise_contracts for all
  using (
    org_id in (
      select org_id from public.profiles
      where id = auth.uid()
        and role = 'franchise_admin'
        and org_id is not null
    )
  )
  with check (
    org_id in (
      select org_id from public.profiles
      where id = auth.uid()
        and role = 'franchise_admin'
        and org_id is not null
    )
  );

-- L'admin franchisé peut lire son propre contrat (son establishment_id)
-- Toutes les routes admin utilisent le service role — cette policy est une sécurité supplémentaire
create policy "franchisee_admin_reads_own_contract"
  on public.franchise_contracts for select
  using (
    establishment_id in (
      select establishment_id from public.profiles
      where id = auth.uid()
        and role = 'admin'
        and establishment_id is not null
    )
  );

-- Trigger pour updated_at automatique
-- Suppose que public.handle_updated_at() existe (introduit en Sprint 4/5).
-- Si absent, créer : create or replace function public.handle_updated_at()
--   returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger set_franchise_contracts_updated_at
  before update on public.franchise_contracts
  for each row execute function public.handle_updated_at();
```

---

## Routes API

### `/api/franchise/network-stats` — GET

Retourne les données consolidées pour le Command Center :
- CA réseau total (hier + mois en cours) par établissement
- Royalties et marketing calculés par établissement (CA × taux)
- Alertes actives (sessions non ouvertes, stocks bas)

Accès : `franchise_admin` uniquement. Utilise service role key pour lire les données de tous les établissements du réseau.

**Scoping obligatoire — séquence :**
1. Récupère le profil appelant (via anon client + `auth.uid()`) → vérifie `profile.role === 'franchise_admin'`, sinon 403
2. Récupère `org_id` du profil (non-null garanti par le role check)
3. Charge les orgs du réseau via service role : `organizations` où `id = org_id` (siège) **OU** `parent_org_id = org_id` (franchisés)
4. Charge les `establishments` où `org_id in (<ids des orgs du réseau>)` via service role
5. Toutes les requêtes `orders` / `stock_items` / `caisse_sessions` sont filtrées par `establishment_id in (<ids des établissements du réseau>)` — jamais de requête sans ce filtre
6. Joint avec `franchise_contracts` pour récupérer les taux (où `org_id = <org_id du siège>`) via service role

**Réponse :**
```typescript
{
  network: {
    ca_yesterday: number
    ca_month: number
    ca_month_prev: number
  },
  establishments: Array<{
    id: string
    name: string
    type: 'own' | 'franchise'  // dérivé de organizations.type via establishments.org_id :
                                // org.type === 'siege' → 'own', org.type === 'franchise' → 'franchise'
    ca_yesterday: number
    ca_month: number
    royalty_amount: number    // ca_month × royalty_rate / 100 (0 si type = 'own')
    marketing_amount: number  // ca_month × marketing_rate / 100 (0 si type = 'own')
    royalty_rate: number      // 0 si type = 'own'
    marketing_rate: number    // 0 si type = 'own'
    alerts: string[]          // ['stock_bas', 'session_fermee']
  }>
}
```

### `/api/franchise/establishments` — GET + POST

**GET** : liste tous les établissements du réseau (propres + franchisés). Accès : `franchise_admin` uniquement. Même séquence de scoping que `network-stats` : vérifier `profile.role === 'franchise_admin'` → récupérer `org_id` → orgs du réseau → establishments filtrés. Utilise service role pour les lectures.

**POST** : onboarding d'un nouveau franchisé. Accès : `franchise_admin` uniquement. Toutes les opérations DB utilisent `supabaseAdmin` (service role) car elles créent des données cross-tenant que le RLS anon ne peut pas écrire.
```typescript
{
  company_name: string     // nom de la société franchisée
  shop_name: string        // nom de la boutique
  manager_email: string    // email du gérant
  manager_first_name: string
  royalty_rate: number
  marketing_rate: number
  start_date: string       // YYYY-MM-DD
}
```

Actions :
1. Crée une org franchisée avec `parent_org_id = franchiseur.org_id` et `type = 'franchise'`
2. Crée un établissement rattaché à cette org
3. Crée un `franchise_contract`
4. Invite le gérant via `supabase.auth.admin.inviteUserByEmail` avec `data: { role: 'admin', establishment_id, org_id, first_name }`
5. **Immédiatement après l'invite**, upsert le profil via service role (le trigger `handle_new_user` ne s'exécute qu'à la confirmation du mot de passe, pas à l'invite). Le franchisé admin démarre avec un seul établissement (Sprint 10 — un établissement par onboarding) :
   ```typescript
   await supabaseAdmin.from('profiles').upsert({
     id: invitedUser.id,
     email: manager_email,           // obligatoire si NOT NULL sur profiles.email
     org_id: franchiseeOrg.id,
     establishment_id: establishment.id,
     role: 'admin',
     first_name: manager_first_name,
   }, { onConflict: 'id' })
   ```
   Note : `establishment_id` est nullable sur `profiles` (le `franchise_admin` du siège a `establishment_id = NULL`). L'admin franchisé a `establishment_id` renseigné pour son unique boutique.

6. **Toutes les opérations 1-5 sont wrappées dans un try/catch avec rollback manuel** : si une étape échoue, supprimer les entrées créées dans l'ordre inverse (profile → auth user via `supabaseAdmin.auth.admin.deleteUser(invitedUser.id)` → contract → establishment → org) via service role avant de renvoyer l'erreur 500.

### `/api/franchise/contracts/[establishmentId]` — GET + PATCH

Accès : `franchise_admin` uniquement. **Avant toute opération**, vérifier :
1. `profile.role === 'franchise_admin'`
2. `contract.org_id === profile.org_id` (le contrat appartient bien au réseau du franchiseur appelant)

Si l'une ou l'autre vérification échoue → 403 ou 404.

**GET** : récupère le contrat (royalty_rate, marketing_rate, start_date)

**PATCH** : met à jour les taux. Validation Zod : `royalty_rate` min 0 max 50, `marketing_rate` min 0 max 20 (règles métier Allocookie, plus restrictives que les CHECK DB). Le DB accepte jusqu'à 100 ; l'API plafonne à 50/20 par règle business.

---

## Pages

### `/dashboard/franchise/layout.tsx`

Layout avec `FranchiseSidebar` :
- **📊 Command Center**
- **🏪 Franchisés** (liste + onboarding)

**Garde (server-side) :** Server component. Utilise `createServerClient` (cookies) pour lire l'utilisateur côté serveur, charge le profil via Supabase, redirige vers `/dashboard` si `profile.role !== 'franchise_admin'`. Ne jamais se fier à un état client pour cette vérification — même pattern que les autres layouts dashboard.

### `/dashboard/franchise/page.tsx`

Redirect → `/dashboard/franchise/command-center`

### `/dashboard/franchise/command-center/page.tsx`

Server component. Charge les données via `/api/franchise/network-stats`. Passe à `CommandCenterClient`.

**Sections :**

**1. Bloc "Dans ma poche — ce mois"**
```
Royalties | Fonds marketing | Ventes labo | TOTAL
```
Note : les ventes labo = CA de l'établissement labo propre (non soumis à royalties).

**2. KPIs réseau**
```
CA réseau hier | CA réseau ce mois | Évolution vs mois dernier
```

**3. Tableau par établissement**

Colonnes : Boutique · CA hier · CA mois · Royalty % · Royalty € · Marketing € · Total → franchiseur · Alertes

- Les boutiques en propre (labo, propres) ont la colonne "Total → franchiseur" affichant "Direct" (pas de royalties prélevées sur soi-même)
- Les alertes sont des badges rouges/amber cliquables

### `/dashboard/franchise/franchises/page.tsx`

Liste des franchisés avec statut (actif, invitation envoyée), CA du mois, revenus générés. Bouton **"+ Onboarder un franchisé"**.

### `/dashboard/franchise/franchises/nouveau/page.tsx`

Formulaire d'onboarding :
- Nom société franchisée
- Nom boutique
- Email gérant + Prénom
- Royalty % (input numérique)
- Fonds marketing % (input numérique)
- Date de démarrage (date picker)
- Projection automatique : *"Avec un CA estimé de X€/mois, vous percevrez Y€ de royalties + Z€ de marketing"*

### `/dashboard/franchise/franchises/[establishmentId]/page.tsx`

Fiche franchisé : infos boutique + contrat (royalty %, marketing %) modifiable + historique CA mensuel.

---

## Mise à jour `dashboard/layout.tsx`

Ajouter la redirection `franchise_admin` → `/dashboard/franchise` :

```typescript
if (profile.role === 'franchise_admin') redirect('/dashboard/franchise')
if (profile.role === 'caissier') redirect('/caisse/pos')
```

---

## Design

Suit le design system existant (CSS variables, `var(--surface)`, `var(--blue)`, etc.).

**Bloc revenus franchiseur :** fond gradient bleu foncé (`#0f1f35`), chiffres en `var(--blue)`, total en blanc — visuellement distinct du reste du dashboard.

**Tableau établissements :** même pattern que la liste équipe du Sprint 9a. Colonne "Total → franchiseur" en bleu. Badge alerte rouge/amber.

**Formulaire onboarding :** même pattern que `InviteModal` (Sprint 9a) mais en pleine page.

---

## Flux onboarding franchisé — séquence complète

```
franchise_admin remplit le formulaire
  → POST /api/franchise/establishments
    → Crée org franchisée (parent_org_id = franchiseur, type = 'franchise')
    → Crée establishment (org_id = org franchisée)
    → Crée franchise_contract (royalty_rate, marketing_rate)
    → inviteUserByEmail(manager_email, { role: 'admin', establishment_id, org_id, first_name })
    → upsert profil (id = invitedUser.id, org_id, establishment_id, role = 'admin')
      [Note : handle_new_user ne s'exécute qu'à la confirmation du mot de passe,
       l'upsert immédiat garantit que le profil existe pour l'affichage dans le Command Center]
      → Franchisé reçoit email "Bienvenue dans le réseau Allocookie"
        → Clique le lien → crée son mot de passe
          → Arrive dans son dashboard boutique /dashboard/
franchise_admin voit immédiatement le franchisé dans son Command Center
```

---

## Hors scope

- Suppression / désactivation d'un franchisé
- Historique des modifications de contrat
- Export comptable des royalties
- Notifications automatiques de versement
- Dashboard franchisé comparant sa performance vs réseau
