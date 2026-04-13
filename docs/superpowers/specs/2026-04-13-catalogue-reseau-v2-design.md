# Catalogue Réseau v2 — Design Spec

**Date :** 2026-04-13  
**Statut :** Validé  
**Scope :** franchise_admin (siège) + admin/caissier (franchisé)  
**Dépend de :** `catalogue-reseau` (v1 — déjà en prod)

---

## 1. Contexte & Objectif

La v1 du Catalogue Réseau (prod) couvre Produits · Recettes · SOPs. Quatre lacunes identifiées :

1. **Ingrédients réseau manquants** — pas de liste canonique d'ingrédients au niveau siège. Or les recettes réseau ont besoin d'une base ingrédients, et les franchisés doivent savoir quoi stocker.
2. **SOPs illisibles côté franchisé** — le payload JSONB brut est affiché tel quel. Le mode cuisine (`SopKitchenMode`) existant côté établissement n'est pas réutilisé.
3. **Pas de communication anticipée** — le siège ne peut pas annoncer un futur produit/ingrédient avant sa disponibilité.
4. **Pas de duplication** — créer "Cookie Caramel" depuis "Cookie Chocolat" impose de tout resaisir.

---

## 2. Modèle de données

### 2.1 Migration — deux changements sur `network_catalog_items`

```sql
-- Ajout du type ingredient
ALTER TABLE public.network_catalog_items
  DROP CONSTRAINT network_catalog_items_type_check,
  ADD CONSTRAINT network_catalog_items_type_check
    CHECK (type IN ('product', 'recipe', 'sop', 'ingredient'));

-- Colonne available_from (annonce anticipée)
ALTER TABLE public.network_catalog_items
  ADD COLUMN available_from date;
```

Aucune autre table créée. Tout repose sur l'architecture v1.

### 2.2 Payloads JSONB par type

| Type | Payload |
|------|---------|
| `ingredient` | `{ unit: "g"\|"kg"\|"ml"\|"L"\|"pièce"\|"cl", category?: string }` |
| `sop` | `{ steps: [{ sort_order: number, title: string, description: string, duration_seconds?: number, media_url?: string, note_type?: "warning"\|"tip"\|null, note_text?: string }] }` |
| `recipe` | `{ ingredients: [{ catalog_item_id: string, name: string, quantity: number, unit: string }], steps: string, portions?: number }` |
| `product` | `{ price_ht: number, tva_rate: number, category?: string }` (inchangé) |

### 2.3 Logique `available_from`

Vérifiée **à la lecture** (même pattern que `expires_at` pour le saisonnier) :

- `available_from IS NULL OR available_from <= today` → comportement normal
- `available_from > today` → item retourné avec flag `is_upcoming: true` dans la réponse API, badge **PROCHAINEMENT · JJ/MM** côté franchisé, toggle désactivé

Aucune mutation DB — un job optionnel peut activer proprement les items en arrière-plan.

---

## 3. Features

### 3.1 Ingrédients réseau

**Siège (`/dashboard/franchise/catalogue` — tab "🥕 Ingrédients") :**
- Liste + boutons Éditer · Dupliquer · Publier · Archiver (même pattern que les autres tabs)
- Formulaire : nom, unité (select : g · kg · ml · cl · L · pièce), catégorie (optionnel), is_mandatory, available_from

**Propagation :**
- Publication → batch upsert dans `establishment_catalog_items` (même logique publish v1)

**Onboarding franchisé :**
- Les ingrédients réseau publiés → `stock_items` de l'établissement (name + unit depuis payload, quantity = 0, alert_threshold = 0, autres colonnes à null)
- Ajouté dans la route `POST /api/franchise/establishments` (après le seed catalogue v1 existant)

**Franchisé (`/dashboard/catalogue-reseau` — tab "🥕 Ingrédients") :**
- Liste avec nom · unité · badges (OBLIGATOIRE, NOUVEAU, MIS À JOUR, PROCHAINEMENT, SAISONNIER)
- Pas de toggle actif/inactif sur les ingrédients (stock géré côté `stocks`)

### 3.2 SOP viewer

**Siège — formulaire SOP étendu :**
- Éditeur d'étapes : bouton "+ Ajouter une étape" → champs par étape :
  - Titre (required)
  - Description (required)
  - Durée en secondes (optionnel)
  - URL vidéo/média (optionnel)
  - Note type : aucune · ⚠ Attention · 💡 Conseil
  - Note texte (si note type sélectionné)
- Réordonnancement par drag (ou boutons ↑↓ pour simplicité)
- Le payload `steps` est trié par `sort_order` à la sauvegarde

