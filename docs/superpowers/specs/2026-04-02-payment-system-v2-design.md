ok # Système de caisse v2 — Design Spec

## Contexte

Alloflow est une plateforme POS SaaS couvrant deux types d'établissements : café/comptoir et restaurant à table. Le `PaymentModal` actuel présente plusieurs frictions majeures : simulation TPE inutile, absence de split par articles, reçus non fonctionnels (501). Cette spec décrit la refonte complète du système de paiement.

---

## Périmètre

- Refonte du `PaymentModal` en 3 étapes linéaires
- Nouveau composant `PaymentSplit` pour la division par articles
- Implémentation réelle des routes email et SMS pour les reçus
- Option facture professionnelle (PDF avec SIRET/TVA)
- Page publique `/receipt/[orderId]` (lecture seule, sans auth)

Hors scope : intégration TPE physique (API Stripe Terminal, SumUp), paiement en ligne, abonnements.

---

## Architecture

### Composants

**`src/app/caisse/pos/_components/payment-modal.tsx`** — Refonte complète
Orchestrateur des 3 étapes. Gère le state local du paiement en cours. Aucun état global. Props identiques à l'actuel : `ticket`, `session`, `cashierId`, `isOffline`, `linkedCustomer`, `linkedReward`, `onClose`, `onSuccess`.

**`src/app/caisse/pos/_components/payment-split.tsx`** — Nouveau
Props :
```ts
interface PaymentSplitProps {
  items: LocalItem[]           // articles du ticket
  discount: Discount | null    // remise commerciale (pour calcul pro-rata)
  loyaltyDiscount: number      // montant remise fidélité (déjà calculé, en €)
  onConfirm: (persons: SplitPerson[]) => void
  onBack: () => void
}
interface SplitPerson {
  label: string                // "P1", "P2", ...
  amount: number               // montant exact à encaisser (arrondi centimes)
  method: 'card' | 'cash'
}
```
Retourne via `onConfirm` la liste des personnes avec leurs montants. La somme des montants est garantie égale au total du ticket (la dernière personne absorbe l'écart d'arrondi).

**Routes API :**
- `src/app/api/receipts/[orderId]/email/route.ts` — actuellement 501
- `src/app/api/receipts/[orderId]/sms/route.ts` — actuellement 501
- `src/app/api/receipts/[orderId]/invoice/route.ts` — nouveau, génère PDF
- `src/app/receipt/[orderId]/page.tsx` — nouveau, page publique reçu

---

## Flow PaymentModal — 3 étapes

### Étape 1 — Choix de méthode

Affiché dès l'ouverture du modal. Contient :
- Total à encaisser (bien visible, en haut)
- 3 cartes larges : **Carte**, **Espèces**, **Split**
- Mode hors ligne (`isOffline`) : cartes Carte et Split désactivées visuellement (opacity 0.4, non cliquables), label "Indisponible hors ligne"
- 1 tap → passe à l'étape 2

### Étape 2 — Exécution (selon méthode)

**Mode Carte :**
- Montant affiché en très grand (56px, font-weight 900)
- Sous-titre discret : "💳 Entrez le montant sur le TPE physique"
- 1 bouton principal vert : "✓ Paiement reçu" → appelle `POST /api/orders/[id]/pay` avec `{ method: 'card' }` puis passe à l'étape 3
- 1 lien secondaire : "Annuler" → retour étape 1
- Aucune simulation, aucune animation

**Mode Espèces :**
- Affichage : À encaisser / Remis par le client / Rendu monnaie
- Pavé numérique 3×4 avec touches raccourcis (+5, +10, +20, +50)
- Rendu monnaie calculé en temps réel (remis − à encaisser, affiché en orange)
- Bouton "Confirmer — rendre X,XX €" → appelle `POST /api/orders/[id]/pay` avec `{ method: 'cash', cash_given: montantRemis }` puis étape 3
- Bouton désactivé si montant remis < total

