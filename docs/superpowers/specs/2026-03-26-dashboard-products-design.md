# Dashboard Produits — Spec Technique

> Version : 1.0 — 2026-03-26
> Auteur : CTO Alloflow
> Source : mockup `37399-1774469424/products-mockup.html` (9 écrans)

---

## 1. Vue d'ensemble

### Objectif de la page
Le Dashboard Produits est le module central de gestion du catalogue pour un restaurant utilisant Alloflow. Il permet de créer, modifier, activer/désactiver et supprimer les produits vendus via la caisse et les systèmes de commande. Il inclut également la gestion des catégories et des taux de TVA.

### Utilisateurs cibles
- Gérants de restaurant (rôle Admin)
- Responsables de salle ayant accès aux paramètres catalogue (rôle Manager)

### URL
```
/dashboard/products
```

### Rôles autorisés
| Rôle | Accès en lecture | Création | Modification | Suppression | Gestion catégories |
|------|-----------------|----------|--------------|-------------|-------------------|
| Admin | Oui | Oui | Oui | Oui | Oui |
| Manager | Oui | Oui | Oui | Non | Oui |
| Staff | Non | Non | Non | Non | Non |

---

## 2. Layout & Structure

### Layout général
```
┌─────────────────────────────────────────────────────────┐
│  SIDEBAR (220px fixe)  │  MAIN AREA (flex: 1, scroll)   │
│  sticky top: 44px      │                                 │
└─────────────────────────────────────────────────────────┘
```

La page est composée de deux zones principales :

**Sidebar** (`width: 220px`, `background: #111827`, `border-right: 1px solid #334155`)
- Logo + nom du restaurant
- Navigation principale avec items cliquables
- Section "Paramètres" en bas de nav (margin-top: auto)
- Footer utilisateur (avatar, nom, rôle)

**Main area** (`flex: 1`, `overflow: auto`)
- Page header (titre + sous-titre + CTA primaire)
- Stats bar (4 cards de métriques)
- Toolbar (recherche + filtres + bouton catégories)
- Table des produits avec pagination
- Footer de pagination

### Zones visuelles (de haut en bas)
1. **Page header** — `padding: 24px 24px 16px` — flex space-between
2. **Stats bar** — `padding: 0 24px 16px` — flex gap 16px
3. **Toolbar** — `padding: 0 24px 12px` — flex gap 8px
4. **Table wrapper** — `margin: 0 24px` — border-radius 10px
5. **Table footer** — `padding: 12px 24px` — flex space-between
6. **Bulk bar** (conditionnel) — sticky bottom, visible uniquement si sélection active

---

## 3. Catalogue de tous les éléments (par écran)

### Écran 1 : Vue principale (`screen-main`)

#### Zone Sidebar — lecture Z gauche à droite, haut en bas

