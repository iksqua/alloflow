# Sprint 9b — SOPs pour caissiers : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre aux caissiers de consulter les SOPs depuis le POS via une modal plein écran sans perdre leur ticket en cours.

**Architecture:** On étend le select de `GET /api/sops` pour inclure tous les champs `sop_steps` requis par `SopKitchenMode`, on thread `establishmentId` dans `PosShell`, puis on crée un composant `SopModal` qui réutilise `SopKitchenMode` existant. Aucune nouvelle route API — la modal appelle `GET /api/sops` directement.

**Tech Stack:** Next.js 15 App Router, React, TypeScript, Supabase JS client, CSS variables design system (var(--surface), var(--blue), etc.)

> **Note pour l'implémenteur :** Avant d'écrire du code Next.js, lire `node_modules/next/dist/docs/` pour les conventions Next.js 15. Les types Supabase peuvent être désynchronisés des nouvelles colonnes — utiliser `(supabase as any)` si nécessaire (pattern existant dans le codebase).

---

## Fichiers touchés

| Action | Fichier | Rôle |
|--------|---------|------|
| Modify | `src/app/api/sops/route.ts` | Étendre le select sop_steps |
| Modify | `src/app/caisse/pos/page.tsx` | Passer establishmentId à PosShell |
| Modify | `src/app/caisse/pos/_components/pos-shell.tsx` | Ajouter prop, état showSops, bouton navbar, render SopModal |
| Create | `src/app/caisse/pos/_components/sop-modal.tsx` | Nouveau composant modal SOPs |

**Fichiers à lire avant de commencer :**
- `src/app/api/sops/route.ts` (ligne 29 : le select actuel de sop_steps)
- `src/app/caisse/pos/_components/pos-shell.tsx` (props interface + section navbar ~ligne 119-155)
- `src/app/caisse/pos/page.tsx` (voir comment establishmentId est déjà utilisé)
- `src/app/dashboard/sops/_components/types.ts` (SopWithSteps, SopStep)
- `src/app/dashboard/sops/_components/sop-kitchen-mode.tsx` (props : `sop: SopWithSteps`, `onClose: () => void`)

---

### Task 1 : Étendre le select sop_steps dans GET /api/sops

**Fichiers :**
- Modify: `src/app/api/sops/route.ts`

Le select actuel est :
```typescript
steps:sop_steps(id, sort_order, duration_seconds, media_url)
```

Il manque `sop_id, title, description, note_type, note_text` — requis par `SopKitchenMode` qui rend `step.title`, `step.description`, `step.note_type`, `step.note_text`.

- [ ] **Step 1 : Modifier le select dans `src/app/api/sops/route.ts`**

Trouver la ligne avec `steps:sop_steps(...)` et remplacer par :

```typescript
steps:sop_steps(id, sop_id, sort_order, title, description, duration_seconds, media_url, note_type, note_text)
```

Le contexte exact dans le fichier :
```typescript
// AVANT (ligne ~29)
steps:sop_steps(id, sort_order, duration_seconds, media_url)

// APRÈS
steps:sop_steps(id, sop_id, sort_order, title, description, duration_seconds, media_url, note_type, note_text)
```

