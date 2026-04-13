@AGENTS.md

# Règles obligatoires pour toutes les sessions

## 1. Workflow
- Invoque `using-superpowers` au début de chaque tâche et suis le workflow complet.
- Ne code jamais sans plan validé. Si quelque chose semble hors spec, dis-le avant de coder.
- Pour tout bug : trouve la root cause avant de fixer.
- Après chaque tâche : propose une mise à jour de ce fichier ou des skills si une meilleure pratique est trouvée.

## 2. Stack
- **Next.js App Router** + **Supabase** + **TypeScript strict**
- Lire `node_modules/next/dist/docs/` avant d'écrire du code Next.js — APIs et conventions peuvent différer.
- Composants serveur par défaut, `'use client'` seulement si nécessaire.

## 3. Thème & UI
- **CSS vars uniquement** — jamais de couleurs hardcodées (`bg-[#0f2744]`, `text-slate-*`, `bg-white/[0.xx]`)
- Cards : `style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}`
- Textes : `text-[var(--text1)]` → `text-[var(--text4)]` selon hiérarchie
- Headers responsive : `flex flex-col sm:flex-row sm:items-center justify-between gap-3`
- Ne jamais ajouter d'offset sidebar dans les pages — `layout.tsx` le gère déjà.

## 4. Base de données
- Toujours filtrer par `establishment_id` sauf pour `franchise_admin` et `super_admin`.
- Profils utilisateurs dans la table `profiles`.
- Pas de mock DB dans les tests — les mocks ont masqué des bugs de migration en prod.

## 5. Rôles utilisateurs
| Rôle | Accès |
|---|---|
| `caissier` | `/caisse/pos` uniquement |
| `admin` | Dashboard établissement complet |
| `super_admin` | Droits étendus (remboursements, produits globaux) |
| `franchise_admin` | `/dashboard/franchise/*`, analytics multi-sites |

## 6. Interdictions
- Pas de padding/margin compensant la sidebar dans les pages.
- Pas de feature flags ni de shims de compatibilité.
- Pas de `console.log` oubliés en production.
- Pas de `any` TypeScript sans commentaire justificatif.