**Mode Split :**
- Délègue au composant `PaymentSplit` (voir props ci-dessus)
- Une fois `onConfirm(persons)` appelé, le modal encaisse chaque personne séquentiellement :
  - Personne en CB : affiche l'écran "Montant TPE" avec sa part → caissier confirme → suivant
  - Personne en espèces : affiche le pavé numérique avec sa part → caissier confirme → suivant
  - Quand toutes les personnes sont encaissées : appelle **une seule fois** `POST /api/orders/[id]/pay` avec `{ method: 'split', split_payments: [{method, amount}, ...] }` (schéma existant réutilisé)
  - Si l'appel API échoue : toast.error "Erreur d'enregistrement — réessayez" avec bouton "Réessayer" qui relance uniquement l'appel API
- Si la connectivité tombe avant confirmation finale : toast.error "Connexion perdue", retour étape 1, aucun appel API effectué

**Remises dans le split :**
La remise commerciale (discount) et la remise fidélité (loyaltyDiscount) sont appliquées en pro-rata sur chaque part :
```
ratio = part_personne_brute / total_brut
montant_personne = part_personne_brute - (discount_total * ratio) - (loyalty_discount * ratio)
```
L'arrondi (centimes) est absorbé par la dernière personne pour garantir que la somme == total final.

### Étape 3 — Confirmation & reçu

- Récapitulatif : articles, total, mode de paiement, statut
- Choix du reçu (radio, défaut "Pas de reçu") :
  - 🚫 Pas de reçu
  - 📧 Email — champ email pré-rempli si `linkedCustomer?.email`
  - 📱 SMS — champ téléphone pré-rempli si `linkedCustomer?.phone`
  - 🧾 Facture professionnelle — champs : Nom société (requis), SIRET (optionnel), Email livraison (optionnel)
- Bouton "✓ Terminer & nouvelle commande"
- Si email/SMS/facture sélectionné : appel API correspondant avant de fermer, erreur non bloquante (toast.error, commande déjà enregistrée)

---

## Reçu email (`POST /api/receipts/[orderId]/email`)

Auth : `establishment_id` dérivé de la session Supabase, vérifié via `.eq('establishment_id', authEstablishmentId)` sur l'ordre.

Corps : `{ email: string }`

Fetch Supabase pour l'ordre :
```sql
SELECT orders.*, order_items(*, products(name, emoji, tva_rate)),
       establishments(name, siret, address, receipt_footer)
FROM orders WHERE id = orderId AND establishment_id = authEstablishmentId
```

`receipt_footer` existe en DB (`establishments.receipt_footer text`, défaut `null`).

Appel Brevo `transactionalEmailsApi.sendTransacEmail()` avec HTML inline généré côté serveur. Structure : entête établissement (nom + adresse), liste articles (emoji + nom + qté + prix TTC), séparateur, total HT + TVA par taux + total TTC, footer (`receipt_footer ?? 'Merci de votre visite !'`). Pas de template Brevo — HTML inline uniquement.

Retourne `200 { sent: true }` ou `500 { error: string }`.

---

## Reçu SMS (`POST /api/receipts/[orderId]/sms`)

Auth : même pattern — `establishment_id` vérifié sur l'ordre.


Corps : `{ phone: string }`

Message : `"[NomEtablissement] — Votre reçu : https://alloflow.fr/receipt/[orderId] — Total : XX,XX €"`

Sender : `establishment.brevo_sender_name ?? 'Alloflow'` (pattern existant, identique à `src/app/api/campaigns/[id]/send/route.ts:111`).

Retourne `200 { sent: true }` ou `500 { error: string }`.

---

## Page publique reçu (`/receipt/[orderId]`)

