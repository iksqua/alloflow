# Prix de référence ingrédients réseau — Design

## Contexte

Les franchisés reçoivent leurs ingrédients réseau à l'onboarding sans aucun prix pré-rempli. Ils doivent tout saisir manuellement (ex : sirop de vanille 750 ml à 7,45 €). Le siège connaît les prix du marché et peut leur fournir une base de départ. Sans ça, le calcul des marges est bloqué dès le premier jour.

## Objectif

Permettre au siège de définir un prix de référence sur chaque ingrédient du catalogue réseau. Ce prix pre-remplit automatiquement `unit_price` dans `stock_items` lors de l'onboarding d'un nouveau franchisé. Les franchisés existants ne sont pas affectés.

---

## Données

### Stockage

Le prix de référence est ajouté au payload JSONB existant de `network_catalog_item_data` :

```json
{
  "unit": "ml",
  "category": "Sirops",
  "reference_package_price": 7.45,
  "reference_package_size": 750
}
```

- `reference_package_price` : prix du package en euros (ex : 7,45 €)
- `reference_package_size` : contenance en unités du champ `unit` (ex : 750 pour 750 ml)
- `unit_price` calculé = `reference_package_price / reference_package_size` (jamais stocké)

Pas de migration DB — le payload JSONB absorbe les nouveaux champs.

### Validation

Extension de `ingredientPayloadSchema` dans `src/lib/validations/catalogue.ts` :

```ts
export const ingredientPayloadSchema = z.object({
  unit:                    z.enum(['g', 'kg', 'ml', 'cl', 'L', 'pièce']),
  category:                z.string().optional(),
  reference_package_price: z.number().positive().optional(),
  reference_package_size:  z.number().positive().optional(),
}).refine(
  d => (d.reference_package_price == null) === (d.reference_package_size == null),
  { message: 'reference_package_price et reference_package_size doivent être fournis ensemble ou pas du tout' }
)
```

La contrainte "les deux ou aucun" est enforced au niveau schéma — pas seulement côté UI. Les ingrédients sans prix de référence fonctionnent comme avant.

---

## Interface siège — CatalogueItemForm

Dans `src/app/dashboard/franchise/catalogue/_components/catalogue-item-form.tsx`, section ingrédient :

**State `ingPayload` — étendre `initIngredientPayload` et le type :**

```ts
function initIngredientPayload(payload: Record<string, unknown>) {
  return {
    unit:                    (payload?.unit as string) ?? 'kg',
    category:                (payload?.category as string) ?? '',
    reference_package_price: (payload?.reference_package_price as number | undefined) ?? '',
    reference_package_size:  (payload?.reference_package_size as number | undefined) ?? '',
  }
}
```

Les champs prix sont initialisés à `''` pour que les inputs soient vides par défaut (pas `0`).

**`buildPayload` — inclure les champs prix :**

```ts
if (form.type === 'ingredient') {
  const refPrice = Number(ingPayload.reference_package_price)
  const refSize  = Number(ingPayload.reference_package_size)
  const hasRef   = refPrice > 0 && refSize > 0
  return {
    unit: ingPayload.unit,
    ...(ingPayload.category ? { category: ingPayload.category } : {}),
    ...(hasRef ? { reference_package_price: refPrice, reference_package_size: refSize } : {}),
  }
}
```

**Type explicite pour `ingPayload` (TypeScript strict, défini localement dans `catalogue-item-form.tsx`, non exporté) :**

```ts
type IngPayload = {
  unit: string
  category: string
  reference_package_price: number | ''
  reference_package_size:  number | ''
}
```

Passer ce type au `useState<IngPayload>(() => initIngredientPayload(form.payload))` pour éviter les erreurs strict-mode sur les bindings `value`.

**Deux nouveaux champs UI**, visibles uniquement quand `type === 'ingredient'`, placés sous Unité/Catégorie :
- **Prix du package (€)** — `input type="number" step="0.01" min="0"` lié à `ingPayload.reference_package_price`
- **Contenance** — `input type="number" step="1" min="0"` avec le suffixe de l'unité (ex : "ml"), lié à `ingPayload.reference_package_size`
- Affichage temps réel sous les champs, conditionné par `Number(ingPayload.reference_package_price) > 0 && Number(ingPayload.reference_package_size) > 0` :
  `= {(Number(price) / Number(size)).toFixed(4)} €/{unit}` (toFixed(4), point décimal, pas de localisation)

---

## Interface franchisé — CatalogueReseauPageClient

Dans `src/app/dashboard/catalogue-reseau/_components/catalogue-reseau-page-client.tsx`, ligne ingrédient :

- Si `reference_package_price` et `reference_package_size` sont présents dans le payload, afficher en gris clair : `Réf. siège : 0,0099 €/ml`
- Pas de UI d'interaction — information uniquement

**Diff viewer — filtrer les clés de prix :**