| Élément | Type | Action au clic | État(s) | Règles |
|---------|------|----------------|---------|--------|
| Logo "A" (carré bleu) | Élément visuel | Aucune | Statique | Toujours visible |
| "Alloflow" (nom) | Texte | Aucune | Statique | 15px font-weight 700 |
| "L'Entrecôte Dorée" (sous-titre) | Texte | Aucune | Statique | Nom du restaurant actif (tenant) |
| Nav item "Dashboard" | Lien de nav | Naviguer vers `/dashboard` | default / hover | Hover: `background: #1e293b` |
| Nav item "Produits" | Lien de nav | Aucune (page actuelle) | **active** (fond bleu #1d4ed8) | `color: white` quand active |
| Nav item "Commandes" | Lien de nav | Naviguer vers `/dashboard/orders` | default / hover | Badge rouge "3" à droite (compteur commandes en attente) |
| Nav item "Analytics" | Lien de nav | Naviguer vers `/dashboard/analytics` | default / hover | — |
| Nav item "Stocks" | Lien de nav | Naviguer vers `/dashboard/stocks` | default / hover | — |
| Nav item "CRM" | Lien de nav | Naviguer vers `/dashboard/crm` | default / hover | — |
| Nav item "Paramètres" | Lien de nav | Naviguer vers `/dashboard/settings` | default / hover | Positionné en bas (margin-top: auto) |
| Avatar "MA" | Bouton utilisateur | Ouvrir menu utilisateur (logout, profil) | default / hover | Background blue, initiales du prénom/nom |
| Nom "Marc Antoine" | Texte | — | — | Prénom + Nom de l'utilisateur connecté |
| Rôle "Admin" | Texte | — | — | Rôle de l'utilisateur |

#### Zone Main — Page Header

| Élément | Type | Action au clic | État(s) | Règles |
|---------|------|----------------|---------|--------|
| Titre "Produits" | H1 visuel | Aucune | Statique | 18px font-weight 700 |
| Sous-titre "84 produits · 76 actifs · 8 inactifs · 6 catégories" | Texte dynamique | Aucune | Calculé | Mis à jour après chaque opération CRUD |
| Bouton "+ Nouveau produit" | Bouton primaire | Ouvrir la modale d'ajout (Écran 2) | default / hover (`#1e40af`) | Désactivé si rôle insuffisant |

#### Zone Stats Bar (4 cartes)

| Élément | Type | Valeur affichée | Règles |
|---------|------|-----------------|--------|
| Card "Produits au catalogue" | Stat card | Nombre total de produits du tenant | Non cliquable |
| Card "Actifs ce soir" | Stat card | Nombre de produits avec `is_active = true` | Valeur en `--green` (#10b981) |
| Card "Inactifs / suspendus" | Stat card | Nombre de produits avec `is_active = false` | Valeur en `--text-muted` (#94a3b8) |
| Card "Prix TTC moyen" | Stat card | Moyenne des prix TTC de tous les produits actifs | Format `XX,XX€` |

#### Zone Toolbar

| Élément | Type | Action | État(s) | Règles |
|---------|------|--------|---------|--------|
| Input "Nom, référence…" | Champ de recherche | Filtrage en temps réel (debounce 300ms) | vide / avec valeur / focus (border bleu) | Recherche sur `name` et `internal_ref`. Max-width 320px |
| Dropdown "Catégorie — Tous" | Select filtrant | Filtrer la table par catégorie | Tous (défaut) / catégorie sélectionnée | Liste dynamique des catégories du tenant |
| Segment "Tous / Actifs / Inactifs" | Segmented control | Filtrer par statut `is_active` | Tous (défaut) / Actifs / Inactifs | Un seul segment actif à la fois. `.active` = `background: #263348` |
| Dropdown "TVA — Tous" | Select filtrant | Filtrer par taux TVA | Tous / 5,5% / 10% / 20% | — |
| Séparateur vertical | Élément visuel | Aucune | Statique | `width: 1px; height: 28px; background: #334155` |
| Bouton "Catégories" | Bouton ghost small | Ouvrir la modale Gestion catégories (Écran 6) | default / hover | — |

#### Zone Table

**En-têtes de colonnes :**

| Colonne | Largeur | Triable | Tri par défaut |
|---------|---------|---------|----------------|
| Checkbox select-all | 40px | Non | — |
| Nom | flex | Oui (↕) | Alphabétique ASC |
| Catégorie | 130px | Non | — |
| Prix TTC | 90px, aligné droite | Oui (↕) | — |
| TVA | 70px, centré | Non | — |
| Statut | 90px, centré | Non | — |
| Actions | 50px, centré | Non | — |

| Élément | Type | Action au clic | État(s) | Règles |
|---------|------|----------------|---------|--------|
| Checkbox en-tête | Checkbox | Sélectionner / désélectionner toutes les lignes de la page | unchecked / checked / indeterminate | Indeterminate si sélection partielle |
| En-tête "Nom ↕" | Th sortable | Tri ASC → DESC → aucun | default / hover / sorted | cursor: pointer, hover: `color: #94a3b8` |
| En-tête "Prix TTC ↕" | Th sortable | Tri ASC → DESC → aucun | idem | — |

**Lignes de la table (par produit) :**

| Élément | Type | Action au clic | État(s) | Règles |
|---------|------|----------------|---------|--------|
| Checkbox ligne | Checkbox | Sélectionner la ligne | unchecked / checked | Sélection → fond `rgba(29,78,216,.06)` + border-left bleu |
| Nom du produit | Texte | Aucune (direct sur action ✏️) | — | `font-size: 14px; font-weight: 600` |
| Référence interne | Texte | Aucune | — | `font-family: monospace; font-size: 11px; color: muted` |
| Badge catégorie | Badge coloré | Aucune | Par catégorie (5 couleurs) | Voir section Tokens couleurs catégories |
| Prix TTC | Texte | Aucune | — | Bold, aligné droite |
| Prix HT | Texte sous le prix TTC | Aucune | — | `font-size: 11px; color: muted`, format "XX,XX€ HT" |
| Badge TVA | Badge amber | Aucune | 10% (amber) / 20% (orange) | `font-family: monospace` |
| Toggle statut | Toggle interactif | Basculer `is_active` (appel PATCH immédiat) | on (vert) / off (gris) | Label "Actif" / "Inactif" à côté. Optimistic update + toast feedback |
| Bouton ✏️ (éditer) | Action button | Ouvrir modale Édition (Écran 3) | opacity 0 par défaut, opacity 1 au hover de la ligne | `width: 28px; height: 28px` |
| Bouton ⋯ (more) | Action button | Ouvrir dropdown contextuel (Écran 9) | opacity 0 par défaut, opacity 1 au hover | Exception : toujours visible (`opacity: 1`) pour les produits inactifs |

**Règle d'opacité des lignes inactives :**
Les lignes avec `is_active = false` ont `opacity: 0.6` et leurs boutons d'action sont toujours visibles (classe `row-actions always`).

#### Zone Table Footer (pagination)

| Élément | Type | Action | État(s) | Règles |
|---------|------|--------|---------|--------|
| Compteur "1–25 sur 84 produits" | Texte dynamique | Aucune | Mis à jour selon filtre/page | Format : `{début}–{fin} sur {total} produits` |
| Bouton ← (page précédente) | Pagination | Page précédente | disabled si page 1 | `width: 30px; height: 30px` |
| Bouton de page "1" | Pagination | Aller à la page 1 | **active** (fond bleu) | Fond bleu + color white pour la page courante |
| Bouton de page "2", "3" | Pagination | Aller à la page correspondante | default / hover | — |
| Ellipse "…" | Texte | Aucune | — | Affiché si > 4 pages |
| Bouton de page "4" (dernière) | Pagination | Aller à la dernière page | default | — |
| Bouton → (page suivante) | Pagination | Page suivante | disabled si dernière page | — |
| Dropdown "Afficher — 25 par page" | Select | Changer le nombre de lignes par page | 10 / 25 / 50 / 100 | Recharge la table en page 1 |

---

### Écran 2 : Ajout produit (`screen-form-add`)

La table en arrière-plan est rendue à `opacity: 0.35` et `pointer-events: none` pendant que la modale est ouverte.

#### Modale "Nouveau produit"

| Élément | Type | Action | État(s) | Règles |
|---------|------|--------|---------|--------|
| Titre "Nouveau produit" | H2 | Aucune | — | `font-size: 16px; font-weight: 700` |
| Sous-titre "Remplissez les informations..." | Texte | Aucune | — | — |
| Bouton ×  (fermer) | Icon button | Fermer la modale sans sauvegarder | default / hover | Hover: `background: #263348` |
| **Section "Informations générales"** | — | — | — | — |
| Label "Nom du produit *" | Label champ | — | — | Obligatoire (marqué `*`) |
| Input "Nom du produit" | Text input | — | vide / focus (border bleu) / erreur (border rouge) | `autofocus` à l'ouverture. Max 100 chars |
| Label "Référence interne" | Label champ | — | — | Optionnel |
| Input "Référence interne" | Text input | — | vide (placeholder "PRD-085 (auto)") / rempli | Générée automatiquement si vide (format PRD-{n}) |
| Hint "Générée automatiquement si vide" | Texte d'aide | Aucune | — | `font-size: 11px; color: muted` |
| Label "Catégorie *" | Label champ | — | — | Obligatoire |
| Select catégorie | Select dropdown | Sélectionner une catégorie | "Sélectionner…" (défaut) / catégorie choisie / erreur | Options : catégories du tenant + séparateur + "➕ Créer une catégorie" (ouvre la modale catégories) |
| Label "Description" | Label champ | — | — | Optionnel |
| Textarea description | Textarea | — | vide / rempli | `rows: 2`, `resize: vertical`, max 200 chars |
| Compteur "0 / 200 caractères" | Texte dynamique | Aucune | Mis à jour en temps réel | Passe en rouge à 200 chars |
| **Section "Prix et fiscalité"** | — | — | — | — |
| Label "Prix HT *" | Label champ | — | — | Obligatoire |
| Input "Prix HT" | Number input | — | vide / rempli / focus | `step: 0.01`, min: 0.01. Saisir HT → calcule TTC automatiquement |
| Label "Taux TVA *" | Label champ | — | — | Obligatoire |
| Select TVA | Select dropdown | Choisir le taux | 5,5% / **10% (défaut sélectionné)** / 20% | Libellés : "5,5% — Produits essentiels", "10% — Restauration (défaut)", "20% — Alcool / standard" |
| Bloc "Prix TTC calculé" | Computed display | Aucune (lecture seule) | `— €` si HT vide / valeur calculée | Fond `rgba(29,78,216,.1)`, border bleu. Badge TVA à droite. Calcul : `prix_ht * (1 + tva/100)` arrondi à 2 décimales |
| Hint "Vous pouvez aussi saisir le TTC..." | Texte d'aide | Aucune | — | Note informative. Implique qu'on peut aussi remplir TTC → HT calculé |
| **Section "Disponibilité"** | — | — | — | — |
| Label "Produit actif" | Texte | — | — | — |
| Sous-label "Visible sur la caisse et les commandes" | Texte d'aide | — | — | — |
| Toggle "Produit actif" | Toggle | Basculer l'état | **on (actif par défaut)** / off | Vert quand actif |
| **Footer modale** | — | — | — | — |
| Bouton "Annuler" | Bouton ghost | Fermer la modale sans sauvegarder | default / hover | Équivalent à ×. Pas de confirmation si formulaire vierge |
| Bouton "Enregistrer le produit" | Bouton primaire | Valider + POST /api/products | default / hover / loading / disabled | Disabled si champs obligatoires vides. Loading spinner pendant l'appel API. Toast succès ou erreur |

---

### Écran 3 : Édition produit (`screen-form-edit`)

La ligne en cours d'édition dans la table arrière-plan est mise en surbrillance : `background: rgba(29,78,216,.1)` + `border-left: 2px solid var(--blue)`.

#### Différences avec l'Écran 2 (Ajout)

| Élément | Différence |
|---------|------------|
| Titre modale | "Modifier — {Nom du produit}" au lieu de "Nouveau produit" |
| Sous-titre | "{REF} · Modifié il y a {durée}" (ex : "PRD-001 · Modifié il y a 3 jours") |
| Tous les champs | Pré-remplis avec les valeurs existantes |
| Référence interne | Éditable (non auto-générée en mode édition) |
| Section Disponibilité | Contient un toggle supplémentaire : **"Service du soir uniquement"** |
| Bouton de validation | Libellé : "Enregistrer les modifications" (icône 💾 présente) |
| Méthode API | PATCH /api/products/[id] |

#### Toggle additionnel en mode édition

| Élément | Type | Action | État(s) | Règles |
|---------|------|--------|---------|--------|
| Toggle "Service du soir uniquement" | Toggle | Restreindre la visibilité au service du soir | off (défaut) / on | Sous-label : "Ne s'affiche que pour les services soir". Champ `evening_only: boolean` |

---

### Écran 4 : État vide (`screen-empty`)

S'affiche quand `products.count === 0` pour le tenant.

| Élément | Type | Action | État(s) | Règles |
|---------|------|--------|---------|--------|
| Titre "Produits" | H1 | Aucune | — | — |
| Sous-titre "0 produits · 0 catégories" | Texte dynamique | Aucune | — | — |
| Bouton "+ Nouveau produit" | Bouton primaire | Ouvrir modale ajout | — | Toujours visible même en état vide |
| Icône 🍽️ (grande) | Élément visuel | Aucune | `opacity: 0.4` | `font-size: 48px` |
| Titre "Votre catalogue est vide" | Texte | Aucune | — | `font-size: 16px; font-weight: 600` |
| Texte explicatif | Paragraphe | Aucune | — | "Commencez par créer vos catégories (Plats, Entrées, Boissons…), puis ajoutez vos produits avec leurs prix et TVA." `max-width: 320px` |
| Bouton "Créer des catégories" | Bouton ghost | Ouvrir modale Gestion catégories (Écran 6) | default / hover | Action prioritaire recommandée |
| Bouton "+ Ajouter un premier produit" | Bouton primaire | Ouvrir modale ajout (Écran 2) | default / hover | — |

---

### Écran 5 : Chargement skeleton (`screen-skeleton`)

État de chargement initial affiché pendant le fetch des données. Tous les éléments de données sont remplacés par des blocs skeleton animés.

#### Règle d'animation skeleton
```css
@keyframes shimmer { 0% { opacity: .4; } 50% { opacity: .7; } 100% { opacity: .4; } }
animation: shimmer 1.5s ease-in-out infinite;
background: #263348;
```

| Zone | Éléments skeleton |
|------|------------------|
| Page header | Sous-titre : bloc `180×14px`. Bouton "+ Nouveau produit" : bloc `140×34px` border-radius 6px |
| Stats bar | 3 cartes avec 2 blocs chacune (valeur `40×24px` + label variable) |
| Toolbar | 3 blocs (280×34, 130×34, 160×34px) border-radius 6px |
| Table (5 lignes) | Par ligne : checkbox (16×16px), nom (variable×14 + ref 60×10), badge catégorie (80×22px radius 12), prix (variable×14), badge TVA (36×20 radius 4), toggle (50×20 radius 10) |

**Note :** Les en-têtes de colonnes et le cadre de la table restent affichés normalement pendant le chargement.

---

### Écran 6 : Gestion catégories (`screen-categories`)

Modale centrée `width: 520px` par-dessus la table (même pattern overlay que les Écrans 2/3).

#### Modale "Gérer les catégories"

| Élément | Type | Action | État(s) | Règles |
|---------|------|--------|---------|--------|
| Titre "Gérer les catégories" | H2 | Aucune | — | — |
| Sous-titre "6 catégories · Glissez pour réordonner" | Texte | Aucune | — | Nombre dynamique |
| Bouton × (fermer) | Icon button | Fermer sans sauvegarder | — | — |

**Liste des catégories (drag & drop pour réordonner) :**

Chaque ligne de catégorie contient :

| Élément | Type | Action | État(s) | Règles |
|---------|------|--------|---------|--------|
| Handle ⠿ (drag) | Drag handle | Commencer le glisser-déposer | default / grabbing | `cursor: grab` → `grabbing` pendant drag |
| Pastille couleur | Carré coloré 14×14px | Aucune (modifiable via bouton 🎨) | Couleur assignée / dashed si nouvelle | `border-radius: 3px` |
| Nom de la catégorie | Texte | Aucune (éditable inline via double-clic ?) | — | `font-size: 13px; font-weight: 500` |
| Compteur de produits | Texte | Aucune | Ex: "32 produits" | `font-size: 12px; color: muted` |
| Bouton 🎨 (couleur) | Action button | Ouvrir color picker | — | Permet de changer la couleur de la catégorie |
| Bouton 🗑️ (supprimer) | Action button danger | Supprimer la catégorie | — | Hover: fond `rgba(239,68,68,.15)`, color red. Bloqué si la catégorie contient des produits (règle métier) |

**Ligne de création in-situ (état d'ajout en cours) :**

| Élément | Type | Action | État(s) | Règles |
|---------|------|--------|---------|--------|
| Handle ⠿ | Drag handle | — | Désactivé (nouvelle ligne) | — |
| Pastille couleur (grise dashed) | Visuel | — | Couleur par défaut #6b7280, border dashed | Sera remplacée après choix couleur |
| Input "Nom de la catégorie…" | Text input | — | Focus automatique (`autofocus`) | Fond bleu `rgba(29,78,216,.08)` + `border-color: var(--blue)` pour la ligne |
| Bouton ✓ | Action button | Confirmer la création | — | Sauvegarde en base |
| Bouton ✕ | Action button danger | Annuler la création | — | Supprime la ligne temporaire |

**Footer de la liste :**

| Élément | Type | Action | État(s) | Règles |
|---------|------|--------|---------|--------|
| Bouton "+ Nouvelle catégorie" | Bouton ghost pleine largeur | Ajouter une ligne de création | — | `width: 100%; justify-content: center` |

**Footer modale :**

| Élément | Type | Action | État(s) | Règles |
|---------|------|--------|---------|--------|
| Bouton "Annuler" | Bouton ghost | Fermer sans sauvegarder | — | Annule toutes les modifications non confirmées |
| Bouton "Enregistrer" | Bouton primaire | Sauvegarder l'ordre + les modifications | default / loading | POST/PATCH /api/categories |

---

### Écran 7 : Suppression (`screen-delete`)

Modale de confirmation destructive `width: 420px`, `border: 1px solid rgba(239,68,68,.3)`.

| Élément | Type | Action | État(s) | Règles |
|---------|------|--------|---------|--------|
| Zone header danger | Header coloré | Aucune | `background: rgba(69,10,10,.6)` | Zone rouge sombre distinctive |
| Icône ⚠️ | Visuel d'alerte | Aucune | `font-size: 24px` | — |
| Titre "Supprimer définitivement ?" | Texte danger | Aucune | `color: #fca5a5` | — |
| Sous-titre "Cette action est irréversible" | Texte | Aucune | — | — |
| Bouton × | Icon button | Annuler et fermer | — | — |
| Card récapitulatif du produit | Zone info | Aucune | — | Affiche l'icône de la catégorie, le nom du produit, la référence, la catégorie et le prix TTC. Background `--bg` + border |
| Texte d'explication | Paragraphe | Aucune | — | "Le produit sera supprimé de votre catalogue et ne pourra plus être utilisé dans de nouvelles commandes. L'historique des commandes passées sera conservé." `line-height: 1.5` |
| Bloc d'avertissement amber | Alerte contextuelle | Lien "Désactivez-le plutôt" cliquable | — | Background `rgba(245,158,11,.1)`, border amber. Propose la désactivation comme alternative. Le lien "Désactivez-le plutôt" bascule le toggle directement et ferme la modale |
| Bouton "Annuler" | Bouton ghost | Fermer la modale | — | Action sûre |
| Bouton "Supprimer définitivement" | Bouton danger (rouge) | DELETE /api/products/[id] puis fermer | default / loading | Loading pendant l'appel. Toast succès ou erreur. En cas de succès : rafraîchissement de la liste |

---

### Écran 8 : Sélection en masse (`screen-bulk`)

Affiche la Bulk Action Bar en bas de page quand au moins un produit est sélectionné.

#### Règles de sélection

| Élément | Type | Action | État(s) | Règles |
|---------|------|--------|---------|--------|
| Checkbox en-tête (cochée) | Checkbox | Tout désélectionner | **checked** / indeterminate | Quand toute la page est sélectionnée → état checked plein |
| Lignes sélectionnées | Lignes table | — | Fond `rgba(29,78,216,.06)` + `border-left: 2px solid var(--blue)` | Style de sélection active |
| Lignes non sélectionnées | Lignes table | — | Style normal | — |

#### Bulk Action Bar (sticky bottom)

```
position: sticky; bottom: 0; margin: 8px 24px 0;
background: var(--blue); border-radius: 8px; padding: 10px 16px;
box-shadow: 0 8px 24px rgba(0,0,0,.4);
```

| Élément | Type | Action | État(s) | Règles |
|---------|------|--------|---------|--------|
| Compteur "3 produits sélectionnés" | Texte | Aucune | Mis à jour en temps réel | Format : `{n} produit(s) sélectionné(s)` |
| "Tout désélectionner" | Lien texte | Vider la sélection | — | `color: rgba(255,255,255,.5)`, cursor pointer |
| Séparateur vertical | Élément visuel | Aucune | — | `1px solid rgba(255,255,255,.2)` |
| Bouton "Activer" | Bulk action button | PATCH `is_active: true` sur tous les sélectionnés | default / hover | Hover: `background: rgba(255,255,255,.1)`. Toast avec nombre de produits modifiés |
| Bouton "Désactiver" | Bulk action button | PATCH `is_active: false` sur tous les sélectionnés | default / hover | Idem |
| Select "Changer catégorie…" | Select in-bar | Changer la catégorie de tous les sélectionnés | placeholder / catégorie choisie | Options : liste des catégories. Action immédiate à la sélection d'une option (pas de confirmation) |
| Select "Changer TVA…" | Select in-bar | Changer le taux TVA de tous les sélectionnés | placeholder / taux choisi | Options : 5,5% / 10% / 20%. Action immédiate. Toast de confirmation |
| Séparateur vertical | Élément visuel | Aucune | — | idem |
| Bouton "Supprimer" | Bulk action button danger | Ouvrir modale de confirmation suppression en masse | default / hover | `border-color: rgba(239,68,68,.5); color: #fca5a5`. Hover: fond rouge semi-transparent. La modale de confirmation adapte son message au nombre de produits |

---

### Écran 9 : Actions row + toasts (`screen-dropdown`)

Montre deux états simultanément : un dropdown contextuel ouvert sur une ligne ET des toasts de feedback.

#### Dropdown contextuel (menu ⋯)

S'affiche en `position: absolute; right: 8px; top: 36px` de la dernière cellule de la ligne.

| Élément | Type | Action | État(s) | Règles |
|---------|------|--------|---------|--------|
| Item "Modifier" | Dropdown item | Ouvrir la modale d'édition (Écran 3) | default / hover (`#263348`) | — |
| Item "Dupliquer" | Dropdown item | POST /api/products (copie avec nom "Copie de {nom}") | default / hover | Nouveau produit inactif par défaut. Toast de succès avec lien "Modifier" |
| Séparateur | Ligne hr | Aucune | — | `height: 1px; background: #334155` |
| Item "Désactiver temporairement" | Dropdown item | PATCH `is_active: false` | default / hover | Si produit déjà inactif → libellé devient "Réactiver" |
| Séparateur | Ligne hr | Aucune | — | — |
| Item "Supprimer définitivement" | Dropdown item danger | Ouvrir la modale de confirmation (Écran 7) | default / hover (fond `rgba(239,68,68,.1)`) | `color: var(--red)` |

**Comportement du dropdown :**
- Ouvert par clic sur bouton ⋯
- Fermé par : clic à l'extérieur (click outside) / clic sur un item / touche Échap
- Un seul dropdown ouvert à la fois

#### Zone Recherche avec highlight

| Élément | Type | Règles |
|---------|------|--------|
| Texte surligné dans la recherche | `<mark>` tag | Background `rgba(245,158,11,.25)`, color amber. Appliqué sur le terme de recherche dans les résultats |

#### Zone Toasts (bas droite)

Position : `fixed; bottom: 24px; right: 24px; flex-direction: column; gap: 8px; z-index: 9999`

| Toast | Type | Contenu | Durée | Règles |
|-------|------|---------|-------|--------|
| Toast succès | `border-left: 3px solid #10b981` | Icône ✅ + texte "Entrecôte 300g — statut mis à jour" | Auto-dismiss 3s | — |
| Toast erreur | `border-left: 3px solid #ef4444` | Icône ⚠️ + texte "Impossible de modifier le statut. Réessayez." | Auto-dismiss 5s (erreurs restent plus longtemps) | — |

**Règles générales des toasts :**
- Empilables (plusieurs toasts simultanés possibles)
- Auto-dismiss avec transition de fade-out
- Minimum `min-width: 260px`
- Pas de bouton de fermeture dans le mockup (à décider en implémentation)

---

## 4. Modèle de données

### Table `products`

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK, DEFAULT gen_random_uuid() | Identifiant unique |
| `tenant_id` | `uuid` | FK → `tenants.id`, NOT NULL, INDEX | Isolement multi-tenant |
| `name` | `varchar(100)` | NOT NULL, CHECK(length > 0) | Nom du produit |
| `internal_ref` | `varchar(20)` | UNIQUE (scoped to tenant_id) | Référence interne (ex: PRD-001). Auto-générée si null |
| `description` | `varchar(200)` | NULLABLE | Description courte |
| `category_id` | `uuid` | FK → `categories.id`, NOT NULL | Catégorie du produit |
| `price_ht` | `numeric(10,2)` | NOT NULL, CHECK(price_ht > 0) | Prix hors taxes en euros |
| `tva_rate` | `numeric(4,2)` | NOT NULL, CHECK(tva_rate IN (5.5, 10, 20)) | Taux de TVA applicable |
| `price_ttc` | `numeric(10,2)` | GENERATED ALWAYS AS (price_ht * (1 + tva_rate / 100)) STORED | Prix TTC calculé automatiquement |
| `is_active` | `boolean` | NOT NULL, DEFAULT true | Produit visible sur la caisse |
| `evening_only` | `boolean` | NOT NULL, DEFAULT false | Restreint au service du soir |
| `sort_order` | `integer` | DEFAULT 0 | Ordre d'affichage dans le catalogue |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | Date de création |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() | Date de dernière modification (auto-update via trigger) |
| `deleted_at` | `timestamptz` | NULLABLE | Soft delete (NULL = actif) |

**Index :**
- `idx_products_tenant_id` sur `(tenant_id)`
- `idx_products_category_id` sur `(category_id)`
- `idx_products_tenant_active` sur `(tenant_id, is_active)`
- `idx_products_ref` sur `(tenant_id, internal_ref)` UNIQUE

**Contrainte de unicité de référence :**
```sql
UNIQUE (tenant_id, internal_ref)
```

### Table `categories`

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK, DEFAULT gen_random_uuid() | Identifiant unique |
| `tenant_id` | `uuid` | FK → `tenants.id`, NOT NULL, INDEX | Isolement multi-tenant |
| `name` | `varchar(50)` | NOT NULL, CHECK(length > 0) | Nom de la catégorie |
| `color_hex` | `varchar(7)` | NOT NULL, DEFAULT '#6b7280' | Couleur au format #RRGGBB |
| `icon` | `varchar(10)` | NULLABLE | Emoji ou code icône |
| `sort_order` | `integer` | NOT NULL, DEFAULT 0 | Ordre d'affichage (drag & drop) |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | — |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() | — |

**Index :**
- `idx_categories_tenant_id` sur `(tenant_id)`
- `idx_categories_sort` sur `(tenant_id, sort_order)`

### Relations

```
tenants (1) ──── (N) products
tenants (1) ──── (N) categories
categories (1) ── (N) products
```

**Contrainte ON DELETE pour `products.category_id` :**
`RESTRICT` — une catégorie ne peut pas être supprimée si elle contient des produits.

### Génération automatique de `internal_ref`

Trigger ou logique applicative :
```
PRD-{padded_number}
```
Le numéro est incrémental par tenant. Format : `PRD-001`, `PRD-002`, ..., `PRD-999`, `PRD-1000`.

---

## 5. API Endpoints

### Conventions générales
- Authentification : Bearer token (JWT Supabase)
- Toutes les routes vérifient `tenant_id` via RLS ou middleware
- Réponses en JSON
- Format des erreurs : `{ "error": { "code": "string", "message": "string" } }`
- Pagination : query params `page` (défaut: 1) et `per_page` (défaut: 25, max: 100)

---

### `GET /api/products`

**Description :** Lister les produits du tenant avec filtres, tri et pagination.

**Query params :**

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `page` | integer | 1 | Numéro de page |
| `per_page` | integer | 25 | Lignes par page (max 100) |
| `search` | string | — | Recherche sur `name` et `internal_ref` (ILIKE %term%) |
| `category_id` | uuid | — | Filtrer par catégorie |
| `is_active` | boolean | — | Filtrer par statut (absent = tous) |
| `tva_rate` | number | — | Filtrer par taux TVA (5.5, 10, 20) |
| `sort` | string | `name` | Champ de tri : `name`, `price_ttc`, `created_at` |
| `order` | string | `asc` | Direction : `asc` ou `desc` |

**Réponse 200 :**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Entrecôte 300g",
      "internal_ref": "PRD-001",
      "description": null,
      "category": { "id": "uuid", "name": "Plats", "color_hex": "#3b82f6", "icon": "🍽️" },
      "price_ht": 24.00,
      "tva_rate": 10,
      "price_ttc": 26.40,
      "is_active": true,
      "evening_only": false,
      "updated_at": "2026-03-23T10:00:00Z"
    }
  ],
  "meta": {
    "total": 84,
    "page": 1,
    "per_page": 25,
    "total_pages": 4
  },
  "stats": {
    "total": 84,
    "active": 76,
    "inactive": 8,
    "avg_price_ttc": 14.80
  }
}
```

**Erreurs :**
- `401 Unauthorized` — token absent ou expiré
- `403 Forbidden` — tenant_id ne correspond pas au token
- `422 Unprocessable` — paramètre de filtre invalide

---

### `POST /api/products`

**Description :** Créer un nouveau produit.

**Body :**
```json
{
  "name": "string (required, max 100)",
  "internal_ref": "string (optional, auto-generated if absent)",
  "description": "string (optional, max 200)",
  "category_id": "uuid (required)",
  "price_ht": "number (required, > 0)",
  "tva_rate": "number (required, in [5.5, 10, 20])",
  "is_active": "boolean (default: true)",
  "evening_only": "boolean (default: false)"
}
```

**Réponse 201 :** Le produit créé (objet complet).

**Erreurs :**
- `400 Bad Request` — body malformé
- `401 Unauthorized`
- `403 Forbidden`
- `409 Conflict` — `internal_ref` déjà utilisée sur ce tenant
- `422 Unprocessable Entity` — validation échouée, avec détail par champ :
  ```json
  { "error": { "code": "VALIDATION_ERROR", "fields": { "name": "required", "price_ht": "must_be_positive" } } }
  ```

**Règles de sécurité :**
- Le `tenant_id` est injecté depuis le JWT (jamais depuis le body)
- Vérification que `category_id` appartient au même `tenant_id`

---

### `PATCH /api/products/[id]`

**Description :** Modifier partiellement un produit existant.

**Params :** `id` (uuid du produit)

**Body :** Tout champ de `POST /api/products` (tous optionnels en PATCH).

Cas d'usage particuliers :
- Toggle statut : `{ "is_active": false }`
- Changement TVA en masse : `{ "tva_rate": 20 }`

**Réponse 200 :** Le produit mis à jour.

**Erreurs :**
- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found` — produit inexistant ou appartenant à un autre tenant
- `409 Conflict` — `internal_ref` en conflit
- `422 Unprocessable Entity`

**Règles de sécurité :**
- Vérification que le produit appartient au `tenant_id` du token
- Rôle Manager ne peut pas modifier `tenant_id` ni `internal_ref` d'un produit archivé
- `updated_at` mis à jour automatiquement

---

### `DELETE /api/products/[id]`

**Description :** Supprimer définitivement un produit (soft delete avec `deleted_at`).

**Params :** `id` (uuid du produit)

**Réponse 200 :**
```json
{ "success": true, "id": "uuid" }
```

**Erreurs :**
- `401 Unauthorized`
- `403 Forbidden` — rôle Manager ne peut pas supprimer
- `404 Not Found`
- `409 Conflict` — produit présent dans des commandes actives (non archivées)

**Règles métier :**
- Soft delete : le produit n'est pas physiquement supprimé, `deleted_at = now()` est positionné
- L'historique des commandes passées est préservé (FK nullable ou référence figée)
- Un produit avec des commandes actives (non terminées) ne peut pas être supprimé

---

### `GET /api/categories`

**Description :** Lister les catégories du tenant, ordonnées par `sort_order`.

**Query params :** Aucun (pas de pagination, le nombre de catégories est limité)

**Réponse 200 :**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Plats",
      "color_hex": "#3b82f6",
      "icon": "🍽️",
      "sort_order": 0,
      "products_count": 32
    }
  ]
}
```

---

### `POST /api/categories`

**Description :** Créer une nouvelle catégorie.

**Body :**
```json
{
  "name": "string (required, max 50)",
  "color_hex": "string (optional, default: '#6b7280')",
  "icon": "string (optional)",
  "sort_order": "integer (optional)"
}
```

**Réponse 201 :** La catégorie créée.

**Erreurs :**
- `409 Conflict` — nom de catégorie déjà existant sur ce tenant
- `422 Unprocessable Entity`

---

### `PATCH /api/categories/[id]`

**Description :** Modifier une catégorie (nom, couleur, ordre).

**Body :** Tout champ de POST (tous optionnels).

Cas d'usage particulier — réorganisation par drag & drop :
```json
{ "sort_order": 2 }
```
Ou réorganisation complète en batch :
```
PATCH /api/categories/reorder
Body: { "order": ["uuid1", "uuid2", "uuid3"] }
```

**Réponse 200 :** La catégorie mise à jour.

---

### `DELETE /api/categories/[id]`

**Description :** Supprimer une catégorie.

**Réponse 200 :** `{ "success": true }`

**Erreurs :**
- `409 Conflict` — la catégorie contient des produits (règle `RESTRICT`)

---

### Endpoints de bulk actions

#### `PATCH /api/products/bulk`

**Body :**
```json
{
  "ids": ["uuid1", "uuid2", "uuid3"],
  "patch": {
    "is_active": true,
    "category_id": "uuid (optional)",
    "tva_rate": 10
  }
}
```

**Réponse 200 :**
```json
{ "updated": 3, "ids": ["uuid1", "uuid2", "uuid3"] }
```

#### `DELETE /api/products/bulk`

**Body :**
```json
{ "ids": ["uuid1", "uuid2"] }
```

**Réponse 200 :**
```json
{ "deleted": 2 }
```

---

## 6. États & Transitions

### Diagramme d'états de la page

```
[INITIAL]
    │
    ▼