- [ ] **Step 2 : Vérifier la compilation TypeScript**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx tsc --noEmit 2>&1 | head -30
```

Attendu : 0 erreur sur ce fichier.

- [ ] **Step 3 : Tester l'API manuellement**

```bash
# Lancer le serveur de dev si pas déjà lancé
npm run dev
```

Dans le navigateur, ouvrir les DevTools → Network, naviguer vers `/caisse/pos`, filtrer sur `sops`. Vérifier que la réponse inclut `steps` avec `title`, `description`, `note_type`, `note_text` dans chaque step.

- [ ] **Step 4 : Commit**

```bash
git add src/app/api/sops/route.ts
git commit -m "fix(api): extend sop_steps select with all fields required by SopKitchenMode"
```

---

### Task 2 : Thread establishmentId dans PosShell

**Fichiers :**
- Modify: `src/app/caisse/pos/page.tsx`
- Modify: `src/app/caisse/pos/_components/pos-shell.tsx`

`establishmentId` existe dans `pos/page.tsx` mais n'est pas passé à `PosShell`. Il faut l'ajouter à l'interface et au composant.

- [ ] **Step 1 : Ajouter `establishmentId` à `PosShellProps` dans `pos-shell.tsx`**

Trouver l'interface `PosShellProps` (vers ligne 15-25) et ajouter le champ :

```typescript
// Dans PosShellProps, après userRole: string
establishmentId: string
```

- [ ] **Step 2 : Déstructurer `establishmentId` dans le composant**

Trouver la déstructuration des props dans la fonction `PosShell` (vers ligne 33-41) et ajouter :

```typescript
// Ajouter à la déstructuration, après userRole,
establishmentId,
```

- [ ] **Step 3 : Passer `establishmentId` depuis `pos/page.tsx`**

Dans `src/app/caisse/pos/page.tsx`, dans le JSX du `<PosShell ...>`, ajouter la prop :

```typescript
// Ajouter après userRole={...}
establishmentId={establishmentId}
```

- [ ] **Step 4 : Vérifier la compilation**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Attendu : 0 erreur TypeScript.

- [ ] **Step 5 : Commit**

```bash
git add src/app/caisse/pos/page.tsx src/app/caisse/pos/_components/pos-shell.tsx
git commit -m "feat(pos): thread establishmentId prop through PosShell"
```

---

### Task 3 : Créer le composant SopModal

**Fichiers :**
- Create: `src/app/caisse/pos/_components/sop-modal.tsx`

Modal plein écran avec liste des SOPs, barre de recherche, chips catégories. Au clic sur une SOP, lance `SopKitchenMode`.

- [ ] **Step 1 : Créer `src/app/caisse/pos/_components/sop-modal.tsx`**

```typescript
'use client'
import { useState, useEffect } from 'react'
import { SopKitchenMode } from '@/app/dashboard/sops/_components/sop-kitchen-mode'
import type { SopWithSteps } from '@/app/dashboard/sops/_components/types'

interface SopModalProps {
  establishmentId: string  // reçu pour cohérence structurelle — NON transmis à l'API (dérive depuis la session)
  onClose: () => void
}

