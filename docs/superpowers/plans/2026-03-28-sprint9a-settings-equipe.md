# Sprint 9a — Settings & Équipe : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un gérant d'administrer son établissement et son équipe (invitation de caissiers) directement depuis l'app, sans passer par la base de données.

**Architecture:** Nested layout `/dashboard/settings/` avec sidebar gauche (établissement / équipe / caisse / crm). Chaque section est un server component qui passe la data à un client form. Les routes API suivent toutes le même pattern d'autorisation admin. L'invitation utilise le Supabase Admin API (service role key côté serveur). La section CRM est simplement déplacée — pas de changement fonctionnel.

**Tech Stack:** Next.js 15 App Router, React, TypeScript, Supabase JS + Admin API (service role), Zod validation, CSS variables design system (var(--surface), var(--blue), etc.)

> **Note pour l'implémenteur :** Avant d'écrire du code Next.js, lire `node_modules/next/dist/docs/`. Les nouvelles colonnes DB ne seront pas dans les types auto-générés Supabase — utiliser `(supabase as any)` comme dans le codebase existant (ex: `src/app/api/settings/crm/route.ts`). La migration SQL doit être appliquée AVANT tout développement (Task 1).

---

## Fichiers touchés

| Action | Fichier | Rôle |
|--------|---------|------|
| Create | `supabase/migrations/20260328000006_sprint9a_settings.sql` | Colonnes établissement, first_name, trigger |
| Create | `src/app/dashboard/settings/layout.tsx` | Nested layout avec SettingsSidebar |
| Modify | `src/app/dashboard/settings/page.tsx` | Redirect → /settings/etablissement |
| Create | `src/app/dashboard/settings/_components/settings-sidebar.tsx` | Client component (usePathname) |
| Create | `src/app/dashboard/settings/etablissement/page.tsx` | Server component → EstablishmentForm |
| Create | `src/app/dashboard/settings/_components/establishment-form.tsx` | Client form PATCH établissement |
| Create | `src/app/dashboard/settings/equipe/page.tsx` | Server component → TeamPageClient |
| Create | `src/app/dashboard/settings/_components/team-page-client.tsx` | Liste membres + bouton InviteModal |
| Create | `src/app/dashboard/settings/_components/invite-modal.tsx` | Modal email + prénom + rôle |
| Create | `src/app/dashboard/settings/caisse/page.tsx` | Server component → CaisseSettingsForm |
| Create | `src/app/dashboard/settings/_components/caisse-settings-form.tsx` | Client form PATCH config caisse |
| Create | `src/app/dashboard/settings/crm/page.tsx` | Contenu actuel de settings/page.tsx déplacé |
| Modify | `src/app/dashboard/settings/_components/crm-settings-form.tsx` | Aucun changement fonctionnel (déjà existant) |
| Create | `src/app/api/settings/establishment/route.ts` | GET + PATCH établissement |
| Create | `src/app/api/settings/caisse/route.ts` | GET + PATCH config caisse |
| Create | `src/app/api/settings/team/route.ts` | GET membres (Admin API) |
| Create | `src/app/api/settings/invite/route.ts` | POST invitation |
| Create | `src/app/api/settings/team/[userId]/route.ts` | DELETE membre |
| Create | `src/app/api/settings/team/[userId]/resend/route.ts` | POST renvoyer invitation |

**Fichiers à lire avant de commencer :**
- `src/app/api/settings/crm/route.ts` (pattern PATCH de référence)
- `src/app/dashboard/settings/page.tsx` (contenu actuel à déplacer)
- `src/app/dashboard/settings/_components/crm-settings-form.tsx` (pattern form existant)
- `src/app/dashboard/layout.tsx` (comprendre la garde existante qui redirige les caissiers)

---

## Pattern d'autorisation admin (toutes les routes API settings)

Copier ce bloc dans CHAQUE route API settings (sauf CRM qui garde son pattern existant) :

```typescript
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

const { data: profile } = await supabase
  .from('profiles').select('role, establishment_id').eq('id', user.id).single()
if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })
if (!['admin', 'super_admin'].includes(profile.role))
  return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
```

---

### Task 1 : Migration SQL

**Fichiers :**
- Create: `supabase/migrations/20260328000006_sprint9a_settings.sql`

> ⚠️ Cette migration doit être appliquée AVANT toute implémentation. Les colonnes n'existent pas encore en production.

- [ ] **Step 1 : Créer la migration**

