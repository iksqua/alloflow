# Alloflow — Système de SOPs (Standard Operating Procedures)

**Date :** 2026-03-27
**Scope :** Création, organisation et consultation des procédures opérationnelles — catégories flexibles, étapes structurées, vidéos, lien optionnel aux recettes, mode cuisine

---

## Objectif

Permettre à un gérant de documenter toutes les procédures de son établissement (recettes, hygiène, tenue, nettoyage, rôle vendeur…) dans un format structuré par étapes. Les procédures sont consultables en mode cuisine (lecture séquentielle plein-écran) par les équipes. Les catégories sont entièrement personnalisables par établissement.

---

## Décisions de design

| Question | Décision | Raison |
|---|---|---|
| Catégories fixes ou flexibles ? | **Flexibles** — table `sop_categories` par établissement | Chaque type de commerce a des procédures différentes — un enum fixe serait trop rigide |
| Catégories par défaut ? | **6 pré-chargées** à la création du compte | Évite le blank-slate, couvre 95% des besoins initiaux |
| Étapes : texte libre ou structuré ? | **Structuré** — table `sop_steps` | Permet le mode cuisine interactif (progression, timers, vidéos par étape) |
| Vidéos : upload ou URL externe ? | **URL externe** (YouTube, Vimeo) en V1 | Pas de coût de stockage, zéro friction pour le gérant |
| Lien recette | **Optionnel** — `sops.recipe_id nullable` | 1 recette = 0..1 SOP. SOPs sans recette (hygiène, tenue…) entièrement supportés |
| Supprimer une catégorie | SOPs passent en **`category_id = null`** | Pas de perte de données |
| Supprimer un SOP | **Soft delete** (`active = false`) | Cohérent avec le reste du système |

---

## Schéma de données

### Nouvelle table `sop_categories`

```sql
sop_categories (
  id               uuid PK,
  establishment_id uuid NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  name             text NOT NULL,       -- ex : "Hygiène & HACCP"
  emoji            text,               -- ex : "🧼" — optionnel
  sort_order       int DEFAULT 0
)
```

**Catégories pré-chargées à la création d'un établissement :**

| Emoji | Nom |
|---|---|
| 🍳 | Recettes & Production |
| 🧼 | Hygiène & HACCP |
| 👕 | Tenue & Comportement |
| 🧹 | Nettoyage & Entretien |
| 👤 | Rôle & Accueil |
| 📦 | Réception & Stocks |

### Modifications table `sops`

```sql
-- Remplacer le champ category (text) par :
category_id  uuid REFERENCES sop_categories(id) ON DELETE SET NULL  -- nullable
-- Ajouter :
recipe_id    uuid REFERENCES recipes(id) ON DELETE SET NULL          -- nullable
active       boolean NOT NULL DEFAULT true
```