[LOADING] ──── fetch /api/products ────►  [EMPTY]   (0 produits)
    │                                         │
    ▼                                         ▼
[LIST_VIEW] ◄─────────────────────── [EMPTY_ACTIONS] (créer catégorie / ajouter produit)
    │
    ├──── click "+ Nouveau produit" ──────► [MODAL_ADD]
    │                                          │
    │                                     ┌───┴────────────────┐
    │                                  [SUBMIT]             [CANCEL]
    │                                     │                    │
    │                              [API_CREATING]         [LIST_VIEW]
    │                                     │
    │                            success ─┤─ error
    │                               │         │
    │                         [LIST_VIEW]  [MODAL_ADD + error toast]
    │
    ├──── click ✏️ ou "Modifier" ─────────► [MODAL_EDIT]
    │                                          │
    │                                   (même pattern que MODAL_ADD)
    │
    ├──── click toggle statut ────────────► [OPTIMISTIC_UPDATE]
    │                                          │
    │                                    success ─┤─ error
    │                                       │         │
    │                                 [LIST_VIEW]  [REVERT + error toast]
    │                                 + success toast
    │
    ├──── click "Supprimer" ──────────────► [MODAL_DELETE]
    │                                          │
    │                                   ┌──────┴──────────┐
    │                               [CONFIRM]          [CANCEL]
    │                                   │                  │
    │                            [API_DELETING]       [LIST_VIEW]
    │                                   │
    │                              success ─┤─ error
    │                                 │         │
    │                           [LIST_VIEW]  [error toast]
    │                           + success toast
    │
    ├──── checkbox sélection ────────────► [BULK_ACTIVE]
    │                                          │
    │                            tout désélectionner / ESC
    │                                          │
    │                                     [LIST_VIEW]
    │
    └──── click "Catégories" ─────────────► [MODAL_CATEGORIES]
                                               │
                                          [SAVE/CANCEL]
                                               │
                                          [LIST_VIEW]
