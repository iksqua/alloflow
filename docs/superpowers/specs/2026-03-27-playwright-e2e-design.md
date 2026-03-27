# Playwright E2E Tests — Design Spec
**Date:** 2026-03-27
**Scope:** Option 1 — tests par page (products, recipes, POS)

---

## Objectif

Détecter les régressions logiques avant chaque deploy sur des flows critiques du POS SaaS Alloflow. Couvre notamment les bugs récents : prix HT/TTC inversé à l'édition produit, erreur UUID lors de l'activation du toggle "Vendu en caisse" dans les recettes.

---

## Environnement

- **Framework :** Playwright (TypeScript)
- **Serveur :** `localhost:3000` (Next.js dev ou build local)
- **Base de données :** Supabase production, compte de test dédié isolé par `establishment_id` (RLS garantit l'isolation inter-tenant)
- **Credentials :** `.env.test` (non commité)

```
TEST_USER_EMAIL=test@alloflow.dev
TEST_USER_PASSWORD=<secret>
BASE_URL=http://localhost:3000
```

---

## Structure des fichiers

```
tests/e2e/
├── playwright.config.ts          # baseURL, browser, timeout, retries
├── fixtures/
│   └── auth.ts                   # fixture login partagée (storageState)
├── products.spec.ts
├── recipes.spec.ts
└── pos.spec.ts
```

`.env.test` à la racine du projet (gitignored).

Script dans `package.json` :
```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

---

## Fixture d'authentification

`fixtures/auth.ts` effectue le login une seule fois par suite via `storageState` Playwright. Évite de répéter le login à chaque test. Le state est sauvegardé dans `tests/e2e/.auth/user.json` (gitignored).

---

## Stratégie données

Chaque test est **autonome** :
- `beforeEach` : crée les données nécessaires via les API routes (`fetch` vers `localhost:3000/api/...`) avec les cookies de session du compte test
- `afterEach` : supprime les données créées (DELETE sur les ressources créées)
- Aucune dépendance entre tests — ordre d'exécution indifférent

---

## Tests : products.spec.ts

### 1. Prix TTC stable après édition
- Crée un produit via API avec `price: 4.50`
- Ouvre le formulaire d'édition via UI
- Vérifie que le champ "Prix TTC" affiche `4.50`
- Sauvegarde sans modification
- Vérifie via API que `price` est toujours `4.50` (pas le HT)

### 2. Modification du nom
- Crée un produit via API
- Édite le nom dans le formulaire
- Sauvegarde → vérifie le nouveau nom dans la liste

### 3. Désactivation produit
- Crée un produit actif via API
- Toggle "Produit actif" → OFF
- Sauvegarde → vérifie `is_active: false` via API

---

## Tests : recipes.spec.ts

### 1. Création recette interne
- Ouvre le formulaire "Nouvelle recette"
- Remplit titre, catégorie
- Toggle "Vendu en caisse" reste OFF
- Sauvegarde → recette apparaît dans la liste avec badge "Interne"

### 2. Toggle "Vendu en caisse" sans erreur UUID
- Ouvre le formulaire "Nouvelle recette"
- Remplit le titre
- Active le toggle "Vendu en caisse"
- Remplit le prix TTC (ex: 4.50)
- Ne sélectionne pas de catégorie caisse
- Sauvegarde → pas de message d'erreur "Invalid UUID"
- Vérifie que la recette apparaît avec badge "POS"

### 3. Food cost % affiché
- Crée une recette POS via API avec `food_cost_amount` et `price` connus
- Charge la page recettes
- Vérifie que le % affiché correspond à `(food_cost_amount / price) * 100`

---

## Tests : pos.spec.ts

### 1. Chargement page caisse
- Navigue vers `/caisse/pos`
- Vérifie absence d'erreur JS dans la console
- Vérifie que la grille produits est visible

### 2. Ajout article au panier
- Crée un produit actif via API
- Charge `/caisse/pos`
- Clique sur le produit → apparaît dans le panier
- Vérifie que le total correspond au prix du produit

### 3. Ouverture modal paiement
- Ajoute un produit au panier
- Clique "Payer"
- Vérifie que la modal de paiement s'ouvre avec le bon montant

---

## playwright.config.ts — points clés

```ts
{
  testDir: './tests/e2e',
  baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
  use: {
    storageState: 'tests/e2e/.auth/user.json',
  },
  projects: [{ name: 'chromium' }],  // un seul browser suffit pour débuter
  timeout: 30_000,
  retries: 1,                        // 1 retry pour éviter les faux positifs réseau
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
  },
}
```

---

## Ce qui n'est PAS couvert (Option 2 — plus tard)

- Flow complet commande → paiement TPE → journal fiscal NF525
- Fidélité : identifier client → appliquer remise → créditer points
- Gestion stocks : réception commande fournisseur

---

## Critères de succès

- `npm run test:e2e` passe en < 2 minutes sur machine locale
- Les 2 bugs récents (prix HT/TTC, UUID recette) sont détectés si réintroduits
- Chaque test est indépendant et ne laisse pas de données résiduelles
