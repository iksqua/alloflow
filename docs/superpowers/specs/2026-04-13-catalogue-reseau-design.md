# Catalogue Réseau Partagé — Design Spec

**Date :** 2026-04-13  
**Statut :** Validé  
**Scope :** franchise_admin (siège) + admin/caissier (franchisé)

---

## 1. Contexte & Objectif

Alloflow est un POS SaaS multi-tenant pour les réseaux de franchise (coffee shops, cookies). Aujourd'hui, le `franchise_admin` peut consulter et modifier les données de chaque établissement via le module Pilotage, mais il n'existe pas de catalogue centralisé que les franchisés héritent automatiquement.

**Objectif :** Permettre au siège de créer un catalogue réseau (produits, recettes, SOPs/guides) qui se propage automatiquement à tous les franchisés, avec une distinction entre éléments obligatoires et optionnels, et un système de notifications sur les mises à jour.

---

## 2. Modèle de données

### 2.1 Tables réseau (appartiennent à `org_id` du siège)

```sql
-- Catalogue réseau : items maîtres
CREATE TABLE network_catalog_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('product', 'recipe', 'sop')),
  name            text NOT NULL,
  description     text,
  is_mandatory    boolean NOT NULL DEFAULT false,
  is_seasonal     boolean NOT NULL DEFAULT false,
  expires_at      date,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  version         integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Payload spécifique au type (JSONB pour flexibilité)
CREATE TABLE network_catalog_item_data (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id uuid NOT NULL REFERENCES network_catalog_items(id) ON DELETE CASCADE,
  payload         jsonb NOT NULL DEFAULT '{}',
  -- Champs verrouillés pour produit : name, price_ht, tva_rate, category_id
  -- Champs verrouillés pour recette : name, ingredients, steps
  -- Champs verrouillés pour sop : name, steps, video_url
  UNIQUE (catalog_item_id)
);
```

### 2.2 Table de liaison franchisé ↔ catalogue

```sql
CREATE TABLE establishment_catalog_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id    uuid NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  catalog_item_id     uuid NOT NULL REFERENCES network_catalog_items(id) ON DELETE CASCADE,
  -- Champs libres (modifiables par le franchisé)
  local_price         numeric(10,2),
  local_stock_threshold integer,
  is_active           boolean NOT NULL DEFAULT true,
  -- Synchronisation des versions
  current_version     integer NOT NULL DEFAULT 1,
  notified_at         timestamptz,
  seen_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, catalog_item_id)
);
```

### 2.3 Champs verrouillés vs libres

| Champ | Verrouillé (siège) | Libre (franchisé) |
|---|---|---|
| Nom | ✓ | |
| Description | ✓ | |
| Recette / étapes SOP | ✓ | |
| Prix HT | ✓ | |
| Prix local | | ✓ |
| Seuil de stock | | ✓ |
| Actif/inactif (optionnel) | | ✓ |

---

## 3. Workflow Siège

### 3.1 Page `/dashboard/franchise/catalogue`

Nouvelle entrée dans `FranchiseSidebar` : `📦 Catalogue réseau`

Onglets : **Produits · Recettes · SOPs/Guides**

Interface par onglet :
- Liste des items avec badges status (`DRAFT`, `PUBLIÉ`, `ARCHIVÉ`)
- Badges `OBLIGATOIRE` / `OPTIONNEL` / `SAISONNIER`
- Bouton "Nouvel item" → formulaire slide-in
- Actions par item : Éditer · Publier · Archiver

### 3.2 Flow de création

1. Siège crée un item → status `draft`
2. Configure : nom, contenu (payload JSONB), `is_mandatory`, `is_seasonal` + `expires_at` si saisonnier
3. Clique "Publier" → status `published`
4. **Trigger publication** : insertion automatique dans `establishment_catalog_items` pour tous les établissements actifs du réseau (`is_active = true` pour tous, mandatory ou non)

### 3.3 Flow de mise à jour

1. Siège édite un item publié → `version` incrémente
2. `establishment_catalog_items.notified_at = now()` sur toutes les lignes liées
3. Les champs verrouillés se mettent à jour automatiquement dans `network_catalog_item_data`
4. Bandeau de notification apparaît dans le dashboard franchisé

