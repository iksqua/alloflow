# Alloflow — Pipeline Recette → Produit POS

**Date :** 2026-03-27
**Scope :** Relation entre les recettes et les produits POS — création, synchronisation, food cost, cycle de vie

---

## Objectif

Permettre à un gérant de créer une recette et de l'exposer directement en caisse sans double saisie. Certaines recettes sont des préparations internes (jamais vendues) — le système doit gérer les deux cas depuis un seul formulaire.

---

## Décisions de design

| Question | Décision | Raison |
|---|---|---|
| Toutes les recettes sont-elles vendables ? | **Non** — interne ou POS, au choix | Ex : pâte à cookie = recette interne, Cookie Chocolat = produit POS |
| Comment créer le lien ? | **Toggle "Vendu en caisse" dans le formulaire recette** | Un seul endroit, décision explicite au moment de la création |
| Cardinalité | **1 recette = 0 ou 1 produit POS** | Simplification V1 — variantes (tailles) en V2 |
| Ingrédients liés au stock ? | **Non** — ingrédients autonomes avec coût manuel | Pas de déduction automatique du stock en V1 |
| Déduction stock à la vente | **Non** — gestion stock manuelle | Simplification V1 |

---

## Schéma de données

### Table `recipe_ingredients` (nouvelle)

```sql
recipe_ingredients (
  id          uuid PK,
  recipe_id   uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name        text NOT NULL,        -- ex : "Farine T55"
  quantity    numeric NOT NULL,     -- ex : 0.08
  unit        text NOT NULL,        -- ex : "kg", "cl", "u."
  unit_cost   numeric NOT NULL,     -- ex : 0.45 (coût pour 1 unité)
  sort_order  int DEFAULT 0         -- ordre d'affichage
)
```

### Modifications table `recipes`

```sql
-- Ajouter
is_internal  boolean NOT NULL DEFAULT true
-- Si is_internal = false, un produit POS est lié
```

### Modifications table `products`

```sql
-- Ajouter
recipe_id  uuid REFERENCES recipes(id) nullable
-- null si produit sans recette (eau, article emballé, etc.)
```

### Règle de calcul du food cost

```
food_cost_amount = SUM(ingredient.quantity × ingredient.unit_cost)
food_cost_pct    = ROUND(food_cost_amount / product.price * 100, 1)
```

Calculé à la volée côté serveur — pas de colonne stockée (les ingrédients peuvent changer).

---

## Flow UX — Formulaire recette

### Recette interne (toggle OFF)

1. Caissier/gérant remplit : nom, catégorie, portion, ingrédients + coûts, médias
2. Toggle "🧾 Vendu en caisse (POS)" est **désactivé** par défaut
3. Sauvegarde → `recipes` créé avec `is_internal = true`, aucun produit créé
4. Visible uniquement dans le module Recettes, jamais dans la caisse

### Recette vendable (toggle ON)

1. Gérant remplit le formulaire recette
2. Active le toggle → bloc "📦 Paramètres produit POS" apparaît :
   - **Prix de vente** (requis)
   - **TVA** (requis, défaut : 10%)
   - **Catégorie caisse** (pré-remplie depuis la catégorie recette si compatible)
3. Sauvegarde → deux écritures atomiques :
   - `recipes` créé avec `is_internal = false`
   - `products` créé avec `recipe_id → recipes.id`, `name = recipe.title`, prix et TVA saisis
4. Visible dans le module Recettes ET dans la caisse POS

### Modifier une recette liée

- Modifier le **nom** → `products.name` mis à jour automatiquement
- Modifier les **ingrédients/coûts** → food cost recalculé à la prochaine lecture
- Modifier le **prix** → `products.price` mis à jour automatiquement
- Désactiver le toggle → `products.active = false` (soft delete), recette reste

### Supprimer une recette liée

- `recipes` supprimé (soft delete : `active = false`)
- `products.active = false` — disparaît de la caisse, conservé dans l'historique des commandes

### Produit sans recette

Créé depuis le module Produits comme aujourd'hui (`recipe_id = null`). Aucun food cost affiché.

---

## Composants UI

### `RecipeForm`

Formulaire unifié recette. Sections :
1. **Informations générales** — nom, catégorie, portion, description
2. **Ingrédients** — liste dynamique (ajouter/supprimer), chaque ligne : nom + qté + unité + coût unitaire. Affiche le food cost calculé en temps réel.
3. **Médias** — photos, vidéos (URLs ou upload — voir spec SOPs)
4. **Toggle POS** — désactivé par défaut. Si activé, révèle la section POS.
5. **Section POS** (conditionnelle) — prix de vente, TVA, catégorie caisse

### `FoodCostIndicator`

Composant réutilisable affiché dans `RecipeForm` et les cards recettes :
- Pourcentage en couleur : vert (< 30%), amber (30–35%), rouge (> 35%)
- Barre de progression avec marqueur de seuil à 35%
- Montant en euros : `food_cost_amount €`

### `RecipeCard` (liste recettes)

Badge visuel indiquant le statut :
- `🧾 Vendu en caisse` (bleu) si lié à un produit actif
- `🔒 Recette interne` (gris) si `is_internal = true`

---

## API Routes (nouvelles)

```
GET    /api/recipes                     → liste des recettes (avec food_cost calculé)
POST   /api/recipes                     → créer recette (+ produit si is_internal = false)
                                          Body : { title, category, is_internal, ingredients[],
                                                   media_urls[], pos?: { price, tva_rate, category } }
                                          Atomique : recette + produit créés dans la même transaction
PATCH  /api/recipes/[id]                → modifier recette (propage nom/prix au produit lié)
DELETE /api/recipes/[id]                → soft delete recette + produit lié
GET    /api/recipes/[id]/food-cost      → recalcule le food cost à la demande

GET    /api/recipe-ingredients/[recipeId]          → ingrédients d'une recette
POST   /api/recipe-ingredients/[recipeId]          → ajouter un ingrédient
PATCH  /api/recipe-ingredients/[recipeId]/[id]     → modifier un ingrédient
DELETE /api/recipe-ingredients/[recipeId]/[id]     → supprimer un ingrédient
```

La création recette + produit est une **transaction Postgres unique** — si l'écriture produit échoue, la recette n'est pas créée non plus.

---

## Hors scope V1

- Déduction automatique du stock à la vente
- Ingrédients liés aux `stock_items` (lien FK vers le stock)
- Variantes produit depuis une recette (taille S/M/L)
- Historique des versions de recette (le champ `version` est prévu mais non utilisé)
- Import de recettes en masse (CSV)