Le diff AVANT/APRÈS (lignes ~201-216) affiche un `JSON.stringify` brut du payload. Quand le siège modifie le prix de référence, les clés `reference_package_price` et `reference_package_size` apparaîtraient dans ce diff — information interne non pertinente pour le franchisé.

Ajouter une fonction `filterPayloadForDisplay` qui exclut ces deux clés avant le `JSON.stringify` :

```ts
const HIDDEN_PAYLOAD_KEYS = ['reference_package_price', 'reference_package_size']

function filterPayloadForDisplay(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([k]) => !HIDDEN_PAYLOAD_KEYS.includes(k))
  )
}
```

Appliquer aux deux côtés du diff avec null guard (TypeScript strict) :

```ts
{JSON.stringify(filterPayloadForDisplay(cat.network_catalog_item_data.previous_payload ?? {}), null, 2)}
// ...
{JSON.stringify(filterPayloadForDisplay(cat.network_catalog_item_data.payload ?? {}), null, 2)}
```

`filterPayloadForDisplay` et `HIDDEN_PAYLOAD_KEYS` sont définis dans le même fichier `catalogue-reseau-page-client.tsx` (non exportés).

---

## Onboarding

Dans `src/app/api/franchise/establishments/route.ts`, Step 7 (seed stock_items) :

Le type `network_catalog_item_data` dans le `.map()` doit être étendu (conserver la branche array existante) :

```ts
const data = Array.isArray(ing.network_catalog_item_data)
  ? ing.network_catalog_item_data[0]
  : ing.network_catalog_item_data

const payload = data?.payload as {
  unit?: string
  reference_package_price?: number
  reference_package_size?: number
} | undefined

const refPrice = payload?.reference_package_price
const refSize  = payload?.reference_package_size
const unit_price =
  refPrice && refSize
    ? Math.round(refPrice / refSize * 1e6) / 1e6
    : undefined

return {
  establishment_id: establishmentId,
  name:             ing.name,
  unit:             payload?.unit ?? 'pièce',
  quantity:         0,
  alert_threshold:  0,
  active:           true,
  ...(unit_price !== undefined ? { unit_price } : {}),
}
```

La branche `Array.isArray` doit être conservée — elle gère une particularité du join Supabase (peut retourner array ou objet selon la cardinalité).

**Précision float :** arrondir à 6 décimales avant d'insérer : `Math.round(refPrice / refSize * 1e6) / 1e6`. Évite les artefacts float type `0.009933333333333334`.

Le franchisé peut ensuite modifier son propre prix — l'onboarding ne le réécrase jamais (`ignoreDuplicates: true` déjà en place).

**Note sur la validation serveur :** `ingredientPayloadSchema` (avec le `.refine()`) est déjà appelé dans la route `/publish` (ligne 51 de `publish/route.ts`). La contrainte "les deux ou aucun" est donc enforced au moment où le siège tente de publier l'ingrédient — pas au moment de la sauvegarde draft.

**Fix message d'erreur publish (`publish/route.ts` ligne 52)** : Les erreurs `.refine()` vont dans `formErrors`, pas `fieldErrors`. Mettre à jour la ligne d'extraction du message :

```ts
if (!result.success) return NextResponse.json({
  error: result.error.flatten().fieldErrors.unit?.[0]
    ?? result.error.flatten().formErrors[0]
    ?? 'Payload ingrédient invalide'
}, { status: 422 })
```

---

## Périmètre explicite

**In scope :**
- Saisie référence prix dans le formulaire siège
- Affichage info prix sur la vue franchisé
- Pre-remplissage à l'onboarding

**Out of scope :**
- Mise à jour des franchisés existants quand le prix de référence change
- Alerte franchisé si prix de référence mis à jour
- Historique des prix de référence

---

## Tests

**Validation schéma (`ingredientPayloadSchema`):**
- `{unit: 'ml', reference_package_price: 7.45, reference_package_size: 750}` → valide
- `{unit: 'ml'}` → valide (sans prix, comportement actuel)
- `{unit: 'ml', reference_package_price: 7.45}` sans size → invalide (`.refine()`)
- `{unit: 'ml', reference_package_size: 750}` sans price → invalide (`.refine()`)
- `{unit: 'ml', reference_package_price: -1, reference_package_size: 750}` → invalide (négatif)

**Onboarding (`establishments/route.ts` Step 7):**
- Ingrédient avec `reference_package_price: 7.45, reference_package_size: 750` → `unit_price = 0.009933` (arrondi 6 décimales)
- Ingrédient sans prix de référence → `unit_price` absent du stock_item inséré
- Ingrédient avec un seul champ → `unit_price` absent
- `ignoreDuplicates: true` : franchisé existant avec son propre prix non écrasé

**`filterPayloadForDisplay`:**
- `{unit: 'ml', reference_package_price: 7.45, reference_package_size: 750}` → `{unit: 'ml'}`
- `{unit: 'kg', category: 'Farines'}` → `{unit: 'kg', category: 'Farines'}` (pas de régression)
