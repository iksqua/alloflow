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
-- + previous_payload pour le diff visuel franchisé
CREATE TABLE network_catalog_item_data (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id  uuid NOT NULL REFERENCES network_catalog_items(id) ON DELETE RESTRICT,
  payload          jsonb NOT NULL DEFAULT '{}',
  previous_payload jsonb,  -- snapshot avant dernière mise à jour (pour diff Avant/Après)
  -- Champs verrouillés pour produit : name, price_ht, tva_rate, category_id
  -- Champs verrouillés pour recette : name, ingredients, steps
  -- Champs verrouillés pour sop : name, steps, video_url
  UNIQUE (catalog_item_id)
);
```

### 2.2 Table de liaison franchisé ↔ catalogue

```sql
CREATE TABLE establishment_catalog_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id      uuid NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  catalog_item_id       uuid NOT NULL REFERENCES network_catalog_items(id) ON DELETE RESTRICT,
  -- Champs libres (modifiables par le franchisé)
  local_price           numeric(10,2),
  local_stock_threshold integer,
  is_active             boolean NOT NULL DEFAULT true,
  -- Synchronisation des versions
  current_version       integer NOT NULL DEFAULT 1,
  notified_at           timestamptz,
  seen_at               timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, catalog_item_id)
);
```

**Note ON DELETE RESTRICT :** La suppression physique d'un `network_catalog_items` est bloquée si des `establishment_catalog_items` existent. L'archivage (status = 'archived') est la seule voie de désactivation.

### 2.3 Champs verrouillés vs libres

| Champ | Verrouillé (siège) | Libre (franchisé) |
|---|---|---|
| Nom | ✓ | |
| Description | ✓ | |
| Recette / étapes SOP | ✓ | |
| Prix HT | ✓ | |
| Prix local | | ✓ |
| Seuil de stock | | ✓ |
| Actif/inactif (optionnel uniquement) | | ✓ |

### 2.4 RLS Supabase

```sql
-- franchise_admin : accès complet à son org
CREATE POLICY "franchise_admin_catalog" ON network_catalog_items
  FOR ALL USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'franchise_admin'
  );

-- admin franchisé : lecture seule sur les items publiés de son réseau
CREATE POLICY "admin_read_catalog" ON network_catalog_items
  FOR SELECT USING (
    status = 'published'
    AND org_id = (
      SELECT o.id FROM organizations o
      JOIN establishments e ON e.org_id = o.id
      JOIN profiles p ON p.establishment_id = e.id
      WHERE p.id = auth.uid()
    )
  );

-- establishment_catalog_items : chaque établissement accède uniquement aux siennes
CREATE POLICY "establishment_catalog_items_rls" ON establishment_catalog_items
  FOR ALL USING (
    establishment_id = (SELECT establishment_id FROM profiles WHERE id = auth.uid())
  );
```

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
3. Clique "Publier" → route `POST /api/franchise/catalogue/[id]/publish`
4. **Propagation (logique applicative dans la route publish)** :
   - `status = 'published'`, `updated_at = now()`
   - Batch insert dans `establishment_catalog_items` pour tous les établissements actifs de l'`org_id`
   - `is_active = true`, `current_version = 1`

### 3.3 Flow de mise à jour

1. Siège édite un item publié
2. `previous_payload` ← valeur actuelle de `payload` (snapshot pour diff)
3. `payload` ← nouveau contenu, `version` += 1
4. `establishment_catalog_items.notified_at = now()` sur toutes les lignes liées
5. Bandeau de notification apparaît dans le dashboard franchisé

### 3.4 Flow d'archivage

- **Archivage d'un item optionnel :** `status = 'archived'`, `establishment_catalog_items.is_active = false` en cascade
- **Archivage d'un item obligatoire :** idem + avertissement UI "Cet item est obligatoire pour X établissements. L'archivage le désactivera partout."
- Un item archivé n'est pas supprimé. Il disparaît du bandeau franchisé mais reste en DB pour l'historique.

### 3.5 Mise à jour `is_mandatory` true → false ou false → true

- Si un item passe de `optional` à `mandatory` : `establishment_catalog_items.is_active = true` forcé sur tous les établissements du réseau + `notified_at = now()`
- Si un item passe de `mandatory` à `optional` : aucun changement automatique sur `is_active`

### 3.6 Compliance Score

```
score = (nb establishment_catalog_items WHERE is_active = true
         JOIN network_catalog_items WHERE is_mandatory = true AND status = 'published')
      / (nb total network_catalog_items WHERE is_mandatory = true AND status = 'published')
      × 100
