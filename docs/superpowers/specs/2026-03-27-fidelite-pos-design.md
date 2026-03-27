# Alloflow — Fidélité POS : Flow d'identification client en caisse

**Date :** 2026-03-27
**Scope :** UX du flow fidélité dans le POS — identification client, inscription rapide, attribution des points, application des récompenses

---

## Objectif

Intégrer le programme de fidélité directement dans le flow de caisse. Chaque transaction propose au caissier d'identifier le client pour créditer ses points. Si le client est inconnu, le caissier peut l'inscrire en moins de 10 secondes sans quitter la caisse.

---

## Décisions de design

| Question | Décision | Raison |
|---|---|---|
| Moment d'identification | **Avant paiement** | Permet d'appliquer des réductions qui modifient le total |
| Déclencheur | **Étape toujours proposée** (skipable) | Crée un rituel systématique — les programmes de fidélité meurent par invisibilité |
| Client inconnu | **Inscription sur place** (Prénom + Téléphone obligatoires, Nom optionnel) | Maximise les inscriptions sans quitter le flow de caisse |
| Portail QR self-service | **Hors scope V1** | Simplicité — à introduire en V2 |

---

## Flow complet — 6 états

### ① Ticket composé — Déclencheur fidélité

Le bouton principal du panneau ticket devient **"🎁 Identifier le client →"** (amber, prominent).
Un lien discret **"Passer sans fidélité"** est affiché en dessous.

Le bouton "Encaisser" n'est **pas** visible à cette étape — le caissier doit faire un choix explicite.

### ② Modal fidélité — Client trouvé