```

### Conditions de transition

| Transition | Condition |
|-----------|-----------|
| LOADING → EMPTY | `data.length === 0` après fetch réussi |
| LOADING → LIST_VIEW | `data.length > 0` après fetch réussi |
| LOADING → LIST_VIEW (erreur) | Fetch échoué → afficher toast erreur, état vide avec retry |
| MODAL_ADD → API_CREATING | Formulaire valide (tous champs obligatoires remplis) |
| OPTIMISTIC_UPDATE → REVERT | Réponse API erreur 4xx/5xx |
| BULK_ACTIVE → LIST_VIEW | `selectedIds.length === 0` |
| MODAL_DELETE → API_DELETING | Clic sur "Supprimer définitivement" |

---

## 7. Validations & Règles métier

### Validation champ par champ

#### Champ `name`
- Obligatoire
- Longueur : 1 à 100 caractères
- Trim des espaces avant/après
- Message d'erreur : "Le nom du produit est requis" / "Le nom ne peut pas dépasser 100 caractères"

#### Champ `internal_ref`
- Optionnel à la saisie
- Si renseigné : 1 à 20 caractères, caractères alphanumériques + tirets autorisés (`/^[A-Z0-9-]+$/i`)
- Unicité par tenant (vérifiée côté API, affichage d'une erreur inline sur le champ)
- Si vide : auto-génération côté serveur au format `PRD-{n}` avec `n` incrémental
- Message d'erreur : "Cette référence est déjà utilisée"

#### Champ `category_id`
- Obligatoire
- Doit pointer vers une catégorie du même tenant
- Message d'erreur : "Veuillez sélectionner une catégorie"

#### Champ `description`
- Optionnel
- Maximum 200 caractères
- Compteur en temps réel dans le formulaire
- Message d'erreur : "La description ne peut pas dépasser 200 caractères"

#### Champ `price_ht`
- Obligatoire
- Doit être un nombre positif strict (> 0)
- Maximum 2 décimales
- Maximum pratique : 9999.99€
- Message d'erreur : "Le prix HT est requis" / "Le prix doit être supérieur à 0"

#### Champ `tva_rate`
- Obligatoire
- Valeurs autorisées exclusivement : `5.5`, `10`, `20`
- Valeur par défaut : `10` (restauration)
- Message d'erreur : "Taux de TVA invalide"

#### Champ `is_active`
- Obligatoire
- Boolean, défaut `true` pour la création
- Pas de validation spécifique

#### Champ `evening_only`
- Boolean, défaut `false`
- Visible uniquement en mode édition

### Règles de calcul TVA

```
price_ttc = price_ht × (1 + tva_rate / 100)
```
Exemples :
- 24,00 HT × 1,10 = **26,40 TTC** (TVA 10%)
- 20,00 HT × 1,20 = **24,00 TTC** (TVA 20%)
- 9,00 HT × 1,10 = **9,90 TTC** (TVA 10%)

Arrondi à 2 décimales (règle `ROUND_HALF_UP`).

**Saisie inverse (TTC → HT) :**
```
price_ht = price_ttc / (1 + tva_rate / 100)
```
La note dans le mockup indique que cette saisie est possible. Implémenter un second input TTC qui, lorsque modifié, recalcule HT automatiquement.

### Règles de suppression

1. **Soft delete uniquement** — `deleted_at = now()`, les données restent en base.
2. **Historique préservé** — les commandes passées contenant ce produit ne sont pas altérées.
3. **Blocage si commandes actives** — si le produit est dans une commande dont le statut n'est pas `COMPLETED` ou `CANCELLED`, la suppression retourne `409 Conflict`.
4. **Proposition de désactivation** — la modale de confirmation suggère toujours la désactivation comme alternative (via le lien "Désactivez-le plutôt").
5. **Rôle requis** — seul Admin peut supprimer. Manager → bouton absent ou désactivé.

### Règles de suppression de catégorie

1. Impossible si `products_count > 0` → erreur `409 Conflict`.
2. Message suggéré : "Cette catégorie contient {n} produits. Déplacez-les vers une autre catégorie avant de la supprimer."

### Règles de la sélection en masse

1. La bulk bar n'apparaît que si `selectedIds.length >= 1`.
2. La sélection est limitée à la page courante (pas de sélection inter-pages).
3. Les actions "Activer", "Désactiver", "Changer catégorie", "Changer TVA" ne déclenchent pas de confirmation.
4. L'action "Supprimer" en masse ouvre une modale de confirmation adaptée : "Supprimer {n} produits définitivement ?"
5. Après une action bulk, la sélection est vidée et les stats/liste sont rafraîchies.

---

## 8. Composants à créer

### `ProductsPage`
- **Fichier :** `app/dashboard/products/page.tsx`
- **Props :** aucune (Server Component qui récupère les données initiales)
- **State :** géré dans le Client Component enfant `ProductsClient`

---

### `ProductsClient`
- **Fichier :** `app/dashboard/products/_components/ProductsClient.tsx`
- **Props :** `initialData: ProductsResponse`
- **State :**
  - `products: Product[]`
  - `stats: ProductStats`
  - `filters: ProductFilters` (`search`, `category_id`, `is_active`, `tva_rate`)
  - `sort: { field, order }`
  - `pagination: { page, per_page, total }`
  - `selectedIds: Set<string>`
  - `modal: null | 'add' | 'edit' | 'delete' | 'categories' | 'bulk-delete'`
  - `editingProduct: Product | null`
  - `deletingProduct: Product | null`
  - `isLoading: boolean`

---

### `ProductsStatsBar`
- **Fichier :** `_components/ProductsStatsBar.tsx`
- **Props :** `stats: { total, active, inactive, avg_price_ttc }`
- **Comportement :** Affichage pur, pas de state local

---

### `ProductsToolbar`
- **Fichier :** `_components/ProductsToolbar.tsx`
- **Props :**
  - `filters: ProductFilters`
  - `categories: Category[]`
  - `onChange: (filters: ProductFilters) => void`
  - `onManageCategories: () => void`
- **State local :** `searchValue` (pour le debounce 300ms)
- **Comportement :** Debounce du champ de recherche avant d'appeler `onChange`

---

### `ProductsTable`
- **Fichier :** `_components/ProductsTable.tsx`
- **Props :**
  - `products: Product[]`
  - `selectedIds: Set<string>`
  - `sort: { field, order }`
  - `isLoading: boolean`
  - `onToggleSelect: (id: string) => void`
  - `onToggleSelectAll: () => void`
  - `onToggleActive: (product: Product) => void`
  - `onEdit: (product: Product) => void`
  - `onDelete: (product: Product) => void`
  - `onDuplicate: (product: Product) => void`
  - `onSortChange: (field: string) => void`
- **State local :** `openDropdownId: string | null` (pour le menu ⋯)
- **Comportement :** Click outside pour fermer le dropdown. Highlight du terme de recherche dans les noms.

---

### `ProductRow`
- **Fichier :** `_components/ProductRow.tsx`
- **Props :** Subset des props de `ProductsTable` pour une ligne
- **State local :** Aucun (contrôlé par le parent)

---

### `ProductFormModal`
- **Fichier :** `_components/ProductFormModal.tsx`
- **Props :**
  - `mode: 'add' | 'edit'`
  - `product: Product | null` (null pour add)
  - `categories: Category[]`
  - `onClose: () => void`
  - `onSuccess: (product: Product) => void`
- **State local :**
  - `formData: ProductFormData`
  - `errors: Record<string, string>`
  - `isSubmitting: boolean`
  - `computedPriceTtc: number | null`
- **Comportement :**
  - Calcul temps réel de `price_ttc` à chaque modification de `price_ht` ou `tva_rate`
  - Compteur de caractères pour description
  - Focus automatique sur le champ "Nom" à l'ouverture
  - Fermeture sur Échap ou clic sur l'overlay

---

### `DeleteConfirmModal`
- **Fichier :** `_components/DeleteConfirmModal.tsx`
- **Props :**
  - `product: Product | null`
  - `count: number` (pour bulk delete)
  - `onClose: () => void`
  - `onConfirm: () => Promise<void>`
- **State local :** `isDeleting: boolean`

---

### `CategoriesModal`
- **Fichier :** `_components/CategoriesModal.tsx`
- **Props :**
  - `categories: Category[]`
  - `onClose: () => void`
  - `onSuccess: (categories: Category[]) => void`
- **State local :**
  - `localCategories: Category[]` (copie de travail)
  - `newCategoryName: string`
  - `isAddingNew: boolean`
  - `isSaving: boolean`
- **Comportement :**
  - Drag & drop avec `@dnd-kit/sortable` ou équivalent
  - Les modifications sont locales jusqu'au clic "Enregistrer"
  - "Annuler" revert à l'état initial

---

### `BulkActionBar`
- **Fichier :** `_components/BulkActionBar.tsx`
- **Props :**
  - `selectedCount: number`
  - `categories: Category[]`
  - `onDeselect: () => void`
  - `onActivate: () => void`
  - `onDeactivate: () => void`
  - `onChangeCategory: (categoryId: string) => void`
  - `onChangeTva: (rate: number) => void`
  - `onDelete: () => void`
- **Comportement :** Visible uniquement si `selectedCount > 0`

---

### `StatusToggle`
- **Fichier :** `_components/StatusToggle.tsx`
- **Props :**
  - `isActive: boolean`
  - `onChange: (newValue: boolean) => Promise<void>`
  - `disabled?: boolean`
- **State local :** `isLoading: boolean` (pendant l'appel PATCH)
- **Comportement :** Optimistic update → revert si erreur + toast

---

### `SkeletonTable`
- **Fichier :** `_components/SkeletonTable.tsx`
- **Props :** `rows?: number` (défaut: 5)
- **Comportement :** Affichage pur des blocs skeleton animés

---

### `ProductCategoryBadge`
- **Fichier :** `_components/ProductCategoryBadge.tsx`
- **Props :** `category: Category`
- **Comportement :** Affiche le badge coloré avec l'icône et le nom

---

### `TvaBadge`
- **Fichier :** `_components/TvaBadge.tsx`
- **Props :** `rate: 5.5 | 10 | 20`
- **Comportement :** Couleur amber pour 5.5% et 10%, orange pour 20%

---

### `Toast` / `ToastProvider`
- **Fichier :** `_components/Toast.tsx` ou utiliser une lib (ex: `sonner`)
- **Props du toast :** `type: 'success' | 'error'`, `message: string`, `duration?: number`
- **Comportement :** Stack bas-droite, auto-dismiss (3s succès, 5s erreur)

---

## 9. Sécurité

### RLS Policies Supabase (ou équivalent)

#### Table `products`

```sql
-- SELECT : un utilisateur ne voit que les produits de son tenant
CREATE POLICY "products_select" ON products
  FOR SELECT USING (
    tenant_id = auth.jwt() ->> 'tenant_id'
    AND deleted_at IS NULL
  );

