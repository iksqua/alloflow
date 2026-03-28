# Franchiseur Onboarding — Design Spec

## Goal

Allow a franchise network owner (franchiseur) to self-register on Alloflow via a public `/register` page, creating their account, their siege organization, and their `franchise_admin` profile in a single flow — without any manual intervention from Alloflow staff.

## Architecture

### New files

| File | Role |
|------|------|
| `src/app/(auth)/register/page.tsx` | Public registration page (email, password, network name) |
| `src/app/api/auth/register-franchise/route.ts` | POST endpoint — creates org + user atomically |

### Modified files

| File | Change |
|------|--------|
| `src/app/(auth)/login/page.tsx` | Add role-aware redirect + "Créer un réseau" link |
| `src/middleware.ts` | Rate-limit `POST /api/auth/register-franchise` |

---

## Registration Page `/register`

Server-rendered page (same layout group as `/login`, dark theme, no sidebar).

Form fields:
- **Nom du réseau** — text, required, 2–80 chars (becomes `organizations.name`)
- **Email** — email, required
- **Mot de passe** — password, required, min 8 chars

On submit:
1. `POST /api/auth/register-franchise` with `{ networkName, email, password }`
2. On success → `supabase.auth.signInWithPassword({ email, password })`
3. Redirect to `/dashboard/franchise/command-center`

Error states:
- Email already in use → "Un compte existe déjà avec cet email"
- Validation errors → inline field errors
- Server error → generic "Erreur lors de la création du compte"

A link at the bottom: "Déjà un compte ? Se connecter →" pointing to `/login`.

---

## API Route `POST /api/auth/register-franchise`

No authentication required (public endpoint). Rate-limited via middleware.

### Request body (Zod)

```typescript
z.object({
  networkName: z.string().min(2).max(80),
  email:       z.string().email(),
  password:    z.string().min(8),
})
```

### Sequence

1. **Create organization** via `supabaseAdmin`:
   ```sql
   INSERT INTO organizations (name, type) VALUES (networkName, 'siege') RETURNING id
   ```

2. **Create user** via `supabaseAdmin.auth.admin.createUser`:
   ```typescript
   {
     email,
     password,
     email_confirm: true,       // no verification email for now
     user_metadata: {
       role:   'franchise_admin',
       org_id: org.id,
     }
   }
   ```
   The `handle_new_user` trigger fires synchronously and creates the profile with `role='franchise_admin'` and `org_id` set correctly. No separate profile upsert needed.

3. **Error handling**: if user creation fails after org was created, delete the orphaned org.

4. Return `{ ok: true }`.

### Responses

| Status | Meaning |
|--------|---------|
| 201 | Account + org created successfully |
| 422 | Validation error |
| 409 | Email already registered |
| 429 | Rate limit exceeded |
| 500 | Server error |

---

## Login Redirect — Role-Aware

Currently `/login` always redirects to `/dashboard/products`. After sign-in, fetch the profile role and redirect accordingly:

- `franchise_admin` → `/dashboard/franchise/command-center`
- `admin` / `caissier` → `/dashboard/products`

This applies to both the existing login flow and the post-registration sign-in.

### Implementation

After `supabase.auth.signInWithPassword` succeeds, call `supabase.from('profiles').select('role').eq('id', user.id).single()` and branch on `profile.role`.

---

## Rate Limiting

In `src/middleware.ts`, add a simple check on `POST /api/auth/register-franchise`: if more than 5 requests from the same IP in 1 minute, return 429. Use Next.js middleware with an in-memory counter (sufficient for MVP — can upgrade to Upstash Redis later).

---

## Login Page — "Créer un réseau" Link

Add a discreet link below the sign-in button:

```
Vous êtes franchiseur ? Créer votre réseau →
```

Pointing to `/register`.

---

## What This Does NOT Cover

- Email verification (franchise admin is auto-confirmed — to be revisited in a future sprint)
- Billing / subscription setup
- Onboarding wizard (add establishments, invite franchisees) — handled post-registration from the existing dashboard
- Super-admin management interface

---

## Testing

- `POST /api/auth/register-franchise` with valid body → 201, org + profile exist in DB
- `POST /api/auth/register-franchise` with duplicate email → 409
- `POST /api/auth/register-franchise` with invalid body → 422
- Login as `franchise_admin` → lands on `/dashboard/franchise/command-center`
- Login as `admin` → lands on `/dashboard/products`