Le caissier tape le téléphone ou l'email du client. Si une correspondance est trouvée :
- Profil client affiché (avatar initiales, prénom + nom, tier, date d'inscription)
- Points actuels + points à gagner sur cette transaction
- Récompenses disponibles avec bouton "Appliquer"
- CTA principal : **"Confirmer (+X pts) →"**
- Action secondaire : **"Passer"**

Si une récompense est appliquée, le montant total du ticket est recalculé avant confirmation.

### ③ Modal fidélité — Client inconnu

Si aucun compte trouvé :
- Message incitatif : "Inscrire en 10 secondes — le client gagne +X pts dès aujourd'hui"
- Formulaire : **Prénom** + **Téléphone** (obligatoires), **Nom** + **Email** (optionnels)
- Si la recherche a été faite par email (format détecté), le champ Email est pré-rempli avec la valeur saisie
- Si la recherche a été faite par téléphone, le champ Téléphone est pré-rempli
- CTA : **"Inscrire & continuer →"**
- Action secondaire : **"Passer"**

### ④ Ticket prêt à encaisser — Client lié

Retour au panneau ticket avec :
- Ligne de réduction visible si une récompense a été appliquée (ligne verte, montant négatif)
- Total mis à jour
- Bandeau discret en bas du ticket : nom client + tier + points à gagner
- Bouton principal retrouvé : **"💳 Encaisser X,XX €"**

### ⑤ Confirmation — Client existant

Après validation du paiement :
- Bannière verte : **"+X pts crédités !"** avec total points mis à jour
- Barre de progression vers le prochain palier
- Boutons : "🖨️ Imprimer le ticket" + "→ Nouvelle commande"

### ⑥ Confirmation — Nouveau membre

Après inscription + paiement :
- Bannière : **"Bienvenue [Prénom] !"** + points crédités
- Même layout que l'état ⑤ (pas de mention du portail V2 dans cette vue)

---

## Schéma de données impacté

Tables après ajustements (par rapport à Migration 006) :

```sql
customers (
  id               uuid PK,
  establishment_id uuid → establishments,
  first_name       text NOT NULL,          -- remplace l'ancien champ `name`
  last_name        text,                   -- optionnel
  phone            text,
  email            text,
  points           int DEFAULT 0,
  tier             text DEFAULT 'standard',
  created_by       uuid → profiles,        -- caissier qui a inscrit
  created_at       timestamptz
)
loyalty_rewards (id, establishment_id, name, points_required, discount_type, discount_value)
loyalty_transactions (id, customer_id, order_id, points, type, created_at)
```

### Ajustements sur `orders`

**`orders`** — ajouter :
```sql
customer_id     uuid REFERENCES customers(id) nullable
reward_id       uuid REFERENCES loyalty_rewards(id) nullable
discount_amount numeric NOT NULL DEFAULT 0
-- total_after_discount est un alias calculé : total - discount_amount (pas de colonne stockée)
```

### Créditement des points — déclencheur serveur

Les points sont crédités via une **Supabase Database Function** déclenchée sur `orders.status = 'paid'`, pas via un appel API frontend. Cela garantit l'atomicité même si le client se déconnecte après paiement.

```sql
-- Pseudo-code de la function Postgres
AFTER UPDATE ON orders
WHEN (NEW.status = 'paid' AND OLD.status != 'paid' AND NEW.customer_id IS NOT NULL)
DO:
  points_earned = FLOOR(NEW.total - NEW.discount_amount)  -- 1 pt par euro TTC
  INSERT INTO loyalty_transactions (customer_id, order_id, points, type)
    VALUES (NEW.customer_id, NEW.id, points_earned, 'earn')
  UPDATE customers SET points = points + points_earned
    WHERE id = NEW.customer_id
  -- Recalculer le tier si seuil franchi (voir règles de tier ci-dessous)
```

### Règle de calcul des points

```
points_earned = FLOOR(order.total - order.discount_amount)  -- 1 pt par euro TTC
```

### Règles de tier

Les tiers définissent les seuils et avantages. **L'application automatique des remises par tier est hors scope V1** — seules les récompenses explicites (`loyalty_rewards`) sont applicables en caisse pour cette version.

| Tier | Seuil | Avantages V1 |
|---|---|---|
| Standard | 0–99 pts | Accumulation de points |
| Silver | ≥ 100 pts | Accès aux récompenses Silver (configurées dans `loyalty_rewards`) |
| Gold | ≥ 200 pts | Accès aux récompenses Gold (configurées dans `loyalty_rewards`) |

---

## Composants UI (POS)

### `LoyaltyTrigger` (panneau ticket)
- Remplace temporairement le bouton "Encaisser"
- Affiche le bouton amber "🎁 Identifier le client →" + lien skip
- S'active quand le ticket contient au moins un article

### `LoyaltyModal`
- Modal pleine largeur sur le POS
- 3 états internes : `searching` | `found` | `new-customer`
- Recherche en temps réel dès 3 caractères saisis (téléphone ou email)
- Formulaire d'inscription inline (pas de navigation)

### `LoyaltyBadge` (ticket)
- Bandeau compact en bas du ticket après identification
- Affiche : avatar initiales + prénom nom + tier badge + "+X pts"

---

## API Routes (nouvelles)

```
GET  /api/customers/search?q=      → recherche par téléphone ou email (min 3 chars)
                                     Retourne : [] | [{ id, first_name, last_name, phone,
                                     email, points, tier }]

POST /api/customers                → créer un nouveau client
                                     Body : { first_name, phone, last_name?, email? }
                                     Retourne : { id, first_name, points: 0, tier: 'standard' }

POST /api/loyalty/apply-reward     → appliquer une récompense à un order en cours
                                     Body : { order_id, reward_id, customer_id }
                                     Vérifie : customer.tier >= reward.min_tier, reward non déjà appliqué
                                     Écrit : orders.reward_id, orders.discount_amount = reward.discount_value
                                     Retourne : { order_id, discount_amount, new_total }

GET  /api/customers/[id]/rewards   → récompenses disponibles pour un client
                                     Filtre : loyalty_rewards où points_required <= customer.points
                                     ET tier du client compatible
                                     Retourne : [{ id, name, points_required, discount_type, discount_value }]
```

Le créditement des points n'est **pas** une route API — c'est une Database Function Postgres déclenchée automatiquement côté Supabase au passage de l'order en status `paid`.

---

## Hors scope V1

- Portail client mobile (QR code self-service) — prévu V2
- Application automatique des remises par tier (Silver −10%, Gold −15%)
- Notifications push ou SMS pour les points
- Programme de parrainage
- Expiration des points
