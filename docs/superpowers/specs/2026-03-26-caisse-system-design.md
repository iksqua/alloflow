# Système Caisse — Spec Technique

> Version : 1.0 — 26 mars 2026
> Auteur : CTO Alloflow
> Source mockup : `caisse-mockup.html` (10 écrans)

---

## 1. Vue d'ensemble

### Objectif

Le Système Caisse est le cœur opérationnel d'Alloflow. Il permet à un caissier ou un serveur d'enregistrer des commandes, de les encaisser (CB, espèces, Ticket Restaurant, paiement splitté), d'appliquer des remises, de gérer le plan de salle, et de clôturer la session de caisse avec rapport Z.

### Utilisateurs

| Rôle | Périmètre |
|---|---|
| `caissier` | Prise de commande, encaissement, remise (plafonnée), reçu |
| `serveur` | Prise de commande, consultation plan de salle, appel addition |
| `manager` | Tout caissier + remises illimitées, accès clôture de caisse |
| `admin` | Tout manager + configuration produits, salle, paramètres |

### URLs

```
/caisse                    → Redirige vers /caisse/pos
/caisse/pos                → Écran principal POS (caisse vide / panier)
/caisse/pos?table=:id      → POS pré-chargé avec la table spécifiée
/caisse/paiement/:orderId  → Sélection mode de paiement
/caisse/paiement/:orderId/especes  → Saisie paiement espèces
/caisse/paiement/:orderId/cb       → Attente terminal CB
/caisse/paiement/:orderId/split    → Paiement partagé
/caisse/recu/:orderId      → Écran reçu post-encaissement
/caisse/salle              → Plan de salle
/caisse/cloture            → Clôture de caisse (manager+ seulement)
```

### Rôles autorisés par route

| Route | caissier | serveur | manager | admin |
|---|---|---|---|---|
| `/caisse/pos` | ✓ | ✓ | ✓ | ✓ |
| `/caisse/paiement/*` | ✓ | — | ✓ | ✓ |
| `/caisse/recu/*` | ✓ | — | ✓ | ✓ |
| `/caisse/salle` | ✓ | ✓ | ✓ | ✓ |
| `/caisse/cloture` | — | — | ✓ | ✓ |

---

## 2. Layout & Structure

### Layout 3 colonnes (POS principal)

```
┌──────────────┬─────────────────────────────┬────────────────┐
│  CATÉGORIES  │         PRODUITS             │     TICKET     │
│   200 px     │      flex: 1 (reste)         │    360 px      │
│  #060e1a     │      fond neutre             │   #060e1a      │
└──────────────┴─────────────────────────────┴────────────────┘
```

- **Hauteur totale** : `100vh`
- **Barre d'onglets de navigation mockup** : `36px` fixe en haut (non présente en prod, remplacée par la topbar app)
- **Colonne gauche (Catégories)** : `width: 200px`, fond `#060e1a`, scrollable verticalement sans scrollbar visible
- **Colonne centrale (Produits)** : `flex: 1`, grille `4 colonnes`, produits `120px` de hauteur
- **Colonne droite (Ticket)** : `width: 360px`, fond `#060e1a`, flex column avec header / items scrollables / totaux / actions

### Barre d'identité (en-tête colonne gauche)

- Logo établissement (carré 32px, lettre initiale, fond bleu `#1d4ed8`)
- Nom + rôle de l'utilisateur connecté (`Thomas D. / Caissier`)
- Toujours visible, non cliquable dans l'état actuel (future : menu profil)

### Palette de couleurs système

```
--bg:        #0a1628   (fond global)
--surface:   #1e293b   (cartes, panneaux)
--surface2:  #263348   (hover states)
--border:    #334155
--blue:      #1d4ed8   (actions primaires, catégorie active)
--green:     #10b981   (succès, validation, remise active)
--amber:     #f59e0b   (alerte, addition demandée)
--red:       #ef4444   (danger, suppression, annulation)
--text1:     #f8fafc   (titres, valeurs principales)
--text2:     #e2e8f0   (texte standard)
--text3:     #94a3b8   (labels secondaires)
--text4:     #475569   (placeholders, désactivé)
```

---

## 3. Catalogue de tous les éléments par écran

### Écran 1 : Caisse vide

**Lecture Z — Coin haut gauche → haut droit**

| Élément | Type | Action au clic | État(s) | Règles |
|---|---|---|---|---|
| Logo "A" (cat-logo) | Div décoratif | — | Fixe | Initiale établissement |
| "Thomas D. / Caissier" | Texte | — | Statique | Utilisateur connecté |
| Pill "Plats" (active) | Button | Filtre grille sur catégorie Plats | `active` (bleu) / `default` | Border-left bleu quand active |
| Pill "Entrées" | Button | Filtre grille sur catégorie Entrées | `default` / `hover` | — |
| Pill "Boissons" | Button | Filtre grille catégorie Boissons | `default` / `hover` | — |
| Pill "Desserts" | Button | Filtre grille catégorie Desserts | `default` / `hover` | — |
| Pill "Menus" | Button | Filtre grille catégorie Menus | `default` / `hover` | — |
| Pill "Extras" | Button | Filtre grille catégorie Extras | `default` / `hover` | — |

**Diagonale — Centre produits**

| Élément | Type | Action au clic | État(s) | Règles |
|---|---|---|---|---|
| Titre "Plats" | H2 texte | — | Dynamique (suit catégorie active) | — |
| Compteur "12 produits disponibles" | Texte | — | Dynamique | Exclut les épuisés du compte |
| Carte "Entrecôte 300g" 26,40€ | Div clickable | Ajoute 1 article au ticket | `default` / `hover` / `in-cart` / `sold-out` | `prod-card` standard |
| Carte "Burger Maison" 16,50€ | Div clickable | Ajoute 1 article | `default` / `hover` | — |
| Carte "Poulet rôti fermier" 18,70€ | Div clickable | Ajoute 1 article | `default` / `hover` | — |
| Carte "Dos de cabillaud" 22,00€ | Div clickable | Ajoute 1 article | `default` / `hover` | — |
| Carte "Tagliatelles maison" 14,30€ | Div clickable | Ajoute 1 article | `default` / `hover` | — |
| Carte "Plat végétarien" 13,20€ | Div clickable | Ajoute 1 article | `default` / `hover` | — |
| Carte "Canard à l'orange" ÉPUISÉ | Div non-cliquable | Aucune | `sold-out` (opacity 0.45) | `cursor: not-allowed`, badge rouge "ÉPUISÉ" |
| Carte "Côte de veau" 29,70€ | Div clickable | Ajoute 1 article | `default` / `hover` | — |

**Bas — Ticket vide + actions**

| Élément | Type | Action au clic | État(s) | Règles |
|---|---|---|---|---|
| Header ticket "Emporter" | Texte | — | Dynamique | Valeur par défaut si pas de table |
| "Aucun article" | Texte info | — | Vide | Disparaît dès 1 article |
| Bouton "Choisir table" | Button ghost | Ouvre plan de salle | `default` | Navigue vers `/caisse/salle` |
| Zone ticket vide (icône panier) | Zone | — | `empty` | Placeholder, disparaît avec items |
| "Sélectionnez des articles" | Texte placeholder | — | Affiché si 0 items | — |
| Ligne "Sous-total HT" — € | Texte | — | `—` si vide, montant si rempli | — |
| Ligne "TVA 10%" — € | Texte | — | Masqué si vide | — |
| Séparateur | Hr | — | Toujours visible | — |
| Ligne "TOTAL TTC" — € | Texte grand | — | `—` si vide | Police 18px/800 |
| Bouton "Encaisser" (disabled) | Button | Aucune | `disabled` (gris) | S'active dès qu'un article est présent |
| Bouton "% Remise" | Button amber | Ouvre modale remise (Écran 9) | `default` / `hover` | Désactivé si panier vide |
| Bouton "✕ Annuler" | Button red | Vide le panier + confirme | `default` / `hover` | Modal de confirmation requis |

**Footer colonne gauche**

| Élément | Type | Action | État(s) | Règles |
|---|---|---|---|---|
| "🗺️ Plan de salle" | Button vert | Navigue vers Écran 8 | `default` / `hover` | Couleur verte, border verte |
| "⚙️ Paramètres" | Button | Ouvre paramètres caisse | `default` / `hover` | Rôle manager+ requis |

---

### Écran 2 : Panier rempli

Hérite de la structure de l'Écran 1. Changements notables :

**Ticket — Header**

| Élément | Type | Action | État(s) | Règles |
|---|---|---|---|---|
| "Table 4" | Texte | — | Dynamique | Nom de la table associée |
| "Ouvert à 12:47 · 5 articles" | Sous-texte | — | Dynamique | Heure d'ouverture + count items |
| Bouton "Changer" | Button ghost | Ouvre plan de salle pour changement de table | `default` | Visible si table associée |