-- INSERT : Admin et Manager uniquement
CREATE POLICY "products_insert" ON products
  FOR INSERT WITH CHECK (
    tenant_id = auth.jwt() ->> 'tenant_id'
    AND auth.jwt() ->> 'role' IN ('admin', 'manager')
  );

-- UPDATE : Admin et Manager uniquement, sur leur tenant
CREATE POLICY "products_update" ON products
  FOR UPDATE USING (
    tenant_id = auth.jwt() ->> 'tenant_id'
    AND auth.jwt() ->> 'role' IN ('admin', 'manager')
  );

-- DELETE (soft) : Admin uniquement
CREATE POLICY "products_delete" ON products
  FOR UPDATE USING (
    tenant_id = auth.jwt() ->> 'tenant_id'
    AND auth.jwt() ->> 'role' = 'admin'
  )
  WITH CHECK (deleted_at IS NOT NULL);  -- Uniquement pour poser deleted_at
```

#### Table `categories`

```sql
-- SELECT : même tenant
CREATE POLICY "categories_select" ON categories
  FOR SELECT USING (tenant_id = auth.jwt() ->> 'tenant_id');

-- INSERT/UPDATE/DELETE : Admin et Manager
CREATE POLICY "categories_write" ON categories
  FOR ALL USING (
    tenant_id = auth.jwt() ->> 'tenant_id'
    AND auth.jwt() ->> 'role' IN ('admin', 'manager')
  );