```sql
-- supabase/migrations/20260328000006_sprint9a_settings.sql

-- 1. Colonnes établissement
alter table public.establishments
  add column if not exists siret                  text,
  add column if not exists address                text,
  add column if not exists timezone               text not null default 'Europe/Paris',
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

- [ ] **Step 2 : Appliquer la migration en production**

Via le dashboard Supabase → SQL Editor, coller et exécuter le contenu ci-dessus.

Ou via CLI (si configuré) :
```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx supabase db push
```

Vérifier dans Supabase Table Editor que les colonnes existent sur `establishments` et `profiles`.

- [ ] **Step 3 : Commit**

```bash
git add supabase/migrations/20260328000006_sprint9a_settings.sql
git commit -m "db: add sprint9a migration (establishment columns, profiles.first_name, trigger fix)"
```

---

### Task 2 : Nested layout Settings + Sidebar + Redirect

**Fichiers :**
- Create: `src/app/dashboard/settings/layout.tsx`
- Modify: `src/app/dashboard/settings/page.tsx`
- Create: `src/app/dashboard/settings/_components/settings-sidebar.tsx`

- [ ] **Step 1 : Créer `settings-sidebar.tsx` (client component)**

```typescript
// src/app/dashboard/settings/_components/settings-sidebar.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/dashboard/settings/etablissement', label: '🏪 Établissement' },
  { href: '/dashboard/settings/equipe',        label: '👥 Équipe' },
  { href: '/dashboard/settings/caisse',        label: '🖥 Caisse' },
  { href: '/dashboard/settings/crm',           label: '📱 CRM' },
]

