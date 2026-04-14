# Spec : Page Marchandise unifiée

**Date :** 2026-04-14  
**Statut :** Approuvé par l'utilisateur  
**Remplace :** `/dashboard/stocks` (renommé) + `/dashboard/recettes` (fusionné)

---

## 1. Objectif

Remplacer les pages `/dashboard/stocks` et `/dashboard/recettes` par une unique page `/dashboard/marchandise` qui modélise correctement le flux :

> **Marchandise achetée** → vendue directement OU transformée en recette → **Article en vente (POS)**

La page expose 4 onglets : Marchandise · Recettes · En vente · Aperçu caisse.

---

## 2. Modèle mental

| Concept | Table DB | Description |
|---------|----------|-------------|
| Marchandise | `stock_items` | Ce qu'on achète aux fournisseurs. Peut être vendu direct (`is_pos = true`) et/ou utilisé comme ingrédient dans des recettes. |
| Recette | `recipes` | Formule de fabrication composée d'ingrédients (texte + coût unitaire). Produit un article POS via `is_internal = false`. |
| Article en vente | `products` (via `product_id` sur `stock_items` ou via `recipes.is_internal`) | Vue synthétique de tout ce qui apparaît en caisse. |
| Guide SOP | `sops` (lié à `recipes` via `sops.recipe_id`) | Guide opérationnel pas-à-pas. Optionnel par recette, avec toggle "requis". |

---

## 3. Architecture de la page

### Route
`/dashboard/marchandise` — remplace `/dashboard/stocks`  
`/dashboard/stocks` → redirect 301 vers `/dashboard/marchandise`  
`/dashboard/recettes` → redirect 301 vers `/dashboard/marchandise?tab=recettes`

### Structure fichiers
```
src/app/dashboard/marchandise/
  page.tsx                          # SSR shell
  _components/
    marchandise-page-client.tsx     # Shell client : KPIs + tabs
    tab-marchandise.tsx             # Onglet 📦 Marchandise
    tab-recettes.tsx                # Onglet 🍳 Recettes
    tab-en-vente.tsx                # Onglet 🛒 En vente
    tab-apercu-caisse.tsx           # Onglet 🖥️ Aperçu caisse
    stock-item-form.tsx             # Modal création/édition marchandise (réutilisé de stocks)
    recipe-form.tsx                 # Modal création/édition recette (réutilisé de recettes)
    sop-panel.tsx                   # Volet SOP dans la ligne déroulante recette
    network-status-select.tsx       # Dropdown statut réseau réutilisable
    types.ts                        # Types locaux
```

---

## 4. KPIs (bandeau commun)

Affichés en haut de page, indépendants de l'onglet actif :

| KPI | Calcul |
|-----|--------|
| Marchandises | `COUNT(stock_items)` |
| Articles en vente | `COUNT(stock_items WHERE is_pos) + COUNT(recipes WHERE NOT is_internal)` |
| Food cost moyen | Moyenne pondérée sur les recettes actives |
| Partagés réseau | `COUNT(... WHERE network_status = 'active')` + sous-label "X prochainement" |

---

## 5. Onglet 📦 Marchandise

### Colonnes (tableau)
| # | Colonne | Priorité responsive |
|---|---------|---------------------|
| — | Nom article + fournisseur/ref | Toujours |
| 1 | Catégorie | P2 |
| 2 | Coût achat (€/unité) | P1 |
| 3 | Utilisation (badges) | P1 |
| 4 | Vente directe (prix TTC + marge) | P1 |
| 5 | Statut réseau | P2 |
| — | Actions | Toujours |

### Colonne "Utilisation"
- Badge `🛒 Direct` si `is_pos = true`
- Badge `🍳 N recette(s)` si l'item est référencé comme ingrédient dans N recettes. **Note technique :** la table `recipe_ingredients` ne contient pas de FK vers `stock_items` — les ingrédients sont stockés en texte libre (`name`, `unit_cost`). Le comptage "N recette(s)" n'est donc **pas calculable** par jointure directe. Ce badge est masqué pour l'instant ; il sera ajouté dans une itération future une fois que `recipe_ingredients` aura un champ `stock_item_id` optionnel. Pour ce sprint, seul le badge `🛒 Direct` est implémenté.
- Bouton `+ Vendre direct` si `is_pos = false` → ouvre la modal stock-item-form sur la section POS