```

### Contrôles d'accès par rôle (résumé applicatif)

| Action | Admin | Manager | Staff |
|--------|-------|---------|-------|
| Voir la liste des produits | Oui | Oui | Non |
| Créer un produit | Oui | Oui | Non |
| Modifier un produit | Oui | Oui | Non |
| Activer/désactiver (toggle) | Oui | Oui | Non |
| Supprimer un produit | Oui | Non | Non |
| Actions bulk | Oui | Oui (sauf suppression) | Non |
| Gérer les catégories | Oui | Oui | Non |
| Supprimer une catégorie | Oui | Non | Non |

### Autres règles de sécurité

- Le `tenant_id` est **toujours** extrait du JWT côté serveur, jamais depuis le body de la requête.
- Les IDs de catégorie sont vérifiés : appartenance au même `tenant_id` avant tout write.
- Les requêtes bulk vérifient que tous les `ids` fournis appartiennent au tenant (rejet complet si un seul est étranger).
- Pas d'exposition du `tenant_id` dans les URLs publiques.
- Rate limiting : 100 req/min par tenant sur les endpoints write.

---

## 10. Tests à écrire

### Tests unitaires (composants)

| Test | Composant | Scenario |
|------|-----------|----------|
| Calcul TVA correct | `ProductFormModal` | HT=24, TVA=10% → TTC=26,40€ |
| Calcul TVA inverse | `ProductFormModal` | TTC=26,40, TVA=10% → HT=24,00€ |
| Compteur description | `ProductFormModal` | Saisie de 200 chars → compteur rouge, soumission bloquée à 201 |
| Validation champs obligatoires | `ProductFormModal` | Soumission avec nom vide → erreur affichée, pas d'appel API |
| Toggle optimistic | `StatusToggle` | Clic → état optimiste → erreur API → revert au state initial |
| Skeleton affiché | `ProductsTable` | `isLoading=true` → SkeletonTable rendu |
| Sélection tout | `ProductsTable` | Checkbox en-tête → toutes les lignes sélectionnées |
| Sélection partielle | `ProductsTable` | 2/8 lignes → checkbox en-tête indeterminate |
| Bulk bar visible | `BulkActionBar` | `selectedCount > 0` → bar visible, `=0` → bar cachée |
| Catégorie badge couleur | `ProductCategoryBadge` | Couleur correcte selon catégorie |
| Dropdown fermeture | `ProductsTable` | Clic outside → dropdown fermé |
| TVA badge orange | `TvaBadge` | `rate=20` → couleur orange, `rate=10` → couleur amber |

### Tests d'intégration (API)

| Test | Endpoint | Scenario |
|------|----------|----------|
| Liste produits filtrée | `GET /api/products` | `?is_active=true` → uniquement produits actifs |
| Pagination | `GET /api/products` | `?page=2&per_page=25` → items 26–50 |
| Recherche | `GET /api/products` | `?search=entrecote` → match insensible à la casse et aux accents |
| Création produit | `POST /api/products` | Tous champs valides → 201 + objet retourné |
| Référence auto | `POST /api/products` | Sans `internal_ref` → `internal_ref` auto-générée |
| Conflict ref | `POST /api/products` | `internal_ref` existante → 409 |
| PATCH statut | `PATCH /api/products/[id]` | `{ is_active: false }` → produit désactivé |
| DELETE soft | `DELETE /api/products/[id]` | `deleted_at` positionné, produit absent des listes |
| Delete protégé | `DELETE /api/products/[id]` | Produit dans commande active → 409 |
| Isolation tenant | `GET /api/products` | Token tenant A → produits de tenant B invisibles |
| Rôle insufficient | `DELETE /api/products/[id]` | Token rôle Manager → 403 |
| Catégorie inter-tenant | `POST /api/products` | `category_id` d'un autre tenant → 422 |
| Bulk activate | `PATCH /api/products/bulk` | 3 produits → 3 mis à jour, `updated: 3` |
| Catégorie avec produits | `DELETE /api/categories/[id]` | Catégorie non vide → 409 |

### Tests E2E (parcours critiques)

| Parcours | Description |
|----------|-------------|
| Création complète | Ouvrir modal → remplir formulaire → soumettre → toast succès → produit visible dans la liste |
| Édition avec recalcul TVA | Modifier HT d'un produit → TTC recalculé en temps réel → sauvegarder |
| Toggle actif/inactif | Cliquer toggle → optimistic update → vérifier état persisté après reload |
| Suppression avec refus catégorie | Ouvrir dropdown → supprimer → confirmation → succès → produit disparu de la liste |
| Sélection masse + désactivation | Cocher 3 produits → "Désactiver" → toast "3 produits désactivés" → lignes à opacity 0.6 |
| État vide → premier produit | Nouveau tenant → état vide → créer catégorie → créer produit → liste affichée |
| Recherche avec highlight | Saisir "burg" → résultats filtrés → "burg" en surbrillance amber dans les noms |
| Drag & drop catégories | Ouvrir modal catégories → réordonner → sauvegarder → ordre préservé après reload |

---

## 11. Tokens visuels et conventions UI

### Palette de couleurs catégories

| Catégorie | Background (badge) | Couleur texte | Pastille (gestion catégories) |
|-----------|-------------------|---------------|-------------------------------|
| Plats | `#172554` | `#93c5fd` | `#3b82f6` |
| Entrées | `#14532d` | `#86efac` | `#22c55e` |
| Boissons | `#1e1b4b` | `#a5b4fc` | `#8b5cf6` |
| Desserts | `#4a1d96` | `#d8b4fe` | `#a855f7` |
| Menus/Formules | — | — | `#f59e0b` |
| Extra / Autre | `#292524` | `#d6d3d1` | `#6b7280` |