export function SettingsSidebar() {
  const pathname = usePathname()

  return (
    <nav
      className="w-40 flex-shrink-0 flex flex-col gap-1 py-6 px-3 border-r"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <p className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wider px-2 mb-2">
        Paramètres
      </p>
      {links.map(link => {
        const active = pathname === link.href || pathname.startsWith(link.href + '/')
        return (
          <Link
            key={link.href}
            href={link.href}
            className="px-3 py-2 rounded-lg text-sm transition-colors"
            style={
              active
                ? { background: 'var(--selection-bg)', color: 'var(--text1)', fontWeight: 500 }
                : { color: 'var(--text3)' }
            }
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2 : Créer `src/app/dashboard/settings/layout.tsx`**

```typescript
// src/app/dashboard/settings/layout.tsx
import { SettingsSidebar } from './_components/settings-sidebar'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 min-h-0">
      <SettingsSidebar />
      <main className="flex-1 overflow-y-auto py-8 px-6">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 3 : Modifier `src/app/dashboard/settings/page.tsx` pour faire un redirect**

Remplacer TOUT le contenu par :

```typescript
// src/app/dashboard/settings/page.tsx
import { redirect } from 'next/navigation'

export default function SettingsPage() {
  redirect('/dashboard/settings/etablissement')
}
```

- [ ] **Step 4 : Vérifier la compilation**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5 : Tester en navigation**

Dans le navigateur, aller sur `/dashboard/settings` → doit rediriger vers `/dashboard/settings/etablissement`. La sidebar doit être visible. Le lien actif doit être surligné.

- [ ] **Step 6 : Commit**

```bash
git add src/app/dashboard/settings/layout.tsx src/app/dashboard/settings/page.tsx src/app/dashboard/settings/_components/settings-sidebar.tsx
git commit -m "feat(settings): add nested layout with sidebar navigation"
```

---

### Task 3 : Déplacer la section CRM

**Fichiers :**
- Create: `src/app/dashboard/settings/crm/page.tsx`

Déplacer le contenu actuel de `settings/page.tsx` (avant la modification de la Task 2) dans `settings/crm/page.tsx`. Aucun changement fonctionnel.

- [ ] **Step 1 : Créer `src/app/dashboard/settings/crm/page.tsx`**

Contenu à copier depuis l'ancienne `settings/page.tsx` (qui existait avant de devenir un redirect) :

```typescript
// src/app/dashboard/settings/crm/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CrmSettingsForm } from '../_components/crm-settings-form'

export default async function CrmSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) redirect('/dashboard')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: estab } = await (supabase as any)
    .from('establishments')
    .select('brevo_sender_name, google_review_url, sms_credits')
    .eq('id', profile.establishment_id)
    .single()

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-[var(--text1)] mb-6">CRM & Communications</h1>
      <div
        className="rounded-[14px] overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        <div
          className="px-5 py-3 border-b border-[var(--border)]"
          style={{ background: 'var(--surface2)' }}
        >
          <span
            className="text-sm font-medium px-3 py-1.5 rounded-lg text-white"
            style={{ background: 'var(--blue)' }}
          >
            📱 CRM & Communications
          </span>
        </div>
        <div className="p-5" style={{ background: 'var(--surface)' }}>
          <CrmSettingsForm
            initialSenderName={estab?.brevo_sender_name ?? ''}
            initialReviewUrl={estab?.google_review_url ?? ''}
            smsCredits={estab?.sms_credits ?? 0}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2 : Vérifier la compilation + navigation**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Naviguer vers `/dashboard/settings/crm` → le formulaire CRM existant doit s'afficher avec la sidebar.

- [ ] **Step 3 : Commit**

```bash
git add src/app/dashboard/settings/crm/page.tsx
git commit -m "feat(settings): move CRM settings to /settings/crm"
```

---

### Task 4 : API + Page Établissement

**Fichiers :**
- Create: `src/app/api/settings/establishment/route.ts`
- Create: `src/app/dashboard/settings/etablissement/page.tsx`
- Create: `src/app/dashboard/settings/_components/establishment-form.tsx`

- [ ] **Step 1 : Créer `src/app/api/settings/establishment/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const schema = z.object({
  name:     z.string().min(1).max(80),
  siret:    z.string().regex(/^\d{14}$/, '14 chiffres').optional().or(z.literal('')),
  address:  z.string().max(200).optional(),
  timezone: z.string().min(1),
})

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })
  if (!['admin', 'super_admin'].includes(profile.role))
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('establishments')
    .select('name, siret, address, timezone')
    .eq('id', profile.establishment_id)
    .single()

  return NextResponse.json(data ?? {})
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })
  if (!['admin', 'super_admin'].includes(profile.role))
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const body = schema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('establishments')
    .update({
      name:     body.data.name,
      siret:    body.data.siret || null,
      address:  body.data.address || null,
      timezone: body.data.timezone,
    })
    .eq('id', profile.establishment_id)
    .select('name, siret, address, timezone')
    .single()

  if (error) return NextResponse.json({ error: 'Mise à jour échouée' }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2 : Créer `establishment-form.tsx`**

```typescript
// src/app/dashboard/settings/_components/establishment-form.tsx
'use client'
import { useState } from 'react'

interface Props {
  initialName: string
  initialSiret: string
  initialAddress: string
  initialTimezone: string
}

const TIMEZONES = [
  'Europe/Paris', 'Europe/Brussels', 'Europe/Luxembourg',
  'Europe/Zurich', 'Africa/Casablanca', 'Africa/Tunis',
]

export function EstablishmentForm({ initialName, initialSiret, initialAddress, initialTimezone }: Props) {
  const [name,     setName]     = useState(initialName)
  const [siret,    setSiret]    = useState(initialSiret)
  const [address,  setAddress]  = useState(initialAddress)
  const [timezone, setTimezone] = useState(initialTimezone || 'Europe/Paris')
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleSave() {
    setSaving(true); setError(null); setSaved(false)
    try {
      const res = await fetch('/api/settings/establishment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, siret, address, timezone }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error?.message ?? 'Erreur')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    color: 'var(--text1)', borderRadius: '8px', padding: '8px 12px',
    fontSize: '14px', width: '100%', outline: 'none',
  } as React.CSSProperties

  const labelStyle = {
    display: 'block', fontSize: '12px', fontWeight: 500,
    color: 'var(--text3)', marginBottom: '6px',
  } as React.CSSProperties

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label style={labelStyle}>Nom de l&apos;établissement *</label>
        <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} maxLength={80} />
      </div>
      <div>
        <label style={labelStyle}>SIRET (optionnel)</label>
        <input style={inputStyle} value={siret} onChange={e => setSiret(e.target.value)} placeholder="14 chiffres" maxLength={14} />
      </div>
      <div>
        <label style={labelStyle}>Adresse (optionnel)</label>
        <input style={inputStyle} value={address} onChange={e => setAddress(e.target.value)} maxLength={200} />
      </div>
      <div>
        <label style={labelStyle}>Fuseau horaire *</label>
        <select style={inputStyle} value={timezone} onChange={e => setTimezone(e.target.value)}>
          {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </div>

      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving || !name.trim()}
        className="self-end px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity"
        style={{ background: 'var(--blue)', opacity: saving ? 0.6 : 1 }}
      >
        {saving ? 'Enregistrement…' : saved ? '✓ Enregistré' : 'Enregistrer'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3 : Créer `src/app/dashboard/settings/etablissement/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { EstablishmentForm } from '../_components/establishment-form'

export default async function EtablissementPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) redirect('/dashboard')
  if (!['admin', 'super_admin'].includes(profile.role as string)) redirect('/dashboard')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: estab } = await (supabase as any)
    .from('establishments')
    .select('name, siret, address, timezone')
    .eq('id', profile.establishment_id)
    .single()

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-[var(--text1)] mb-6">Établissement</h1>
      <div
        className="rounded-[14px] p-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <EstablishmentForm
          initialName={estab?.name ?? ''}
          initialSiret={estab?.siret ?? ''}
          initialAddress={estab?.address ?? ''}
          initialTimezone={estab?.timezone ?? 'Europe/Paris'}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4 : Vérifier la compilation + navigation**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Naviguer vers `/dashboard/settings/etablissement` → formulaire visible. Modifier un champ et sauvegarder → vérifier dans Supabase que la valeur est mise à jour.

- [ ] **Step 5 : Commit**

```bash
git add src/app/api/settings/establishment/route.ts src/app/dashboard/settings/etablissement/page.tsx src/app/dashboard/settings/_components/establishment-form.tsx
git commit -m "feat(settings): add establishment settings section"
```

---

### Task 5 : API + Page Caisse

**Fichiers :**
- Create: `src/app/api/settings/caisse/route.ts`
- Create: `src/app/dashboard/settings/caisse/page.tsx`
- Create: `src/app/dashboard/settings/_components/caisse-settings-form.tsx`

- [ ] **Step 1 : Créer `src/app/api/settings/caisse/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const schema = z.object({
  default_opening_float: z.number().min(0).max(9999),
  auto_print_receipt:    z.boolean(),
  receipt_footer:        z.string().max(160),
  default_tva_rate:      z.union([z.literal(5.5), z.literal(10), z.literal(20)]),
})

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })
  if (!['admin', 'super_admin'].includes(profile.role))
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('establishments')
    .select('default_opening_float, auto_print_receipt, receipt_footer, default_tva_rate')
    .eq('id', profile.establishment_id)
    .single()

  return NextResponse.json(data ?? {})
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })
  if (!['admin', 'super_admin'].includes(profile.role))
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const body = schema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('establishments')
    .update(body.data)
    .eq('id', profile.establishment_id)
    .select('default_opening_float, auto_print_receipt, receipt_footer, default_tva_rate')
    .single()

  if (error) return NextResponse.json({ error: 'Mise à jour échouée' }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2 : Créer `caisse-settings-form.tsx`**

```typescript
// src/app/dashboard/settings/_components/caisse-settings-form.tsx
'use client'
import { useState } from 'react'

interface Props {
  initialOpeningFloat: number
  initialAutoPrint: boolean
  initialFooter: string
  initialTvaRate: number
}

export function CaisseSettingsForm({ initialOpeningFloat, initialAutoPrint, initialFooter, initialTvaRate }: Props) {
  const [openingFloat, setOpeningFloat] = useState(initialOpeningFloat)
  const [autoPrint,    setAutoPrint]    = useState(initialAutoPrint)
  const [footer,       setFooter]       = useState(initialFooter)
  const [tvaRate,      setTvaRate]      = useState(initialTvaRate)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  async function handleSave() {
    setSaving(true); setError(null); setSaved(false)
    try {
      const res = await fetch('/api/settings/caisse', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_opening_float: openingFloat,
          auto_print_receipt: autoPrint,
          receipt_footer: footer,
          default_tva_rate: tvaRate,
        }),
      })
      if (!res.ok) throw new Error('Erreur')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Erreur lors de l\'enregistrement')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    color: 'var(--text1)', borderRadius: '8px', padding: '8px 12px',
    fontSize: '14px', outline: 'none',
  } as React.CSSProperties

  const labelStyle = {
    display: 'block', fontSize: '12px', fontWeight: 500,
    color: 'var(--text3)', marginBottom: '6px',
  } as React.CSSProperties

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label style={labelStyle}>Fond de caisse par défaut (€)</label>
        <input
          type="number" min={0} max={9999} step={0.01}
          style={{ ...inputStyle, width: '140px' }}
          value={openingFloat}
          onChange={e => setOpeningFloat(parseFloat(e.target.value) || 0)}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setAutoPrint(!autoPrint)}
          className="relative flex-shrink-0 w-10 h-6 rounded-full transition-colors"
          style={{ background: autoPrint ? 'var(--blue)' : 'var(--surface2)', border: '1px solid var(--border)' }}
          role="switch"
          aria-checked={autoPrint}
        >
          <span
            className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
            style={{
              background: 'white',
              transform: autoPrint ? 'translateX(16px)' : 'translateX(2px)',
            }}
          />
        </button>
        <span className="text-sm text-[var(--text2)]">Impression automatique du ticket</span>
      </div>

      <div>
        <label style={labelStyle}>Pied de ticket (max 160 caractères)</label>
        <textarea
          style={{ ...inputStyle, width: '100%', resize: 'vertical', minHeight: '70px' }}
          value={footer}
          onChange={e => setFooter(e.target.value)}
          maxLength={160}
          placeholder="Ex: Merci de votre visite !"
        />
        <p className="text-xs mt-1" style={{ color: 'var(--text4)' }}>{footer.length}/160</p>
      </div>

      <div>
        <label style={labelStyle}>TVA par défaut</label>
        <div className="flex gap-2">
          {[5.5, 10, 20].map(rate => (
            <button
              key={rate}
              onClick={() => setTvaRate(rate)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={
                tvaRate === rate
                  ? { background: 'var(--blue)', color: 'white' }
                  : { background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }
              }
            >
              {rate}%
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="self-end px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity"
        style={{ background: 'var(--blue)', opacity: saving ? 0.6 : 1 }}
      >
        {saving ? 'Enregistrement…' : saved ? '✓ Enregistré' : 'Enregistrer'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3 : Créer `src/app/dashboard/settings/caisse/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CaisseSettingsForm } from '../_components/caisse-settings-form'

export default async function CaissePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) redirect('/dashboard')
  if (!['admin', 'super_admin'].includes(profile.role as string)) redirect('/dashboard')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: estab } = await (supabase as any)
    .from('establishments')
    .select('default_opening_float, auto_print_receipt, receipt_footer, default_tva_rate')
    .eq('id', profile.establishment_id)
    .single()

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-[var(--text1)] mb-6">Configuration caisse</h1>
      <div
        className="rounded-[14px] p-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <CaisseSettingsForm
          initialOpeningFloat={estab?.default_opening_float ?? 0}
          initialAutoPrint={estab?.auto_print_receipt ?? false}
          initialFooter={estab?.receipt_footer ?? ''}
          initialTvaRate={estab?.default_tva_rate ?? 10}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4 : Vérifier la compilation + navigation**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Naviguer vers `/dashboard/settings/caisse` → formulaire visible. Toggle et enregistrer → vérifier dans Supabase.

- [ ] **Step 5 : Commit**

```bash
git add src/app/api/settings/caisse/route.ts src/app/dashboard/settings/caisse/page.tsx src/app/dashboard/settings/_components/caisse-settings-form.tsx
git commit -m "feat(settings): add caisse settings section"
```

---

### Task 6 : Routes API Équipe (GET + DELETE + resend)

**Fichiers :**
- Create: `src/app/api/settings/team/route.ts`
- Create: `src/app/api/settings/team/[userId]/route.ts`
- Create: `src/app/api/settings/team/[userId]/resend/route.ts`

> Ces routes nécessitent le Supabase Admin API avec la **service role key**. Cette clé est différente de l'anon key. Vérifier qu'elle est dans les variables d'environnement : `SUPABASE_SERVICE_ROLE_KEY` (ou `SUPABASE_SECRET_KEY`). Ne JAMAIS l'exposer côté client.

- [ ] **Step 1 : Créer `src/app/api/settings/team/route.ts` (GET membres)**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })
  if (!['admin', 'super_admin'].includes(profile.role as string))
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  // Récupérer les profils de l'établissement
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profiles } = await (supabase as any)
    .from('profiles')
    .select('id, role, first_name')
    .eq('establishment_id', profile.establishment_id)

  if (!profiles || profiles.length === 0) return NextResponse.json({ members: [] })

  // Joindre avec auth.users via Admin API pour obtenir email + last_sign_in_at
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // listUsers() retourne les 1000 premiers users — suffisant pour les tailles d'équipe actuelles
  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })

  const profileIds = new Set(profiles.map((p: { id: string }) => p.id))
  const usersMap = new Map(users.filter(u => profileIds.has(u.id)).map(u => [u.id, u]))

  const members = profiles.map((p: { id: string; role: string; first_name: string }) => {
    const authUser = usersMap.get(p.id)
    return {
      id:             p.id,
      first_name:     p.first_name,
      email:          authUser?.email ?? '',
      role:           p.role,
      last_sign_in_at: authUser?.last_sign_in_at ?? null,
    }
  })

  return NextResponse.json({ members })
}
```

- [ ] **Step 2 : Créer `src/app/api/settings/team/[userId]/route.ts` (DELETE)**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })
  if (!['admin', 'super_admin'].includes(profile.role as string))
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  // Vérifier que la cible appartient bien à l'établissement
  const { data: target } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', userId).single()
  if (!target || target.establishment_id !== profile.establishment_id)
    return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 })

  // Protection : dernier admin ne peut pas être retiré
  if (['admin', 'super_admin'].includes(target.role as string)) {
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('establishment_id', profile.establishment_id)
      .in('role', ['admin', 'super_admin'])

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'Impossible de retirer le dernier administrateur' },
        { status: 409 }
      )
    }
  }

  // Retirer l'établissement du profil (ne supprime pas le compte)
  const { error } = await supabase
    .from('profiles')
    .update({ establishment_id: null })
    .eq('id', userId)

  if (error) return NextResponse.json({ error: 'Opération échouée' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3 : Créer `src/app/api/settings/team/[userId]/resend/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })
  if (!['admin', 'super_admin'].includes(profile.role as string))
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  // Récupérer l'email de la cible via Admin API
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { user: targetUser }, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (fetchError || !targetUser) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })

  // Renvoyer l'invitation (inviteUserByEmail est idempotent — renvoie le magic link)
  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(targetUser.email!)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4 : Vérifier la compilation**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5 : Commit**

