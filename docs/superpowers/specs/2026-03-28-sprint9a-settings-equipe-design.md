# Sprint 9a — Settings & Équipe : Design Spec

## Objectif

Permettre à un gérant d'administrer son établissement et son équipe directement depuis l'app, sans passer par la base de données. Aujourd'hui, onboarder un caissier exige une manipulation SQL manuelle — c'est un bloquant opérationnel.

## Migrations requises

Avant tout développement, une migration crée les colonnes manquantes et met à jour le trigger :

**`supabase/migrations/20260328000006_sprint9a_settings.sql`**

```sql
-- 1. Colonnes établissement (établissement + caisse)
alter table public.establishments
  add column if not exists siret             text,
  add column if not exists address           text,
  add column if not exists timezone          text not null default 'Europe/Paris',
  add column if not exists default_opening_float  numeric  not null default 0,
  add column if not exists auto_print_receipt     boolean  not null default false,
  add column if not exists receipt_footer         text     not null default '',
  add column if not exists default_tva_rate       numeric  not null default 10;

-- 2. Colonne first_name sur profiles
alter table public.profiles
  add column if not exists first_name text not null default '';

-- 3. Trigger handle_new_user mis à jour pour lire raw_user_meta_data
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, role, establishment_id, first_name)
  values (
    new.id,
    coalesce(
      (new.raw_user_meta_data->>'role')::text,
      'caissier'
    ),
    (new.raw_user_meta_data->>'establishment_id')::uuid,
    coalesce(new.raw_user_meta_data->>'first_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
```

---

## Architecture

### Layout nested

`/dashboard/settings/` utilise un nested layout (`layout.tsx`) avec un mini-sidebar gauche fixe (160px) et une zone de contenu principale.

**Routes :**
- `/dashboard/settings/etablissement` — informations du commerce
- `/dashboard/settings/equipe` — gestion des membres
- `/dashboard/settings/caisse` — configuration caisse
- `/dashboard/settings/crm` — existant, déplacé depuis `/dashboard/settings`

**Redirect :** `/dashboard/settings` → `/dashboard/settings/etablissement`.

**Accès :** Admins et super_admins uniquement. Les caissiers sont déjà redirigés vers `/caisse/pos` par le dashboard layout — pas de garde supplémentaire nécessaire.

### Pattern d'autorisation API (toutes les routes settings)

```typescript
const { data: profile } = await supabase
  .from('profiles').select('role, establishment_id').eq('id', user.id).single()
if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })
if (!['admin', 'super_admin'].includes(profile.role))
  return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
```

### Structure fichiers

```
src/app/dashboard/settings/
├── layout.tsx                          ← nested layout avec SettingsSidebar
├── page.tsx                            ← redirect → /settings/etablissement
├── etablissement/
│   └── page.tsx                        ← server component, passe data à EstablishmentForm
├── equipe/
│   └── page.tsx                        ← server component, passe membres à TeamPageClient
├── caisse/
│   └── page.tsx                        ← server component, passe config à CaisseSettingsForm
├── crm/
│   └── page.tsx                        ← contenu actuel de settings/page.tsx déplacé
└── _components/
    ├── settings-sidebar.tsx            ← client component (usePathname pour lien actif)
    ├── establishment-form.tsx          ← formulaire établissement (client)
    ├── team-page-client.tsx            ← liste membres + ouverture InviteModal (client)
    ├── invite-modal.tsx                ← modal invitation (client)
    └── caisse-settings-form.tsx        ← formulaire config caisse (client)
```

`settings-sidebar.tsx` est un **client component** — utilise `usePathname()` de `next/navigation` pour surligner le lien actif.

---

## Section Établissement

Formulaire PATCH sur `establishments` :

| Champ | Type | Contrainte |
|-------|------|-----------|
| name | text | required, max 80 chars |
| siret | text | optional, 14 chiffres |
| address | text | optional, max 200 chars |
| timezone | select | required, default `Europe/Paris` |

