# Sprint 9 — Paramètres & Gestion Équipe : Implementation Plan

**Date:** 2026-03-27
**Spec:** `docs/superpowers/specs/2026-03-27-sprint9-settings-design.md`
**Mockups:** `.superpowers/brainstorm/master-mockups/s9-settings-*.html`

---

## Task 1 — Settings layout & sub-navigation

**Goal:** Create `/dashboard/settings` with a persistent vertical sub-nav (Établissement / Équipe / Caisse / Compte) driven by `?tab=` query param.

### Files
- `app/dashboard/settings/page.tsx` — settings page shell
- `app/dashboard/settings/layout.tsx` — (optional) can reuse the dashboard layout
- `components/settings/SettingsNav.tsx` — left vertical tab list

### Steps

1. Create `app/dashboard/settings/page.tsx`. Read `searchParams.tab` (default `etablissement`). Render `<SettingsNav activeTab={tab} />` and the matching panel component.
2. Create `components/settings/SettingsNav.tsx`. Array of `{ id, label, icon }` tabs. Each renders as a `<Link href={/dashboard/settings?tab=...}>` styled as `.settings-tab` per the mockup. Active state detected via prop.
3. Wire the `⚙️ Paramètres` sidebar nav item (already present) to `/dashboard/settings`.
4. Apply layout styles from the mockup: `display:flex; gap:20px` content area, 180px nav, flex-1 panel. Use Tailwind or CSS module consistent with the rest of the dashboard.

### Test
- Navigate to `/dashboard/settings` — shows Établissement tab by default.
- Click each tab — URL updates, panel swaps, no full reload.

### Commit
`feat: settings page shell with vertical sub-navigation`

---

## Task 2 — Établissement form

**Goal:** Let admin/manager read and update establishment info and schedule, persisted to Supabase.

### Files
- `components/settings/EtablissementPanel.tsx`
- `app/actions/settings.ts` — server actions
- Supabase migration: add `phone`, `email`, `address`, `logo_url`, `settings` (jsonb) to `establishments`

### Steps

1. **Migration** — Create `supabase/migrations/YYYYMMDD_settings_columns.sql`:
   ```sql
   ALTER TABLE establishments
     ADD COLUMN IF NOT EXISTS phone text,
     ADD COLUMN IF NOT EXISTS email text,
     ADD COLUMN IF NOT EXISTS address text,
     ADD COLUMN IF NOT EXISTS logo_url text,
     ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}';
   ```

2. **Server action `updateEstablishment`** in `app/actions/settings.ts`:
   - Validates `establishment_id` belongs to the calling user's session.
   - Calls `supabase.from('establishments').update({...}).eq('id', establishmentId)`.
   - Returns `{ error }`.

3. **`EtablissementPanel`** — controlled form with React state mirroring the DB row. On mount, `useEffect` fetches the establishment row. On submit, calls `updateEstablishment`. Shows a toast on success/error.

4. **Logo upload** — Use `supabase.storage.from('logos').upload(...)`. Store the public URL in `logo_url`. Drag-drop zone styled per mockup.

5. **Schedule section** — days as an array, each with `{ open: boolean, from: string, to: string }`. Stored inside the `settings` JSONB under `schedule`.

6. **TVA / currency / toggles** — stored in `settings.tva_default`, `settings.currency`, `settings.print_ticket`, `settings.email_receipt`.

### Test
- Fill form, save, refresh — values persist.
- Logo uploads to Storage, URL stored, preview renders.
- Closing a day hides time inputs and saves `open: false`.

### Commit
`feat: établissement settings form with Supabase persistence`

---

## Task 3 — Gestion Équipe

**Goal:** List team members, invite by email via Supabase Auth, change roles, activate/deactivate.

### Files
- `components/settings/EquipePanel.tsx`
- `components/settings/InviteForm.tsx`
- `app/actions/team.ts` — server actions
- Supabase migration: add `is_active boolean` to `profiles`

### Steps

1. **Migration** — add `is_active` column:
   ```sql
   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
   ```

2. **List query** — fetch `profiles` where `establishment_id = currentEstablishment` ordered by `created_at`. Include `email` via join on `auth.users` or store it denormalized on the profile at invite time.