export function SopModal({ establishmentId: _establishmentId, onClose }: SopModalProps) {
  const [sops, setSops] = useState<SopWithSteps[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedSop, setSelectedSop] = useState<SopWithSteps | null>(null)

  useEffect(() => {
    fetch('/api/sops')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setSops(data.sops ?? [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Dériver les catégories uniques depuis les SOPs chargées
  const categories = Array.from(
    new Map(
      sops
        .filter(s => s.category)
        .map(s => [s.category!.id, s.category!])
    ).values()
  )

  const filtered = sops.filter(s => {
    const matchSearch = search === '' || s.title.toLowerCase().includes(search.toLowerCase())
    const matchCat = selectedCategoryId === null || s.category_id === selectedCategoryId
    return matchSearch && matchCat
  })

  function formatDuration(seconds: number) {
    const m = Math.ceil(seconds / 60)
    return m <= 1 ? '1 min' : `${m} min`
  }

  // SopKitchenMode est fixed inset-0 z-[100] — s'affiche nativement par-dessus cette modal (z-50)
  if (selectedSop) {
    return <SopKitchenMode sop={selectedSop} onClose={() => setSelectedSop(null)} />
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-0">
      {/* Overlay */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.7)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-2xl mt-16 rounded-2xl flex flex-col"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          maxHeight: '85vh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="text-sm font-semibold text-[var(--text1)]">📋 Procédures</span>
          <button
            onClick={onClose}
            className="text-xs text-[var(--text4)] hover:text-[var(--text1)] transition-colors"
          >
            ✕ Fermer
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Barre de recherche */}
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Rechercher une procédure…"
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              color: 'var(--text1)',
              outline: 'none',
            }}
          />

          {/* Chips catégories */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCategoryId(null)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                style={
                  selectedCategoryId === null
                    ? { background: 'var(--blue)', color: 'white' }
                    : { background: 'var(--surface2)', color: 'var(--text3)' }
                }
              >
                Tous
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                  style={
                    selectedCategoryId === cat.id
                      ? { background: 'var(--blue)', color: 'white' }
                      : { background: 'var(--surface2)', color: 'var(--text3)' }
                  }
                >
                  {cat.emoji} {cat.name}
                </button>
              ))}
            </div>
          )}

          {/* États */}
          {loading && (
            <div className="flex items-center justify-center py-12 text-sm text-[var(--text4)]">
              Chargement…
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <p className="text-sm text-[var(--red)]">{error}</p>
              <button
                onClick={() => { setError(null); setLoading(true); fetch('/api/sops').then(r => r.json()).then(d => { setSops(d.sops ?? []); setLoading(false) }).catch(e => { setError(e.message); setLoading(false) }) }}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
              >
                Réessayer
              </button>
            </div>
          )}

          {/* Liste SOPs */}
          {!loading && !error && (
            <div className="flex flex-col gap-2">
              {filtered.length === 0 && (
                <p className="text-center text-sm text-[var(--text4)] py-8">
                  Aucune procédure trouvée
                </p>
              )}
              {filtered.map(sop => (
                <div
                  key={sop.id}
                  className="flex items-center justify-between px-4 py-3 rounded-xl transition-colors"
                  style={{ background: 'var(--surface2)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--blue-light)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface2)')}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-semibold text-[var(--text1)] truncate">{sop.title}</span>
                    <span className="text-xs text-[var(--text4)]">
                      {sop.category ? `${sop.category.emoji ?? ''} ${sop.category.name} · ` : ''}
                      {sop.step_count} étape{sop.step_count !== 1 ? 's' : ''}
                      {sop.total_duration_seconds > 0 ? ` · ${formatDuration(sop.total_duration_seconds)}` : ''}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedSop(sop)}
                    className="flex-shrink-0 ml-3 text-xs font-medium"
                    style={{ color: 'var(--blue)' }}
                  >
                    Suivre →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2 : Vérifier la compilation**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Attendu : 0 erreur TypeScript.

- [ ] **Step 3 : Commit**

```bash
git add src/app/caisse/pos/_components/sop-modal.tsx
git commit -m "feat(pos): add SopModal component for cashier SOP access"
```

---

### Task 4 : Intégrer SopModal dans PosShell

**Fichiers :**
- Modify: `src/app/caisse/pos/_components/pos-shell.tsx`

Ajouter l'import, l'état `showSops`, le bouton dans la navbar, et le render conditionnel de `SopModal`.

- [ ] **Step 1 : Ajouter l'import dans `pos-shell.tsx`**

En haut du fichier, après les imports existants (ex: après `import { LoyaltyModal } ...`), ajouter :

```typescript
import { SopModal } from './sop-modal'
```

- [ ] **Step 2 : Ajouter l'état `showSops`**

Dans le corps de la fonction `PosShell`, après les autres déclarations `useState` des modals (ex: après `const [showLoyalty, setShowLoyalty] = useState(false)`), ajouter :

```typescript
const [showSops, setShowSops] = useState(false)
```

- [ ] **Step 3 : Ajouter le bouton SOPs dans la navbar**

Dans la navbar (la `<div>` avec `position: absolute, top: 0`), dans le groupe de boutons de droite (`<div className="flex items-center gap-2">`), insérer le bouton **après** le bouton `🗺 Plan de salle` et **avant** le lien conditionnel `← Dashboard admin` :

```typescript
<button
  onClick={() => setShowSops(true)}
  className="h-8 px-3 rounded-lg text-xs text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
>
  📋 SOPs
</button>
```

- [ ] **Step 4 : Rendre SopModal conditionnellement**

À la fin du JSX retourné par `PosShell`, après le dernier modal existant (ex: `{showLoyalty && <LoyaltyModal ...`), ajouter :

```typescript
{showSops && (
  <SopModal
    establishmentId={establishmentId}
    onClose={() => setShowSops(false)}
  />
)}
```

- [ ] **Step 5 : Vérifier la compilation**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Attendu : 0 erreur TypeScript.

- [ ] **Step 6 : Vérifier le build complet**

```bash
npm run build 2>&1 | tail -20
```

Attendu : Build réussi, pas d'erreur.

- [ ] **Step 7 : Test manuel**

1. Naviguer vers `/caisse/pos`
2. Vérifier que le bouton `📋 SOPs` est visible dans la navbar
3. Cliquer → la modal s'ouvre par-dessus le POS, ticket visible en dessous au refermement
4. Vérifier que la barre de recherche filtre les SOPs
5. Cliquer sur `Suivre →` d'une SOP → `SopKitchenMode` se lance
6. Cliquer Fermer dans `SopKitchenMode` → retour à la liste SopModal
7. Cliquer `✕ Fermer` de la SopModal → retour au POS avec ticket intact

- [ ] **Step 8 : Commit**

```bash
git add src/app/caisse/pos/_components/pos-shell.tsx
git commit -m "feat(pos): integrate SopModal — cashiers can now browse SOPs without leaving POS"
```