**Ticket — Ligne article standard (ex: Entrecôte 300g)**

| Élément | Type | Action | État(s) | Règles |
|---|---|---|---|---|
| Nom article + prix unitaire × qté | Texte | — | Statique | Format : "26,40€ × 2" |
| Bouton "−" (qty-btn minus) | Button | Décrémente quantité. Si qty = 1, passe à 0 et supprime | `default` / `hover` (rouge) | Hover : fond rouge transparent, texte rouge |
| Valeur quantité | Texte | — | Dynamique | Non éditable directement |
| Bouton "+" (qty-btn) | Button | Incrémente quantité | `default` / `hover` | — |
| Prix total ligne (tl-price) | Texte | — | Dynamique (prix × qté) | Recalcul immédiat |
| Bouton "✕" (tl-del) | Button | Supprime entièrement la ligne | `default` / `hover` (rouge) | Pas de confirmation pour suppression ligne |

**Ticket — Ligne article avec remise (ex: Tiramisu maison)**

| Élément | Type | Action | État(s) | Règles |
|---|---|---|---|---|
| Fond vert léger + border-left verte | Style | — | `discounted` | `background: rgba(16,185,129,.06)`, `border-left: 3px solid rgba(16,185,129,.4)` |
| Prix barré original (7,70€) | Texte barré | — | Strike-through, gris | `text-decoration: line-through` |
| Prix remisé (−10% → 6,93€ × 2) | Texte vert | — | Actif | Couleur `--green` |
| Prix total remisé (13,86€) | Texte vert | — | Dynamique | Couleur `--green` |

**Produits — État in-cart**

| Élément | Type | Action | État(s) | Règles |
|---|---|---|---|---|
| Carte produit "in-cart" (ex: Entrecôte) | Div | Clic ajoute +1 | `in-cart` | Fond bleu foncé `--blue-light`, border `--blue` |
| Badge quantité (prod-badge) | Span | — | Nombre d'articles dans panier | Cercle bleu absolu top-right, 22px |

**Ticket — Totaux (panier rempli)**

| Élément | Type | Valeur | Règles |
|---|---|---|---|
| "Sous-total HT" | Texte | 83,96€ | Somme prix HT de tous items après remises |
| "TVA 10% (plats, desserts)" | Texte small | 8,40€ | Calculé par taux |
| "TVA 20% (boissons)" | Texte small | 1,17€ | Calculé par taux |
| "Remise (desserts)" | Texte vert small | −1,54€ | Affiché seulement si remise active |
| Séparateur | — | — | — |
| "TOTAL TTC" | Texte grand 18px/800 | 92,36€ | Somme définitive |

**Ticket — Actions (panier rempli)**

| Élément | Type | Action | État(s) | Règles |
|---|---|---|---|---|
| "💳 Encaisser · 92,36€" | Button vert 72px | Navigue vers Écran 3 | `active` (vert, ombre verte) | Montant affiché dans le label. `box-shadow: 0 4px 24px rgba(16,185,129,.35)` |
| "% Remise" | Button amber | Ouvre Écran 9 (modale remise) | `default` | — |
| "✕ Annuler" | Button rouge | Annule la commande | `default` | Confirmation requise si items présents |

---

### Écran 3 : Sélection mode de paiement

**Structure** : Plein écran centré, pas de layout 3 colonnes.

| Élément | Type | Action | État(s) | Règles |
|---|---|---|---|---|
| "← Retour au ticket" (pay-back) | Button ghost | Navigue vers Écran 2 | `default` | Absolu top-left |
| Montant "92,36€" (pay-amount) | Texte 52px/800 | — | Dynamique | `font-variant-numeric: tabular-nums` |
| Sous-titre "Table 4 · 7 articles · Thomas D." | Texte | — | Dynamique | Contexte de la commande |
| Mode btn "💳 Carte bancaire" | Button 150×90px | Navigue vers Écran 5 (attente CB) | `default` / `hover` / `selected` | Border bleue + glow quand sélectionné |
| Mode btn "💵 Espèces" | Button 150×90px | Navigue vers Écran 4 (numpad espèces) | `default` / `hover` / `selected` | — |
| Mode btn "🎟 Ticket Resto" | Button 150×90px | — | `disabled` | **V1 : désactivé.** Bouton visible mais `cursor: not-allowed`, opacity 0.4, aucune action. Flow Ticket Restaurant hors scope V1. |
| Mode btn "✂️ Partager" | Button 150×90px | Navigue vers Écran 6 (split) | `default` / `hover` / `selected` | — |
| Mini récap commande | Panel 500px | — | Statique | Résumé articles + montant total |

**États des mode-btn** :
- `default` : border `--border`, fond `--surface`
- `hover` : border `--blue`, fond `--blue-light`
- `selected` : border `--blue`, fond `--blue-light`, `box-shadow: 0 0 0 3px var(--blue-glow)`

---

### Écran 4 : Paiement espèces

**Structure** : Plein écran centré, grille 2 colonnes (display + numpad).

| Élément | Type | Action | État(s) | Règles |
|---|---|---|---|---|
| "← Mode paiement" (pay-back) | Button ghost | Retour Écran 3 | `default` | Absolu top-left |
| Label "PAIEMENT ESPÈCES" | Texte | — | Statique | Uppercase, text3 |
| Montant "92,36€" (pay-amount) | Texte 52px | — | Statique | Montant dû |
| Panneau display gauche | Panel | — | — | Background `--surface`, border-radius 16px |
| "À RÉGLER : 92,36€" | Ligne display | — | Statique | Grisé, montant dû |
| "REÇU : 100,00€" | Ligne display | — | Dynamique | Saisie via numpad, fond blanc/text1 |
| "RENDU : 7,64€" | Ligne display | — | Dynamique | Vert si positif (`nd-rendu.pos`), rouge si négatif (`nd-rendu.neg`) |
| Bouton rapide "93€" | Button quick | Définit REÇU = 93€ | `default` / `hover` | Fond `--blue-light`, border bleue |
| Bouton rapide "95€" | Button quick | Définit REÇU = 95€ | `default` / `hover` | — |
| Bouton rapide "100€" | Button quick | Définit REÇU = 100€ | `default` / `hover` | — |
| Bouton rapide "Exact" | Button quick | Définit REÇU = montant exact dû | `default` / `hover` | RENDU devient 0,00€ |
| Touches 0–9, 00 (numpad) | Buttons 72px | Construit montant REÇU | `default` / `active` (scale 0.95) | Grille 3 colonnes |
| Touche "⌫" (del) | Button rouge | Efface dernier chiffre saisi | `default` | Fond `--red-bg`, couleur `--red` |
| Touche "✓ Valider" (validate) | Button vert full-width | Si REÇU >= DÛ : navigue vers Écran 7 | `active` (vert) / `disabled` (gris) | Désactivé si REÇU < montant dû. `grid-column: span 3` |

**Règles calcul rendu** :
- RENDU = REÇU − À RÉGLER
- Si RENDU >= 0 : couleur verte (`nd-rendu.pos`)
- Si RENDU < 0 : couleur rouge (`nd-rendu.neg`), bouton Valider désactivé
- Les montants rapides sont calculés dynamiquement : arrondi supérieur au billet/pièce suivant

---

### Écran 5 : Attente CB

**Structure** : Plein écran centré, mode attente terminal.

| Élément | Type | Action | État(s) | Règles |
|---|---|---|---|---|
| "← Mode paiement" (pay-back) | Button ghost | Retour Écran 3 | `default` | Absolu top-left |
| Indicateur 3 points (cb-dots) | Animation CSS | — | `pulsing` | Animation `pulse` 1.5s, délais 0/0.3/0.6s |
| Icône "💳" (cb-icon) | Texte emoji 64px | — | Statique | — |
| Montant "92,36€" (cb-amount) | Texte 44px/800 | — | Statique | Montant envoyé au terminal |
| "Présentez votre carte" (cb-title) | Texte 22px | — | Statique | — |
| "ou approchez votre téléphone du terminal" | Sous-texte | — | Statique | — |
| Bouton "Annuler le paiement" (cb-cancel) | Button rouge ghost 52px | Annule transaction → retour Écran 3 | `default` | Border rouge, couleur rouge. Envoie signal d'annulation au terminal |

**États de la page CB** :
- `waiting` : état affiché (animation points, message attente)
- `approved` : transition automatique vers Écran 7 (reçu). Message "Paiement accepté" bref.
- `declined` : affiche message d'erreur + bouton "Réessayer" / "Changer de mode"
- `timeout` (30s) : affiche message timeout + options retry/annuler

---

### Écran 6 : Split paiement