```bash
git add src/app/api/settings/team/ -r
git commit -m "feat(settings): add team API routes (list, remove, resend invite)"
```

---

### Task 7 : Route API Invitation

**Fichiers :**
- Create: `src/app/api/settings/invite/route.ts`

- [ ] **Step 1 : Créer `src/app/api/settings/invite/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const schema = z.object({
  email:      z.string().email(),
  first_name: z.string().min(1).max(50),
  role:       z.enum(['admin', 'caissier']),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })
  if (!['admin', 'super_admin'].includes(profile.role as string))
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const body = schema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // inviteUserByEmail envoie un email magique à l'invité.
  // raw_user_meta_data est lu par le trigger handle_new_user pour créer le profil.
  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(body.data.email, {
    data: {
      first_name:       body.data.first_name,
      role:             body.data.role,
      establishment_id: profile.establishment_id,
    },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 201 })
}
```

- [ ] **Step 2 : Vérifier la compilation**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3 : Commit**

```bash
git add src/app/api/settings/invite/route.ts
git commit -m "feat(settings): add invite API route (Supabase Admin inviteUserByEmail)"
```

---

### Task 8 : Page Équipe — UI (TeamPageClient + InviteModal)

**Fichiers :**
- Create: `src/app/dashboard/settings/equipe/page.tsx`
- Create: `src/app/dashboard/settings/_components/team-page-client.tsx`
- Create: `src/app/dashboard/settings/_components/invite-modal.tsx`

