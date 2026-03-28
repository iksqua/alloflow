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

---

## DB Schema

### 1. `user_role` enum — ajouter `franchise_admin`

```sql
alter type public.user_role add value 'franchise_admin';
```

### 2. `organizations` — ajouter `parent_org_id`

```sql
alter table public.organizations
  add column if not exists parent_org_id uuid references public.organizations(id) on delete set null;
```

Les organisations franchisées ont `parent_org_id = <id_du_franchiseur>`. Les boutiques en propre du franchiseur sont directement rattachées à son org via `establishments.org_id`.

### 3. Nouvelle table `franchise_contracts`

Stocke les conditions négociées pour chaque établissement franchisé.

```sql
create table public.franchise_contracts (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade, -- org du franchiseur
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  royalty_rate     numeric(5,2) not null default 0,   -- % du CA HT
  marketing_rate   numeric(5,2) not null default 0,   -- % du CA HT
  start_date       date not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique(org_id, establishment_id)
);

alter table public.franchise_contracts enable row level security;

create policy "franchise_admin_manages_contracts"
  on public.franchise_contracts for all
  using (
    org_id in (
      select org_id from public.profiles where id = auth.uid() and role = 'franchise_admin'
    )
  );
```

---

## Routes API

### `/api/franchise/network-stats` — GET

Retourne les données consolidées pour le Command Center :
- CA réseau total (hier + mois en cours) par établissement
- Royalties et marketing calculés par établissement (CA × taux)
- Alertes actives (sessions non ouvertes, stocks bas)

Accès : `franchise_admin` uniquement. Utilise service role key pour lire les données de tous les établissements de l'org.

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
    type: 'own' | 'franchise'
    ca_yesterday: number
    ca_month: number
    royalty_amount: number    // ca_month × royalty_rate / 100
    marketing_amount: number  // ca_month × marketing_rate / 100
    royalty_rate: number
    marketing_rate: number
    alerts: string[]          // ['stock_bas', 'session_fermee']
  }>
}
```

### `/api/franchise/establishments` — GET + POST

**GET** : liste tous les établissements du réseau (propres + franchisés)

**POST** : onboarding d'un nouveau franchisé
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
1. Crée une org franchisée avec `parent_org_id = franchiseur.org_id`
2. Crée un établissement rattaché à cette org
3. Crée un `franchise_contract`
4. Invite le gérant via `supabase.auth.admin.inviteUserByEmail` avec `data: { role: 'admin', establishment_id, first_name }`

### `/api/franchise/contracts/[establishmentId]` — GET + PATCH

**GET** : récupère le contrat (royalty_rate, marketing_rate, start_date)
**PATCH** : met à jour les taux (Zod : royalty_rate min 0 max 50, marketing_rate min 0 max 20)

---

## Pages

### `/dashboard/franchise/layout.tsx`

Layout avec `FranchiseSidebar` :
- **📊 Command Center**
- **🏪 Franchisés** (liste + onboarding)

Garde : redirige vers `/dashboard` si `profile.role !== 'franchise_admin'`.

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
    → Crée org franchisée (parent_org_id = franchiseur)
    → Crée establishment (org_id = org franchisée)
    → Crée franchise_contract (royalty_rate, marketing_rate)
    → inviteUserByEmail(manager_email, { role: 'admin', establishment_id, first_name })
      → Franchisé reçoit email "Bienvenue dans le réseau Allocookie"
        → Clique le lien → crée son mot de passe
          → Arrive dans son dashboard boutique /dashboard/
          → Profil créé via trigger handle_new_user
          → Lié à son établissement et son org
franchise_admin voit immédiatement le franchisé dans son Command Center
```

---

## Hors scope

- Suppression / désactivation d'un franchisé
- Historique des modifications de contrat
- Export comptable des royalties
- Notifications automatiques de versement
- Dashboard franchisé comparant sa performance vs réseau