**Structure** : Plein écran centré, colonne max-width 600px.

| Élément | Type | Action | État(s) | Règles |
|---|---|---|---|---|
| "← Mode paiement" | Button ghost | Retour Écran 3 | `default` | Absolu top-left |
| "TOTAL À RÉGLER" label | Texte | — | Statique | — |
| "92,36€" (split-total-val) | Texte 48px/800 | — | Statique | Montant original |
| Ligne "💳 Carte bancaire · 50,00€ ✓" (done) | Row | — | `done` | Fond vert-bg, opacity 0.6, border verte, badge "✓" vert |
| Ligne "💵 Espèces · 42,36€" | Row | — | `pending` | Fond `--surface` |
| Bouton "Payer" (split-pay-btn) | Button bleu | Navigue vers Écran 4 (espèces) avec montant 42,36€ | `default` | Visible seulement sur lignes non payées |
| Panel "Reste à régler : 42,36€" | Panel vert | — | Dynamique | Décrémenté à chaque paiement partiel |
| Bouton "+ Ajouter un mode de paiement" | Button ghost full-width | Ajoute une nouvelle ligne de split | `default` | Ouvre sélecteur de mode + saisie montant |

**Règles split** :
- La somme de tous les montants de split doit égaler exactement le total
- Si un montant de split > reste à régler : erreur
- Quand reste = 0 : transition automatique vers Écran 7
- Chaque ligne peut utiliser un mode de paiement différent
- Minimum 2 lignes pour activer le mode split

---

### Écran 7 : Reçu

**Structure** : Plein écran, reçu centré 380px, fond blanc (simulant papier thermique).

**Reçu (receipt-body) — Lecture Z**

| Élément | Type | Valeur | Règles |
|---|---|---|---|
| Logo "ALLOFLOW" | Texte centré 22px/800 | Nom app | Font Courier New (thermique) |
| Nom établissement "Le Bistrot du Port" | Texte centré 14px | Configurable | — |
| Adresse + SIRET | Texte centré 11px gris | Configurable | — |
| Séparateur pointillé | `border-top: 1px dashed` | — | — |
| "Table 4 / 25 mars 2026" | Ligne | Dynamique | Date ISO → format FR |
| "Déjeuner / 12:53" | Ligne | Dynamique | Service + heure |
| "Ticket n° / 00847" | Ligne | Dynamique | Numéro séquentiel de ticket |
| Séparateur | — | — | — |
| Lignes articles (r-row) | Lignes | Nom · ×qté · Prix | Une ligne par référence article |
| Ligne remise | Texte gris 11px | "Remise desserts −10% : −1,54€" | Affiché si remise |
| Séparateur | — | — | — |
| "Sous-total HT : 83,96€" | Ligne | Dynamique | — |
| Bloc TVA (r-tva-block) | Bloc gris | TVA 10% base 76,36€ : 7,64€ / TVA 20% base 5,83€ : 1,17€ | Fond gris clair |
| Séparateur double | `border-top: 2px solid` | — | — |
| "TOTAL TTC : 92,36€" | Ligne 18px/800 | Dynamique | — |
| Mode de règlement | Texte 12px | "Carte bancaire ···· ···· ···· 4242" | Masque 12 premiers chiffres CB |
| Message de remerciement | Texte centré 11px | Configurable | "Merci de votre visite !" |

**Actions reçu (receipt-actions)**

| Élément | Type | Action | État(s) | Règles |
|---|---|---|---|---|
| "🖨️ Imprimer" | Button | Envoie à imprimante thermique | `default` / `loading` | API `POST /api/receipts/:id/print` |
| "✉️ Email" | Button | Ouvre saisie email → envoie | `default` / `loading` | Champ email requis. API `POST /api/receipts/:id/email` |
| "💬 SMS" | Button | Ouvre saisie téléphone → envoie | `default` / `loading` | Champ téléphone requis. API `POST /api/receipts/:id/sms` |
| "Nouvelle commande" | Button vert | Remet POS à zéro → Écran 1 | `default` | Efface ticket courant, remet table à "Emporter" |

---

### Écran 8 : Plan de salle

**Structure** : Sidebar gauche 180px + zone principale positionnement absolu.

**Sidebar**

| Élément | Type | Action | État(s) | Règles |
|---|---|---|---|---|
| "SALLE" (h3) | Label section | — | Statique | Uppercase, text4 |
| "Salle principale" | Button salle | Filtre affichage sur salle principale | `active` (bleu) | — |
| "Terrasse" | Button salle | Filtre sur terrasse | `default` | — |
| "Bar" | Button salle | Filtre sur zone bar | `default` | — |
| Séparateur | — | — | — | — |
| "LÉGENDE" | Label section | — | Statique | — |
| Puce Libre (gris) | Indicateur | — | Statique | Fond `--surface`, border `--border` |
| Puce Occupée (bleu) | Indicateur | — | Statique | Fond `--blue-light`, border `--blue` |
| Puce Addition demandée (amber) | Indicateur | — | Statique | Animation `blink` 1.2s |
| Puce CB en cours (vert) | Indicateur | — | Statique | Fond `--green-bg`, border `--green` |
| Compteur "6 libres · 8 occupées" | Texte | — | Dynamique | En bas de sidebar |

**Zone principale (grille positionnement absolu)**

| Élément | Type | Action | État(s) | Règles |
|---|---|---|---|---|
| Label "Salle principale — 14 tables" | Texte | — | Statique | Absolu top 12px left 16px |
| Table 1 (libre, 90×90, carré) | Node | Ouvre ticket vide pour Table 1 | `libre` | Fond `--surface`, pas de montant affiché |
| Table 2 (libre, 90×90, carré) | Node | Ouvre ticket vide pour Table 2 | `libre` | — |
| Table 3 (libre, 110×90, carré) | Node | Ouvre ticket vide pour Table 3 | `libre` | 4 couverts |
| Table 4 (occupée, 110×90) | Node | Ouvre ticket Table 4 → Écran 2 | `occupee` | Fond `--blue-light`, border `--blue`. Affiche montant 92,36€ et durée 47 min |
| Table 5 (occupée, 110×90) | Node | Ouvre ticket Table 5 | `occupee` | 134,80€ · 1h12 |
| Table 6 (occupée, 110×90) | Node | Ouvre ticket Table 6 | `occupee` | 67,50€ · 28 min |
| Table 7 (addition demandée, 110×90) | Node | Ouvre ticket Table 7 | `addition` | Animation `blink`, label "Addition !" amber |
| Table 8 (CB en cours, 110×90) | Node | — (paiement en cours) | `cb` | Fond `--green-bg`, label "CB…" vert. Non cliquable pendant paiement |
| Table 9 (libre, ronde 80×80) | Node | Ouvre ticket vide Table 9 | `libre` | `border-radius: 50%` |
| Table 10 (libre, ronde 80×80) | Node | Ouvre ticket vide Table 10 | `libre` | `border-radius: 50%` |
| Table 11 (occupée, ronde 80×80) | Node | Ouvre ticket Table 11 | `occupee` | 35 min, pas de montant affiché (0€?) |

**Actions flottantes bas droite**

| Élément | Type | Action | État(s) | Règles |
|---|---|---|---|---|
| "+ Emporter" (primary) | Button bleu | Crée commande "À emporter" → Écran 1 | `default` | — |
| "⚙️ Config salle" | Button ghost | Ouvre interface config plan de salle | `default` | Rôle manager+ requis |

**États des table-node** :
- `libre` : aucune commande ouverte
- `occupee` : commande ouverte, en cours de service
- `addition` : serveur a demandé l'addition (client attend), animation blink
- `cb` : paiement CB en cours sur terminal, non interactif

---

### Écran 9 : Remise

**Structure** : Modal centré 480px, sur fond POS opacifié (opacity 0.25, pointer-events none).

