# Sprint 9b — SOPs pour caissiers : Design Spec

## Objectif

Les caissiers peuvent consulter les procédures opérationnelles (SOPs) directement depuis la caisse, sans quitter le POS ni perdre leur ticket en cours. Aujourd'hui, les caissiers sont redirigés vers `/caisse/pos` et n'ont aucun accès aux SOPs.

## Expérience utilisateur

1. Le caissier voit un bouton **"📋 SOPs"** dans la navbar de la caisse (à côté du bouton "🗺 Tables")
2. Il clique → une modal plein écran s'ouvre **par-dessus le POS**
3. Le ticket en cours est intact en dessous (même pattern que PaymentModal, FloorPlanModal)
4. Dans la modal : recherche + filtre par catégorie + liste des SOPs
5. Il clique une SOP → le Mode Cuisine (`SopKitchenMode`) se lance en plein écran
6. Il ferme → retour au POS avec son ticket

**Lecture seule** — les caissiers ne voient pas les boutons Créer / Modifier / Supprimer. Ces actions restent dans `/dashboard/sops` pour les admins.

---

## Architecture

### Nouveau composant : `SopModal`

```
src/app/caisse/pos/_components/sop-modal.tsx
```

Modal client component, pattern identique aux autres modals POS (`PaymentModal`, `FloorPlanModal`). Props :

```typescript
interface SopModalProps {
  establishmentId: string
  onClose: () => void
}
```

**Structure interne :**

```
SopModal
├── Barre de recherche (input texte)
├── Chips catégories (Tous + une chip par catégorie avec emoji)
├── Liste SOPs filtrée
│   └── Card SOP (titre, catégorie, nb étapes, durée, bouton "Suivre →")
└── SopKitchenMode (conditionnel, quand une SOP est sélectionnée)
```

### Intégration dans PosShell

`pos-shell.tsx` :
- Ajouter état `showSops: boolean`
- Ajouter bouton "📋 SOPs" dans la navbar (entre "🗺 Tables" et le nom utilisateur)
- Rendre `<SopModal>` quand `showSops === true`

### Données

`SopModal` fetche les SOPs au montage via `GET /api/sops?establishment_id=...` (API existante).

**Filtre lecture seule côté API :** l'API existante retourne déjà les SOPs actives filtrées par `establishment_id`. Aucune modification API nécessaire — le composant affiche simplement sans les actions d'édition.

---

## Structure fichiers modifiés

| Fichier | Modification |
|---------|-------------|
| `src/app/caisse/pos/_components/pos-shell.tsx` | Ajouter état `showSops` + bouton navbar + render `<SopModal>` |
| `src/app/caisse/pos/_components/sop-modal.tsx` | Nouveau composant |
| `src/app/caisse/pos/page.tsx` | Pas de modification (SopModal fetche ses propres données) |

---

## Design

**Modal :**
```
fixed inset-0 z-50
background: rgba(0,0,0,0.7)
inner panel: max-w-2xl, rounded-2xl, bg-[var(--surface)], border var(--border)
```

**Chips catégories :**
```
px-3 py-1 rounded-full text-xs font-medium
Active: bg-[var(--blue)] text-white
Inactive: bg-[var(--surface2)] text-[var(--text3)]
```

**Card SOP :**
```
px-4 py-3 rounded-xl bg-[var(--surface2)] border border-[var(--border)]
Titre: text-sm font-semibold text-[var(--text1)]
Meta: text-xs text-[var(--text4)] — "X étapes · Y min"
Bouton: "Suivre →" text-xs text-[var(--blue)]
```

**Réutilisation de `SopKitchenMode` :** le composant existant est déjà autonome (prend une SOP + steps en props, gère timer + navigation). Il s'intègre directement dans la modal sans modification.

---

## Hors scope

- Créer / modifier / supprimer des SOPs depuis la caisse
- SOPs favoris / épinglés
- Historique des SOPs consultées
- Notifications push pour nouvelles SOPs
