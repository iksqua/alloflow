# Playwright E2E Tests — Design Spec
**Date:** 2026-03-27
**Scope:** Option 1 — tests par page (products, recipes, POS)

---

## Objectif

Détecter les régressions logiques avant chaque deploy sur des flows critiques du POS SaaS Alloflow. Couvre notamment les bugs récents : prix HT/TTC inversé à l'édition produit, erreur UUID lors de l'activation du toggle "Vendu en caisse" dans les recettes.

---

## Environnement

- **Framework :** Playwright (TypeScript)
- **Serveur :** `localhost:3000` (Next.js via `webServer` dans la config Playwright)
- **Base de données :** Supabase production, compte de test dédié — isolation garantie par RLS (`establishment_id`). Les données de test n'affectent jamais d'autres tenants.
- **Credentials :** `.env.test` (gitignored)

```
TEST_USER_EMAIL=test@alloflow.dev
TEST_USER_PASSWORD=<secret>
BASE_URL=http://localhost:3000
```

Scripts `package.json` :
```json
"test:e2e":    "playwright test",
"test:e2e:ui": "playwright test --ui"
```

---

## Structure des fichiers

```
tests/e2e/
├── playwright.config.ts          # baseURL, browser, timeout, retries, globalSetup
├── global-setup.ts               # login unique → storageState .auth/user.json
├── products.spec.ts
├── recipes.spec.ts
└── pos.spec.ts
.env.test                         # gitignored
tests/e2e/.auth/                  # gitignored (storageState Playwright)
```

---

## Authentification

`global-setup.ts` effectue le login **une seule fois** pour toute la suite et écrit le cookie de session dans `tests/e2e/.auth/user.json`. Ce fichier est référencé dans `playwright.config.ts` via `use.storageState`. Chaque test repart avec la session déjà ouverte sans se reconnecter.

```ts
// playwright.config.ts (points clés)
{
  globalSetup: './tests/e2e/global-setup.ts',
  testDir: './tests/e2e',
  baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
  use: {
    storageState: 'tests/e2e/.auth/user.json',
  },
  projects: [{ name: 'chromium' }],
  timeout: 30_000,
  retries: 1,
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
  },
}
```

---

## Stratégie données

Chaque test est **autonome** :
- `beforeEach` : crée les données nécessaires via les API routes (fetch authentifié vers `localhost:3000/api/...`)
- `afterEach` : supprime les données créées via les mêmes API routes
- Aucune dépendance entre tests

**Payload minimum pour créer un produit** (tous les champs requis par le schéma Zod) :
```json
{
  "name": "Test Produit E2E",
  "price": 4.09,
  "tva_rate": 10,
  "is_active": true
}
```
*(price est en HT dans la DB — voir section products.spec ci-dessous)*

---

## data-testid

Les sélecteurs CSS fragiles sont remplacés par des attributs `data-testid` ajoutés pendant l'implémentation sur les éléments clés :

| Élément | data-testid |
|---|---|
| Bouton "Modifier" d'une carte produit | `product-edit-btn-{id}` |
| Champ prix TTC dans le formulaire produit | `product-price-input` |
| Toggle "Vendu en caisse" dans le formulaire recette | `recipe-pos-toggle` |
| Champ prix POS dans le formulaire recette | `recipe-pos-price-input` |
| Message d'erreur formulaire recette | `recipe-form-error` |
| Bouton "Payer" dans la caisse | `pos-pay-btn` |
| Modal paiement | `payment-modal` |

---

## Tests : products.spec.ts

### 1. Prix stable après édition (régression bug HT/TTC)