| Élément | Type | Action | État(s) | Règles |
|---|---|---|---|---|
| Titre "Appliquer une remise" | H3 | — | Statique | — |
| Sous-titre "Table 4 · Total en cours : 93,90€" | Texte | — | Dynamique | Total avant remise |
| Bouton "×" (close-btn) | Button | Ferme la modale → retour Écran 2 | `default` / `hover` | — |
| Segment "Sur un article" | Button seg | Passe en mode remise par article | `default` / `active` | En mode article : affiche sélecteur d'article |
| Segment "Sur le total" | Button seg | Passe en mode remise sur total (sélectionné) | `active` | Fond `--blue`, texte blanc |
| Segment "% Pourcentage" | Button seg | Type remise = pourcentage (sélectionné) | `active` | — |
| Segment "€ Montant fixe" | Button seg | Type remise = montant fixe | `default` | Input affiche "€" au lieu de "%" |
| Quick btn "5%" | Button | Sélectionne 5% + met input à 5 | `default` / `active` | — |
| Quick btn "10%" | Button | Sélectionne 10% (actif) | `active` | Fond `--blue` |
| Quick btn "15%" | Button | Sélectionne 15% | `default` | — |
| Quick btn "20%" | Button | Sélectionne 20% | `default` | — |
| Input numérique (rd-input) | Input number | Saisie valeur remise personnalisée | `focused` → border bleue | Font-size 24px, text-align center |
| Unité "%" (rd-unit) | Texte | — | Dynamique | "%" si pourcentage, "€" si montant fixe |
| Select motif | Select | Sélection motif (Fidélité / Geste commercial / Erreur commande / Autre) | `default` | Optionnel |
| Panel preview vert | Panel | — | Dynamique | Recalcul en temps réel |
| "Remise appliquée : −9,39€" | Texte vert | — | Dynamique | Montant de la remise |
| "Nouveau total : 84,51€" | Texte 20px/800 | — | Dynamique | Total après remise |
| Bouton "Annuler" | Button ghost | Ferme sans appliquer | `default` | — |
| Bouton "Appliquer la remise" | Button primary (flex:2) | Applique remise → retour Écran 2 avec ticket mis à jour | `default` | Validation : valeur > 0, si %, valeur <= 100, si plafond manager configuré : valeur <= plafond |

**Règles remise** :
- Mode "Sur un article" : sélection d'une ligne de ticket, remise appliquée uniquement sur cette ligne
- Mode "Sur le total" : remise globale sur le sous-total HT
- Remise % : calculé sur le HT
- Remise € fixe : soustraction directe du TTC
- Plafond : configurable par rôle (ex. caissier max 15%, manager illimité)
- La remise est loggée avec motif + utilisateur dans la table `order_discounts`

---

### Écran 10 : Clôture de caisse

**Structure** : Scroll vertical, plein écran (pas de layout 3 colonnes).

**Header**

| Élément | Type | Valeur | Règles |
|---|---|---|---|
| "Clôture de caisse" (h1) | Titre 22px/800 | Statique | — |
| "25 mars 2026 · Service du midi · Thomas D." | Sous-titre | Dynamique | Date + service actif + caissier |
| "Ouverture : 10:00 / Clôture : 15:30 / Durée : 5h30" | Bloc droite | Dynamique | Calculé à l'ouverture de la clôture |

**Section "Ventes par mode de paiement"**

| Élément | Type | Valeur | Règles |
|---|---|---|---|
| Tableau cl-table | Table | Mode / Transactions / Montant | Données issues de `payments` groupées |
| Ligne CB : 34 transactions · 1 245,80€ | Ligne | Dynamique | — |
| Ligne Espèces : 12 transactions · 389,50€ | Ligne | Dynamique | — |
| Ligne Ticket Restaurant : 8 · 210,00€ | Ligne | Dynamique | — |
| Ligne TOTAL : 54 · 1 845,30€ | Ligne totaux | Dynamique | Font 700, border-top 2px |
| Hover lignes | Style | — | Fond `--surface2` au survol |

**Section "Détail TVA"**

| Élément | Type | Valeur | Règles |
|---|---|---|---|
| Tableau TVA | Table | Taux / Base HT / TVA / TTC | — |
| 5,5% : 180,00€ / 9,90€ / 189,90€ | Ligne | Dynamique | — |
| 10% : 890,00€ / 89,00€ / 979,00€ | Ligne | Dynamique | — |
| 20% : 561,17€ / 112,23€ / 673,40€ | Ligne | Dynamique | — |
| Total HT : 1 631,17€ / TVA : 211,13€ / TTC : 1 842,30€ | Ligne totaux | Dynamique | — |

**Section "Comptage espèces"**

| Élément | Type | Action | État(s) | Règles |
|---|---|---|---|---|
| "Fond de caisse début : 150,00€" | Texte | — | Statique | Saisi à l'ouverture de session |
| Input "50€ ×" | Input number | Saisie nombre de billets 50€ | Editable | Contribue au total compté |
| Input "20€ ×" | Input number | Saisie nombre de billets 20€ | Editable | — |
| Input "10€ × 3" | Input number | Saisie billets 10€ (pré-rempli 3) | Editable | — |
| Input "5€ × 2" | Input number | Saisie billets 5€ | Editable | — |
| Input "2€ × 12" | Input number | Saisie pièces 2€ | Editable | — |
| Input "1€ × 8" | Input number | Saisie pièces 1€ | Editable | — |
| Input "0,50€ × 5" | Input number | Saisie pièces 0,50€ | Editable | — |
| Input "0,20€ × 10" | Input number | Saisie pièces 0,20€ | Editable | — |
| Input "0,10€ × 3" | Input number | Saisie pièces 0,10€ | Editable | — |
| Panel "Total compté : 542,80€ / Attendu : 539,50€" | Panel bleu | — | Dynamique | Recalcul en temps réel |
| "Écart : +3,30€" | Ligne verte | — | Dynamique | Vert si >= 0, rouge si < 0. Texte "Écart" |

**Actions finales (zone danger)**

| Élément | Type | Action | État(s) | Règles |
|---|---|---|---|---|
| Fond rouge (cloture-danger) | Zone | — | Statique | Background `--red-bg`, border rouge |
| "🖨️ Imprimer rapport Z" | Button ghost | Imprime rapport Z via imprimante thermique | `default` / `loading` | — |
| "📄 Exporter PDF" | Button ghost | Génère PDF rapport et télécharge | `default` / `loading` | — |
| Texte avertissement "⚠️ La validation de la clôture est irréversible..." | Texte rouge clair | — | Statique | Couleur `#fca5a5` |
| "Valider la clôture de caisse" | Button danger full-width 56px | Déclenche clôture → archive session | `default` | Confirmation modale requise. Rôle manager+ uniquement. Irréversible. |

---

## 4. Modèle de données

### Table `cash_sessions`

```sql
CREATE TABLE cash_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id),
  opened_by       UUID NOT NULL REFERENCES users(id),
  closed_by       UUID REFERENCES users(id),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opening_float   NUMERIC(10,2) NOT NULL DEFAULT 0,  -- Fond de caisse début
  cash_counted    NUMERIC(10,2),                     -- Total compté physiquement
  cash_expected   NUMERIC(10,2),                     -- Total théorique
  cash_variance   NUMERIC(10,2),                     -- Écart = compté - attendu
  cash_count_detail JSONB,                           -- {bills: {50:0,20:0,...}, coins: {...}}
  service_label   TEXT,                              -- "Service du midi", "Dîner", etc.
  report_pdf_url  TEXT,                              -- URL rapport Z exporté
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### Table `orders`

```sql
CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id),
  session_id      UUID REFERENCES cash_sessions(id),
  table_id        UUID REFERENCES tables(id),        -- NULL si emporter
  order_type      TEXT NOT NULL DEFAULT 'dine_in' CHECK (order_type IN ('dine_in', 'takeaway')),
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'paid', 'cancelled', 'void')),
  ticket_number   INTEGER NOT NULL,                  -- Numéro séquentiel (ex: 00847)
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at         TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  created_by      UUID NOT NULL REFERENCES users(id),
  subtotal_ht     NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_tva       NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_ttc       NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_discount  NUMERIC(10,2) NOT NULL DEFAULT 0,  -- Somme de toutes remises
  covers          INTEGER DEFAULT 1,                 -- Nombre de couverts
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Index
CREATE INDEX orders_session_id_idx ON orders(session_id);
CREATE INDEX orders_table_id_idx ON orders(table_id);
CREATE INDEX orders_status_idx ON orders(status);
CREATE UNIQUE INDEX orders_ticket_number_per_session ON orders(session_id, ticket_number);
```

### Table `order_items`

```sql
CREATE TABLE order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  product_name    TEXT NOT NULL,                     -- Snapshot au moment de la commande
  product_price_ht NUMERIC(10,2) NOT NULL,           -- Prix HT snapshot
  vat_rate        NUMERIC(4,2) NOT NULL,             -- 5.5, 10, ou 20
  quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_ttc  NUMERIC(10,2) NOT NULL,            -- Prix TTC unitaire après remise
  line_total_ttc  NUMERIC(10,2) NOT NULL,            -- quantity × unit_price_ttc
  discount_pct    NUMERIC(5,2) DEFAULT 0,            -- Remise % sur cette ligne
  discount_amount NUMERIC(10,2) DEFAULT 0,           -- Montant remise sur cette ligne
  discount_reason TEXT,                              -- Motif remise ligne
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX order_items_order_id_idx ON order_items(order_id);
```

### Table `order_discounts`

```sql
CREATE TABLE order_discounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id   UUID REFERENCES order_items(id),   -- NULL si remise globale
  applied_by      UUID NOT NULL REFERENCES users(id),
  discount_type   TEXT NOT NULL CHECK (discount_type IN ('pct', 'fixed')),
  discount_target TEXT NOT NULL CHECK (discount_target IN ('item', 'total')),
  value           NUMERIC(10,2) NOT NULL,            -- Valeur (% ou €)
  amount          NUMERIC(10,2) NOT NULL,            -- Montant € effectivement remisé
  reason          TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### Table `payments`

