# Sprint 9b — SOPs pour caissiers : Design Spec

## Objectif

Les caissiers peuvent consulter les procédures opérationnelles (SOPs) directement depuis la caisse, sans quitter le POS ni perdre leur ticket en cours. Aujourd'hui, les caissiers sont redirigés vers `/caisse/pos` et n'ont aucun accès aux SOPs.

## Expérience utilisateur

1. Le caissier voit un bouton **"📋 SOPs"** dans la navbar de la caisse (à côté du bouton "🗺 Tables")
2. Il clique → une modal plein écran s'ouvre **par-dessus le POS**
3. Le ticket en cours est intact en dessous (même pattern que `PaymentModal`, `FloorPlanModal`)
4. Dans la modal : recherche + chips catégories + liste des SOPs
5. Il clique "Suivre →" sur une SOP → `SopKitchenMode` se lance en plein écran
6. Il ferme → retour au POS avec son ticket

**Lecture seule** — pas de boutons Créer / Modifier / Supprimer. Ces actions restent dans `/dashboard/sops`.

---

## Corrections API préalables

Le `GET /api/sops` actuel ne retourne pas tous les champs de `sop_steps` requis par `SopKitchenMode`. Il faut étendre le select avant d'implémenter `SopModal` :

```typescript
// src/app/api/sops/route.ts — ligne 29, étendre le select steps
steps:sop_steps(id, sop_id, sort_order, title, description, duration_seconds, media_url, note_type, note_text)
```

Cette correction est incluse dans les tâches de ce sprint.

---

## Architecture

### Thread `establishmentId` dans PosShell

`establishmentId` existe dans `pos/page.tsx` mais n'est pas passé à `PosShell`. Il faut le thread :

```typescript
// pos/page.tsx
<PosShell ... establishmentId={establishmentId} />

// pos-shell.tsx — ajouter à PosShellProps
establishmentId: string
```

### Nouveau composant : `SopModal`

```
src/app/caisse/pos/_components/sop-modal.tsx
```

Client component. Props :

```typescript
interface SopModalProps {
  establishmentId: string  // reçu pour cohérence structurelle — NON transmis à l'API (l'API dérive depuis la session)
  onClose: () => void
}
```

**Imports requis :**
```typescript
import SopKitchenMode from '@/app/dashboard/sops/_components/sop-kitchen-mode'
import type { SopWithSteps } from '@/app/dashboard/sops/_components/types'
```

Ces deux imports viennent de `src/app/dashboard/sops/_components/`. Ne pas copier les types localement — importer directement.

**Comportement :**
- Au montage : `GET /api/sops` — l'API dérive `establishment_id` depuis la session (pas de param à passer)
- État local : `loading: boolean`, `error: string | null`, `search: string`, `selectedCategoryId: string | null`, `selectedSop: SopWithSteps | null`
- Pendant le chargement : spinner centré dans le panel
- En cas d'erreur : message d'erreur centré avec bouton Réessayer
- Si `selectedSop` → rend `<SopKitchenMode sop={selectedSop} onClose={() => setSelectedSop(null)} />` — ce composant utilise `fixed inset-0 z-[100]`, il s'affiche par-dessus la SopModal (z-50) grâce au positionnement fixe, pas besoin de le sortir du DOM
- Sinon → rend la liste filtrée

**Structure :**
```
SopModal (fixed inset-0 z-50, overlay + panel max-w-2xl max-h-[85vh] overflow-y-auto)
├── Header : "📋 Procédures" + bouton ✕
├── Barre de recherche
├── Chips catégories (Tous + une par catégorie)
├── Liste SOPs (scrollable)
│   └── Card : titre · catégorie · nb étapes · durée · bouton "Suivre →"
SopKitchenMode (rendu conditionnellement, fixed inset-0 z-[100] — s'affiche par-dessus tout)
```

### Intégration dans PosShell

```typescript
// pos-shell.tsx
const [showSops, setShowSops] = useState(false)

// Dans la navbar — insérer APRÈS le bouton "🗺 Plan de salle" et AVANT le lien conditionnel "Dashboard admin"
<button onClick={() => setShowSops(true)}>📋 SOPs</button>

// Dans le render
{showSops && (
  <SopModal
    establishmentId={establishmentId}
    onClose={() => setShowSops(false)}
  />
)}
```

---

## Fichiers modifiés

| Fichier | Modification |
|---------|-------------|
| `src/app/api/sops/route.ts` | Étendre select steps (sop_id, title, description, note_type, note_text) |
| `src/app/caisse/pos/page.tsx` | Passer `establishmentId` à PosShell |
| `src/app/caisse/pos/_components/pos-shell.tsx` | Ajouter `establishmentId` aux props, état `showSops`, bouton navbar, render SopModal |
| `src/app/caisse/pos/_components/sop-modal.tsx` | Nouveau composant |

---

## Design

**Overlay et panel :**
```
fixed inset-0 z-50
overlay: bg-black/70
panel: max-w-2xl mx-auto mt-16 rounded-2xl bg-[var(--surface)] border border-[var(--border)]
```

**Chips catégories :**
```
px-3 py-1 rounded-full text-xs font-medium
Active: bg-[var(--blue)] text-white
Inactive: bg-[var(--surface2)] text-[var(--text3)] hover:text-[var(--text1)]
```

**Card SOP :**
```
px-4 py-3 rounded-xl bg-[var(--surface2)] hover:bg-[var(--blue-light)] transition-colors
Titre: text-sm font-semibold text-[var(--text1)]
Meta: text-xs text-[var(--text4)] — "X étapes · Y min"
Bouton: "Suivre →" text-xs font-medium text-[var(--blue)]
```

**`SopKitchenMode`** : réutilisé tel quel depuis `src/app/dashboard/sops/_components/sop-kitchen-mode.tsx`. Composant autonome, props : `sop: SopWithSteps` + `onClose: () => void`. Utilise `fixed inset-0 z-[100]` — s'affiche nativement par-dessus la `SopModal` (z-50) sans configuration supplémentaire.

---

## Hors scope

- Créer / modifier / supprimer des SOPs depuis la caisse
- SOPs favoris / épinglés
- Historique des SOPs consultées
- Notifications pour nouvelles SOPs