- `src/app/receipt/[orderId]/page.tsx` — Server Component, aucune auth requise
- Fetch Supabase avec **service role key** côté serveur (pas de clé anon / RLS) — filtre `.eq('status', 'paid')` dans la requête
- Affiche : logo Alloflow, nom établissement, liste articles, total TTC, détail TVA, date, mode paiement
- `noindex` meta tag (pas d'indexation SEO)
- Si orderId inconnu ou non payé : page 404 générique

---

## Facture professionnelle (`POST /api/receipts/[orderId]/invoice`)

Auth : même pattern que les autres routes reçu — `establishment_id` dérivé de la session, vérifié sur l'ordre.

Corps : `{ company_name: string, siret?: string, delivery_email?: string }`

Génération PDF via `pdfkit` (à installer : `npm install pdfkit @types/pdfkit`). `@react-pdf/renderer` n'est pas dans le projet.

Numérotation `FAC-YYYY-NNNN` : table Supabase `invoices` :
```sql
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid REFERENCES establishments(id),
  order_id uuid REFERENCES orders(id),
  invoice_year int NOT NULL,      -- YYYY pour reset annuel
  sequence_number int NOT NULL,   -- NNNN dans l'année
  number text NOT NULL,           -- "FAC-2026-0001" (généré)
  company_name text NOT NULL,
  siret text,
  delivery_email text,
  pdf_url text,                   -- URL Supabase Storage (pas d'expiration)
  created_at timestamptz DEFAULT now(),
  UNIQUE(establishment_id, invoice_year, sequence_number)
);
```

Séquence sans race condition : `SELECT COALESCE(MAX(sequence_number), 0) + 1 FROM invoices WHERE establishment_id = X AND invoice_year = YYYY FOR UPDATE` dans une transaction.

PDF uploadé dans Supabase Storage bucket `invoices` (privé, rétention indéfinie). Route retourne URL signée 1h pour téléchargement immédiat.
Si `delivery_email` fourni : envoi email avec PDF en pièce jointe via Brevo après upload.

Retourne `200 { pdf_url: string, invoice_number: string }` ou `500 { error: string }`.

---

## Mode hors ligne

- Étape 1 : cartes Carte et Split désactivées (opacity 0.4, `pointer-events: none`), tooltip "Indisponible hors ligne"
- Mode Espèces hors ligne : le paiement est enregistré via `POST /api/orders/[id]/pay` dès que la connexion est rétablie. En attendant, la commande reste en statut `pending` — le caissier reçoit un toast "Paiement en attente de synchronisation" et le ticket est effacé localement. Hors périmètre de cette spec : file d'attente offline persistante (traité en sprint séparé si nécessaire).
- Si connexion perdue en cours de split (après assignment mais avant paiement) : toast.error "Connexion perdue", retour étape 1

---

## Gestion d'erreurs

| Cas | Comportement |
|-----|-------------|
| Email/SMS échoue | `toast.error` non bloquant — commande déjà enregistrée |
| Montant remis < total (espèces) | Bouton désactivé |
| Split total mismatch (API 400) | `toast.error "Erreur de calcul — réessayez"` |
| Facture PDF : invoice route échoue | `toast.error`, pas de PDF, commande inchangée |
| orderId inconnu (page reçu) | 404 |

---

## Tests

- `payment-modal` : étape 1 → Carte → étape 2 CB avec bon montant
- `payment-modal` : étape 1 → Espèces → rendu monnaie calculé correctement, bouton désactivé si insuffisant
- `payment-modal` : mode hors ligne → Carte et Split désactivées, Espèces actif
- `payment-modal` CB : "Paiement reçu" appelle `POST /api/orders/[id]/pay` avec `{ method: 'card' }`
- `payment-split` : assignation articles → totaux par personne corrects
- `payment-split` : articles non assignés distribués équitablement, arrondi sur dernière personne
- `payment-split` : remise pro-rata → somme des parts == total après remise
- `payment-split` : 1 personne = pas de split (cas dégénéré), fonctionne comme paiement simple
- Route email : fetch ordre + appel Brevo avec contenu correct, gestion erreur Brevo
- Route SMS : appel Brevo SMS avec sender `brevo_sender_name ?? 'Alloflow'`
- Route invoice : PDF généré, numérotation séquentielle, upload Storage
- Page reçu `/receipt/[orderId]` : affiche données ordre payé, 404 si non payé