**API :** `PATCH /api/settings/establishment` — applique le pattern d'autorisation admin ci-dessus.

---

## Section Équipe

### Liste des membres

**Source de données :** `GET /api/settings/team` retourne les profils de l'établissement joints avec `auth.users` via l'Admin API Supabase (côté serveur uniquement) :

```typescript
// Dans la route API — côté serveur avec service role key
const supabaseAdmin = createClient(url, serviceRoleKey)
const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
// Filtrer sur establishment_id depuis profiles, joindre email + last_sign_in_at depuis users
```

Colonnes affichées : **Membre** (initiale avatar + `profiles.first_name` + `auth.users.email`), **Rôle** (badge coloré), **Statut**, **Dernière connexion** (`last_sign_in_at`), **Action**.

- **Actif** : badge vert — `last_sign_in_at` non null
- **Invitation en attente** : badge amber — `last_sign_in_at` null (invitation envoyée, pas encore acceptée)
- **Action** :
  - Membres actifs : bouton "Retirer" (rouge) — désactive en mettant `establishment_id = null` sur le profil
  - Invitations en attente : "Renvoyer" + "Annuler"
  - **Le dernier admin ne peut pas être retiré** — l'API `DELETE /api/settings/team/[userId]` vérifie qu'il reste au moins un admin après l'opération et retourne 409 sinon.

### Modal d'invitation

Champs :
- **Email** (required, validation format email)
- **Prénom** (required, max 50 chars)
- **Rôle** — boutons visuels `Admin` / `Caissier` (Caissier sélectionné par défaut)

### Flux d'invitation

1. `POST /api/settings/invite` reçoit `{ email, first_name, role }`
2. Vérifie que l'appelant est admin (pattern ci-dessus)
3. Appelle `supabaseAdmin.auth.admin.inviteUserByEmail(email, { data: { first_name, role, establishment_id } })`
4. Supabase envoie un email magique à l'invité
5. L'invité clique le lien → crée son mot de passe
6. Le trigger `handle_new_user` (mis à jour par la migration) lit `raw_user_meta_data` et crée le profil avec `role`, `establishment_id`, `first_name` corrects

### Routes API équipe

- `GET /api/settings/team` — liste membres de l'établissement (Admin API côté serveur)
- `POST /api/settings/invite` — envoie une invitation
- `DELETE /api/settings/team/[userId]` — retire un membre (`establishment_id = null`), bloque si dernier admin
- `POST /api/settings/team/[userId]/resend` — renvoie l'email d'invitation

---

## Section Caisse

| Champ | UI | Défaut |
|-------|-----|--------|
| Fond de caisse par défaut | Input number (€) | 0 |
| Impression auto du ticket | Toggle | off |
| Pied de ticket | Textarea (max 160 chars) | vide |
| TVA par défaut | Select 5.5 / 10 / 20 % | 10% |

**API :** `PATCH /api/settings/caisse` — même pattern que `/api/settings/crm` + garde admin.

---

## Section CRM

Contenu actuel de `settings/page.tsx` déplacé tel quel dans `settings/crm/page.tsx`. Aucun changement fonctionnel. La route `PATCH /api/settings/crm` existante est conservée.

---

## Design system

- Mini-sidebar : `bg-[var(--surface)] border-r border-[var(--border)]`, liens `text-[var(--text3)]`, actif `text-[var(--text1)] bg-[var(--selection-bg)] rounded-lg`
- Cards sections : `rounded-[14px] border border-[var(--border)] bg-[var(--surface)]`
- Badges rôle : Admin = `bg-[#1e3a5f] text-[#93c5fd]`, Caissier = `bg-[#14532d] text-[#4ade80]`
- Statut actif : `text-[var(--green)]` ●, en attente : `text-[var(--amber)]` ⏳

---

## Hors scope

- Facturation / abonnement
- Notifications email/push
- SSO / OAuth
- Permissions granulaires (au-delà de admin/caissier)
- `is_owner` flag — la règle "dernier admin indestructible" suffit
