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
| Client inconnu | **Inscription sur place** (Prénom + Téléphone) | Maximise les inscriptions sans quitter le flow de caisse |
| Portail QR self-service | **Hors scope V1** | Simplicité — à introduire en V2 |

---

## Flow complet — 6 états

### ① Ticket composé — Déclencheur fidélité

Le bouton principal du panneau ticket devient **"🎁 Identifier le client →"** (amber, prominent).
Un lien discret **"Passer sans fidélité"** est affiché en dessous.

Le bouton "Encaisser" n'est **pas** visible à cette étape — le caissier doit faire un choix explicite.

### ② Modal fidélité — Client trouvé

Le caissier tape le téléphone ou l'email du client. Si une correspondance est trouvée :
- Profil client affiché (avatar, nom, tier, date d'inscription)
- Points actuels + points à gagner sur cette transaction
- Récompenses disponibles avec bouton "Appliquer"
- CTA principal : **"Confirmer (+X pts) →"**
- Action secondaire : **"Passer"**

Si une récompense est appliquée, le montant total du ticket est recalculé avant confirmation.

### ③ Modal fidélité — Client inconnu

Si aucun compte trouvé :
- Message incitatif : "Inscrire en 10 secondes — le client gagne +X pts dès aujourd'hui"
- Formulaire minimal : **Prénom** + **Nom** + **Téléphone** (obligatoires), **Email** (optionnel)
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
- Information sur la carte digitale (URL `alloflow.app/fidelite`) — prévu pour V2

---

## Schéma de données impacté

Tables existantes (Migration 006, déjà définies en Phase 1) :

```sql
customers (id, establishment_id, name, phone, email, points, tier)
loyalty_rewards (id, establishment_id, name, points_required, discount_type, discount_value)
loyalty_transactions (id, customer_id, order_id, points, type, created_at)
```

### Ajustements nécessaires

**`customers`** — ajouter :
```sql
first_name  text
last_name   text
created_by  uuid → profiles  -- caissier qui a inscrit
```

**`orders`** — ajouter :
```sql
customer_id  uuid → customers nullable  -- lien fidélité
reward_id    uuid → loyalty_rewards nullable  -- récompense appliquée
discount_amount numeric default 0
```

### Règle de calcul des points

```
points_earned = FLOOR(order.total_after_discount / 1.0)  -- 1 pt par euro
```

Les points sont crédités **après confirmation du paiement** (status order = 'paid').

### Règles de tier

| Tier | Seuil | Avantages |
|---|---|---|
| Standard | 0–99 pts | Accumulation de points |
| Silver | 100–199 pts | −10% sur les boissons |
| Gold | ≥ 200 pts | Café offert + −15% |

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
- Affiche : avatar initiales + nom + tier badge + "+X pts"

---

## API Routes (nouvelles)

```
GET    /api/customers/search?q=         → recherche par téléphone/email
POST   /api/customers                   → créer un nouveau client
POST   /api/loyalty/apply-reward        → appliquer une récompense à un order
POST   /api/loyalty/credit-points       → créditer les points après paiement confirmé
GET    /api/customers/[id]/rewards      → récompenses disponibles pour un client
```

---

## Hors scope V1

- Portail client mobile (QR code self-service)
- Notifications push ou SMS pour les points
- Programme de parrainage
- Expiration des points