```sql
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id),
  session_id      UUID NOT NULL REFERENCES cash_sessions(id),
  method          TEXT NOT NULL CHECK (method IN ('card', 'cash', 'ticket_resto', 'other')),
  amount          NUMERIC(10,2) NOT NULL,
  amount_tendered NUMERIC(10,2),                     -- Montant remis (espèces)
  amount_change   NUMERIC(10,2),                     -- Rendu (espèces)
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'declined', 'cancelled', 'refunded')),
  terminal_ref    TEXT,                              -- Référence terminal CB
  card_last4      TEXT,                              -- 4 derniers chiffres CB
  card_brand      TEXT,                              -- Visa, Mastercard, etc.
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX payments_order_id_idx ON payments(order_id);
CREATE INDEX payments_session_id_idx ON payments(session_id);
CREATE INDEX payments_status_idx ON payments(status);
```

### Table `tables`

```sql
CREATE TABLE tables (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id),
  room_id         UUID REFERENCES rooms(id),         -- Salle, Terrasse, Bar
  number          INTEGER NOT NULL,
  label           TEXT,                              -- "Table 4", "Bar 2", etc.
  capacity        INTEGER NOT NULL DEFAULT 2,        -- Nombre max de couverts
  shape           TEXT DEFAULT 'square' CHECK (shape IN ('square', 'round', 'rectangle')),
  pos_x           INTEGER,                           -- Position X sur plan (px)
  pos_y           INTEGER,                           -- Position Y sur plan (px)
  width           INTEGER DEFAULT 90,                -- Largeur sur plan (px)
  height          INTEGER DEFAULT 90,                -- Hauteur sur plan (px)
  status          TEXT NOT NULL DEFAULT 'libre'
                  CHECK (status IN ('libre', 'occupee', 'addition', 'cb', 'reserved', 'unavailable')),
  current_order_id UUID REFERENCES orders(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (establishment_id, number)
);
```

### Table `rooms`

```sql
CREATE TABLE rooms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id),
  name            TEXT NOT NULL,                     -- "Salle principale", "Terrasse", "Bar"
  is_active       BOOLEAN DEFAULT true,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### Relations entre tables

```
establishments
  └── rooms (1:n)
  └── tables (1:n) → rooms
  └── cash_sessions (1:n)
      └── orders (1:n) → tables
          └── order_items (1:n) → products
          └── order_discounts (1:n) → order_items?
          └── payments (1:n)
```

---

## 5. API Endpoints

### Convention

- Auth : JWT Bearer token (`Authorization: Bearer <token>`)
- Isolation : toutes les requêtes filtrent par `establishment_id` issu du JWT
- Versioning : `/api/v1/`
- Erreurs : format unifié `{ error: { code, message, details? } }`

---

### Orders

#### `POST /api/v1/orders`
Crée une nouvelle commande.

```
Body: {
  table_id?: UUID,
  order_type: "dine_in" | "takeaway",
  covers?: number
}
Response 201: { order: Order }
Erreurs:
  400 table_not_found
  409 table_already_occupied
Sécurité: caissier+
```

#### `GET /api/v1/orders/:id`
Récupère une commande avec ses items et paiements.

```
Response 200: { order: Order & { items: OrderItem[], payments: Payment[], discounts: OrderDiscount[] } }
Erreurs: 404 not_found
Sécurité: caissier+
```

#### `PATCH /api/v1/orders/:id`
Modifie une commande (table, couverts, note). Pas de modification de statut via cet endpoint.

```
Body: { table_id?, covers?, note? }
Response 200: { order: Order }
Erreurs: 400 order_already_paid, 404
Sécurité: caissier+
```

#### `POST /api/v1/orders/:id/items`
Ajoute un article à la commande.

```
Body: { product_id: UUID, quantity: number }
Response 201: { item: OrderItem, order: OrderTotals }
Erreurs: 400 product_sold_out, 400 order_closed, 404
Sécurité: caissier+
```

#### `PATCH /api/v1/orders/:id/items/:itemId`
Modifie la quantité d'un article (ou supprime si quantity = 0).

```
Body: { quantity: number }
Response 200: { item: OrderItem, order: OrderTotals }
Erreurs: 400, 404
Sécurité: caissier+
```

#### `DELETE /api/v1/orders/:id/items/:itemId`
Supprime un article de la commande.

```
Response 200: { order: OrderTotals }
Erreurs: 404, 400 order_closed
Sécurité: caissier+
```

#### `POST /api/v1/orders/:id/cancel`
Annule une commande ouverte.

```
Body: { reason?: string }
Response 200: { order: Order }
Erreurs: 400 order_already_paid
Sécurité: caissier+
```

---

### Remises

#### `POST /api/v1/orders/:id/discounts`
Applique une remise sur la commande ou un article.

```
Body: {
  target: "item" | "total",
  type: "pct" | "fixed",
  value: number,
  order_item_id?: UUID,
  reason?: string
}
Response 200: { discount: OrderDiscount, order: OrderTotals }
Effets — ordre de calcul :
  1. Remises articles appliquées d'abord (réduisent le prix unitaire de chaque ligne)
  2. Remise globale appliquée sur le sous-total HT post-remises articles
  3. TVA recalculée par taux sur les montants remisés
  4. total_ttc = sous-total HT remisé + somme TVA par taux
Erreurs:
  400 discount_exceeds_limit (si rôle insuffisant)
  400 discount_value_invalid (pct > 100 ou montant > total)
  400 order_closed
Sécurité: caissier+, plafond selon rôle
```

#### `DELETE /api/v1/orders/:id/discounts/:discountId`
Retire une remise.

```
Response 200: { order: OrderTotals }
Sécurité: caissier+ (ou manager si remise posée par autre utilisateur)
```

---

### Paiements

#### `POST /api/v1/orders/:id/payments`
Initie un paiement.

```
Body: {
  method: "card" | "cash" | "ticket_resto" | "other",
  amount: number,
  amount_tendered?: number  -- Requis pour espèces
}
Response 201: {
  payment: Payment,
  terminal_transaction_id?: string  -- Pour CB : ID transaction terminal à poller
}
Erreurs:
  400 amount_exceeds_remaining (montant > reste à payer)
  400 session_not_open
  409 payment_in_progress
Sécurité: caissier+
```

#### `POST /api/v1/orders/:id/payments/:paymentId/confirm`
Confirme un paiement CB approuvé par le terminal.

```
Body: {
  terminal_ref: string,
  card_last4?: string,
  card_brand?: string
}
Response 200: { payment: Payment, order: Order }
Effets: si tous paiements couvrent le total → order.status = "paid", table.status = "libre"
Sécurité: système (webhook terminal) ou caissier+
```

#### `POST /api/v1/orders/:id/payments/:paymentId/cancel`
Annule un paiement en attente (CB non aboutie).

```
Response 200: { payment: Payment }
Erreurs: 400 payment_already_confirmed
Sécurité: caissier+
```

---

### Tables

#### `GET /api/v1/rooms/:roomId/tables`
Liste les tables d'une salle avec statut temps réel.

```
Response 200: {
  tables: Array<Table & { current_order?: OrderSummary }>
}
Sécurité: caissier+
```

#### `PATCH /api/v1/tables/:id/status`
Met à jour le statut d'une table (ex: demande d'addition).

```
Body: { status: "libre" | "occupee" | "addition" | "cb" }
Response 200: { table: Table }
Sécurité: caissier+
```

---

### Session caisse (ouverture / clôture)

#### `POST /api/v1/cash-sessions`
Ouvre une nouvelle session de caisse.

```
Body: {
  opening_float: number,
  service_label?: string
}
Response 201: { session: CashSession }
Erreurs:
  409 session_already_open (une session active existe)
Sécurité: caissier+
```

#### `GET /api/v1/cash-sessions/current`
Récupère la session ouverte.

```
Response 200: { session: CashSession }
Erreurs: 404 no_open_session
Sécurité: caissier+
```

#### `GET /api/v1/cash-sessions/:id/summary`
Calcule le récapitulatif complet d'une session (ventes par mode, TVA).

```
Response 200: {
  session: CashSession,
  sales_by_method: Array<{ method, transactions, amount }>,
  vat_detail: Array<{ rate, base_ht, vat, ttc }>,
  cash_expected: number,
  totals: { transactions, total_ttc }
}
Sécurité: manager+
```

#### `POST /api/v1/cash-sessions/:id/close`
Clôture la session (irréversible).

```
Body: {
  cash_counted: number,
  cash_count_detail: {
    bills: { 50: n, 20: n, 10: n, 5: n, 2: n },
    coins: { 2: n, 1: n, 0.5: n, 0.2: n, 0.1: n, 0.05: n }
  }
}
Response 200: { session: CashSession }
Effets:
  - session.status → "closed"
  - session.closed_at → now()
  - session.cash_counted, cash_expected, cash_variance calculés
  - Toutes les orders "open" sont flagged (alerte)
