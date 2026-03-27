# Sprint 9 — Paramètres & Gestion Équipe : Design Spec

**Date:** 2026-03-27
**Sprint:** 9 — Back-office admin

---

## Objective

Give restaurant owners and managers a self-service configuration hub so they can set up their establishment, manage their staff, and tune the POS experience — without requiring support intervention. This is a critical SaaS retention feature: the faster an owner can onboard a new employee or adjust their ticket footer, the stickier the product becomes.

---

## Architecture

Settings live under `/dashboard/settings` as a full-page section within the existing dashboard shell (sidebar + topbar unchanged). Inside the settings page, a **vertical sub-navigation** on the left drives four tabs: Établissement, Équipe, Caisse, Compte. This avoids nested routes that complicate the Next.js layout tree — a single route with a `?tab=` query param is sufficient for v1.

The tab content renders as a scrollable panel to the right of the sub-nav. Cards group related settings. Save buttons are per-section (not global) to reduce accidental overwrites and keep the feedback loop tight.

---

## Data Model

### `establishments` table (extends existing)

New columns to add:

| Column | Type | Notes |
|---|---|---|
| `phone` | `text` | Tel de contact |
| `email` | `text` | Email public de l'enseigne |
| `logo_url` | `text` | URL Supabase Storage |
| `address` | `text` | Adresse postale |
| `settings` | `jsonb` | Bag of POS config (see below) |

The `settings` JSONB column avoids schema migrations for every new toggle. Shape:

```json
{
  "tva_default": 10,
  "currency": "EUR",
  "print_ticket": true,
  "email_receipt": false,
  "schedule": {
    "mon": { "open": true, "from": "08:00", "to": "20:00" },
    "tue": { "open": true, "from": "08:00", "to": "20:00" },
    "sun": { "open": false }
  },
  "caisse": {
    "auto_close": true,
    "auto_close_time": "23:30",
    "low_cash_alert": true,
    "low_cash_threshold": 50,
    "payments": { "cash": true, "card": true, "ticket_resto": false },
    "receipt_header": "...",
    "receipt_footer": "...",
    "receipt_qr": true,
    "receipt_logo": true,
    "tips_enabled": true,
    "tips_rates": [5, 10, 15, 20]
  }
}
```

### `profiles` table (existing, no new columns needed)

Uses `role` (`admin | manager | caissier`), `establishment_id`, `full_name`, and `email` (from `auth.users`). A boolean `is_active` column should be added to support disabling members without deleting the account.

### Invitations

Supabase provides `supabase.auth.admin.inviteUserByEmail()`. On acceptance, a trigger (or server action) writes the profile row with the pre-assigned role. No custom invitations table needed for v1.

---

## Role Restrictions

| Action | Admin | Manager | Caissier |
|---|---|---|---|
| View Settings | Yes | Yes | No |
| Edit Établissement | Yes | Yes | No |
| Edit Caisse config | Yes | Yes | No |
| View Équipe | Yes | Yes | No |
| Invite / modify team | Yes | No | No |
| Deactivate members | Yes | No | No |
| Edit own Compte | Yes | Yes | Yes |

Route guard: server-side check in the settings layout — caissiers are redirected to `/dashboard`. Within the Équipe tab, admin-only actions (invite, deactivate) are hidden for managers via conditional rendering.

---

## Scope — v1

**In:**
- Établissement: name, address, phone, email, logo upload, default TVA, currency, toggles, schedule
- Équipe: list members, invite by email, change role, activate/deactivate
- Caisse: session management, payment methods, receipt customization, tips
- Compte: read-only profile display (name, email, role) — password change via Supabase magic link

**Out (post-v1):**
- Multi-establishment switching from settings
- Custom roles or granular permissions
- Audit log of settings changes
- Scheduled hours exceptions (holidays)
- SMS notifications
- Accounting integrations
