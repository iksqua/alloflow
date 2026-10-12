# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

# Alloflow — Agent Instructions

## 1. Superpowers (obligatoire)
- Invoquer `using-superpowers` au début de **chaque** tâche, même petite.
- Si la tâche touche du code existant : `systematic-debugging` avant tout fix.
- Si la tâche crée quelque chose : `brainstorming` → `writing-plans` → `subagent-driven-development`.
- Auto-amélioration : après chaque tâche non triviale, proposer une mise à jour de ce fichier ou des skills si une meilleure pratique émerge.

## 2. Stack & Architecture
- **Next.js 16 App Router** · **TypeScript strict** · **Supabase** · **Tailwind 4** · **Vercel**
- Pattern obligatoire : `page.tsx` (SSR) → `*-page-client.tsx` (shell) → `_components/`
- Composants serveur par défaut ; `'use client'` seulement si nécessaire.
- Lire `node_modules/next/dist/docs/` avant d'écrire du code Next.js.
- Alias `@` → `src/` (configuré dans `tsconfig.json` et `vitest.config.ts`).

## 3. Commandes clés
```bash
npm run dev          # Dev local
npm run build        # Build production
npm run test         # Vitest (watch)
npm run test:run     # Vitest CI (une passe)
npx vitest run path/to/file.test.ts        # Un seul fichier de test
npx vitest run -t "nom du test"            # Un seul test par nom
npm run test:e2e     # Playwright E2E (nécessite .env.test + serveur live)
npx tsc --noEmit     # Vérification TypeScript
npx supabase db push # Appliquer migrations
supabase db diff     # Vérifier diff avant push
```

## 4. UI & Thème
- **CSS vars uniquement** — jamais de couleurs hardcodées.
- `--bg` `--surface` `--surface2` `--border` `--text1`→`--text4` `--blue` `--overlay-bg`
- Cards : `style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}`
- Modal overlay : `style={{ background: 'var(--overlay-bg)' }}` · shell : `rounded-xl`
- Inputs (dans modals) : `style={{ background: 'var(--surface2)' }}`
- Labels : `text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5`
- **Ne jamais ajouter d'offset sidebar dans les pages** — `layout.tsx` applique `md:ml-[60px] lg:ml-[220px]` (responsive) + `paddingTop: 48px` + `p-6`.

## 5. Base de données & Sécurité
- Toujours filtrer par `establishment_id` (sauf `franchise_admin` / `super_admin`).
- Profils : table `profiles`. Prix DB : **HT** (`price`). TTC calculé à l'affichage et à la soumission.
- TVA : 3 taux possibles — `5.5`, `10`, `20`. Calcul : `ttc = r2(ht * (1 + tva/100))`.
- Jamais de mock DB dans les tests — risque de divergence silencieuse avec la prod.
- Supabase project ref : `vblxzfsddxhtthycsmim`

### Trois clients Supabase — choisir le bon
| Client | Fichier | Quand l'utiliser |
|--------|---------|-----------------|
| Server (SSR) | `@/lib/supabase/server` | Server Components, Route Handlers, Layouts — lit les cookies de session |
| Browser | `@/lib/supabase/client` | Client Components (`'use client'`) uniquement |
| Service | `@/lib/supabase/service` | **Contourne la RLS** — réservé aux opérations admin côté serveur (webhooks, automation) |

## 6. Pattern API Route
Chaque Route Handler suit ce squelette :
1. `createClient()` depuis `@/lib/supabase/server`
2. `supabase.auth.getUser()` → 401 si absent
3. Lecture du profil (`profiles`) → récupérer `establishment_id` et `role`
4. Toutes les requêtes DB filtrées par `establishment_id`
5. Validation du body avec Zod avant toute écriture

```ts
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const { data: profile } = await supabase.from('profiles').select('establishment_id, role').eq('id', user.id).single()
```

## 7. Tests (Vitest + jsdom)
- Fichiers de test : `*.test.ts` / `*.test.tsx` colocalisés avec leur source.
- Environnement jsdom, globals activés, cleanup automatique après chaque test.
- Mocking du client Supabase — toujours en tête de fichier :
```ts
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'
// puis dans le test :
;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({ auth: ..., from: ... })
```
- Tests de logique pure (calculs, validations) : pas de mock nécessaire — importer directement la fonction.

## 8. Rôles utilisateurs
| Rôle | Accès |
|------|-------|
| `caissier` | `/caisse/pos` uniquement |
| `admin` | Dashboard établissement complet |
| `super_admin` | Remboursements, produits globaux |
| `franchise_admin` | `/dashboard/franchise/*`, multi-sites — le layout dashboard ne lui injecte **pas** de sidebar |

## 9. Debugging avec MCPs (l'agent fait le boulot)
- **Reproduire d'abord** : utiliser Playwright MCP pour ouvrir le navigateur, naviguer, cliquer, capturer l'erreur — avant de toucher au code.
- **Inspecter la DB** : MCP Supabase pour lire le schéma, les données réelles et les logs avant tout fix.
- **Vérifier le deploy** : MCP Vercel pour consulter les logs de build/runtime en cas d'erreur prod.
- Si erreur TypeScript : `npx tsc --noEmit` exhaustif avant de commit.
- Si migration : `supabase db diff` avant `supabase db push`.
- Tokens MCP expirés → régénérer sur dashboard.supabase.com/account/tokens.
- **Après chaque bug corrigé manuellement** : mettre à jour ce fichier ou le skill concerné avec la leçon apprise.

## 10. Interdictions
- Pas de `console.log` en production.
- Pas de `any` TypeScript sans commentaire justificatif.
- Pas de feature flags ni shims de compatibilité.
- Pas de padding/margin compensant la sidebar dans les pages.
- Pas d'estimation de temps.

## 11. Architecture Marchandise

Page `/dashboard/marchandise` (4 onglets) remplace `/dashboard/stocks` + `/dashboard/recettes`.

| Onglet | Composant | Table(s) principale(s) |
|--------|-----------|------------------------|
| 📦 Marchandise | `tab-marchandise.tsx` | `stock_items` |
| 🍳 Recettes | `tab-recettes.tsx` | `recipes`, `recipe_ingredients`, `sops` |
| 🛒 En vente | `tab-en-vente.tsx` | `stock_items (is_pos)`, `products` |
| 🖥️ Aperçu caisse | `tab-apercu-caisse.tsx` | partagé avec pilotage franchise |

Colonnes ajoutées : `network_status` (enum: active/inactive/coming_soon/not_shared, défaut not_shared) sur `stock_items` et `recipes`. Colonne `sop_required` (boolean, défaut false) sur `recipes`.

Routes `/dashboard/stocks` et `/dashboard/recettes` redirigent vers `/dashboard/marchandise`.