- [ ] **Step 1 : Créer `invite-modal.tsx`**

```typescript
// src/app/dashboard/settings/_components/invite-modal.tsx
'use client'
import { useState } from 'react'

interface Props { onClose: () => void; onSuccess: () => void }

export function InviteModal({ onClose, onSuccess }: Props) {
  const [email,     setEmail]     = useState('')
  const [firstName, setFirstName] = useState('')
  const [role,      setRole]      = useState<'caissier' | 'admin'>('caissier')
  const [sending,   setSending]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  async function handleSend() {
    setSending(true); setError(null)
    try {
      const res = await fetch('/api/settings/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, first_name: firstName, role }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Erreur')
      }
      onSuccess()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSending(false)
    }
  }

  const inputStyle = {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    color: 'var(--text1)', borderRadius: '8px', padding: '8px 12px',
    fontSize: '14px', width: '100%', outline: 'none',
  } as React.CSSProperties

  const labelStyle = {
    display: 'block', fontSize: '12px', fontWeight: 500,
    color: 'var(--text3)', marginBottom: '6px',
  } as React.CSSProperties

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <h2 className="text-base font-semibold text-[var(--text1)] mb-5">Inviter un membre</h2>

        <div className="flex flex-col gap-4">
          <div>
            <label style={labelStyle}>Email *</label>
            <input type="email" style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} placeholder="caissier@example.com" />
          </div>
          <div>
            <label style={labelStyle}>Prénom *</label>
            <input type="text" style={inputStyle} value={firstName} onChange={e => setFirstName(e.target.value)} maxLength={50} placeholder="Marie" />
          </div>
          <div>
            <label style={labelStyle}>Rôle</label>
            <div className="flex gap-2">
              {(['admin', 'caissier'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize"
                  style={
                    role === r
                      ? { background: 'var(--blue)', color: 'white', border: '1px solid var(--blue)' }
                      : { background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }
                  }
                >
                  {r === 'admin' ? 'Admin' : 'Caissier'} {role === r ? '✓' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-sm mt-3" style={{ color: 'var(--red)' }}>{error}</p>}

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm"
            style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
          >
            Annuler
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !email || !firstName}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-opacity"
            style={{ background: 'var(--blue)', opacity: (sending || !email || !firstName) ? 0.5 : 1 }}
          >
            {sending ? 'Envoi…' : '✉ Envoyer l\'invitation'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2 : Créer `team-page-client.tsx`**

```typescript
// src/app/dashboard/settings/_components/team-page-client.tsx
'use client'
import { useState } from 'react'
import { InviteModal } from './invite-modal'