### Colonne "Vente directe"
- Si `is_pos = true` : affiche prix TTC + marge
- Si `is_pos = false` : bouton grisé `+ Vendre direct`

### Filtres
- Par utilisation : Tout · 🛒 Vendu direct · 🍳 En recette
- Par catégorie : pills colorées

### Actions par ligne
- ✏️ Modifier (ouvre modal)
- ⧉ Dupliquer (copie l'item, préfixe "Copie de …")
- 🗑 Supprimer (confirmation)

---

## 6. Onglet 🍳 Recettes

### Tableau avec lignes déroulantes (expandable rows)

**Colonne chevron** (toujours visible) : `▶` gris fermé → `▼` bleu ouvert au clic.

### Colonnes
| # | Colonne | Priorité responsive |
|---|---------|---------------------|
| — | Chevron | Toujours |
| 1 | Nom recette + catégorie | Toujours |
| 2 | Food cost % + barre | Toujours |
| 3 | Prix TTC | P1 |
| 4 | Guide SOP | P1 |
| 5 | Statut réseau | P2 |
| 6 | Catégorie | P2 |
| 7 | TVA | P3 |
| 8 | Nb ingrédients | P3 |
| — | Actions | Toujours |

### Colonne "Guide SOP"
- `📋 Guide ✓` (vert) : SOP créé
- `— Sans guide` (gris) : pas de SOP, toggle "requis" = OFF → pas d'alerte
- `⚠ Manquant` (rouge) : pas de SOP, toggle "requis" = ON → alerte visible

### Volet déroulant (par recette)
2 sous-onglets :

**🧪 Ingrédients**
- Tableau : Ingrédient | Qté | Unité | Coût unitaire | Total ligne
- Footer : coût total matières + food cost %
- Bouton : Modifier ingrédients

**📋 Guide SOP**
- Si SOP existant : liste des étapes avec titre + description
- Si pas de SOP :
  - Toggle "Guide requis pour cette recette ?" (stocké dans `recipes.sop_required`)
  - Bouton "Créer le guide" → ouvre modal SOP
- Actions SOP : ✏️ Modifier · ⧉ Dupliquer guide · ▶ Mode cuisine (lecture plein écran)

### Actions par ligne recette
- ✏️ Modifier (modal recette)
- ⧉ Dupliquer (copie recette + ingrédients + SOP si existant, préfixe "Copie de …")
- 🗑 Supprimer (confirmation)

---

## 7. Onglet 🛒 En vente

Vue synthétique de **tous les articles disponibles en caisse** (direct + recettes).

### Colonnes
| # | Colonne | Priorité responsive |
|---|---------|---------------------|
| 1 | Nom + origine (badge Direct/Recette) | Toujours |
| 2 | Catégorie POS | P2 |
| 3 | Origine (badge) | P1 |
| 4 | Prix TTC | P1 |
| 5 | TVA | P3 |
| 6 | Marge % | Toujours |
| 7 | Statut réseau | P2 |
| — | Actions | Toujours |

### Badge "Origine"
- `🛒 Direct` → vente directe d'une marchandise
- `🍳 Recette` → résultat d'une recette

### Actions
- ✏️ Modifier le prix/TVA/catégorie (modal légère) :
  - Origine `🛒 Direct` → écrit sur `stock_items` (`pos_price`, `pos_tva_rate`, `pos_category_id`)
  - Origine `🍳 Recette` → écrit sur le `products` lié à la recette (via `recipes` → `product_id` du `products` associé via `is_internal = false`)
- Navigation vers la recette source si origine = Recette

---

## 8. Onglet 🖥️ Aperçu caisse

Vue en lecture seule de l'interface caisse de l'établissement courant. Identique à la preview dans `/dashboard/franchise/pilotage/[establishmentId]` (composant partagé).

- Groupé par catégorie POS
- Cartes produit : nom, prix TTC, photo si disponible
- Indicateur de statut réseau (Actif / Inactif / Prochainement)
- Aucune action de modification

---

## 9. Statut réseau (champ transversal)

Applicable à `stock_items` ET `recipes`. Nouveau champ `network_status` à ajouter aux deux tables.

| Valeur | Affichage | Signification |
|--------|-----------|---------------|
| `active` | `● Actif` (vert) | Partagé et visible dans tous les établissements du réseau |
| `inactive` | `○ Inactif` (gris) | Masqué du réseau, non partagé |
| `coming_soon` | `◑ Prochainement` (violet) | Sera partagé prochainement |
| `not_shared` | `+ Partager` (pointillés) | Jamais partagé, invitation à partager |

**Valeur par défaut :** `not_shared`

Implémenté comme dropdown inline sur chaque ligne (composant `NetworkStatusSelect`).

---

## 10. Modifications de base de données

### Migration 1 : Ajout `network_status` sur `stock_items`
```sql
ALTER TABLE stock_items
  ADD COLUMN network_status text NOT NULL DEFAULT 'not_shared'
  CHECK (network_status IN ('active', 'inactive', 'coming_soon', 'not_shared'));
```

### Migration 2 : Ajout `network_status` et `sop_required` sur `recipes`
```sql
ALTER TABLE recipes
  ADD COLUMN network_status text NOT NULL DEFAULT 'not_shared'
  CHECK (network_status IN ('active', 'inactive', 'coming_soon', 'not_shared')),
  ADD COLUMN sop_required boolean NOT NULL DEFAULT false;
```

### Pas de nouvelle table
Les tables `sops`, `sop_steps`, `recipe_ingredients` existent déjà et sont réutilisées.

---

## 11. Responsive

3 breakpoints :

| Breakpoint | Comportement |
|------------|--------------|
| ≥ 1024px (Desktop) | Toutes colonnes visibles |
| 640–1023px (Tablette) | Masque P3 (TVA, Nb ingrédients) + Catégorie (P2 selon espace) |
| < 640px (Mobile) | Tableau → cards empilées. Carte : nom, food cost %, prix, statut, actions |

Ordre de disparition (de 1er à dernier masqué) :
1. P3 : TVA, Nb ingrédients
2. P2 : Catégorie, Statut réseau
3. P1 : Food cost, Prix TTC, Guide SOP (toujours visibles sauf mobile cards)

---

## 12. Pilotage franchise

### Ajout onglet "Aperçu caisse" dans pilotage établissement
`/dashboard/franchise/pilotage/[establishmentId]`

Ajouter un onglet `🖥️ Aperçu caisse` qui réutilise le composant `tab-apercu-caisse.tsx` en mode read-only avec les données de l'établissement piloté.

Les onglets existants (Produits / Recettes) restent inchangés.

---

## 13. Navigation sidebar

Remplacer les entrées :
- `Stocks` → `Marchandise` (pointe vers `/dashboard/marchandise`)
- `Recettes` → supprimer (fusionné dans Marchandise)

---

## 14. Contraintes techniques

- CSS vars exclusivement (`--bg`, `--surface`, `--surface2`, `--border`, `--text1`→`--text4`, `--blue`)
- Pattern page.tsx (SSR) → `*-page-client.tsx` (shell) → `_components/`
- Filtrer toujours par `establishment_id`
- Prix stockés en HT en DB, calculés TTC à l'affichage
- Pas de `console.log` en prod, pas de `any` TypeScript sans justification
- TypeScript strict : `npx tsc --noEmit` avant commit
- Avant migration : `supabase db diff`

---

## 15. Hors périmètre (YAGNI)

- Historique des modifications de prix
- Import/export CSV de marchandise
- Gestion des fournisseurs (table dédiée)
- Système de commandes fournisseurs (déjà dans `/dashboard/stocks/commandes`, non touché)
- Photos sur les recettes (roadmap future)
