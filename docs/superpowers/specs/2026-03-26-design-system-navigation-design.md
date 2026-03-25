# Design System & Navigation — Spec Design

**Version :** 1.0
**Date :** 2026-03-26
**Auteur :** Head of Design, Alloflow
**Scope :** Dashboard Admin + Interface Caisse — navigation, design tokens, composants UI

---

## Table des matières

1. [Design Tokens](#1-design-tokens)
2. [Composants UI partagés](#2-composants-ui-partagés)
3. [Layout Dashboard Admin](#3-layout-dashboard-admin)
4. [Layout Interface Caisse](#4-layout-interface-caisse)
5. [Navigation entre les interfaces](#5-navigation-entre-les-interfaces)
6. [Flows de navigation](#6-flows-de-navigation)
7. [Accessibilité](#7-accessibilité)
8. [Responsive](#8-responsive)
9. [États globaux de l'application](#9-états-globaux-de-lapplication)

---

## 1. Design Tokens

### 1.1 Couleurs — Backgrounds et surfaces

L'application utilise un thème sombre profond inspiré des environnements de travail nocturnes de la restauration. Deux "températures" de fond coexistent : le Dashboard Admin (bleu-ardoise) et la Caisse (bleu nuit plus profond), signalant visuellement deux espaces fonctionnels distincts.

| Token | Valeur hex | Usage |
|---|---|---|
| `--bg` | `#0f172a` | Fond global Dashboard Admin |
| `--bg-caisse` | `#0a1628` | Fond global Interface Caisse (plus sombre, contexte opérationnel) |
| `--bg-tabs` | `#060e1a` | Barre de tabs navigateur mockup / bande la plus sombre |
| `--surface` | `#1e293b` | Surfaces primaires : cards, tables, sidebars, dialogs |
| `--surface2` / `--surface-raised` | `#263348` | Surfaces surélevées : hover de rows, dropdowns, éléments actifs |
| `--border` | `#334155` | Bordures par défaut entre éléments |
| `--border-active` | `#475569` | Bordures en état actif / focus |

**Justification des deux fonds :** La distinction `#0f172a` (dashboard) vs `#0a1628` (caisse) crée une rupture perceptible lors de la transition. L'utilisateur comprend instinctivement qu'il a changé d'espace sans lire aucun texte. La caisse étant un environnement de focus opérationnel — utilisée en conditions de stress (service), sous éclairage de salle — le fond plus sombre réduit la fatigue oculaire et améliore le contraste des prix et des CTA.

### 1.2 Couleurs — Texte (4 niveaux)

| Token | Valeur hex | Usage |
|---|---|---|
| `--text1` / `--text-primary` | `#f8fafc` | Texte principal, titres, prix, valeurs critiques |
| `--text2` / `--text-secondary` | `#e2e8f0` | Texte secondaire, labels de nav, contenu de table |
| `--text3` / `--text-muted` | `#94a3b8` | Texte atténué, sous-titres, hints, métadonnées |
| `--text4` / `--text-disabled` | `#475569` | Texte désactivé, labels de section, éléments inactifs |

**Hiérarchie de lisibilité :** Les 4 niveaux permettent une scanabilité immédiate. Dans une interface POS où le caissier doit lire un prix ou un nom de produit en moins d'une seconde, la différence de luminance entre text1 (#f8fafc) et text4 (#475569) est un ratio de contraste de ~8:1 sur fond --surface, bien au-dessus du minimum WCAG AA (4.5:1).

### 1.3 Couleurs — Accents fonctionnels

| Token | Valeur hex | Usage sémantique |
|---|---|---|
| `--blue` | `#1d4ed8` | Action principale, nav active, boutons primaires, liens |
| `--blue-hover` | `#1e40af` | État hover du bleu (assombri de ~10%) |
| `--blue-light` | `#1e3a5f` | Fond de highlight bleu (role cards hover) |
| `--green` | `#10b981` | Succès, actif, disponible, caisse ouverte, Encaisser |
| `--amber` | `#f59e0b` | Avertissement, TVA badge, annotations de spec |
| `--red` | `#ef4444` | Danger, erreur, suppression, notification badge |

**Couleurs semi-transparentes dérivées :**

| Usage | Valeur |
|---|---|
| Fond badge blue | `rgba(29,78,216,.2)` |
| Fond badge green | `rgba(16,185,129,.15)` |
| Fond badge amber | `rgba(245,158,11,.15)` |
| Fond badge red | `rgba(239,68,68,.15)` |
| Glow bouton caisse hover | `rgba(16,185,129,.15)` (box-shadow) |
| Overlay modal | `rgba(0,0,0,.6)` |
| Fond selection bulk | `rgba(29,78,216,.06)` |
| Fond row édition | `rgba(29,78,216,.1)` |
| Fond info prix calculé | `rgba(29,78,216,.1)` |

### 1.4 Couleurs — Tokens spécifiques catégories produits

Ces couleurs couvrent les badges de catégorie dans le tableau produits et les pills de navigation de la caisse. Le choix de fonds très sombres (évocateurs de la couleur de la catégorie) avec des textes clairs assure la lisibilité sur fond `--surface`.

| Catégorie | Fond badge | Texte badge |
|---|---|---|
| Plat | `#172554` | `#93c5fd` (bleu clair) |
| Entrée | `#14532d` | `#86efac` (vert clair) |
| Boisson | `#1e1b4b` | `#a5b4fc` (indigo clair) |
| Dessert | `#4a1d96` | `#d8b4fe` (violet clair) |
| Extra / Divers | `#292524` | `#d6d3d1` (gris clair) |

**Couleurs des catégories dans le gestionnaire de catégories :**

| Catégorie | Couleur pastille |
|---|---|
| Plats | `#3b82f6` |
| Entrées | `#22c55e` |
| Boissons | `#8b5cf6` |
| Desserts | `#a855f7` |
| Menus / Formules | `#f59e0b` |

### 1.5 Couleurs — TVA

| Taux | Fond | Texte | Justification |
|---|---|---|---|
| 5,5% | `rgba(245,158,11,.15)` | `#f59e0b` (amber) | Même token que la TVA 10% (le 5,5% est rare) |
| 10% | `rgba(245,158,11,.15)` | `#f59e0b` (amber) | Taux standard restauration |
| 20% | `rgba(251,146,60,.15)` | `#fb923c` (orange-amber) | Taux alcool, visuellement distinct |

---

### 1.6 Typographie

La stack typographique s'appuie sur les polices système de chaque plateforme. Pas de chargement de police externe : performances garanties, cohérence avec l'OS de l'iPad ou du Mac utilisé en caisse.

**Famille principale :**
```
-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
```

**Famille monospace (références produit, URLs, code) :**
```
'SF Mono', 'Fira Code', monospace
```

| Usage | Taille | Poids | Couleur par défaut |
|---|---|---|---|
| Titre de page (`page-title`) | 18px | 700 | `--text-primary` |
| Nom du logo (`logo-name`) | 15px | 700 | `--text-primary` |
| Titre splash | 28px | 800 | `--text-primary` |
| Titre dialog / modal | 16–17px | 700 | `--text-primary` |
| Prix grand total ticket | 18px | 800 | `--text-primary` |
| Prix bouton Encaisser | 18px | 700 | blanc |
| Prix produit card caisse | 18px | 700 | `--text-primary` |
| Nom produit card caisse | 14px | 600 | `--text-secondary` |
| Texte de navigation (nav items) | 13px | 400–500 | `--text-muted` |
| Contenu tableau | 13–14px | 400–600 | `--text-secondary` |
| Labels de section nav | 10px | 600 | `--text-disabled` (uppercase) |
| En-têtes de colonnes table | 11px | 600 | `--text-disabled` (uppercase, letter-spacing: .06em) |
| Sous-titres de page | 13px | 400 | `--text-muted` |
| Badges TVA | 11px | 700 | amber / orange |
| Badges catégorie | 12px | 500 | selon catégorie |
| Hints de formulaire | 11px | 400 | `--text-muted` |
| Labels de formulaire | 12px | 500 | `--text-muted` |
| Texte de toast | 13px | 400 | `--text-secondary` |
| Référence produit (monospace) | 11px | 400 | `--text-muted` |
| URLs (structure URL screen) | 13px | 400 | `#93c5fd` (bleu clair, monospace) |
| Heure caissier | 13px | 400 | `--text-muted` |
| Sous-logo restaurant | 10px | 400 | `--text-muted` |

**Line-heights notables :**
- Texte narratif (modals, descriptions) : 1.5
- Nom produit card caisse (peut passer sur 2 lignes) : 1.3
- Valeur par défaut : non spécifiée (héritée navigateur, ~1.4)

---

### 1.7 Espacements & Dimensions

#### Touch targets

Conformément aux guidelines WCAG 2.5.5 (AAA) et Apple HIG :

| Élément | Dimension minimale | Valeur mockup |
|---|---|---|
| Bouton action (edit, more) | 44×44px recommandé WCAG | 28×28px (desktop-only, à agrandir pour tablet) |
| Bouton primaire (btn) | 36px de hauteur min | 36px |
| Bouton login | 48px de hauteur | 48px |
| Bouton Encaisser | 72px de hauteur | 72px (CTA critique, touch-first) |
| Toggle switch | 36×20px | 36×20px |
| Nav items sidebar | ~36px de hauteur effective | padding 8px 10px (hauteur ~34px) |
| Cat pills caisse | 56px de hauteur | 56px |
| Cat footer btn | 44px de hauteur | 44px |

**Règle de design :** Tout élément interactif sur la caisse (interface tablet potentielle) doit avoir un touch target d'au moins 44×44px. Les action-btns de 28×28px sont acceptables uniquement sur le Dashboard Admin (usage souris exclusif).

#### Heights des éléments clés

| Élément | Hauteur |
|---|---|
| Topbar Dashboard Admin | 52px |
| Header Caisse (admin et caissier) | 48px |
| Barre de tabs mockup (navigation-mockup.html) | 36px |
| Barre de tabs produits (products-mockup.html) | 44px |
| Row de tableau | 40px |
| Bouton standard (`.btn`) | 36px (implicite, padding 7px 14px) |
| Bouton caisse | 36px |
| Bouton login | 48px |
| Bouton Encaisser | 72px |
| Input de formulaire | 44px |
| Prod card caisse | 120px |
| Ticket header | auto (padding 12px 16px) |
| Ligne ticket | auto (padding 9px 16px) |

#### Widths des éléments clés

| Élément | Largeur |
|---|---|
| Sidebar Dashboard Admin | 220px (variable CSS : `--sidebar-w`) |
| Colonne catégories caisse | 200px |
| Ticket / panier caisse | 360px |
| Dialog / Modal standard | 480px |
| Modal commande en cours | 440px |
| Dialog danger (suppression) | 420px |
| Dialog catégories | 520px |
| Logo icon sidebar | 32×32px |
| Avatar utilisateur | 30×30px |
| Notif button | 36×36px |
| Bouton fermer caisse | 32×32px |
| Logo caissier header | 28×28px |
| Avatar caissier | 26×26px |
| Barre de progression splash | 200px × 3px |
| Search input max-width | 320px |

#### Border-radius par composant

| Composant | Border-radius |
|---|---|
| Logo icon sidebar | 8px |
| Splash icon | 12px |
| Login logo icon | 12px |
| Boutons standard (`.btn`) | 6px |
| Bouton caisse | 8px |
| Bouton login | 10px |
| Bouton Encaisser | 14px |
| Cards produit caisse | 16px |
| Dialog / Modal | 12px |
| Modal commande en cours | 16px |
| Toast | 8px |
| Badge catégorie | 12px |
| Badge TVA | 4px |
| Badge statut (blue/green/red/amber) | 20px (pill) |
| Tag rôle (rc-tag) | 10px |
| Toggle | 10px (=height/2) |
| Bille toggle | 50% |
| Nav item | 6px |
| Cat pill caisse | 12px |
| Action button | 5px |
| Dropdown menu | 8px |
| Dropdown item | 5px |
| Input form | 6px |
| Table wrap | 10px |
| Bulk bar | 8px |
| Search input | 6px |
| Pagination button | 5px |
| Page footer btn (caisse) | 10px |
| Séparateur caisse (dot vert) | 50% |
| Barre progression splash | 3px |
| Notif dot | 50% |
| Mode dot caisse | 50% |

---

### 1.8 Animations

Toutes les animations sont courtes et fonctionnelles. Pas d'animation décorative longue — l'interface est un outil de travail utilisé sous pression.

| Animation | Durée | Easing | Usage |
|---|---|---|---|
| Transitions hover (nav, boutons, rows) | 100ms | linear | Réactivité immédiate pour pointer events |
| Transitions hover (badges, barge caisse) | 150ms | ease | Légèrement plus doux |
| Transitions hover (btn-caisse, cards) | 200ms | ease | Bouton caisse (élément clé, mérite attention) |
| Toggle thumb slide | 150ms | ease | Animation du bouton switch |
| Tooltip fade | 150ms | ease | Apparition tooltip bouton caisse |
| Row actions fade-in | 100ms | ease | Apparition des actions edit/more au hover |
| Blink dot caisse (keyframe) | 1500ms | ease-in-out | Clignotement du point vert "Ouvrir la caisse" |
| Splash progress bar (keyframe) | 1800ms | ease-in-out | Chargement : 0% → 70% → 100% |
| Skeleton shimmer (keyframe) | 1500ms | ease-in-out | Pulsation opacity 0.4 → 0.7 → 0.4 |
| Backdrop filter admin topbar | — | — | `backdrop-filter: blur(8px)` — pas d'animation, état permanent |
| Backdrop filter caisse header | — | — | `backdrop-filter: blur(8px)` — idem |
| Fond flou modal commande en cours | — | — | `filter: blur(2px)` sur le fond, opacity .4 |

**Règle :** Aucune animation de transition de page n'est spécifiée dans les mockups (ce sera une décision d'implémentation : fade-in 150ms recommandé pour les transitions dashboard ↔ caisse).

---

## 2. Composants UI partagés

### 2.1 Badge

**Description :** Étiquette inline indiquant un statut, une catégorie ou un taux fiscal. Non interactif.

**Variants :**

| Variant | Classe | Fond | Texte | Shape |
|---|---|---|---|---|
| Blue (statut admin/manager) | `.badge-blue` | `rgba(29,78,216,.2)` | `#93c5fd` | pill (radius 20px) |
| Green (accès caisse) | `.badge-green` | `rgba(16,185,129,.15)` | `#6ee7b7` | pill |
| Amber (avertissement) | `.badge-amber` | `rgba(245,158,11,.15)` | `#fcd34d` | pill |
| Red (danger/erreur) | `.badge-red` | `rgba(239,68,68,.15)` | `#fca5a5` | pill |
| TVA 10% | `.tva-badge` | `rgba(245,158,11,.15)` | `#f59e0b` | carré (radius 4px) |
| TVA 20% | `.tva-badge.tva-20` | `rgba(251,146,60,.15)` | `#fb923c` | carré |
| Catégorie Plat | `.cat-badge.cat-plat` | `#172554` | `#93c5fd` | pill |
| Catégorie Entrée | `.cat-badge.cat-entree` | `#14532d` | `#86efac` | pill |
| Catégorie Boisson | `.cat-badge.cat-boisson` | `#1e1b4b` | `#a5b4fc` | pill |
| Catégorie Dessert | `.cat-badge.cat-dessert` | `#4a1d96` | `#d8b4fe` | pill |
| Catégorie Extra | `.cat-badge.cat-extra` | `#292524` | `#d6d3d1` | pill |

**Props :** `variant`, `label`
**Taille :** padding 2px 8px (catégorie/statut) / 2px 6–7px (TVA). Font 11–12px, weight 600–700.
**États visuels :** badge statique uniquement (pas d'hover, pas de focus).

---

### 2.2 Toggle Switch

**Description :** Interrupteur binaire actif/inactif. Utilisé pour la disponibilité des produits (table Admin et formulaire).

**Anatomy :**
- Track : 36×20px, border-radius 10px
- Thumb : 14×14px, border-radius 50%, background blanc, top 3px, left 3px
- Animation thumb : `transform: translateX(16px)` en 150ms ease

**États visuels :**

| État | Track background | Thumb position | Label |
|---|---|---|---|
| On | `#10b981` (vert) | translateX(16px) | "Actif" color: `#10b981` |
| Off | `#475569` (gris-bleu) | position initiale | "Inactif" color: `#94a3b8` |

**Composant wrapper `.toggle-wrap` :** `display: inline-flex; align-items: center; gap: 6px; cursor: pointer`
**Dans les formulaires (`.toggle-row`) :** Le toggle est accompagné d'un label + sous-label, dans un container `background: --bg, border: 1px solid --border, border-radius: 6px, padding: 10px 12px`.

**États non spécifiés dans les mockups** (à définir lors de l'implémentation) :
- Disabled : opacité 0.4, cursor not-allowed
- Loading : animation shimmer sur le track
- Focus : ring bleu 2px offset 2px

---

### 2.3 Button

**Variants :**

| Variant | Classe | Background | Texte | Border |
|---|---|---|---|---|
| Primary | `.btn-primary` | `#1d4ed8` | blanc | aucune |
| Primary hover | — | `#1e40af` | blanc | aucune |
| Secondary | `.btn-secondary` | `#1e293b` | `#e2e8f0` | `1px solid #334155` |
| Secondary hover | — | `#263348` | `#e2e8f0` | identique |
| Ghost | `.btn-ghost` | transparent | `#94a3b8` | `1px solid #334155` |
| Ghost hover | — | `#1e293b` | `#e2e8f0` | identique |
| Green | `.btn-green` | `#10b981` | blanc | aucune |
| Danger | `.btn-danger` | `#ef4444` | blanc | aucune |
| Caisse | `.btn-caisse` | `rgba(16,185,129,.1)` | `#10b981` | `1px solid rgba(16,185,129,.4)` |
| Caisse hover | — | `rgba(16,185,129,.2)` | `#10b981` | `1px solid #10b981` + box-shadow glow |
| Login | `.btn-login` | `#1d4ed8` | blanc | aucune |

**Tailles :**
- Standard : height 36px, padding 0 16px (`.btn` avec height implicite par padding)
- Small : `.btn-sm` → padding 5px 10px, font-size 12px
- Login : height 48px, width 100%, border-radius 10px
- Encaisser : height 72px, width calc(100% - 28px), border-radius 14px, font 18px/700, box-shadow `0 4px 24px rgba(16,185,129,.35)`

**Props communs :** `display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: none; cursor: pointer; font-weight: 600 (500 pour btn secondaire); transition: all .15s`

**État Encaisser désactivé (panier vide) :**
- `background: --surface` (gris), `color: --text-disabled`, `box-shadow: none`, `cursor: not-allowed`
- Justification : ne pas griser/masquer le bouton, mais le rendre visuellement inactif tout en restant présent pour l'affordance.

**États focus/disabled (à implémenter) :**
- Focus visible : `outline: 2px solid #1d4ed8; outline-offset: 2px`
- Disabled : opacité 0.5, cursor not-allowed

---

### 2.4 Toast

**Description :** Notification temporaire apparaissant en bas à droite de l'écran.

**Position :** `position: fixed; bottom: 24px; right: 24px; z-index: 9999`
**Container :** `display: flex; flex-direction: column; gap: 8px` (stack de toasts possible)

**Anatomy :**
- Background : `--surface` (#1e293b)
- Border : `1px solid --border`
- Border-radius : 8px
- Padding : 12px 16px
- Box-shadow : `0 8px 24px rgba(0,0,0,.4)`
- Min-width : 260px
- Gap interne : 10px (icon + texte)

**Variants :**

| Variant | Différenciateur visuel | Couleur borde gauche |
|---|---|---|
| Success | `border-left: 3px solid #10b981` | vert |
| Error | `border-left: 3px solid #ef4444` | rouge |

**Contenu :** icône (font-size 16px) + texte (13px, `--text-secondary`)

**Comportement (à implémenter) :** disparition automatique après 3–5s avec fade-out 150ms. Cliquable pour dismissal immédiat.

---

### 2.5 Modal / Dialog

Il existe deux patterns distincts dans les mockups.

#### Pattern A — Dialog Dashboard (`.dialog`)
Usage : formulaires produit, gestion catégories, confirmation suppression.

- Width : 480px (standard) / 420px (danger) / 520px (catégories)
- Max-height : 80vh avec `overflow: auto`
- Background : `--surface`
- Border : `1px solid --border`
- Border-radius : 12px
- Box-shadow : `0 25px 50px rgba(0,0,0,.5)`
- Overlay : `position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 100; display: flex; align-items: center; justify-content: center`

**Structure :**
- `.dialog-header` : padding 20px 24px 16px, border-bottom 1px, flex row avec titre + bouton close
- `.dialog-body` : padding 20px 24px, flex column, gap 20px
- `.dialog-footer` : padding 16px 24px, border-top 1px, flex row, justify-content flex-end, gap 8px

**Bouton close (`.dialog-close`) :** 28×28px, border-radius 5px, fond transparent, couleur text-muted. Hover : fond surface-raised, couleur text-primary.

**Variant Danger (`.dialog.danger-dialog`) :**
- Border : `1px solid rgba(239,68,68,.3)`
- Header background : `rgba(69,10,10,.6)` (rouge très sombre)
- Titre : `#fca5a5`

#### Pattern B — Modal Caisse (`.modal`)
Usage : avertissement "commande en cours" lors de la tentative de quitter la caisse.

- Width : 440px
- Background : `--surface`
- Border : `1px solid --border`
- Border-radius : 16px (plus arrondi que le dialog dashboard)
- Box-shadow : `0 24px 60px rgba(0,0,0,.5)`
- Overlay : `position: absolute; inset: 0; background: rgba(0,0,0,.6); z-index: 200`

**Structure :**
- `.modal-header` : padding 20px 24px 16px, border-bottom 1px, flex row avec icon (28px emoji) + titre + sous-texte
- `.modal-body` : padding 20px 24px, flex column, gap 12px
- `.modal-footer` : padding 16px 24px, border-top 1px, flex row, gap 10px

**Fond flou derrière la modal :** le contenu de la caisse est affiché à `filter: blur(2px); opacity: 0.4` en position absolute, créant un effet de contexte visible mais non lisible.

---

### 2.6 Skeleton Loader

**Description :** Placeholder animé indiquant un chargement. Remplace les vraies données avant leur arrivée.

**Anatomy :**
- Classe : `.skeleton`
- Background : `--surface-raised` (#263348)
- Border-radius : 4px (overridé selon la forme de l'élément : 12px pour les badges pilule, etc.)
- Animation : `shimmer 1.5s ease-in-out infinite`
- Keyframe shimmer : `0% { opacity: .4 } 50% { opacity: .7 } 100% { opacity: .4 }`

**Utilisation dans la page produits :**
- Sous-titre de page : skeleton 180×14px
- Bouton "Nouveau produit" : skeleton 140×34px border-radius 6px
- Stat cards : skeleton valeur 40×24px + label 80–120×12px
- Toolbar : skeletons search (280×34px), filter (130×34px), segment (160×34px)
- Rows de table : checkbox (16×16px) + nom (130–180×14px) + ref (60×10px) + badge (70–80×22px, radius 12px) + prix (45–60×14px) + TVA (36×20px, radius 4px) + toggle (50×20px, radius 10px)

---

### 2.7 Empty State

**Description :** État affiché lorsqu'une liste est vide (aucun produit au catalogue).

**Container :** `.empty-state` — `display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 64px 32px; text-align: center; gap: 16px`

**Éléments :**
- Icône emoji : font-size 48px, opacity 0.4
- Titre : 16px, weight 600, `--text-secondary`
- Texte explicatif : 13px, `--text-muted`, max-width 320px, line-height 1.5
- Actions CTA : flex row, gap 8px, margin-top 8px (ghost + primary)

**Exemple Dashboard Produits :**
- Icône : 🍽️
- Titre : "Votre catalogue est vide"
- Texte : "Commencez par créer vos catégories (Plats, Entrées, Boissons…), puis ajoutez vos produits avec leurs prix et TVA."
- Actions : "🏷️ Créer des catégories" (ghost) + "+ Ajouter un premier produit" (primary)

**Exemple Ticket caisse vide :**
- Icône : 🛒 à font-size 36px, opacity 0.3
- Texte : "Sélectionnez des articles"
- Couleur : `--text-disabled`

---

### 2.8 Dropdown Menu

**Description :** Menu contextuel apparaissant au clic sur le bouton "⋯" d'une row de tableau.

**Position :** absolute, right 8px, top 36px (sous le bouton déclencheur), z-index 50.

**Container (`.dropdown-menu`) :**
- Background : `--surface`
- Border : `1px solid --border`
- Border-radius : 8px
- Padding : 4px
- Min-width : 180px
- Box-shadow : `0 8px 24px rgba(0,0,0,.4)`

**Item (`.dropdown-item`) :**
- Display flex, align-items center, gap 8px
- Padding : 7px 10px
- Border-radius : 5px
- Font-size : 13px, color `--text-secondary`
- Hover : background `--surface-raised`

**Item danger (`.dropdown-item.danger`) :**
- Color : `--red`
- Hover : background `rgba(239,68,68,.1)`

**Séparateur (`.dropdown-sep`) :**
- Height 1px, background `--border`, margin 4px 0

**Items disponibles pour un produit :**
1. ✏️ Modifier
2. 📋 Dupliquer
3. ─── (séparateur)
4. ⏸️ Désactiver temporairement
5. ─── (séparateur)
6. 🗑️ Supprimer définitivement (danger)

**Déclenchement :** le bouton "⋯" prend `background: --bg; color: --text-primary` à l'état ouvert (inverse du hover normal).

---

### 2.9 Tooltip

**Description :** Info-bulle apparaissant au hover sur le bouton "Ouvrir la caisse".

**Conteneur (`.tooltip-wrap`) :** position relative.

**Bulle (`.tooltip`) :**
- Position absolute, top calc(100% + 8px), right 0
- Background : `--surface`
- Border : `1px solid --border`
- Border-radius : 8px
- Padding : 10px 14px
- Font-size : 12px, color `--text-secondary`
- White-space : nowrap
- Box-shadow : `0 8px 24px rgba(0,0,0,.4)`
- z-index : 100
- Transition opacity 150ms
- Default : opacity 0
- Hover sur parent : opacity 1

**Flèche :** pseudo-élément `::before`, 8×8px, background `--surface`, border-top + border-left `1px solid --border`, rotate 45deg, position top -5px right 14px.

**Contenu :** "S'ouvre dans un nouvel onglet\nLa caisse tourne en parallèle"

---

### 2.10 Bulk Action Bar

**Description :** Barre d'actions groupées apparaissant lors de la sélection de plusieurs produits. Position sticky en bas de la liste.

**Container (`.bulk-bar`) :**
- Position sticky, bottom 0
- Margin : 8px 24px 0
- Background : `--blue` (#1d4ed8)
- Border-radius : 8px
- Padding : 10px 16px
- Flex row, align-items center, gap 12px
- Border : `1px solid rgba(255,255,255,.15)`
- Box-shadow : `0 8px 24px rgba(0,0,0,.4)`

**Éléments :**
- Compteur : "X produits sélectionnés" (13px, weight 600, blanc)
- Lien "Tout désélectionner" (12px, `rgba(255,255,255,.5)`, cursor pointer)
- Séparateurs verticaux : 1×20px, `rgba(255,255,255,.2)`
- Actions (`.bulk-action`) : padding 5px 12px, border-radius 5px, border `1px solid rgba(255,255,255,.2)`, fond transparent, couleur blanc, 12px/500
  - Activer, Désactiver, Supprimer (danger : border rouge, texte `#fca5a5`)
- Selects natifs (changer catégorie, changer TVA) : fond `rgba(255,255,255,.1)`, border similaire, couleur blanc

**Rows sélectionnées :** `background: rgba(29,78,216,.06); border-left: 2px solid --blue`

---

## 3. Layout Dashboard Admin

### 3.1 Structure générale

```
┌─────────────────────────────────────────────────────────────┐
│  TOPBAR (height: 52px, position: sticky/fixed)              │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│   SIDEBAR    │           MAIN CONTENT AREA                 │
│   220px      │           flex: 1, overflow: auto           │
│              │                                              │
│   min-height │  ┌─────────────────────────────────────┐   │
│   calc(100vh │  │  PAGE HEADER (padding 24px)          │   │
│   - topbar)  │  │  STATS BAR                           │   │
│              │  │  TOOLBAR                             │   │
│   position:  │  │  TABLE WRAP                          │   │
│   sticky     │  │  TABLE FOOTER (pagination)           │   │
│   top: 0     │  └─────────────────────────────────────┘   │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

**Layout principal :** `display: flex; height: 100%` (navigation-mockup) ou `display: flex; min-height: calc(100vh - 44px)` (products-mockup). Pas de grille CSS complexe : modèle flexbox simple sidebar + main.

### 3.2 Sidebar

**Dimensions :** width 220px, background `#111827` (légèrement plus sombre que --surface), border-right `1px solid --border`.

**Structure de haut en bas :**

1. **Logo area** (`.sidebar-logo` / `.admin-sidebar-logo`)
   - Padding : 18–20px 16px 14–16px
   - Border-bottom : `1px solid --border`
   - Icône A : 32×32px, background `--blue`, border-radius 8px, font 16px/800, blanc
   - Nom : "Alloflow" 15px/700
   - Sous-nom restaurant : 10px, `--text-muted` (ex: "L'Entrecôte Dorée")

2. **Navigation** (`.admin-nav` / `.nav-section`)
   - Padding : 8–10px 8px
   - Gap entre items : 1–2px
   - **Labels de section** (ex: "Principal") : 10px, weight 600, `--text-disabled`, uppercase, letter-spacing .06em, padding 6–8px 10px 4px

3. **Nav items** (`.nav-item`)
   - Padding : 8px 10px
   - Border-radius : 6px
   - Gap icon/label : 10px
   - États :
     - Default : `color: --text-muted`, fond transparent
     - Hover : `background: --surface; color: --text-secondary` — transition 100ms
     - Active : `background: --blue; color: blanc`
   - Icône : zone 16px, text-align center, font 14px
   - Badge notification : `background: --red; color: blanc; border-radius: 10px; padding: 1px 6px; font 10px/700; margin-left: auto`

4. **Items de navigation disponibles :**
   - 📊 Dashboard
   - 🍽️ Produits (page active dans les mockups)
   - 📋 Commandes + badge "3" (rouge)
   - 📈 Analytics
   - 📦 Stocks
   - 👥 CRM
   - Séparateur : `height: 1px; background: --border; margin: 8px 0`
   - ⚙️ Paramètres

5. **Footer sidebar** (`.sidebar-footer`)
   - `margin-top: auto` (pousse vers le bas)
   - Border-top : `1px solid --border`
   - Padding : 12px
   - `.user-row` / `.user-info` : flex row, gap 8px, padding 8px, border-radius 6px, cursor pointer
   - Hover : `background: --surface`
   - Avatar : 30×30px, border-radius 50%, `background: --blue`, initiales en blanc 12px/700
   - Nom utilisateur : 12px/500, `--text-secondary`
   - Rôle : 10px, `--text-muted`

### 3.3 Topbar Dashboard Admin

**Dimensions :** height 52px, border-bottom `1px solid --border`, padding `0 24px`, `background: rgba(15,23,42,.8)`, `backdrop-filter: blur(8px)`.

**Lecture Z de gauche à droite :**

Zone gauche (`.topbar-left`) :
- Breadcrumb : "Dashboard / **Produits**" — 13px, `--text-muted` / `--text-secondary` weight 500

Zone droite (`.topbar-right`) — de gauche à droite :
1. **Bouton "Ouvrir la caisse"** (`.btn-caisse`) — l'élément de navigation principal entre les deux interfaces
2. **Bouton notification** (`.notif-btn`) — 36×36px, icône 🔔, point rouge en top-right
3. **Avatar utilisateur** — 30×30px, initiales, cursor pointer

**Bouton Caisse détaillé :**
- Background : `rgba(16,185,129,.1)`, border : `1px solid rgba(16,185,129,.4)`, color : `--green`
- Font : 13px/700
- Contenu : point vert animé (blink 1.5s) + "Ouvrir la caisse ↗"
- Hover : background `rgba(16,185,129,.2)`, border `1px solid --green`, box-shadow `0 0 0 3px rgba(16,185,129,.15)`
- Tooltip au hover : "S'ouvre dans un nouvel onglet / La caisse tourne en parallèle"

### 3.4 Main content area

**Container (`.admin-main` / `.main`) :** `flex: 1; display: flex; flex-direction: column; overflow: hidden` (pour admin-main) ou `flex: 1; overflow: auto` (pour products-mockup).

**Page Header :**
- Padding : 24px 24px 16px
- Layout : flex row, justify-content space-between
- Gauche : titre 18px/700 + sous-titre 13px/--text-muted (margin-top 2–3px)
- Droite : bouton "+" primaire

**Stats Bar :**
- Padding : 0 24px 16px
- Flex row, gap 16px
- Chaque stat card : `background: --surface; border: 1px solid --border; border-radius: 8px; padding: 12px 16px`
  - Valeur : 20px/700, `--text-primary` (ou `--green` pour actifs, `--text-muted` pour inactifs)
  - Label : 11px, `--text-muted`
  - Delta (optionnel) : 11px, `--green`

**Toolbar :**
- Padding : 0 24px 12px
- Flex row, gap 8px, align-items center
- Search input : flex 1, max-width 320px
- Filtres (`.filter-select`) : fond --surface, border --border, radius 6px, padding 7px 10px, 13px
- Segment control : flex row, fond --surface, border --border, radius 6px, overflow hidden
  - Seg btn : padding 7px 12px, 12px/500
  - Active : background --surface-raised, color --text-primary
- Séparateur : 1×28px, `--border`, margin 0 4px
- Bouton fantôme small "🏷️ Catégories"

**Table Wrap :**
- Margin : 0 24px
- Background : --surface, border : `1px solid --border`, border-radius 10px, overflow hidden

**Table :**
- Width 100%, border-collapse collapse
- En-tête : background `--bg`, border-bottom `1px solid --border`
- TH : padding 10px 12px, 11px/600, `--text-disabled`, uppercase, letter-spacing .06em
  - Classes `.right` et `.center` pour alignement
  - `.sortable` : cursor pointer, hover color --text-muted
- Rows tbody : border-bottom `1px solid rgba(51,65,85,.5)`, transition background 100ms
  - Last-child : pas de border-bottom
  - Hover : background `--surface-raised`
  - Hover → row-actions opacity 1
  - Inactive : opacity 0.6 (produit désactivé)
- TD : padding 0 12px, height 40px, vertical-align middle

**Table Footer (pagination) :**
- Padding : 12px 24px
- Flex row, justify-content space-between, align-items center
- Texte : "1–25 sur 84 produits", 13px, `--text-muted`
- Pagination : flex row, gap 4px
  - Page btn : 30×30px, border-radius 5px, border `1px solid --border`, background --surface, 13px, --text-muted
  - Active : background --blue, border --blue, blanc
  - Hover : background --surface-raised, --text-secondary

### 3.5 Breakpoints

| Breakpoint | Comportement |
|---|---|
| > 1024px (desktop) | Layout complet : sidebar 220px + main |
| 768–1024px (tablette) | À définir — sidebar réductible ou masquable |
| < 768px (mobile) | Hors scope pour le Dashboard Admin |

---

## 4. Layout Interface Caisse

### 4.1 Structure générale

```
┌─────────────────────────────────────────────────────────────┐
│  CAISSE HEADER (height: 48px)                               │
├──────────────┬───────────────────────────────┬──────────────┤
│              │                              │              │
│  CATÉGORIES  │      GRILLE PRODUITS         │   TICKET     │
│   200px      │      flex: 1                 │   360px      │
│              │                              │              │
│  pills nav   │  header (titre catégorie)    │  header      │
│              │  grid 4 colonnes             │  lignes      │
│  cats-footer │                              │  totaux      │
│  (plan salle)│                              │  [Encaisser] │
└──────────────┴───────────────────────────────┴──────────────┘
```

**Container (`.pos`) :** `display: flex; height: 100%` (ou flex: 1 sur --bg-caisse).

### 4.2 Top bar Caisse — Lecture Z complète

#### Vue Admin (S3)

```
[← Dashboard admin] | [· Mode caisse · L'Entrecôte Dorée]    [Avatar MA - Marc Antoine (Admin)] [✕]
```

- Height : 48px, background `rgba(10,22,40,.95)`, border-bottom `1px solid --border`, backdrop-filter blur(8px)
- **Zone gauche** (`.caisse-context`) :
  - Bouton retour (`.caisse-back`) : `← Dashboard admin` — padding 6px 12px, border-radius 7px, border `1px solid --border`, fond transparent, 12px/500, `--text-muted`. Hover : fond --surface, --text-secondary.
  - Séparateur vertical : 1×20px, `--border`
  - Badge mode (`.caisse-mode-badge`) : point vert 8×8px + "Mode caisse · L'Entrecôte Dorée" — 13px/600, `--text-secondary`

- **Zone droite** (`.caisse-right`) :
  - Info utilisateur (`.caisse-user`) : avatar 26×26px + "Marc Antoine (Admin)" — 12px, `--text-muted`
  - Bouton fermer (`.caisse-close`) : 32×32px, border-radius 7px, border `1px solid rgba(239,68,68,.3)`, fond transparent, `--red`. Hover : fond `rgba(239,68,68,.1)`.

#### Vue Caissier (S4)

```
[A logo] [Alloflow] | [· Caisse ouverte]          [12:53] | [Avatar TD - Thomas D. — Caissier]
```

- Height : 48px, background `rgba(10,22,40,.95)`, border-bottom `1px solid --border`
- **Zone gauche** (`.ch-left`) :
  - Logo : 28×28px, border-radius 7px, `--blue`, initiale "A" 14px/800
  - Nom : "Alloflow" 13px/700, `--text-secondary`
  - Séparateur 1×18px
  - Mode : point vert 8×8px + "Caisse ouverte" — 12px, `--green`

- **Zone droite** (`.ch-right`) :
  - Heure : "12:53" — 13px, `--text-muted`
  - Séparateur 1×18px
  - Utilisateur (`.ch-user`) : padding 5px 10px, border-radius 7px, border `1px solid --border`
    - Avatar : 26×26px, border-radius 50%, fond #334155, initiales 11px/700 `--text-secondary`
    - Nom + rôle : "Thomas D. — Caissier" 12px, `--text-muted`
  - **Pas de bouton "Dashboard"** — absence intentionnelle, non grisé.

**Différence critique Admin vs Caissier :** Le bouton "← Dashboard admin" est présent uniquement pour les rôles Admin et Manager. Il est complètement absent (pas désactivé, absent) pour le rôle Caissier. Cette décision de design garantit qu'un caissier ne peut pas naviguer accidentellement vers l'administration.

### 4.3 Colonne Catégories

**Container (`.cats`) :** width 200px, background `#060e1a` (plus sombre que --bg-caisse), border-right `1px solid --border`, flex column, padding-top 48px (pour passer sous le header).

**Inner (`.cats-inner`) :** padding 10px, flex column, gap 6px, flex: 1.

**Cat pill (`.cat-pill`) :**
- Height : 56px
- Border-radius : 12px
- Padding : 0 14px
- Gap : 10px
- Font : 15px/600
- Border-left : 4px solid transparent (remplacé par couleur active)
- Width : 100%

**États cat pill :**
- Default : background `--surface`, color `--text-muted`
- Hover : background `--surface2`, color `--text-secondary`
- Active : background `--blue`, color blanc, border-left-color `#60a5fa`
- Transition : 150ms

**Footer catégories (`.cats-footer`) :**
- Padding : 10px, border-top `1px solid --border`
- Bouton "🗺️ Plan de salle" : height 44px, width 100%, border-radius 10px, border `1px solid --border`, fond transparent, `--text-muted`, 13px, flex center, gap 6px

### 4.4 Grille Produits

**Container (`.products-area`) :** flex: 1, display flex, flex-direction column, padding-top 48px, overflow hidden.

**Header produit (`.prod-header`) :** padding 12px 16px 8px, border-bottom `1px solid --border`, 17px/700. Exemple : "Plats · 12 disponibles" avec le compteur en 13px/400 `--text-muted` (vue admin) ou sans compteur (vue caissier).

**Grille (`.prod-grid`) :** flex: 1, padding 14px 16px, `display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; overflow-y: auto; align-content: start`.

**Product card (`.prod-card`) :**
- Height : 120px
- Background : `--surface`
- Border : `1px solid --border`
- Border-radius : 16px
- Padding : 12px
- Display flex, flex-direction column
- Cursor pointer
- Transition : 150ms

**États prod-card :**
- Default : comme ci-dessus
- Hover : `background: --surface2; border-color: --blue`
- Active/sélectionné (à implémenter) : border `2px solid --blue` + léger fond bleu

**Contenu prod-card :**
- Emoji : font-size 24px, margin-bottom 4px
- Nom : 14px/600, `--text-secondary`, flex: 1, line-height 1.3
- Prix : 18px/700, `--text-primary`

### 4.5 Ticket (colonne droite)

**Container (`.ticket-area`) :** width 360px, background `#060e1a`, border-left `1px solid --border`, flex column, padding-top 48px.

**Header ticket (`.ticket-hd`) :** padding 12px 16px, border-bottom `1px solid --border`, flex row, space-between.
- Titre : 16px/700 (ex: "Table 4" ou "Emporter")
- Info : 11px, `--text-muted` (heure d'ouverture ou nb d'articles)

**Corps ticket (`.ticket-body`) :** flex: 1, overflow-y auto, padding 8px 0.

**Ligne ticket (`.t-line`) :** padding 9px 16px, border-bottom `1px solid rgba(51,65,85,.3)`, flex row, align-items center, gap 8px.
- Nom `.t-name` : flex: 1, 14px/600, `--text-secondary`
  - Détail (prix unitaire × qté) : 11px/400, `--text-muted`
- Prix `.t-price` : 14px/700, `--text-primary`, white-space nowrap

**État ticket vide :**
- Corps : flex center column, gap 8px, `--text-disabled`
- Icône 🛒 : font-size 36px, opacity 0.3
- Texte : "Sélectionnez des articles" 13px

**Totaux (`.ticket-totals`) :** padding 12px 16px, border-top `1px solid --border`.
- Ligne sous-total / TVA : flex row, space-between, 13px, `--text-muted`, margin-bottom 4px
- Ligne TVA détaillée (10%, 20%) : flex row, 11px, `--text-muted`
- Grand total (`.tot-grand`) : flex row, space-between, 18px/800, `--text-primary`, margin-top 8px

**Bouton Encaisser (`.btn-encaisser`) :**
- Width : calc(100% - 28px), margin 12px 14px
- Height : 72px
- Border-radius : 14px
- Background : `--green` (#10b981)
- Color : blanc
- Font : 18px/700
- Box-shadow : `0 4px 24px rgba(16,185,129,.35)`
- Contenu : "💳 Encaisser · [montant]€"

**État désactivé (ticket vide) :**
- Background : `--surface`, color `--text-disabled`, box-shadow none, cursor not-allowed
- Le montant devient "—"

---

## 5. Navigation entre les interfaces

### 5.1 Lecture Z : Écran 1 — Dashboard Admin + bouton caisse

**Pattern de lecture Z :**

```
Haut-gauche → Haut-droite
Logo A + "Alloflow"              Breadcrumb "Dashboard / Produits"     [Ouvrir la caisse ↗] 🔔 [MA]
↓                                                                                                 ↓
Bas-gauche ← ────────────────────────────────────────────────────────────── Bas-droite
Nav items (Produits actif)       Tableau produits                     Actions (✏️ ⋯) col droite
```

**Éléments critiques dans l'ordre de scan Z :**
1. **Coin haut-gauche :** Logo Alloflow — ancrage de marque, identité visuelle
2. **Coin haut-droite :** Bouton "Ouvrir la caisse ↗" — l'action la plus importante de cette vue. Positionnement délibéré : c'est la première chose que l'admin cherche après son café du matin.
3. **Zone centrale-gauche :** Navigation sidebar — orientation dans l'application
4. **Zone centrale :** Contenu de page (tableau produits dans cet exemple)

**Point d'attention UX :** Le bouton caisse est dans la topbar, pas dans la sidebar. Justification : (a) il est toujours visible quelle que soit la page du dashboard, (b) il appartient à une logique d'action rapide (pas de navigation entre sections), (c) son style vert avec point clignotant le distingue visuellement des boutons d'action standard.

### 5.2 Lecture Z : Écran 2 — Splash transition

**Éléments :**
```
                    Centre-haut :
                    [A] Alloflow
                    "Chargement de la caisse…"
                    ████████████  (barre progression verte)
                    "L'Entrecôte Dorée · Service du midi"
```

**Design de la transition :**
- Fond `--bg-caisse` (#0a1628) — le changement de fond signale immédiatement l'espace caisse
- Centrage parfait : `align-items: center; justify-content: center`
- Barre de progression : 200×3px, `--surface` de fond, barre verte animée sur 1.8s (0% → 70% → 100%)
- Lecture Z simplifiée : mono-colonne centrée, scan du haut vers le bas

**Rôle de cet écran :** Feedback de chargement asynchrone (chargement du catalogue produits, des tables actives, des sessions en cours). Durée typique : 0.5–2s. Évite le flash blanc "écran vide" qui serait désorientant.

### 5.3 Lecture Z : Écran 3 — Caisse vue Admin

**Header (gauche → droite) :**
```
[← Dashboard admin] | [· Mode caisse · L'Entrecôte Dorée]    [Avatar MA] [Marc Antoine (Admin)] [✕]
```

**Corps (lecture globale) :**
```
[Catégories : pills verticaux]  [Grille produits 4 col]  [Ticket Table 4]
Plats (actif)                   🥩 Entrecôte 26,40€       Table 4 — 12:47
Entrées                         🍔 Burger 16,50€          Entrecôte ×2  52,80€
Boissons                        🍗 Poulet 18,70€          Coca ×2        7,00€
Desserts                        🐟 Cabillaud 22,00€       Tiramisu ×1    7,70€
Menus                           🍝 Tagliatelles 14,30€    ─────────────────
─────────────                   🥩 Côte de veau 29,70€    TOTAL TTC    67,50€
🗺️ Plan de salle                                          [💳 Encaisser]
```

**Spécificité Admin :** présence du bouton "← Dashboard admin" en haut à gauche. Il confirme visuellement à l'admin qu'il peut revenir à tout moment. Le bouton ✕ en haut à droite est une alternative (fermeture de la caisse, retour au dashboard).

### 5.4 Lecture Z : Écran 4 — Caisse vue Caissier

**Header :**
```
[A] Alloflow | [· Caisse ouverte]          [12:53] | [Avatar TD — Thomas D. — Caissier]
```

**Différences avec la vue Admin :**
- Pas de bouton "← Dashboard admin" : **intentionnellement absent**
- Pas de bouton ✕ (fermeture caisse) — le caissier ne ferme pas la caisse, seul l'admin le fait
- Ticket vide au démarrage : état "Emporter / 0 articles" avec panier vide
- Pas d'info "X disponibles" dans le header produit

**Lecture Z identique au corps** : catégories → produits → ticket.

### 5.5 Lecture Z : Écran 5 — Modal commande en cours

**Contexte :** L'admin tente de quitter la caisse (via "← Dashboard admin" ou ✕) alors qu'une commande est ouverte.

**Composition visuelle :**
```
[Fond caisse : blur(2px) opacity .4]
              ┌─────────────────────────────────┐
              │ ⚠️  Commande en cours            │
              │ "Une commande non encaissée…"   │
              │                                 │
              │ ┌─ Info ────────────────────┐   │
              │ │ Table           Table 4   │   │
              │ │ Articles        3         │   │
              │ │ Ouverte à       12:47     │   │
              │ │ Total           67,50€    │   │
              │ └───────────────────────────┘   │
              │                                 │
              │ 💡 La commande sera sauvegardée… │
              │                                 │
              │ [Rester sur la caisse] [Quitter →]│
              └─────────────────────────────────┘
```

**Lecture Z de la modal :**
1. Coin gauche : icône ⚠️ + titre "Commande en cours" — contexte immédiat
2. Sous-texte : explication de la situation
3. Bloc info : détails de la commande (ancrage factuel)
4. Note verte : rassurance (la commande est sauvegardée)
5. Footer : deux choix clairs — rester (ghost, gauche) ou quitter (primary, droite)

**Justification du placement des CTA :** L'action "quitter" est à droite en primary (bleu) car c'est l'action voulue par l'utilisateur qui a déclenché la modal. L'action "rester" est à gauche en ghost pour éviter les clics accidentels.

### 5.6 Lecture Z : Écran 6 — Connexion / Rôles

**Layout split-screen :**
```
┌──────────────────────────────┬─────────────────────────────┐
│         CONNEXION            │       RÔLES & ACCÈS          │
│                              │                              │
│  [A] Alloflow                │  "Après connexion, vous     │
│                              │   accédez à…"               │
│  Connexion                   │                              │
│  L'Entrecôte Dorée · Paris   │  ╔═══════════════════╗      │
│                              │  ║ 👑 Propriétaire   ║ (actif)│
│  Email [input]               │  ║ Dashboard + Caisse ║      │
│  Mot de passe [input]        │  ╚═══════════════════╝      │
│                              │                              │
│  [Se connecter]              │  ┌─────────────────────┐    │
│                              │  │ 👔 Manager          │    │
│  Mot de passe oublié ?       │  │ Dashboard + Caisse  │    │
│                              │  └─────────────────────┘    │
│                              │                              │
│                              │  ┌─────────────────────┐    │
│                              │  │ 🧾 Caissier/Serveur │    │
│                              │  │ Caisse uniquement   │    │
│                              │  └─────────────────────┘    │
│                              │                              │
│                              │  Note: redirection auto      │
└──────────────────────────────┴─────────────────────────────┘
```

**Zone gauche :** `flex: 1`, fond `--bg`, centrage column, padding 60px, border-right `1px solid --border`.
**Zone droite :** width 420px, fond `#060e1a`, centrage column, padding 60px.

**Formulaire de connexion :**
- Inputs : height 44px, background `--surface`, border `1px solid --border`, border-radius 8px, padding 0 12px, 14px. Focus : border-color `--blue`.
- Labels : 12px/500, `--text-muted`
- Bouton Se connecter : width 100%, height 48px, border-radius 10px, `--blue`, 15px/700

**Role cards :**
- Container : `.role-cards`, flex column, gap 12px, max-width 320px
- Card : background `--surface`, border `2px solid --border`, border-radius 12px, padding 16px 20px, flex row, gap 14px, cursor pointer, transition 150ms
- Hover : border-color `--blue`, background `--blue-light`
- Active (rôle courant) : border-color `--green`, background `rgba(16,185,129,.08)`
- Icône : font-size 28px
- Nom : 15px/700, `--text-primary`
- Desc : 12px, `--text-muted`, margin-top 2px
- Access tags : `.rc-access`, flex row, gap 6px, flex-wrap wrap, margin-top 6px
  - Tag bleu (`.rc-tag`) : fond `rgba(29,78,216,.2)`, couleur `#93c5fd`, 10px/600, padding 2px 7px, radius 10px
  - Tag vert (`.rc-tag.green`) : fond `rgba(16,185,129,.2)`, couleur `#6ee7b7`
- Flèche → : margin-left auto, font-size 18px, `--text-disabled`

**Note importante :** La zone droite est informative (pas interactive pour le choix). La redirection est automatique selon le rôle en base de données. L'utilisateur ne choisit pas son rôle à la connexion.

### 5.7 Lecture Z : Écran 7 — Structure URL

**Organisation :** 3 blocs (`url-section`) dans une colonne centrée, max-width 800px.

**Structure URL — Dashboard (accès Admin + Manager) :**
| URL | Page |
|---|---|
| `/dashboard` | Redirect → `/dashboard/overview` |
| `/dashboard/overview` | KPIs et chiffres du jour |
| `/dashboard/products` | Catalogue produits |
| `/dashboard/orders` | Historique commandes |
| `/dashboard/analytics` | Rapports et statistiques |
| `/dashboard/stock` | Gestion des stocks |
| `/dashboard/crm` | Clients et fidélité |
| `/dashboard/settings` | Configuration (Admin uniquement) |

**Structure URL — Caisse (accès Admin + Manager + Caissier) :**
| URL | Page |
|---|---|
| `/caisse` | Redirect → `/caisse/commande` |
| `/caisse/commande` | Interface principale prise de commande |
| `/caisse/tables` | Plan de salle |
| `/caisse/paiement` | Tunnel paiement (CB, espèces, split) |
| `/caisse/historique` | Commandes encaissées du service |
| `/caisse/cloture` | Clôture de caisse — rapport Z |

**Structure URL — Auth :**
| URL | Comportement |
|---|---|
| `/login` | Page connexion unique |
| `/login` (rôle Admin) | Redirect → `/dashboard/overview` |
| `/login` (rôle Caissier) | Redirect → `/caisse/commande` |
| `/dashboard/*` (rôle Caissier) | Bloqué → redirect `/caisse/commande` |

---

## 6. Flows de navigation

### 6.1 Flow Admin : login → dashboard → caisse → retour dashboard

```
/login
  │
  ├─ Auth success (rôle Admin ou Manager)
  │
  ▼
/dashboard/overview
  │
  ├─ Clic sidebar "Produits"
  │
  ▼
/dashboard/products
  │
  ├─ Clic "Ouvrir la caisse ↗" (topbar)
  │      │
  │      ├─ Si pas de commande en cours dans l'onglet courant :
  │      │   Ouvre /caisse/commande [nouvel onglet OU navigation directe]
  │      │   → Écran Splash (S2) → Caisse vue Admin (S3)
  │      │
  │      └─ Comportement d'ouverture : selon spec technique
  │          Option A : nouvel onglet (tooltip "La caisse tourne en parallèle")
  │          Option B : même onglet avec navigation
  │
  ▼ (dans la caisse)
/caisse/commande (vue Admin)
  │
  ├─ Clic "← Dashboard admin" (haut gauche) :
  │      │
  │      ├─ Si ticket vide → retour direct /dashboard (dernière page visitée)
  │      └─ Si commande en cours → Modal S5 :
  │                                    [Rester] → reste sur /caisse/commande
  │                                    [Quitter] → /dashboard/overview
  │
  └─ Clic ✕ (fermer caisse) :
         ├─ Si ticket vide → retour direct /dashboard
         └─ Si commande en cours → Modal S5
```

### 6.2 Flow Caissier : login → caisse directe

```
/login
  │
  ├─ Auth success (rôle Caissier / Serveur)
  │
  ▼
/caisse/commande (vue Caissier — sans bouton ← Dashboard)
  │
  ├─ Navigation interne caisse uniquement :
  │   /caisse/tables (plan de salle, via bouton footer)
  │   /caisse/paiement (après clic Encaisser)
  │   /caisse/historique
  │
  └─ Pas de sortie vers /dashboard (accès bloqué par guard de route)
```

### 6.3 Redirections selon rôle

| Rôle | After login | Tentative /dashboard | Tentative /caisse |
|---|---|---|---|
| Admin / Propriétaire | `/dashboard/overview` | OK | OK (+ bouton retour) |
| Manager | `/dashboard/overview` | OK partiel (pas /settings) | OK (+ bouton retour) |
| Caissier / Serveur | `/caisse/commande` | Bloqué → `/caisse/commande` | OK (sans bouton retour) |
| Non authentifié | `/login` | `/login?redirect=...` | `/login?redirect=...` |

### 6.4 Gestion du bouton "Back" navigateur

| Contexte | Comportement attendu |
|---|---|
| Dans le dashboard (entre pages) | Navigation normale dans l'historique browser |
| Caisse → retour avec back (Admin) | Si commande en cours : modal de confirmation S5 (utiliser `beforeunload` ou équivalent React Router) |
| Caisse → retour avec back (Caissier) | Même comportement si commande en cours |
| Login → back après auth | Redirect vers la page d'accueil du rôle (pas de loop de login) |
| Splash → back | Ne pas permettre le retour vers le splash (remplacer l'entrée historique) |

**Implémentation recommandée :** Utiliser `history.replaceState` sur la page splash pour éviter qu'elle s'accumule dans l'historique. Intercepter `popstate` ou l'événement de navigation sur la caisse si une commande est en cours.

---

## 7. Accessibilité

### 7.1 Contraste minimum (WCAG AA)

| Paire texte/fond | Ratio estimé | Statut |
|---|---|---|
| `--text1` (#f8fafc) sur `--bg` (#0f172a) | ~15:1 | Excellent |
| `--text2` (#e2e8f0) sur `--surface` (#1e293b) | ~10:1 | Excellent |
| `--text3` (#94a3b8) sur `--surface` (#1e293b) | ~5.5:1 | Passe AA (4.5:1) |
| `--text4` (#475569) sur `--bg` (#0f172a) | ~3:1 | Insuffisant pour texte courant (usage uniquement pour labels décoratifs) |
| blanc sur `--blue` (#1d4ed8) | ~5.8:1 | Passe AA |
| blanc sur `--green` (#10b981) | ~4.5:1 | Passe AA juste |
| blanc sur `--red` (#ef4444) | ~4.7:1 | Passe AA |
| `--green` (#10b981) sur `--bg` (#0f172a) | ~9:1 | Excellent |
| `--amber` (#f59e0b) sur `--bg` (#0f172a) | ~8:1 | Excellent |

**Actions requises :** `--text4` (#475569) ne passe pas AA en texte courant. Il doit être limité aux éléments purement décoratifs (labels de section en uppercase, séparateurs textuels, placeholders d'inputs — non soumis au critère 1.4.3 pour les placeholders).

### 7.2 Focus visible

Tous les éléments interactifs doivent avoir un état focus visible distinct du hover. Recommandation :

```css
:focus-visible {
  outline: 2px solid #1d4ed8;
  outline-offset: 2px;
  border-radius: [inherit le border-radius du composant];
}
```

**Cas particuliers :**
- Toggle switch : focus ring autour du track
- Cards produit caisse : focus ring avec border-radius 16px
- Bouton Encaisser : focus ring vert (#10b981) pour cohérence avec la couleur du bouton
- Nav items sidebar : focus ring interne (inset si nécessaire)

### 7.3 Touch targets

| Élément | Taille actuelle | Conformité WCAG 2.5.5 (44×44) | Action |
|---|---|---|---|
| Bouton Encaisser | 72px × 100% | Conforme | OK |
| Cat pills caisse | 56px × 100% | Conforme (hauteur) | OK |
| Nav items | ~34px | Non conforme | Agrandir à 44px sur tablet |
| Action btns (✏️ ⋯) | 28×28px | Non conforme | Accepté sur desktop uniquement |
| Toggle switch | 36×20px | Non conforme | Étendre la zone de clic au wrapper |
| Bouton close dialog | 28×28px | Non conforme | Agrandir à 36×36px minimum |

### 7.4 Autres considérations accessibilité

- **ARIA labels :** Tous les boutons icône (🔔, ✕, ⋯) doivent avoir un `aria-label` explicite.
- **Rôles ARIA :** Navigation sidebar = `role="navigation"`, Table = `role="grid"`, Modal = `role="dialog" aria-modal="true"`.
- **Gestion du focus dans les modals :** Au clic sur "Ouvrir la caisse" ou déclenchement d'un dialog, le focus doit se déplacer sur le premier élément interactif de la modal. Au fermeture, retour sur l'élément déclencheur.
- **Toggle states :** L'état on/off doit être communiqué via `aria-checked` sur un rôle `switch`.
- **Skeleton loaders :** Ajouter `aria-busy="true"` sur le container pendant le chargement.
- **Animation réduite :** Respecter `prefers-reduced-motion` pour désactiver les keyframe animations (blink, skeleton shimmer, splash progress).

---

## 8. Responsive

### 8.1 Desktop (> 1024px)

Layout cible dans les mockups. Tout s'affiche comme spécifié.

**Dashboard :**
- Sidebar 220px fixe + main flexible
- Tableau complet avec toutes les colonnes
- Topbar complète avec breadcrumb + bouton caisse + notifs + avatar

**Caisse :**
- Catégories 200px + grille 4 colonnes + ticket 360px
- Header complet avec tous les éléments

### 8.2 Tablette (768–1024px)

**Dashboard (à définir) :**
- Sidebar réductible à icônes (64px) ou via hamburger
- Tableau : masquer colonnes secondaires (TVA, référence)
- Topbar : conserver le bouton caisse (critique)
- Stats bar : scroll horizontal ou grid 2 colonnes

**Caisse (priorité tablet — les POS sont souvent sur iPad) :**
- Catégories : réduire à 56px (icônes uniquement) ou conserver 160px
- Grille : passer à 3 colonnes (`grid-template-columns: repeat(3, 1fr)`)
- Ticket : width 280px minimum
- Header caisse : simplifier si nécessaire
- Touch targets : tous les éléments interactifs à 44px minimum
- Cat pills : hauteur 56px déjà conforme

### 8.3 Mobile (< 768px)

**Dashboard Admin :** hors scope. Rediriger vers une vue "non disponible sur mobile" avec lien vers le dashboard desktop.

**Caisse :** à étudier séparément (use case: commandes rapides sur smartphone). Non spécifié dans les mockups actuels. Option envisageable : layout vertical (catégories en scroll horizontal, produits en liste, ticket en drawer).

---

## 9. États globaux de l'application

### 9.1 Authentifié vs non authentifié

| État | Comportement |
|---|---|
| Non authentifié | Toute route protégée redirige vers `/login?redirect=[url_cible]` |
| Authentifié (Admin) | Accès à `/dashboard/*` et `/caisse/*` |
| Authentifié (Manager) | Accès à `/dashboard/*` (sauf /settings) et `/caisse/*` |
| Authentifié (Caissier) | Accès à `/caisse/*` uniquement. Tentative `/dashboard/*` → redirect `/caisse/commande` |
| Token expiré | Voir section 9.4 — Session expirée |

**Guards de route recommandés :**
- `AuthGuard` : vérifie l'authentification, redirige vers /login sinon
- `RoleGuard` : vérifie le rôle, redirige selon les règles ci-dessus
- Application au niveau du router (Next.js middleware ou équivalent)

### 9.2 Chargement initial de l'application

**Séquence :**
1. Shell HTML/CSS chargé → afficher skeleton immédiatement
2. Vérification du token d'auth (cookie httpOnly ou localStorage)
3. Si non authentifié → redirect /login (pas de flash de contenu protégé)
4. Si authentifié → charger les données du profil + redirect selon rôle
5. Chargement de la page cible → skeleton remplacé par contenu réel

**Skeleton screen Dashboard Produits :**
Voir composant Skeleton Loader (section 2.6) — couvre : sous-titre, bouton, stats bar (3 cards), toolbar (3 éléments), table (5 rows).

**Splash Caisse :**
Barre de progression verte sur fond `--bg-caisse`. Durée 1.8s (peut être court-circuitée si les données arrivent plus vite). Afficher les données réelles dès disponibilité, ne pas attendre la fin de l'animation.

### 9.3 Erreur réseau

**Comportement recommandé :**
- Requête échouée → Toast error (bas droite) avec message contextualisé
- Exemple : "Impossible de charger le catalogue. Vérifiez votre connexion." + bouton "Réessayer"
- Les données en cache restent affichées (mode dégradé) si disponibles
- Le bouton Encaisser doit être bloqué si une requête de sauvegarde de commande échoue

**Sur la caisse (critique) :**
- Afficher un banner non-dismissible en haut de la caisse si la connexion est perdue
- Design : fond `rgba(239,68,68,.1)`, border-bottom `1px solid rgba(239,68,68,.3)`, texte "Connexion perdue — les commandes ne sont pas synchronisées"
- Mode offline potentiel à étudier (IndexedDB pour queue de commandes)

### 9.4 Session expirée

**Déclencheurs :** Token JWT expiré (typiquement 8–24h) ou révocation côté serveur.

**Comportement :**
1. Requête API retourne 401 → intercepteur global
2. Tenter un refresh token silencieux (si refresh token valide)
3. Si refresh échoue → afficher modal "Session expirée" (non dismissible)
   - Message : "Votre session a expiré. Reconnectez-vous pour continuer."
   - Bouton unique : "Se reconnecter" → `/login?redirect=[url_actuelle]`
4. Si la caisse est active avec une commande en cours : sauvegarder l'état local avant redirection

**Design de la modal session expirée :**
- Réutiliser le pattern `.modal` (Pattern B)
- Icône : 🔐
- Overlay non cliquable (l'utilisateur ne peut pas dismiss sans se reconnecter)
- Fond : légèrement plus sombre pour signaler la gravité

---

*Spec rédigée sur la base d'une lecture exhaustive des mockups `navigation-mockup.html` (7 écrans) et `products-mockup.html` (9 écrans) — session de brainstorm 37399-1774469424.*