### Tokens TVA

| Taux | Background | Couleur texte |
|------|-----------|---------------|
| 5,5% | `rgba(245,158,11,.15)` | `#f59e0b` (amber) |
| 10% | `rgba(245,158,11,.15)` | `#f59e0b` (amber) |
| 20% | `rgba(251,146,60,.15)` | `#fb923c` (orange) |

### Variables CSS globales utilisées

```css
--bg: #0f172a
--surface: #1e293b
--surface-raised: #263348
--border: #334155
--border-active: #475569
--text-primary: #f8fafc
--text-secondary: #e2e8f0
--text-muted: #94a3b8
--text-disabled: #475569
--blue: #1d4ed8
--blue-hover: #1e40af
--green: #10b981
--amber: #f59e0b
--red: #ef4444
--sidebar-w: 220px
```

---

## 12. Points ouverts & décisions à prendre

| # | Sujet | Question | Recommandation |
|---|-------|----------|----------------|
| 1 | Saisie TTC inverse | Le mockup mentionne la possibilité de saisir TTC directement. Faut-il deux inputs ou un seul avec bascule ? | Deux inputs liés (modifier l'un recalcule l'autre). Label actif mis en avant visuellement. |
| 2 | Suppression catégorie avec produits | Bloquer ou proposer un transfert ? | Bloquer avec message d'erreur + suggestion de déplacer les produits |
| 3 | Confirmation bulk (hors suppression) | Les actions bulk non-destructives (activer, changer catégorie, changer TVA) déclenchent-elles une confirmation ? | Non, action immédiate + toast de résumé |
| 4 | Sélection inter-pages | Faut-il pouvoir sélectionner "tous les 84 produits" (pas seulement la page) ? | Phase 1 : sélection par page uniquement. Phase 2 : "Sélectionner tous les {n} produits correspondants" |
| 5 | Bouton "Fermer" sur les toasts | Le mockup n'a pas de bouton × sur les toasts. L'ajouter ? | Oui, bouton × discret pour les toasts d'erreur au moins |
| 6 | Ordre de tri par défaut | Le mockup affiche Nom ↕ comme triable. Tri initial ? | Alphabétique ASC sur le nom |
| 7 | Nombre de catégories max | Pas de limite dans le mockup. En définir une ? | Limite de 20 catégories par tenant (UI bloque le bouton "+ Nouvelle catégorie" passé ce seuil) |
| 8 | `evening_only` en mode création | Le champ n'apparaît pas dans la modale d'ajout (Écran 2), uniquement en édition (Écran 3). Volontaire ? | Oui, volontaire : le paramètre de service est une configuration avancée post-création |
| 9 | Gestion du color picker catégories | Le bouton 🎨 est visible mais l'interface du picker n'est pas mockée. | Implémenter un color picker avec palettes prédéfinies (12-16 couleurs) + hex libre |
| 10 | Duplication | La copie crée un produit avec quel nom ? | "Copie de {nom du produit}" — inactif par défaut — même catégorie et TVA que l'original |