Erreurs:
  400 session_already_closed
  400 open_orders_exist (commandes non encaissées → warning, pas blocant si confirmé)
Sécurité: manager+
```

---

### Reçus

#### `POST /api/v1/receipts/:orderId/print`
Envoie le reçu à l'imprimante thermique.

```
Body: {}
Response 200: { job_id: string }
Erreurs: 503 printer_unavailable
Sécurité: caissier+
```

#### `POST /api/v1/receipts/:orderId/email`
Envoie le reçu par email.

```
Body: { email: string }
Response 200: { message_id: string }
Erreurs: 400 invalid_email, 422 order_not_paid
Sécurité: caissier+
```

#### `POST /api/v1/receipts/:orderId/sms`
Envoie le reçu par SMS.

```
Body: { phone: string }  -- Format E.164 (+33612345678)
Response 200: { message_id: string }
Erreurs: 400 invalid_phone, 422 order_not_paid
Sécurité: caissier+
```

#### `POST /api/v1/receipts/z-report`
Génère et imprime le rapport Z (clôture de caisse).

```
Body: { session_id: UUID }
Response 200: { job_id: string }
Erreurs: 404 session_not_found, 400 session_still_open, 503 printer_unavailable
Sécurité: manager+
```

#### `GET /api/v1/cash-sessions/:id/report.pdf`
Génère et télécharge le rapport Z en PDF.

```
Response 200: application/pdf (fichier binaire)
Erreurs: 404 session_not_found
Sécurité: manager+
```

---

## 6. Flows critiques

### Flow commande complète (du premier article au reçu)

```
1. [Caissier] Ouvre /caisse/pos (ou /caisse/salle → sélection table)
2. [POS] Charge session ouverte via GET /api/v1/cash-sessions/current
3. [Caissier] Clique sur catégorie → grille filtrée
4. [Caissier] Clique sur produit →
   a. Si panier vide : POST /api/v1/orders (crée order + associe table)
   b. Si order existante : POST /api/v1/orders/:id/items
   c. UI : badge quantité sur carte produit, ligne ajoutée au ticket
5. [Caissier] Ajuste quantités avec +/− dans ticket
   → PATCH /api/v1/orders/:id/items/:itemId { quantity: n }
6. [Optionnel] Applique remise → Écran 9 → POST /api/v1/orders/:id/discounts
7. [Caissier] Clique "Encaisser" → Écran 3 (sélection mode)
8. [Caissier] Choisit mode de paiement → Écran 4, 5 ou 6
9. [Paiement validé] → POST /api/v1/orders/:id/payments confirm
10. [API] order.status → "paid", table.status → "libre"
11. [UI] Navigue automatiquement vers Écran 7 (reçu)
12. [Caissier] Imprime/envoie reçu ou clique "Nouvelle commande"
```

### Flow paiement CB (optimistic, timeout, retry)

```
1. Sélection "Carte bancaire" → POST /api/v1/orders/:id/payments { method: "card", amount }
   → Réponse : payment { id, status: "pending" } + terminal_transaction_id
2. Ouverture de la connexion terminal (WebSocket ou polling)
3. Affichage Écran 5 (attente) avec animation
4. Terminal envoie résultat :
   a. APPROVED → POST /confirm { terminal_ref, card_last4, card_brand }
      → Transition vers Écran 7
   b. DECLINED → Affiche "Paiement refusé" + bouton "Réessayer" / "Changer de mode"
      → POST /cancel sur le payment pending
   c. TIMEOUT (30s sans réponse) → Affiche "Terminal ne répond pas"
      → Options : [Réessayer] [Confirmer manuellement] [Annuler]
5. Si annulation → POST /api/v1/orders/:id/payments/:paymentId/cancel
   → Retour Écran 3
6. Si "Confirmer manuellement" (mode dégradé) : caissier entre ref manuelle
```

### Flow paiement espèces (calcul rendu)

```
1. Sélection "Espèces" → Écran 4
2. Montants rapides générés dynamiquement :
   - "Exact" = montant exact dû
   - Arrondi +1€ (ex: 92,36 → 93€)
   - Arrondi billet suivant (95€ si 92,36 < 95)
   - Billet standard au-dessus (100€)
3. Saisie via numpad : construit string montant (en centimes pour éviter float)
4. Calcul en temps réel : RENDU = REÇU − DÛ
5. Bouton Valider activé seulement si RENDU >= 0
6. Clic Valider → POST /api/v1/orders/:id/payments {
     method: "cash",
     amount: montant_dû,
     amount_tendered: reçu,
   }
7. Réponse immédiate (pas de terminal) → order.status = "paid"
8. Affichage Écran 7 avec rendu monnaie en bas du reçu
```

### Flow split payment

```
1. Sélection "Partager" → Écran 6
2. Affichage total à régler
3. Caissier choisit 1ère ligne :
   a. Mode de paiement
   b. Montant partiel (saisie libre ou partage égal automatique)
4. POST /api/v1/orders/:id/payments { method, amount }
5. Si CB → flow CB → confirmation → retour Écran 6 avec ligne marquée "done"
6. Si espèces → Écran 4 avec montant pré-rempli → validation → retour Écran 6
7. "Reste à régler" décrémenté
8. Bouton "+ Ajouter un mode" pour troisième paiement si besoin
9. Quand reste = 0 : transition automatique vers Écran 7
Règle : sum(payments.amount) doit = order.total_ttc avant de passer "paid"
```

### Flow remise (par article vs total)

```
Mode "Sur le total" :
1. Caissier ouvre modale remise (Écran 9) depuis "% Remise"
2. Sélectionne "Sur le total" + "% Pourcentage" + valeur (ex: 10%)
3. Preview calculé en temps réel côté client
4. Clic "Appliquer" → POST /api/v1/orders/:id/discounts {
     target: "total", type: "pct", value: 10, reason: "Fidélité client"
   }
5. API : recalcule tous les totaux (HT, TVA par taux, TTC)
6. Ticket mis à jour avec ligne remise verte

Mode "Sur un article" :
1. Sélectionne "Sur un article" → apparaît sélecteur de ligne ticket
2. Caissier sélectionne article (ex: Tiramisu)
3. Applique % ou montant fixe
4. POST /api/v1/orders/:id/discounts { target: "item", order_item_id, ... }
5. La ligne article dans le ticket affiche prix barré + nouveau prix vert
```

### Flow clôture caisse

```
1. Manager accède /caisse/cloture (role check)
2. GET /api/v1/cash-sessions/:id/summary → charge résumé complet
3. Manager remplit comptage espèces (billets + pièces)
4. Calcul temps réel : total compté vs attendu, écart
5. Clic "Imprimer rapport Z" → POST /api/v1/receipts/z-report { session_id }
   ou "Exporter PDF" → GET /api/v1/cash-sessions/:id/report.pdf
