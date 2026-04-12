# Refonte Feature Commandes Fournisseurs — Design Spec

**Date :** 2026-04-12  
**Projet :** Alloflow  
**Module :** Stocks → Commandes fournisseurs  
**Statut :** Approuvé

---

## Contexte

La feature "Commandes fournisseurs" actuelle est incomplète. Le workflow `draft → sent → received/partial` est brisé (pas de bouton "Envoyer"), la réception partielle ne permet pas de réceptionner le reste, il n'y a pas d'édition ni d'annulation, et le formulaire de création est inutilisable avec 200+ articles. Cette spec décrit la refonte complète.

---

## Décisions de design

| Dimension | Décision |
|-----------|----------|
| Scope | Suivi interne uniquement — pas d'envoi email fournisseur |
| Fournisseurs | Autocomplétion depuis l'historique (pas de table dédiée) |
| Workflow | `En cours → Partielle → Reçue` + `Annulée` — statut calculé automatiquement |
| Formulaire | Onglets catégories + onglet Alertes pré-cochées |
| Structure | Page dédiée `/dashboard/stocks/commandes` + panneau slide-in détail |
| Réceptions | Multiples sur la même commande jusqu'à réception complète |
| Édition | Libre sauf sur les lignes partiellement reçues (verrouillées) |

---

## Architecture

### Routes

```
/dashboard/stocks                  → Page inventaire (existante)
/dashboard/stocks/commandes        → Page liste des commandes (nouvelle)
```

Le lien "Commandes" dans la page Stocks pointe vers cette nouvelle route. La sidebar reste inchangée (toujours sous "Stocks").

### Structure de fichiers

```
src/app/dashboard/stocks/
  commandes/
    page.tsx                          → Server component, fetch initial
    _components/
      purchase-orders-page-client.tsx → Client shell avec état
      purchase-orders-list.tsx        → Liste filtrée par statut
      purchase-order-detail-panel.tsx → Slide-in détail + actions
      purchase-order-form/
        index.tsx                     → Modal multi-étapes
        step-items.tsx                → Étape 1 : sélection articles
        step-info.tsx                 → Étape 2 : infos commande
      receive-modal.tsx               → Modal réception (lignes restantes)
      edit-modal.tsx                  → Modal édition (subset du form)
```

### API routes

```
GET    /api/purchase-orders              → Liste avec items + historique réceptions
POST   /api/purchase-orders              → Création
GET    /api/purchase-orders/[id]         → Détail
PATCH  /api/purchase-orders/[id]         → Édition (fournisseur, date, notes, lignes non reçues)
PATCH  /api/purchase-orders/[id]/cancel  → Annulation
POST   /api/purchase-orders/[id]/receive → Nouvelle réception partielle ou complète
```

---

## Modèle de données

Les tables existantes sont conservées. Un ajout est nécessaire :

### Nouvelle table : `purchase_order_receptions`

Historique de chaque réception sur une commande.

```sql
create table purchase_order_receptions (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id),
  received_at       timestamptz not null default now(),
  notes             text,
  lines             jsonb not null
  -- lines = [{ purchase_order_item_id, quantity_received, ecart }]
);
```

### Modifications sur `purchase_order_items`

Ajouter la colonne `quantity_received` (cumul de toutes les réceptions) si elle n'existe pas déjà.

### Statut automatique

Le statut de `purchase_orders` est recalculé après chaque réception :

```
totalOrdered  = sum(quantity_ordered) sur toutes les lignes
totalReceived = sum(quantity_received) sur toutes les lignes

si totalReceived == 0              → "pending"   (En cours)
si totalReceived < totalOrdered    → "partial"   (Partielle)
si totalReceived >= totalOrdered   → "received"  (Reçue)
```

Le statut `cancelled` est positionné manuellement via l'action Annuler.

---

## Feature 1 — Page liste `/dashboard/stocks/commandes`

### En-tête

- Titre "Commandes fournisseurs"
- KPI : montant total engagé (somme des commandes `pending` + `partial`)
- Bouton "📥 Nouvelle commande" → ouvre le formulaire

### Tabs de filtrage

```
Toutes | En cours (N) | Partielles (N) | Reçues | Annulées
```

### Tableau

| Colonne | Contenu |
|---------|---------|
| Ref | `order_ref` |
| Fournisseur | `supplier` |
| Articles | Nombre de lignes |
| Montant HT | `total_ht` |
| Livraison prévue | `requested_delivery_date` + badge rouge "En retard" si dépassée |
| Statut | Badge coloré (bleu / orange / vert / rouge) |
| Actions | Bouton "Réceptionner" si `pending` ou `partial` ; "•••" menu → Modifier / Annuler |

Clic sur la ligne → ouvre le panneau slide-in détail.

Tri par défaut : `created_at` décroissant.

---

## Feature 2 — Formulaire de création (modal multi-étapes)

### Étape 1 — Sélection des articles

**Onglets catégories** issus de la table `categories` de l'établissement, plus un onglet fixe :
- `⚠ Alertes` (en premier) : articles avec `status = 'alert'` ou `status = 'out_of_stock'`
- `[Catégorie 1]`, `[Catégorie 2]`… : articles groupés par `category`
- `Tous` : vue complète avec recherche

**Grille d'articles** (3 colonnes desktop, 2 mobile) :

