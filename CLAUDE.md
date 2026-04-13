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

## 3. Commandes clés
```bash
npm run dev          # Dev local
npm run test         # Vitest (unit)
npm run test:run     # Vitest CI
npm run test:e2e     # Playwright E2E
npx tsc --noEmit     # Vérification TypeScript
npx supabase db push # Appliquer migrations
```

## 4. UI & Thème
- **CSS vars uniquement** — jamais de couleurs hardcodées.
- `--bg` `--surface` `--surface2` `--border` `--text1`→`--text4` `--blue` `--overlay-bg`
- Cards : `style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}`
- Modal overlay : `style={{ background: 'var(--overlay-bg)' }}` · shell : `rounded-xl`
- Inputs (dans modals) : `style={{ background: 'var(--surface2)' }}`
- Labels : `text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5`
- **Ne jamais ajouter d'offset sidebar dans les pages** — `layout.tsx` applique `marginLeft: 220px + paddingTop: 48px + p-6`.

## 5. Base de données & Sécurité
- Toujours filtrer par `establishment_id` (sauf `franchise_admin` / `super_admin`).
- Profils : table `profiles`. Prix DB : **HT** (`price`). TTC calculé à l'affichage.
- Jamais de mock DB dans les tests — risque de divergence silencieuse avec la prod.
- Supabase project ref : `vblxzfsddxhtthycsmim`

## 6. Rôles utilisateurs
| Rôle | Accès |
|------|-------|
| `caissier` | `/caisse/pos` uniquement |
| `admin` | Dashboard établissement complet |
| `super_admin` | Remboursements, produits globaux |
| `franchise_admin` | `/dashboard/franchise/*`, multi-sites |

## 7. Debugging avec MCPs (l'agent fait le boulot)
- **Reproduire d'abord** : utiliser Playwright MCP pour ouvrir le navigateur, naviguer, cliquer, capturer l'erreur — avant de toucher au code.
- **Inspecter la DB** : MCP Supabase pour lire le schéma, les données réelles et les logs avant tout fix.
- **Vérifier le deploy** : MCP Vercel pour consulter les logs de build/runtime en cas d'erreur prod.
- Si erreur TypeScript : `npx tsc --noEmit` exhaustif avant de commit.
- Si migration : `supabase db diff` avant `supabase db push`.
- Tokens MCP expirés → régénérer sur dashboard.supabase.com/account/tokens.
- **Après chaque bug corrigé manuellement** : mettre à jour ce fichier ou le skill concerné avec la leçon apprise.

## 8. Interdictions
- Pas de `console.log` en production.
- Pas de `any` TypeScript sans commentaire justificatif.
- Pas de feature flags ni shims de compatibilité.
- Pas de padding/margin compensant la sidebar dans les pages.
- Pas d'estimation de temps.
