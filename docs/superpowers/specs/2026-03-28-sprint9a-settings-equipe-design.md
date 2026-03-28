# Sprint 9a — Settings & Équipe : Design Spec

## Objectif

Permettre à un gérant d'administrer son établissement et son équipe directement depuis l'app, sans passer par la base de données. Aujourd'hui, onboarder un caissier exige une manipulation SQL manuelle — c'est un bloquant opérationnel.

## Architecture

### Layout nested

`/dashboard/settings/` utilise un nested layout (`layout.tsx`) avec un mini-sidebar gauche fixe (160px) et une zone de contenu principale. Pattern identique au sidebar principal mais à l'échelle de la section Settings.

**Routes :**
- `/dashboard/settings/etablissement` — informations du commerce
- `/dashboard/settings/equipe` — gestion des membres
- `/dashboard/settings/caisse` — configuration caisse
- `/dashboard/settings/crm` — existant, déplacé depuis `/dashboard/settings`

**Redirect :** `/dashboard/settings` redirige vers `/dashboard/settings/etablissement`.

**Accès :** Admins et super_admins uniquement. Les caissiers sont déjà redirigés vers `/caisse/pos` au niveau du dashboard layout — pas de garde supplémentaire nécessaire.

### Structure fichiers

```
src/app/dashboard/settings/
├── layout.tsx                          ← nouveau nested layout + mini-sidebar
├── page.tsx                            ← redirect → /settings/etablissement
├── etablissement/
│   └── page.tsx                        ← form établissement (server component)
├── equipe/
│   └── page.tsx                        ← liste membres + invitations
├── caisse/
│   └── page.tsx                        ← config caisse
├── crm/
│   └── page.tsx                        ← contenu actuel de settings/page.tsx déplacé
└── _components/
    ├── settings-sidebar.tsx            ← mini-nav avec 4 liens
    ├── establishment-form.tsx          ← formulaire établissement (client)
    ├── team-page-client.tsx            ← liste membres + modal invite (client)
    ├── invite-modal.tsx                ← modal invitation
    └── caisse-settings-form.tsx        ← formulaire config caisse (client)
```

---

## Section Établissement

### Données

Formulaire PATCH sur la table `establishments` :

| Champ | Type | Contrainte |
|-------|------|-----------|
| name | text | required, max 80 chars |
| siret | text | optional, 14 chiffres |
| address | text | optional, max 200 chars |
| timezone | select | required, default `Europe/Paris` |

### API

`PATCH /api/settings/establishment` — met à jour `establishments` où `id = profile.establishment_id`. Vérifie que l'utilisateur est admin de cet établissement.

---

## Section Équipe

### Liste des membres

Tableau avec colonnes : **Membre** (avatar initiale + nom + email), **Rôle** (badge coloré), **Statut** (actif / invitation en attente), **Dernière connexion**, **Action**.

- **Actif** : badge vert — utilisateur a accepté l'invitation et s'est connecté
- **Invitation en attente** : badge amber — `invited_at` présent, `last_sign_in_at` null
- **Action** : "Retirer" (rouge) pour les membres actifs, "Renvoyer · Annuler" pour les invitations en attente. Le propriétaire (premier admin) ne peut pas être retiré.

Données : `SELECT id, email, raw_user_meta_data->>'first_name', last_sign_in_at FROM auth.users` joint avec `profiles (role, establishment_id)`.

### Modal d'invitation

Champs :
- **Email** (required, validation email)
- **Prénom** (required, max 50 chars) — pré-rempli dans le profil à la création
- **Rôle** — boutons visuels Admin / Caissier (Caissier sélectionné par défaut)

Action : `POST /api/settings/invite`

### Flux d'invitation technique

1. `POST /api/settings/invite` reçoit `{ email, first_name, role }`
2. Vérifie que l'appelant est admin de son établissement
3. Appelle `supabase.auth.admin.inviteUserByEmail(email, { data: { first_name, role, establishment_id } })`
4. Supabase envoie un email magique à l'invité
5. L'invité clique le lien → page `/auth/confirm` → définit son mot de passe
6. Un trigger Supabase `on auth.users insert` crée automatiquement le profil avec `role` et `establishment_id` depuis `raw_user_meta_data`

**Trigger existant :** vérifier si `handle_new_user` dans les migrations lit déjà `raw_user_meta_data`. Si oui, il suffit de passer les métadonnées dans `inviteUserByEmail`. Si non, le trigger doit être étendu.

### API routes équipe

- `GET /api/settings/team` — liste des membres de l'établissement
- `POST /api/settings/invite` — invite un utilisateur
- `DELETE /api/settings/team/[userId]` — retire un membre (met `establishment_id = null` sur le profil)
- `POST /api/settings/team/[userId]/resend` — renvoie l'invitation

---

## Section Caisse

Formulaire PATCH sur `establishments` (colonnes JSONB ou colonnes dédiées) :

| Champ | UI | Valeur par défaut |
|-------|-----|------------------|
| Fond de caisse par défaut | Input number (€) | 0 |
| Impression auto du ticket | Toggle on/off | off |
| Pied de ticket | Textarea (max 160 chars) | vide |
| TVA par défaut | Select 5.5% / 10% / 20% | 10% |

**Stockage :** colonnes dédiées sur `establishments` — `default_opening_float numeric`, `auto_print_receipt boolean`, `receipt_footer text`, `default_tva_rate numeric`. Migration nécessaire.

**API :** `PATCH /api/settings/caisse` — même pattern que `/api/settings/crm` existant.

---

## Section CRM

Contenu actuel de `settings/page.tsx` déplacé tel quel dans `settings/crm/page.tsx`. Aucun changement fonctionnel.

---

## Design system

- Mini-sidebar settings : `background: var(--surface)`, liens `text-[var(--text3)]`, actif `text-[var(--text1)] bg-[var(--selection-bg)]`
- Cards sections : `rounded-[14px] border border-[var(--border)] bg-[var(--surface)]`
- Badges rôle : Admin = `bg-[#1e3a5f] text-[#93c5fd]`, Caissier = `bg-[#14532d] text-[#4ade80]`
- Statut actif : `text-[var(--green)]`, en attente : `text-[var(--amber)]`

---

## Hors scope

- Facturation / abonnement
- Notifications email/push
- SSO / OAuth
- Permissions granulaires (au-delà de admin/caissier)
- Désactivation d'un compte (soft delete) — "Retirer" suffit pour l'instant