6. Confirmation modale avant clôture définitive
7. Clic "Valider la clôture" → POST /api/v1/cash-sessions/:id/close { cash_counted, cash_count_detail }
8. API vérifie qu'il n'y a pas d'orders "open" (warning si oui, pas bloquant)
9. session.status = "closed", archivage
10. Redirect vers dashboard ou écran d'ouverture nouvelle session
```

---

## 7. Règles métier

### Calcul TVA

| Taux | Catégories applicables | Exemple |
|---|---|---|
| 5,5% | Produits alimentaires de base, eau | Eau plate, pain |
| 10% | Restauration sur place, plats, desserts | Entrecôte, Tiramisu |
| 20% | Boissons alcoolisées, sodas, non-alimentaire | Coca-Cola, vin |

- Le taux TVA est stocké sur chaque produit (`products.vat_rate`)
- Calcul : `price_ht = price_ttc / (1 + vat_rate/100)`
- Les totaux sont calculés par taux et affichés séparément sur le ticket et le reçu
- Un article peut changer de taux si le mode de service change (ex : emporter → taux différent pour certains produits) — ce cas est hors scope V1

### Calcul rendu monnaie

```
rendu = montant_reçu - montant_dû
```

- Rendu toujours calculé en centimes (integer) pour éviter les erreurs float
- Affichage : rendu vert si >= 0, rouge si < 0
- Bouton Valider désactivé si rendu < 0
- Le montant rendu est stocké dans `payments.amount_change`

### Remises — règles et limites

| Rôle | Plafond remise % | Plafond remise fixe |
|---|---|---|
| caissier | 15% | 20€ |
| manager | 100% | illimité |
| admin | 100% | illimité |

- Une remise % ne peut pas dépasser 100%
- Une remise fixe ne peut pas dépasser le total TTC de la cible
- Les remises sont tracées (table `order_discounts`) avec utilisateur + motif
- Plusieurs remises peuvent coexister sur une commande (une globale + des lignes)
- Si conflit : les remises s'appliquent en cascade, la remise globale s'applique sur le sous-total post-remises articles

### Clôture caisse

- Une seule session peut être ouverte par établissement à la fois
- La clôture est **irréversible** : `cash_sessions.status` ne peut pas repasser à "open"
- Les orders "open" au moment de la clôture sont flaggées (champ `void` ou alerte)
- Le rapport Z est généré et archivé (PDF + données JSON)
- L'écart de caisse (cash_variance) est conservé dans la base pour audit

### Commande : états possibles

```
open → paid       (paiement validé)
open → cancelled  (annulée avant paiement)
paid → void       (remboursement, rôle admin uniquement, hors scope V1)
```

### Table : états possibles

```
libre → occupee    (création commande sur table)
occupee → addition (serveur ou client demande l'addition)
addition → cb      (CB initiée depuis la table)
cb → libre         (paiement validé)
occupee → libre    (commande annulée)
addition → libre   (commande annulée après demande addition)
libre → reserved   (réservation, hors scope V1)
```

---

## 8. Composants à créer

### `<CategorySidebar>`
```
Props: categories[], activeCategory, onSelect
States: none (controlled)
Behavior:
  - Rend la liste des catégories sous forme de pills verticales
  - Active met border-left bleue + fond bleu
  - Footer avec bouton "Plan de salle" et "Paramètres"
  - Scroll masqué si overflow
```

### `<ProductGrid>`
```
Props: products[], onAddToCart, cartQuantities: Map<product_id, qty>
States: none (controlled)
Behavior:
  - Grille 4 colonnes responsive
  - Carte en état "in-cart" si cartQuantities[id] > 0, badge avec quantité
  - Carte en état "sold-out" si product.is_available = false → non cliquable
  - Animation scale(0.97) au clic
```

### `<ProductCard>`
```
Props: product, quantity, isInCart, isSoldOut, onClick
States: pressed (animation)
Behavior:
  - Emoji + nom + prix + tva_label
  - Badge quantité absolu top-right si inCart
  - Ribbon "ÉPUISÉ" si soldOut
```

### `<TicketPanel>`
```
Props: order?, onAddItem, onUpdateQuantity, onDeleteItem, onEncaisser, onRemise, onCancel
States: empty | filled
Behavior:
  - Header : nom table ou "Emporter" + bouton "Choisir table" / "Changer"
  - Zone items scrollable
  - État vide : icône panier + texte placeholder
  - Totaux recalculés à chaque changement
  - Bouton Encaisser disabled si order = null ou items vides
```

### `<TicketLine>`
```
Props: item (OrderItem), onUpdateQty, onDelete
States: default | discounted
Behavior:
  - État discounted : fond vert léger, border-left verte, prix barré
  - Bouton − : hover rouge
  - Bouton ✕ : hover rouge, suppression directe (pas de confirm)
```

### `<PaymentModeSelector>`
```
Props: orderId, amount, orderSummary, onModeSelect
States: none
Behavior:
  - 4 boutons modes (CB, Espèces, Ticket Resto, Partager)
  - Bouton sélectionné : border bleue + glow
  - Mini récap commande en bas
  - Bouton retour ticket
```

### `<CashNumpad>`
```
Props: amountDue, onValidate, onBack
States: inputValue (string centimes), rendu (number)
Behavior:
  - Construit montant REÇU via saisie numérique (string de chiffres)
  - Boutons rapides calculés dynamiquement
  - RENDU = REÇU − DÛ, vert si >= 0, rouge sinon
  - Valider actif seulement si RENDU >= 0
  - "Exact" → input = montant dû exact
  - ⌫ efface dernier chiffre
```

### `<CBWaitingScreen>`
```
Props: amount, transactionId, onCancel, onSuccess
States: waiting | approved | declined | timeout
Behavior:
  - polling ou WebSocket sur terminal_transaction_id
  - Animation 3 points pulsants
  - Timeout 30s → état timeout
  - onSuccess() → navigue vers reçu
  - onCancel() → POST /cancel → retour sélection mode
```

### `<SplitPaymentScreen>`
```
Props: orderId, totalAmount
States: splits[] (liste des lignes split), reste
Behavior:
  - Chaque ligne : mode + montant + état (pending/done)
  - Bouton "+ Ajouter" ouvre sélecteur mode + input montant
  - Quand reste = 0 → auto-redirect vers reçu
  - Validation : somme splits = total
```

### `<ReceiptView>`
```
Props: order (avec items, discounts, payments)
States: printLoading | emailLoading | smsLoading
Behavior:
  - Rendu HTML style thermique (Courier New, monospace)
  - Bouton Imprimer → POST /print
  - Bouton Email → modale saisie email → POST /email
  - Bouton SMS → modale saisie téléphone → POST /sms
  - Bouton "Nouvelle commande" → reset POS
```

### `<FloorPlan>`
```
Props: rooms[], tables[], activeRoom, onSelectTable, onCreateTakeaway
States: none (controlled)
Behavior:
  - Sidebar sélection salle
  - Tables positionnées absolument selon pos_x/pos_y
  - Statut visuel (libre/occupee/addition/cb)
  - Animation blink sur tables "addition"
  - Clic table occupée → navigue vers ticket de cette table
  - Clic table libre → crée ordre pour cette table
```

### `<TableNode>`
```
Props: table, onSelect
States: libre | occupee | addition | cb
Behavior:
  - Shape: square ou round (border-radius 50%)
  - Affiche numéro + couverts + montant (si occupée) + durée
  - Animation blink si addition
  - Non cliquable si status = "cb"
```

### `<DiscountModal>`
```
Props: order, onApply, onClose
States: target (item|total), type (pct|fixed), value, selectedItemId, reason
Behavior:
  - Segments "Sur un article" / "Sur le total"
  - Segments "%" / "€"
  - Quick buttons 5/10/15/20%
  - Input numérique + unité dynamique
  - Select motif
  - Preview temps réel (recalcul côté client)
  - Valider → POST /discounts → ferme modale, ticket mis à jour
  - Validation plafond selon rôle
```

### `<CashCloseScreen>`
```
Props: sessionId
States: summary (chargé), cashCountDetail
Behavior:
  - Charge summary via GET /cash-sessions/:id/summary
  - Tables ventes par mode + TVA en lecture seule
  - Inputs comptage physique (billets + pièces)
  - Calcul temps réel total compté vs attendu vs écart
  - Imprimer/Exporter avant de fermer
  - Confirmation modale avant clôture
  - POST /close → redirect
```

---

## 9. Sécurité & RLS

### Principe d'isolation par établissement

Chaque utilisateur est rattaché à un ou plusieurs établissements via la table `user_establishments`. Toutes les requêtes API filtrent automatiquement par `establishment_id` issu du JWT.

### Règles Supabase RLS (Row Level Security)

```sql
-- orders : visible seulement par membres de l'établissement
CREATE POLICY "orders_by_establishment" ON orders
  FOR ALL USING (
    establishment_id IN (
      SELECT establishment_id FROM user_establishments
      WHERE user_id = auth.uid()
    )
  );

-- Même pattern pour : order_items, order_discounts, payments,
--                     tables, rooms, cash_sessions

-- cash_sessions : clôture réservée aux managers
CREATE POLICY "cash_sessions_close_manager_only" ON cash_sessions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_establishments
      WHERE user_id = auth.uid()
        AND establishment_id = cash_sessions.establishment_id
        AND role IN ('manager', 'admin')
    )
  );