### 3.4 Compliance Score

```
score = (items_mandatory_actifs / total_items_mandatory_publiés) × 100
```

Affiché dans le Command Center siège comme colonne supplémentaire dans le tableau des établissements.

### 3.5 Routes API siège

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/franchise/catalogue` | Liste items avec stats par établissement |
| POST | `/api/franchise/catalogue` | Créer un item (draft) |
| PATCH | `/api/franchise/catalogue/[id]` | Éditer / publier / archiver |
| DELETE | `/api/franchise/catalogue/[id]` | Archivage soft (jamais suppression) |
| POST | `/api/franchise/catalogue/[id]/publish` | Publication + propagation réseau |

---

## 4. Workflow Franchisé

### 4.1 Bandeau de notification (layout dashboard)

Affiché en haut du dashboard si `establishment_catalog_items` contient des lignes avec `notified_at > seen_at` :

> `"📦 3 éléments mis à jour par le siège · 1 nouveau produit optionnel disponible"` → lien `/dashboard/catalogue-reseau`

### 4.2 Page `/dashboard/catalogue-reseau`

Onglets : **Produits · Recettes · SOPs/Guides**

Par item :
- Badge `OBLIGATOIRE` ou `OPTIONNEL`
- Badge `NOUVEAU` (si créé après onboarding) ou `MIS À JOUR` (si `current_version < catalog version`)
- Diff visuel sur mise à jour : encadré "Avant / Après" sur les champs modifiés
- Champs éditables localement : prix local, seuil de stock
- Toggle activer/désactiver (optionnels uniquement, obligatoires non toggleables)
- Marquage automatique `seen_at = now()` à l'ouverture de l'onglet

### 4.3 Onboarding automatique

Lors de la création d'un franchisé via `/dashboard/franchise/franchises/nouveau` :

1. Récupérer tous les `network_catalog_items` publiés de l'`org_id` siège
2. Insérer en batch dans `establishment_catalog_items` (transaction unique)
3. `is_active = true` pour tous, `current_version = catalog.version`

### 4.4 Routes API franchisé

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/catalogue-reseau` | Items catalogue de l'établissement courant |
| PATCH | `/api/catalogue-reseau/[id]` | Modifier prix local, seuil, activer/désactiver |
| POST | `/api/catalogue-reseau/[id]/seen` | Marquer comme vu (efface notification) |

---

## 5. Features supplémentaires

### 5.1 Catalogue saisonnier
Items avec `is_seasonal = true` et `expires_at` : archivage automatique à l'expiration via cron ou check à la lecture. Affiché avec badge amber `SAISONNIER · expire le JJ/MM`.

### 5.2 Tracking SOPs
Les caissiers peuvent marquer un SOP catalogue comme "lu/pratiqué" (table `sop_completions` : `establishment_id`, `catalog_item_id`, `user_id`, `completed_at`). Le siège voit le taux de complétion par boutique dans la page Catalogue réseau.

### 5.3 Compliance Score dans Command Center
Colonne supplémentaire dans le tableau des établissements du Command Center siège, avec code couleur :
- Vert ≥ 90%
- Amber 70–89%
- Rouge < 70%

---

## 6. Architecture & patterns

- Suivre le pattern existant : `page.tsx` (SSR) → `*-page-client.tsx` (shell) → `_components/`
- Composants serveur par défaut, `'use client'` seulement si nécessaire
- CSS vars uniquement, jamais de couleurs hardcodées
- RLS Supabase : `franchise_admin` accède à `network_catalog_items` via `org_id`, `admin` accède à `establishment_catalog_items` via `establishment_id`
- Filtrer toujours par `establishment_id` côté franchisé

---

## 7. Tests

- Unit : logique compliance score, calcul diff versions, batch onboarding
- Integration : routes API avec Supabase réel (pas de mocks DB)
- E2E Playwright : flow siège (créer → publier), flow franchisé (voir notification → marquer vu), onboarding franchisé

---

## 8. Hors scope (pour cette itération)

- Système de versioning avec historique complet (Approche C)
- Approbation workflow multi-niveaux
- Import/export catalogue CSV
- Notifications email/SMS sur publication