3. **Stats row** — derived client-side from the profiles array: total active, count by role.

4. **`InviteForm`** — email + role select. Server action `inviteTeamMember`:
   ```ts
   // app/actions/team.ts
   await supabase.auth.admin.inviteUserByEmail(email, {
     data: { role, establishment_id: currentEstablishmentId }
   })
   ```
   A `handle_new_user` Supabase trigger (or a webhook) should insert a `profiles` row using `new.raw_user_meta_data` when the user accepts. If the trigger already exists from auth setup, extend it; otherwise create it.

5. **Change role** — `updateProfileRole(profileId, newRole)` server action, updates `profiles.role`. Only callable by admin (checked server-side via session role).

6. **Deactivate / Reactivate** — `setProfileActive(profileId, isActive)` toggles `is_active`. Does not delete the auth user. Deactivated users should be caught by a Supabase RLS policy or middleware check at login.

7. **Pending invitations** — Supabase doesn't expose pending invites easily in the client SDK. For v1: show invited users whose profile exists but `auth.users.last_sign_in_at IS NULL`. Badge them as "Invité".

8. **Role badges and avatar** — initials from `full_name`, color by role (purple admin, blue manager, green caissier) per mockup.

### Test
- Invite a real email — user receives Supabase invite email, clicks link, profile row appears.
- Change role from caissier to manager — badge updates, persists on refresh.
- Deactivate a member — status badge goes to "Inactif", user cannot log in (test RLS).

### Commit
`feat: team management — invite, roles, activate/deactivate`

---

## Task 4 — Caisse config

**Goal:** Persist all POS configuration in `establishments.settings` JSONB.

### Files
- `components/settings/CaissePanel.tsx`
- Reuses `app/actions/settings.ts` (`updateEstablishmentSettings`)

### Steps

1. **Server action `updateCaisseSettings`** — merges the caisse sub-object into `settings` JSONB using Postgres `jsonb_set` or a full replace:
   ```sql
   UPDATE establishments
   SET settings = settings || '{"caisse": ...}'::jsonb
   WHERE id = $1
   ```
   Or simply fetch → merge in JS → write back.

2. **`CaissePanel`** — four card sections per mockup:
   - Sessions: auto_close toggle + time input, low_cash_alert toggle + threshold input.
   - Paiements: three toggles (cash, card, ticket_resto).
   - Ticket: header textarea, footer textarea, qr toggle, logo toggle.
   - Pourboire: tips_enabled toggle, chip array for rates (pre-defined + custom add).

3. Tip chips are stored as `tips_rates: number[]`. Adding a custom rate opens a small inline input.

4. All toggles are controlled boolean state derived from `settings.caisse` on mount.

5. Single save button at the bottom of the panel writes the full caisse sub-object.

### Test
- Toggle espèces off, save, refresh — stays off.
- Change receipt header text, save — reflected in ticket preview (if ticket preview exists) or confirmed via DB.
- Tip rates: add 25%, save, refresh — chip appears with new rate.

### Commit
`feat: caisse configuration panel with JSONB persistence`

---

## Task 5 — Route guard (role-based access)

**Goal:** Prevent caissiers from accessing the settings section at all.

### Files
- `middleware.ts` (existing, extend) OR `app/dashboard/settings/layout.tsx`

### Steps

1. In `app/dashboard/settings/layout.tsx`, fetch the current user's profile server-side:
   ```ts
   const { data: profile } = await supabase
     .from('profiles')
     .select('role')
     .eq('user_id', user.id)
     .single()

   if (profile?.role === 'caissier') {
     redirect('/dashboard')
   }
   ```

2. Within `EquipePanel`, additionally check `profile.role === 'admin'` before rendering invite form and deactivate buttons. Managers see the list but not the mutating actions.

3. Server actions (`inviteTeamMember`, `setProfileActive`, `updateProfileRole`) must re-verify role server-side and return `{ error: 'Unauthorized' }` if called by a non-admin — never trust client-only guards.

### Test
- Log in as caissier, navigate to `/dashboard/settings` — redirected to `/dashboard`.
- Log in as manager, open Équipe tab — invite form and deactivate buttons are absent.
- Log in as admin — full access confirmed.

### Commit
`feat: settings route guard and server-side role enforcement`