La DB stocke le prix **HT**. Le formulaire affiche et saisit en **TTC** (converti à l'affichage). Ce test vérifie que le prix HT en DB ne dérive pas après une édition sans modification du prix.

- `beforeEach` : crée via API un produit avec `price: 4.09` (HT), `tva_rate: 10`
  - TTC affiché = `4.09 × 1.10 = 4.50 €`
- Ouvre le formulaire d'édition
- Vérifie que le champ `[data-testid="product-price-input"]` affiche `4.50`
- Sauvegarde sans modifier le prix
- Vérifie via `GET /api/products` que `price` est toujours `4.09` (±0.01)
- `afterEach` : DELETE produit

### 2. Modification du nom
- `beforeEach` : crée un produit via API
- Édite le nom → "Produit Modifié E2E"
- Sauvegarde → vérifie le nouveau nom visible dans la liste
- `afterEach` : DELETE produit

### 3. Désactivation produit
- `beforeEach` : crée un produit actif via API
- Toggle `[data-testid="product-active-toggle"]` → OFF
- Sauvegarde → vérifie via API que `is_active: false`
- `afterEach` : DELETE produit

---

## Tests : recipes.spec.ts

### 1. Création recette interne
- Ouvre formulaire "Nouvelle recette"
- Remplit titre, laisse toggle POS off
- Sauvegarde → recette visible avec badge "🔒 Interne"
- `afterEach` : DELETE via API

### 2. Toggle "Vendu en caisse" — régression UUID

Ce test vérifie que `category_id: null` (aucune catégorie sélectionnée) ne provoque pas d'erreur de validation UUID.

- Ouvre formulaire "Nouvelle recette"
- Remplit le titre
- Clique `[data-testid="recipe-pos-toggle"]`
- Remplit `[data-testid="recipe-pos-price-input"]` avec `4.50`
- **Ne sélectionne pas** de catégorie caisse
- Sauvegarde
- Vérifie qu'aucun élément `[data-testid="recipe-form-error"]` n'est visible
- Vérifie via `GET /api/recipes` que la recette créée a `is_internal: false`
- Vérifie que `product[0].category_id === null` dans la réponse API (pas `""`)
- `afterEach` : DELETE via API (gère également le produit POS lié)

### 3. Food cost % affiché correctement
- `beforeEach` : crée une recette POS via API avec `price: 4.50` HT et `food_cost_amount: 1.26`
  - `food_cost_pct` attendu = `Math.round((1.26 / 4.50) * 1000) / 10` = `28.0`
- Charge `/dashboard/recettes`
- Vérifie que la carte de la recette affiche `28%`
- `afterEach` : DELETE

---

## Tests : pos.spec.ts

### beforeEach global POS

Toutes les specs POS nécessitent une **cash session ouverte**. `beforeEach` :
1. `POST /api/cash-sessions` avec `{ opening_amount: 100 }`  → sauvegarde `sessionId`
2. Crée un produit actif via API → sauvegarde `productId`

`afterEach` :
1. `PATCH /api/cash-sessions/:sessionId` avec `{ status: 'closed' }` (ou DELETE selon l'API)
2. DELETE produit

### 1. Chargement page caisse
- Navigue vers `/caisse/pos`
- Vérifie zéro erreur JS dans la console
- Vérifie que le produit créé en `beforeEach` est visible dans la grille

### 2. Ajout article au panier
- Navigue vers `/caisse/pos`
- Clique sur le produit → vérifie qu'il apparaît dans le panier
- Vérifie que le total affiché = `product.price × (1 + tva_rate/100)` (TTC)

### 3. Ouverture modal paiement
- Ajoute un produit au panier
- Clique `[data-testid="pos-pay-btn"]`
- Vérifie que `[data-testid="payment-modal"]` est visible
- Vérifie que le montant affiché dans la modal correspond au total du panier

---

## Ce qui n'est PAS couvert (Option 2 — plus tard)

- Flow complet commande → paiement TPE → journal fiscal NF525
- Fidélité : identifier client → appliquer remise → créditer points
- Gestion stocks : réception commande fournisseur
- Tests multi-browser (Safari, Firefox)

---

## Critères de succès

- `npm run test:e2e` passe en < 2 minutes sur machine locale
- Les 2 bugs récents (prix HT/TTC, UUID recette) sont détectés si réintroduits
- Chaque test est indépendant, sans données résiduelles après exécution
- Zéro `data-testid` manquant au moment de l'implémentation