interface Member {
  id:              string
  first_name:      string
  email:           string
  role:            string
  last_sign_in_at: string | null
}

interface Props { initialMembers: Member[] }

function formatLastSeen(date: string | null) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(date))
}

export function TeamPageClient({ initialMembers }: Props) {
  const [members,     setMembers]     = useState<Member[]>(initialMembers)
  const [showInvite,  setShowInvite]  = useState(false)
  const [removing,    setRemoving]    = useState<string | null>(null)
  const [resendings,  setResendings]  = useState<Set<string>>(new Set())

  async function refreshMembers() {
    const res = await fetch('/api/settings/team')
    if (res.ok) {
      const d = await res.json()
      setMembers(d.members ?? [])
    }
  }

  async function handleRemove(memberId: string) {
    if (!confirm('Retirer ce membre de l\'établissement ?')) return
    setRemoving(memberId)
    try {
      const res = await fetch(`/api/settings/team/${memberId}`, { method: 'DELETE' })
      if (res.status === 409) {
        const d = await res.json()
        alert(d.error)
        return
      }
      if (res.ok) await refreshMembers()
    } finally {
      setRemoving(null)
    }
  }

  async function handleResend(memberId: string) {
    setResendings(prev => new Set([...prev, memberId]))
    try {
      await fetch(`/api/settings/team/${memberId}/resend`, { method: 'POST' })
    } finally {
      setResendings(prev => { const s = new Set(prev); s.delete(memberId); return s })
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-[var(--text1)]">
          Équipe · {members.length} membre{members.length !== 1 ? 's' : ''}
        </h1>
        <button
          onClick={() => setShowInvite(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'var(--blue)' }}
        >
          + Inviter
        </button>
      </div>

      <div
        className="rounded-[14px] overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr style={{ background: 'var(--surface2)', color: 'var(--text4)', fontSize: '11px' }}>
              <th className="px-4 py-3 text-left font-medium uppercase tracking-wider">Membre</th>
              <th className="px-4 py-3 text-left font-medium uppercase tracking-wider">Rôle</th>
              <th className="px-4 py-3 text-left font-medium uppercase tracking-wider">Statut</th>
              <th className="px-4 py-3 text-left font-medium uppercase tracking-wider">Dernière connexion</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => {
              const isActive  = !!m.last_sign_in_at
              const isPending = !m.last_sign_in_at
              const initial   = (m.first_name?.[0] ?? m.email[0] ?? '?').toUpperCase()
              return (
                <tr key={m.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, background: 'var(--surface)' }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                        style={{ background: isActive ? 'var(--blue)' : 'var(--surface2)', color: isActive ? 'white' : 'var(--text4)' }}
                      >
                        {initial}
                      </div>
                      <div>
                        <p className="font-medium text-[var(--text1)]">{m.first_name || '—'}</p>
                        <p className="text-xs text-[var(--text4)]">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={
                        ['admin', 'super_admin'].includes(m.role)
                          ? { background: '#1e3a5f', color: '#93c5fd' }
                          : { background: '#14532d', color: '#4ade80' }
                      }
                    >
                      {['admin', 'super_admin'].includes(m.role) ? 'Admin' : 'Caissier'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isActive
                      ? <span style={{ color: 'var(--green)', fontSize: '13px' }}>● Actif</span>
                      : <span style={{ color: 'var(--amber)', fontSize: '13px' }}>⏳ Invitation envoyée</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text4)]">
                    {formatLastSeen(m.last_sign_in_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isActive && (
                      <button
                        onClick={() => handleRemove(m.id)}
                        disabled={removing === m.id}
                        className="text-xs font-medium transition-opacity"
                        style={{ color: 'var(--red)', opacity: removing === m.id ? 0.5 : 1 }}
                      >
                        {removing === m.id ? '…' : 'Retirer'}
                      </button>
                    )}
                    {isPending && (
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => handleResend(m.id)}
                          disabled={resendings.has(m.id)}
                          className="text-xs text-[var(--text4)] hover:text-[var(--text2)] transition-colors"
                        >
                          {resendings.has(m.id) ? 'Envoi…' : 'Renvoyer'}
                        </button>
                        <span style={{ color: 'var(--border)' }}>·</span>
                        <button
                          onClick={() => handleRemove(m.id)}
                          className="text-xs text-[var(--text4)] hover:text-[var(--red)] transition-colors"
                        >
                          Annuler
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSuccess={async () => {
            setShowInvite(false)
            await refreshMembers()
          }}
        />
      )}
    </>
  )
}
```

- [ ] **Step 3 : Créer `src/app/dashboard/settings/equipe/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { TeamPageClient } from '../_components/team-page-client'

export default async function EquipePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) redirect('/dashboard')
  if (!['admin', 'super_admin'].includes(profile.role as string)) redirect('/dashboard')

  // Charger les membres côté serveur pour le SSR initial (même logique que GET /api/settings/team)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profiles } = await (supabase as any)
    .from('profiles')
    .select('id, role, first_name')
    .eq('establishment_id', profile.establishment_id)

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  const profileIds = new Set((profiles ?? []).map((p: { id: string }) => p.id))
  const usersMap   = new Map(users.filter(u => profileIds.has(u.id)).map(u => [u.id, u]))

  const members = (profiles ?? []).map((p: { id: string; role: string; first_name: string }) => {
    const authUser = usersMap.get(p.id)
    return {
      id:              p.id,
      first_name:      p.first_name,
      email:           authUser?.email ?? '',
      role:            p.role,
      last_sign_in_at: authUser?.last_sign_in_at ?? null,
    }
  })

  return (
    <div className="max-w-3xl">
      <TeamPageClient initialMembers={members} />
    </div>
  )
}
```

- [ ] **Step 4 : Vérifier la compilation**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5 : Vérifier le build complet**

```bash
npm run build 2>&1 | tail -20
```

Attendu : Build réussi.

- [ ] **Step 6 : Test manuel complet**

1. Naviguer vers `/dashboard/settings/equipe` → tableau des membres visible
2. Cliquer `+ Inviter` → modal s'ouvre
3. Remplir email + prénom + rôle Caissier → `Envoyer l'invitation`
4. Vérifier dans Supabase Auth → l'email apparaît dans la liste des users
5. Le membre apparaît dans la liste avec statut "⏳ Invitation envoyée"
6. Cliquer "Renvoyer" → pas d'erreur
7. Cliquer "Annuler" → le membre est retiré de la liste

