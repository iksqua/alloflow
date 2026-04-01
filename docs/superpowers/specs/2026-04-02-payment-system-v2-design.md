# Système de caisse v2 — Design Spec

## Contexte

Alloflow est une plateforme POS SaaS couvrant deux types d'établissements : café/comptoir et restaurant à table. Le `PaymentModal` actuel présente plusieurs frictions majeures : simulation TPE inutile, absence de split par articles, reçus non fonctionnels (501). Cette spec décrit la refonte complète du système de paiement.

---

## Périmètre

- Refonte du `PaymentModal` en 3 étapes linéaires
- Nouveau composant `PaymentSplit` pour la division par articles
- Implémentation réelle des routes email et SMS pour les reçus
- Option facture professionnelle (PDF avec SIRET/TVA)

Hors scope : intégration TPE physique (API Stripe Terminal, SumUp), paiement en ligne, abonnements.

---

## Architecture

### Composants

**`src/app/caisse/pos/_components/payment-modal.tsx`** — Refonte complète
Orchestrateur des 3 étapes. Gère le state local du paiement en cours. Aucun état global.

**`src/app/caisse/pos/_components/payment-split.tsx`** — Nouveau
UI d'assignation des articles aux personnes + sélection méthode par personne. Utilisé à l'étape 2 du modal quand le mode Split est choisi.

**Routes API existantes à implémenter :**
- `src/app/api/receipts/[orderId]/email/route.ts` — actuellement retourne 501, à brancher sur Brevo
- `src/app/api/receipts/[orderId]/sms/route.ts` — idem

---

## Flow PaymentModal — 3 étapes

### Étape 1 — Choix de méthode

Affiché dès l'ouverture du modal. Contient :
- Total à encaisser (bien visible, en haut)
- 3 cartes larges : **Carte**, **Espèces**, **Split**
- 1 tap → passe à l'étape 2

### Étape 2 — Exécution (selon méthode)

**Mode Carte :**
- Montant affiché en très grand (56px, font-weight 900)
- Sous-titre discret : "💳 Entrez le montant sur le TPE physique"
- 1 bouton principal vert : "✓ Paiement reçu"
- 1 lien secondaire : "Annuler"
- Aucune simulation, aucune animation, aucune étape intermédiaire

**Mode Espèces :**
- Affichage : À encaisser / Remis par le client / Rendu monnaie
- Pavé numérique 3×4 avec touches raccourcis (+5, +10, +20, +50)
- Rendu monnaie calculé en temps réel (remis - à encaisser)
- Bouton "Confirmer — rendre X,XX €" (désactivé si montant remis < total)

**Mode Split :**
- Liste des articles du ticket avec leur prix
- Tap sur un article → cycle entre les personnes (P1, P2, P3...) + "Non assigné"
- Bouton "+ Personne" pour ajouter des personnes (max 10)
- En bas : récap par personne avec son total et un toggle 💵 / 💳
- Les articles non assignés restent sur un poste "À partager" distribué également entre les personnes
- Bouton "Encaisser P1 + P2 + ..." → déclenche les paiements séquentiellement
- Pour chaque personne en CB : retour à l'écran "Montant TPE" (étape 2 CB) avec le montant de sa part
- Pour chaque personne en espèces : retour à l'écran pavé numérique avec sa part
- Une fois toutes les personnes encaissées → étape 3

### Étape 3 — Confirmation & reçu

- Récapitulatif : articles, total, mode de paiement, statut
- Choix du reçu (radio, défaut "Pas de reçu") :
  - 🚫 Pas de reçu
  - 📧 Email — affiche un champ email (pré-rempli si client fidélité lié)
  - 📱 SMS — affiche un champ téléphone
  - 🧾 Facture professionnelle — affiche nom société + SIRET (optionnel TVA intra)
- Bouton "✓ Terminer & nouvelle commande"

---

## Reçu email / SMS

### Email (`POST /api/receipts/[orderId]/email`)
- Corps : `{ email: string }`
- Appel Brevo `transactionalEmailsApi.sendTransacEmail()`
- Template : liste articles, total TTC, détail TVA, nom établissement, SIRET si disponible
- Retourne 200 `{ sent: true }` ou 500 avec message d'erreur

### SMS (`POST /api/receipts/[orderId]/sms`)
- Corps : `{ phone: string }`
- Appel Brevo SMS API `transactionalSMSApi.sendTransacSms()`
- Message : "Votre reçu Alloflow : [lien] — Total : XX,XX €"
- Le lien pointe vers `/receipt/[orderId]` (page publique lecture seule, à créer si inexistante)
- Retourne 200 `{ sent: true }` ou 500 avec message d'erreur

---

## Facture professionnelle

- Générée côté serveur en PDF via `@react-pdf/renderer` ou `pdfkit`
- Contenu légal obligatoire : numéro séquentiel, date, SIRET émetteur, détail TVA par taux, total HT/TTC
- Numérotation : `FAC-YYYY-NNNN` (séquentiel par établissement, stocké en DB)
- Téléchargement direct depuis l'étape 3 du modal
- Optionnel : envoi par email en parallèle

---

## Gestion d'erreurs

- Si email/SMS échoue → toast.error avec message lisible, commande déjà enregistrée
- Si montant remis insuffisant (espèces) → bouton désactivé, pas de soumission
- Mode hors ligne : seul le mode Espèces est disponible (comportement actuel conservé)
- Split : si 0 article assigné → bouton "Encaisser" désactivé

---

## Tests

- `payment-modal`: étape 1 → sélection méthode → étape 2 correcte
- `payment-modal` CB: bouton "Paiement reçu" enregistre la commande
- `payment-modal` espèces: rendu monnaie calculé correctement, bouton désactivé si insuffisant
- `payment-split`: assignation articles → calcul par personne correct
- `payment-split`: articles non assignés distribués équitablement
- Route email: appel Brevo avec bon contenu, gestion erreur Brevo
- Route SMS: appel Brevo SMS, gestion erreur