-- order_discounts : création limitée par plafond de rôle (validé côté API)
-- La vérification du plafond se fait dans le endpoint, pas dans RLS
```

### Qui peut voir / faire quoi

| Action | caissier | serveur | manager | admin |
|---|---|---|---|---|
| Créer commande | ✓ | ✓ | ✓ | ✓ |
| Modifier quantités | ✓ | ✓ | ✓ | ✓ |
| Encaisser (paiement) | ✓ | — | ✓ | ✓ |
| Remise <= 15% | ✓ | — | ✓ | ✓ |
| Remise > 15% | — | — | ✓ | ✓ |
| Annuler commande | ✓ | — | ✓ | ✓ |
| Voir plan de salle | ✓ | ✓ | ✓ | ✓ |
| Config salle | — | — | ✓ | ✓ |
| Ouvrir session | ✓ | — | ✓ | ✓ |
| Clôturer session | — | — | ✓ | ✓ |
| Voir rapport Z | — | — | ✓ | ✓ |
| Void commande | — | — | — | ✓ |

### Tokens & sessions

- JWT émis par Supabase Auth avec `role` et `establishment_id` dans les claims
- Expiration : 1h (rafraîchissement automatique)
- Pas de token dans localStorage : Supabase gère via cookies httpOnly en production
- Toutes les routes `/caisse/*` nécessitent un JWT valide + session caisse ouverte

---

## 10. Intégrations externes

### Terminal CB (Ingenico / SumUp)

**Architecture recommandée** : Event-driven via WebSocket ou Server-Sent Events

```
Client POS ──── WebSocket ──── Backend ──── Terminal SDK ──── Terminal physique
```

**Providers supportés en V1** :
- **SumUp** : API REST + webhook (`POST /webhooks/sumup`)
- **Ingenico/Worldline** : SDK propriétaire, intégration via service dédié

**Payload envoyé au terminal** :
```json
{
  "amount": 9236,        // en centimes
  "currency": "EUR",
  "order_ref": "00847",
  "tip": false
}
```

**Webhook reçu** :
```json
{
  "transaction_id": "txn_xxx",
  "status": "approved" | "declined" | "timeout",
  "card_last4": "4242",
  "card_brand": "Visa",
  "auth_code": "123456"
}
```

**Timeout** : 30 secondes. Si pas de réponse → statut `timeout`, options manuelles.

**Mode dégradé** : Si terminal indisponible, caissier peut saisir une référence manuelle (mode offline, auditable).

### Imprimante thermique

**Protocole** : ESC/POS (standard industrie)

**Intégration V1 (décision)** : `window.print()` côté navigateur avec CSS `@media print` optimisé thermique.
- Avantage : zéro dépendance backend, fonctionne avec n'importe quelle imprimante réseau configurée comme imprimante système
- Option V2 (hors scope) : service backend `node-escpos` pour protocole ESC/POS natif et impression réseau directe par IP
- En production : imprimante configurée par défaut dans le navigateur (iPad ou PC caisse)

**Format reçu thermique** :
- Largeur : 80mm (48 caractères par ligne)
- Police : Courier New ou ESC/POS native
- Séparateurs : tirets ou dashes ASCII
- Logo : image bitmap 1 bit (si imprimante compatible)

**Endpoint** :
```
POST /api/v1/receipts/:orderId/print
Body: { printer_id?: UUID }  -- Optionnel, utilise imprimante par défaut sinon
```

### Envoi SMS reçu

**Provider recommandé V1** : Twilio

```
POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages
Body: {
  To: "+33612345678",
  From: "+33XXXXXXXXX",  -- Numéro Twilio de l'établissement
  Body: "Votre reçu Alloflow — Le Bistrot du Port\nTotal : 92,36€\nTicket n°00847\nhttps://alloflow.fr/r/00847"
}
```

**Alternative** : Brevo (ex-Sendinblue) pour tarification europe-friendly

**Contenu SMS** :
- Nom établissement
- Montant total
- Numéro ticket
- Lien vers reçu HTML hébergé (URL courte, TTL 30 jours)

**Validation téléphone** : format E.164, vérification préfixe pays

### Envoi Email reçu

**Provider recommandé** : Resend (ou Brevo)

**Template** : HTML transactionnel avec :
- Logo établissement
- Tableau articles (HTML table)
- Totaux HT/TVA/TTC
- Mode de règlement
- SIRET + adresse

**Endpoint interne** :
```
POST /api/v1/receipts/:orderId/email
Body: { email: "client@example.com" }
```

**Suivi** : Webhook provider pour tracking `delivered` / `bounced` — conservé dans table `receipt_sends`

---

## 11. Tests critiques

### Tests unitaires (fonctions pures)

- [ ] `calculateTotals(items[])` : sous-total HT, TVA par taux, TTC — cas normaux
- [ ] `calculateTotals` avec remise % sur total
- [ ] `calculateTotals` avec remise € fixe sur article
- [ ] `calculateTotals` avec remises multiples (article + total)
- [ ] `calculateChange(amountDue, amountTendered)` : rendu positif, nul, négatif
- [ ] `calculateChange` avec montant exact
- [ ] `getQuickAmounts(amountDue)` : génère les 4 montants rapides corrects
- [ ] Calcul TVA 5,5% : 100 HT → 105,50 TTC
- [ ] Calcul TVA 10% : 100 HT → 110 TTC
- [ ] Calcul TVA 20% : 100 HT → 120 TTC
- [ ] Remise % plafonnée à 100
- [ ] Remise € plafonnée au total TTC cible
- [ ] Formatage montants FR (séparateur décimal virgule, espace milliers)

### Tests composants (React Testing Library)

- [ ] `<ProductCard>` : affiche badge si inCart, pas de clic si soldOut
- [ ] `<TicketPanel>` : bouton Encaisser disabled si panier vide, enabled si items
- [ ] `<TicketLine>` : clic − sur qty 1 supprime la ligne
- [ ] `<CashNumpad>` : saisie 1-0-0 affiche 100,00€, rendu = 7,64€ vert
- [ ] `<CashNumpad>` : saisie 9-0 affiche 90,00€, rendu négatif rouge, Valider disabled
- [ ] `<CashNumpad>` : clic "Exact" → rendu = 0,00€ vert, Valider enabled
- [ ] `<CashNumpad>` : clic ⌫ efface dernier chiffre
- [ ] `<DiscountModal>` : preview recalculé en temps réel sur changement valeur
- [ ] `<DiscountModal>` : changement type % ↔ € met à jour l'unité affiché
- [ ] `<TableNode>` : classe CSS correcte selon statut (libre/occupee/addition/cb)
- [ ] `<TableNode>` : non cliquable si statut = "cb"
- [ ] `<CBWaitingScreen>` : affiche état timeout après 30s sans réponse

### Tests API (integration)

- [ ] `POST /orders` : crée ordre avec table_id valide → 201
- [ ] `POST /orders` : erreur si table déjà occupée → 409
- [ ] `POST /orders/:id/items` : ajoute article → recalcule totaux
- [ ] `POST /orders/:id/items` : erreur si produit épuisé → 400
- [ ] `PATCH /orders/:id/items/:itemId` : qty = 0 supprime la ligne
- [ ] `POST /orders/:id/discounts` : remise 10% sur total → nouveau TTC correct
- [ ] `POST /orders/:id/discounts` : erreur si caissier tente 20% → 403
- [ ] `POST /orders/:id/payments` : espèces → paiement immédiat, order paid
- [ ] `POST /orders/:id/payments` : CB → payment pending, transaction_id retourné
- [ ] `POST /orders/:id/payments/:id/confirm` → order paid, table libre
- [ ] `POST /orders/:id/payments` : montant > reste → 400
- [ ] `POST /cash-sessions` : erreur si session déjà ouverte → 409
- [ ] `POST /cash-sessions/:id/close` : ferme session, calcule variance
- [ ] `POST /cash-sessions/:id/close` : erreur si session déjà clôturée → 400
- [ ] `GET /rooms/:id/tables` : retourne seulement les tables de l'établissement (RLS)
- [ ] Tentative accès ordre d'un autre établissement → 403 (RLS)

### Tests E2E (Playwright)

- [ ] Flow complet caisse vide → article → encaissement CB → reçu
- [ ] Flow complet avec remise 10% → encaissement espèces → rendu correct
- [ ] Flow split payment : CB 50€ + espèces 42,36€ → reçu
- [ ] Plan de salle : table occupée → clic → ticket chargé
- [ ] Plan de salle : table "addition" clignote (animation visible)
- [ ] Clôture de caisse : comptage espèces → écart calculé → validation
- [ ] Produit épuisé : non cliquable dans la grille
- [ ] Annulation commande : panier vidé, table repassée à "libre"
- [ ] Session expirée : redirect vers login (401)

### Tests de régression

- [ ] Total TTC = somme(TVA par taux) + sous-total HT (cohérence comptable)
- [ ] Ticket n° séquentiel par session (pas de doublon)
- [ ] Remise affichée sur reçu correspond à remise enregistrée en base
- [ ] Après clôture : `GET /cash-sessions/current` retourne 404
- [ ] Après clôture : impossibilité de créer un paiement sur session fermée

### Tests de charge

- [ ] Simultanément 10 caissiers actifs sur 10 tables → pas de race condition sur `ticket_number`
- [ ] Terminal CB timeout sous charge : 30s respecté
- [ ] Plan de salle temps réel (20 tables) → mise à jour < 500ms après changement statut