- [ ] **Step 7 : Commit**

```bash
git add src/app/dashboard/settings/equipe/ -r src/app/dashboard/settings/_components/team-page-client.tsx src/app/dashboard/settings/_components/invite-modal.tsx
git commit -m "feat(settings): add team management section with invite modal"
```

---

### Task 9 : Build final + vérification end-to-end

- [ ] **Step 1 : Build production**

```bash
npm run build 2>&1 | tail -30
```

Attendu : Aucune erreur de build.

- [ ] **Step 2 : Vérification TypeScript complète**

```bash
npx tsc --noEmit 2>&1
```

Attendu : 0 erreur.

- [ ] **Step 3 : Test end-to-end navigation settings**

1. `/dashboard/settings` → redirect vers `/settings/etablissement` ✓
2. Sidebar visible, lien actif surligné ✓
3. `/dashboard/settings/etablissement` → formulaire ✓
4. `/dashboard/settings/caisse` → formulaire caisse ✓
5. `/dashboard/settings/crm` → formulaire CRM existant ✓
6. `/dashboard/settings/equipe` → liste membres ✓
7. Inviter un caissier → email reçu → l'invité crée son mot de passe → profil créé avec bon role + establishment_id ✓

- [ ] **Step 4 : Commit final**

```bash
git add -A
git commit -m "feat(sprint9a): complete settings & team management — establish/team/caisse/crm"
```