```

Affiché dans le Command Center siège comme colonne `Conformité` dans le tableau des établissements.

### 3.7 Routes API siège

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/franchise/catalogue` | Liste items avec stats par établissement |
| POST | `/api/franchise/catalogue` | Créer un item (draft) |
| PATCH | `/api/franchise/catalogue/[id]` | Éditer (draft ou published) |
| POST | `/api/franchise/catalogue/[id]/publish` | Publication + propagation réseau |
| POST | `/api/franchise/catalogue/[id]/archive` | Archivage + cascade is_active = false |

---

## 4. Workflow Franchisé

### 4.1 Bandeau de notification (layout dashboard)

Condition : `establishment_catalog_items` contient des lignes où `notified_at IS NOT NULL AND (seen_at IS NULL OR seen_at < notified_at)`

> `"📦 3 éléments mis à jour par le siège · 1 nouveau produit optionnel disponible"` → lien `/dashboard/catalogue-reseau`

### 4.2 Page `/dashboard/catalogue-reseau`

Onglets : **Produits · Recettes · SOPs/Guides**

Par item :
- Badge `OBLIGATOIRE` ou `OPTIONNEL`
- Badge `NOUVEAU` (si `current_version = 1` et `seen_at IS NULL`) ou `MIS À JOUR` (si `current_version < catalog.version`)
- Diff visuel sur mise à jour : encadré "Avant / Après" comparant `previous_payload` et `payload` de `network_catalog_item_data`
- Champs éditables localement : prix local, seuil de stock
- Toggle activer/désactiver (optionnels uniquement — obligatoires non toggleables)
- Marquage automatique `seen_at = now()` à l'ouverture de l'onglet (via POST `/api/catalogue-reseau/[id]/seen`)

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
| POST | `/api/catalogue-reseau/[id]/seen` | Marquer comme vu (`seen_at = now()`) |

---

## 5. Features supplémentaires

### 5.1 Catalogue saisonnier
Items avec `is_seasonal = true` et `expires_at` : expiration vérifiée **à la lecture** dans la route GET (check `expires_at < now()`). Si expiré, l'item est retourné avec `status = 'archived'` sans modifier la DB — un job de nettoyage peut archiver proprement en arrière-plan. Affiché avec badge amber `SAISONNIER · expire le JJ/MM`.

### 5.2 Tracking SOPs
Les caissiers peuvent marquer un SOP catalogue comme "lu/pratiqué" :

```sql
CREATE TABLE sop_completions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL,
  catalog_item_id  uuid NOT NULL,
  user_id          uuid NOT NULL REFERENCES profiles(id),
  completed_at     timestamptz NOT NULL DEFAULT now()
);
```

Le siège voit le taux de complétion (`completed / total_staff`) par boutique dans la page Catalogue réseau.

### 5.3 Compliance Score dans Command Center
Colonne supplémentaire dans le tableau des établissements :
- Vert ≥ 90%
- Amber 70–89%
- Rouge < 70%

---

## 6. Architecture & patterns

- Suivre le pattern existant : `page.tsx` (SSR) → `*-page-client.tsx` (shell) → `_components/`
- Composants serveur par défaut, `'use client'` seulement si nécessaire
- CSS vars uniquement, jamais de couleurs hardcodées
- Propagation réseau = logique applicative dans les routes `/publish` et `/archive` (pas de trigger Postgres)
- Filtrer toujours par `establishment_id` côté franchisé, par `org_id` côté siège

---

## 7. Tests

- Unit : logique compliance score, calcul diff versions, batch onboarding, condition notification `seen_at IS NULL OR seen_at < notified_at`
- Integration : routes API avec Supabase réel (pas de mocks DB)
- E2E Playwright : flow siège (créer → publier → archiver), flow franchisé (voir notification → marquer vu → toggle optionnel), onboarding franchisé

---

## 8. Hors scope (pour cette itération)

- Système de versioning avec historique complet multi-versions
- Approbation workflow multi-niveaux
- Import/export catalogue CSV
- Notifications email/SMS sur publication