Chaque carte affiche :
- Nom de l'article
- Stock actuel coloré (rouge si rupture, orange si alerte, vert si OK)
- Case à cocher + champ quantité (affiché uniquement si coché)

**Pré-sélection automatique** :
- Les articles de l'onglet "Alertes" sont pré-cochés avec leur `order_quantity` par défaut
- L'utilisateur peut décocher ou ajuster

**Barre récapitulative fixe en bas** :
```
X articles sélectionnés · Total estimé XX.XX €          [Suivant →]
```

### Étape 2 — Informations commande

- **Fournisseur** (requis) : champ texte avec datalist d'autocomplétion (distinct values depuis `purchase_orders.supplier` de l'établissement)
- **Date de livraison souhaitée** (optionnel) : date picker
- **Notes** (optionnel) : textarea
- **Récapitulatif** : tableau des lignes sélectionnées avec quantités et total HT
- Bouton "Créer le bon de commande"

La commande est créée directement en statut `pending`. Pas de brouillon.

---

## Feature 3 — Panneau détail (slide-in)

Panneau fixe à droite, largeur 420px desktop / plein écran mobile.

### En-tête du panneau

```
[Ref]  [Fournisseur]                    [×]
Créée le JJ MMM YYYY · Livraison prévue : JJ MMM YYYY
[Badge statut]  [Badge "En retard" si applicable]

[Réceptionner]  [Modifier]  [Annuler]    ← selon statut
```

### Tableau des lignes

| Article | Commandé | Reçu | Restant |
|---------|----------|------|---------|
| Café Arabica | 10 kg | 6 kg | 4 kg ← orange |
| Lait entier | 40 L | 40 L | 0 ← vert |

### Historique des réceptions

Timeline verticale en bas du panneau :

```
● 12 jan 2026 — Réception partielle
  Café Arabica : 6/10 kg  |  Lait entier : 40/40 L  |  Sirop vanille : 6/6 btl

● 15 jan 2026 — Réception complète
  Café Arabica : 4/4 kg restants
```

---

## Feature 4 — Modal réception

S'ouvre via "Réceptionner" dans le panneau détail ou la liste.

**Titre** : "Réception — [Ref] · [Fournisseur]"

**Tableau** : affiche uniquement les lignes avec `restant > 0`

| Article | Commandé | Déjà reçu | Restant | Quantité reçue aujourd'hui |
|---------|----------|-----------|---------|---------------------------|
| Café Arabica | 10 kg | 6 kg | 4 kg | [input, pré-rempli à 4] |

Le champ "Quantité reçue aujourd'hui" est pré-rempli avec le restant. L'utilisateur peut saisir une valeur inférieure pour une nouvelle réception partielle.

**Champ Notes** : optionnel, archivé dans `purchase_order_receptions`.

**Bouton** : "Confirmer la réception"

**Après confirmation** :
- `quantity_received` de chaque ligne est incrémenté
- Le statut de la commande est recalculé automatiquement
- Les stocks (`stock_items.quantity`) sont mis à jour : `quantity += quantity_received_ce_jour`
- Le panneau détail se rafraîchit

---

## Feature 5 — Modal édition

Disponible si statut `pending` ou `partial`.

**Toujours modifiable** :
- Fournisseur
- Date de livraison souhaitée
- Notes

**Modifiable sous condition** (uniquement si `quantity_received == 0` sur la ligne) :
- Quantité commandée
- Prix unitaire
- Suppression de la ligne

**Verrouillé** (ligne grisée avec icône cadenas) :
- Toute ligne avec `quantity_received > 0`

**Ajout de nouvelles lignes** : toujours possible, même sur une commande `partial`.

---

## Feature 6 — Annulation

Disponible si statut ≠ `received`.

Modal de confirmation :
```
Annuler la commande [Ref] ?
Les stocks ne seront pas affectés.
Les quantités déjà réceptionnées restent en stock.

[Annuler]  [Confirmer l'annulation]
```

Après confirmation :
- `status = 'cancelled'`
- La commande reste visible dans l'historique (tab "Annulées")
- Non réversible

---

## Comportements transversaux

### Autocomplétion fournisseurs
- Au chargement du formulaire, fetch des valeurs distinctes de `supplier` sur les commandes de l'établissement
- Rendu via `<datalist>` HTML natif (pas de dépendance externe)

### Badge "En retard"
- Affiché si `requested_delivery_date < today` ET statut ∈ `[pending, partial]`
- Couleur rouge, texte "En retard"

### Mise à jour des stocks à la réception
- Chaque confirmation de réception incrémente `stock_items.quantity` pour chaque article reçu
- Recalcul automatique du `status` de l'article (`ok` / `alert` / `out_of_stock`)

### Pas de pagination initiale
- Chargement des 50 dernières commandes (au lieu de 20 actuellement)
- Bouton "Charger plus" si nécessaire

---

## Ce qui ne change pas

- Table `stock_items` et ses colonnes
- API `/api/stock-items` (inventaire)
- Page inventaire `/dashboard/stocks`
- Modal `StockItemForm` (édition d'un article)

---

## Hors scope

- Envoi d'email fournisseur
- Table fournisseurs dédiée
- Import/export CSV
- Calcul automatique des quantités à commander basé sur la consommation