**Franchisé — lecture SOP :**
- Bouton **▶ Voir le guide** sur chaque SOP (remplace l'affichage JSON)
- Clic → overlay plein écran : mapping payload → `SopWithSteps` → `SopKitchenMode` (composant existant réutilisé sans modification)
- SOPs PROCHAINEMENT : bouton grisé "Bientôt disponible"

**Mapping payload → SopWithSteps :**
```typescript
function payloadToSopWithSteps(item: NetworkCatalogItem): SopWithSteps {
  const steps = (item.payload?.steps ?? []) as PayloadStep[]
  return {
    id: item.id,
    title: item.name,
    sop_steps: steps.map((s, i) => ({
      id: `${item.id}-${i}`,
      sort_order: s.sort_order ?? i,
      title: s.title,
      description: s.description,
      duration_seconds: s.duration_seconds ?? null,
      media_url: s.media_url ?? null,
      note_type: s.note_type ?? null,
      note_text: s.note_text ?? null,
    })),
  }
}
```

### 3.3 PROCHAINEMENT (tous types)

**Siège :** champ "Annoncer à l'avance" (checkbox) + date `available_from` dans le formulaire — disponible sur tous les types.

**Franchisé :** badge bleu `PROCHAINEMENT · JJ/MM` sur l'item, toggle/bouton désactivé avec title "Disponible le JJ/MM".

**API :** les routes GET franchisé calculent `is_upcoming` en JS et l'ajoutent à la réponse (pas de colonne supplémentaire).

### 3.4 Duplication

**Route :** `POST /api/franchise/catalogue/[id]/duplicate`

```
- Copie network_catalog_items (même org_id, type, payload, is_mandatory, is_seasonal, expires_at, available_from)
- name = "Copie de [nom original]"
- status = 'draft', version = 1
- Copie network_catalog_item_data (même payload, previous_payload = null)
- Retourne le nouvel item
```

**UI siège :** bouton **⎘ Dupliquer** sur chaque item quel que soit son status.

---

## 4. Routes API

### Siège

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/franchise/catalogue/[id]/duplicate` | Dupliquer un item (status draft) |
| GET | `/api/franchise/catalogue` | Inchangé — retourne aussi `ingredient` |
| POST | `/api/franchise/catalogue` | Inchangé — accepte `type = 'ingredient'` |
| PATCH | `/api/franchise/catalogue/[id]` | Inchangé — accepte `available_from` |
| POST | `/api/franchise/catalogue/[id]/publish` | Inchangé |
| POST | `/api/franchise/catalogue/[id]/archive` | Inchangé |

### Franchisé

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/catalogue-reseau` | Inchangé — ajoute `is_upcoming` calculé côté JS |
| PATCH | `/api/catalogue-reseau/[id]` | Inchangé — bloque activation si `is_upcoming` |
| POST | `/api/catalogue-reseau/[id]/seen` | Inchangé |

---

## 5. Composants UI

### Siège (`src/app/dashboard/franchise/catalogue/_components/`)

| Fichier | Changement |
|---------|-----------|
| `catalogue-page-client.tsx` | Ajouter tab Ingrédients, bouton Dupliquer |
| `catalogue-item-form.tsx` | Champ `available_from`, formulaire SOP avec éditeur étapes, formulaire ingrédient (unit + category) |
| `sop-steps-editor.tsx` | **Nouveau** — éditeur d'étapes SOP (liste étapes, add/remove, ↑↓) |

### Franchisé (`src/app/dashboard/catalogue-reseau/_components/`)

| Fichier | Changement |
|---------|-----------|
| `catalogue-reseau-page-client.tsx` | Tab Ingrédients, badge PROCHAINEMENT, bouton ▶ Voir le guide |
| `sop-kitchen-viewer.tsx` | **Nouveau** — wrapper qui mappe payload → SopWithSteps et affiche SopKitchenMode |

---

## 6. Validations Zod (mises à jour)

```typescript
// Ajout dans createCatalogueItemSchema / updateCatalogueItemSchema
available_from: z.string().date().nullable().optional()

// Payload ingredient
z.object({ unit: z.enum(['g','kg','ml','cl','L','pièce']), category: z.string().optional() })

// Payload SOP
z.object({ steps: z.array(z.object({
  sort_order: z.number(),
  title: z.string().min(1),
  description: z.string().min(1),
  duration_seconds: z.number().nullable().optional(),
  media_url: z.string().nullable().optional(),
  note_type: z.enum(['warning','tip']).nullable().optional(),
  note_text: z.string().nullable().optional(),
})) })
```

---

## 7. Onboarding franchisé — mise à jour

Dans `POST /api/franchise/establishments`, après le seed catalogue v1 :

```typescript
// Seed stock_items depuis les ingrédients réseau publiés
const { data: ingredients } = await supabase
  .from('network_catalog_items')
  .select('id, name, network_catalog_item_data(payload)')
  .eq('org_id', orgId)
  .eq('type', 'ingredient')
  .eq('status', 'published')

if (ingredients?.length) {
  await supabase.from('stock_items').upsert(
    ingredients.map(i => ({
      establishment_id: newEstablishmentId,
      name: i.name,
      unit: (i.network_catalog_item_data as { payload: { unit: string } })?.payload?.unit ?? 'pièce',
      quantity: 0,
      alert_threshold: 0,
      active: true,
    })),
    { onConflict: 'establishment_id,name', ignoreDuplicates: true }
  )
}
```

---

## 8. Tests

- **Unit :** `payloadToSopWithSteps()`, `isUpcoming(available_from)`, duplication payload copy
- **Integration :** route duplicate (vérifier status=draft, version=1), route GET franchisé avec `is_upcoming`, seed stock_items onboarding ingrédients
- **E2E Playwright :** siège crée ingrédient → publie → vérifie stock_items franchisé seedé ; siège crée SOP avec étapes → franchisé ouvre mode cuisine

---

## 9. Hors scope

- Réordonnancement drag & drop des étapes SOP (boutons ↑↓ suffisent)
- Lien ingrédients réseau ↔ recettes réseau (payload recipe référence par nom, pas par ID — v3)
- Notifications push sur PROCHAINEMENT
- Commentaires franchisé → siège (roadmap future)
- Photos sur les items catalogue (roadmap future)