Les colonnes existantes `title`, `content`, `version` sont conservées. `content` est utilisé pour les notes générales du SOP (hors étapes). `media_urls` est conservé pour des photos de couverture ou visuels de présentation du SOP (pas des vidéos d'étapes) — non exposé dans l'UI V1 mais présent en base pour éviter une migration destructive.

### Nouvelle table `sop_steps`

```sql
sop_steps (
  id               uuid PK,
  sop_id           uuid NOT NULL REFERENCES sops(id) ON DELETE CASCADE,
  sort_order       int NOT NULL DEFAULT 0,
  title            text NOT NULL,           -- ex : "Préchauffer le four"
  description      text NOT NULL,           -- instructions détaillées
  duration_seconds int,                     -- null = pas de timer
  media_url        text,                    -- URL YouTube/Vimeo, null si absent
  note_type        text,                    -- 'warning' | 'tip' | null
  note_text        text                     -- null si note_type est null
)
```

---

## Flow UX

### Gérer les catégories

Accessible depuis `Paramètres > SOPs` ou depuis un lien dans la liste SOPs.

- Ajouter une catégorie : nom + emoji (sélecteur ou libre)
- Renommer / réordonner (drag-and-drop) / supprimer
- Supprimer une catégorie affiche un avertissement : "X SOPs seront sans catégorie" — confirmation requise

### Créer un SOP

1. Gérant clique **+ Nouveau SOP**
2. Remplit : titre, catégorie (sélecteur peuplé depuis `sop_categories`), fréquence/contexte (texte libre optionnel)
3. Le champ **Lier une recette** est toujours disponible, quelle que soit la catégorie — il reste optionnel. Il s'affiche dans une section dédiée sous les infos générales.
4. Ajoute les étapes une par une :
   - Titre + description (obligatoires)
   - Timer optionnel (en secondes, affiché en mm:ss)
   - Note optionnelle : type `warning` (amber) ou `tip` (bleu), + texte
   - Vidéo optionnelle : coller une URL YouTube/Vimeo
5. Réordonner les étapes par drag-and-drop
6. Sauvegarde → `sops` + `sop_steps` créés dans la même transaction

### Modifier un SOP

- Modifier le titre → `sops.title` mis à jour
- Ajouter / modifier / supprimer / réordonner des étapes via les routes dédiées
- Changer de catégorie → `sops.category_id` mis à jour
- Délier / relier une recette → `sops.recipe_id` mis à jour

### Mode cuisine (lecture)

- Accessible depuis le bouton **▶ Mode cuisine** sur chaque ligne de la liste
- Vue plein-écran séquentielle :
  - Étapes précédentes : affichées en grisé (faites)
  - Étape active : mise en avant (bordure bleue, fond légèrement coloré)
  - Étapes suivantes : visibles mais atténuées
  - Timer : affiché et décompte si `duration_seconds` renseigné
  - Note warning/tip : affichée sous la description
  - Vidéo : embed inline sous la description si `media_url` renseigné
- Boutons : **← Étape précédente** / **Étape suivante →**
- Barre de progression en haut

### Liste SOPs

- Filtres par catégorie (pills dynamiques depuis `sop_categories`)
- Pill "Tous" affiche le total
- Recherche par titre
- Chaque ligne affiche : emoji + titre, badge catégorie, badge "📦 Lié : [recette]" si `recipe_id` non null, badge "▶ Vidéo" si au moins une étape a un `media_url`, nombre d'étapes + durée totale estimée
- Actions : **▶ Mode cuisine** + **✏️ Modifier**

---

## Composants UI

### `SOPList`
Page principale du module SOPs. Filtre dynamique depuis `sop_categories`. Déclenche le mode cuisine ou l'édition.

### `SOPForm`
Formulaire création/édition. Sections : infos générales, lien recette (conditionnel), liste d'étapes avec `StepEditor`.

### `StepEditor`
Composant ligne pour une étape. Champs : titre, description, timer (optionnel), note (optionnel), vidéo URL (optionnel). Drag handle pour réordonner.

### `SOPKitchenMode`
Vue plein-écran de lecture séquentielle. Timer actif, embed vidéo, navigation étape par étape.

### `SOPCategoryManager`
Page ou modal de gestion des catégories. CRUD + drag-and-drop pour le sort_order. Accessible depuis les paramètres de l'établissement.

---

## API Routes (nouvelles)

```
-- Catégories
GET    /api/sop-categories                          → liste des catégories de l'établissement (triées par sort_order)
POST   /api/sop-categories                          → créer une catégorie
                                                      Body : { name, emoji?, sort_order? }
PATCH  /api/sop-categories/[id]                     → renommer / réordonner
DELETE /api/sop-categories/[id]                     → supprimer (sops.category_id → null)

-- SOPs
GET    /api/sops                                    → liste des SOPs actifs (filtrables par category_id, recipe_id)
                                                      Retourne : { id, title, category: { id, name, emoji }, recipe_id, step_count, total_duration_seconds, has_video }
POST   /api/sops                                    → créer SOP + étapes (transaction atomique)
                                                      Body : { title, category_id?, recipe_id?, content?, steps[] }
                                                      steps[] : [{ title, description, sort_order, duration_seconds?, media_url?, note_type?, note_text? }]
PATCH  /api/sops/[id]                               → modifier les métadonnées du SOP
DELETE /api/sops/[id]                               → soft delete (active = false)

-- Étapes
GET    /api/sops/[id]/steps                         → étapes d'un SOP (triées par sort_order)
POST   /api/sops/[id]/steps                         → ajouter une étape
                                                      Body : { title, description, sort_order, duration_seconds?, media_url?, note_type?, note_text? }
PATCH  /api/sops/[id]/steps/[stepId]                → modifier une étape (contenu ou sort_order)
DELETE /api/sops/[id]/steps/[stepId]                → supprimer une étape
```

---

## Hors scope V1

- Upload de vidéos (Supabase Storage) — URLs externes uniquement
- Assignation d'un SOP à un employé spécifique
- Validation / signature numérique de lecture par l'employé
- Historique des versions de SOP (`version` existe mais non utilisé)
- Import de SOPs en masse (CSV)
- Notifications ou rappels liés aux SOPs (ex : nettoyage quotidien)
