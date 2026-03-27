# Sprint 8 — CRM & Fidélité : Design Spec

**Date :** 27 mars 2026
**Sprint :** 8
**Statut :** Approuvé pour implémentation

---

## Objectif

Donner aux gérants une visibilité complète sur leur base clients et finaliser le flux fidélité initié dans le POS. Les sprints précédents ont posé les fondations (API `/api/customers`, widget POS partiel) — ce sprint les fait converger en une surface utilisable au quotidien.

Deux usages cibles :
1. **Le gérant** consulte la liste de ses clients, ouvre une fiche, voit l'historique d'achats et peut agir (modifier, envoyer le QR, appliquer une récompense manuelle).
2. **Le caissier** au POS identifie un client, voit ses points en temps réel, et applique une récompense en un clic sans quitter l'écran de caisse.

---

## Écrans

### 1. CRM Liste clients — `/dashboard/crm`
Existant côté mockup (s6-crm-clients.html), à implémenter côté code. Table paginée avec recherche full-text et filtre par statut (Gold / Silver / Standard). Quatre stat-cards en haut : clients inscrits, membres Gold, points distribués ce mois, récompenses utilisées. Chaque ligne a un bouton "Voir" qui navigue vers la fiche client.

### 2. Fiche client — `/dashboard/crm/[id]`
Nouveau screen (mockup s8-crm-fiche-client.html). Disposition deux colonnes :
- **Colonne gauche (60 %)** : profil (avatar initiales, nom, badge statut, coordonnées), rang de stats (CA total, nb visites, ticket moyen, points actuels), tableau des 20 dernières commandes avec ligne par produit et points gagnés, zone de notes caissier (champ texte libre sauvegardé par PATCH).
- **Colonne droite (40 %)** : carte Points & Niveau avec barre de progression vers le palier suivant, liste des récompenses disponibles / verrouillées avec bouton "Appliquer", mini-timeline des transactions de points (earned / spent / bonus), widget "Envoyer QR" (SMS ou email déclenche une notification côté Supabase Edge Function).

### 3. Programme fidélité — `/dashboard/crm/programme`
Nouveau screen (mockup s8-fidelite-config.html). Formulaire de configuration en sections :
- **Activation** : toggle ON/OFF visible en permanence.
- **Points** : pts/euro, bonus inscription, validité, seuil minimum.
- **Niveaux** : trois cartes éditables (Standard / Silver / Gold) avec nom, seuils et description des avantages.
- **Récompenses** : table éditable avec colonnes Nom, Points requis, Type (produit offert / réduction € / réduction %), Valeur, Niveau requis. Bouton "Ajouter une récompense" ajoute une ligne vide.

---

## Modèle de données

```
customers          — id, name, phone, email, notes, created_at, shop_id
loyalty_config     — id, shop_id, pts_per_euro, signup_bonus, pts_validity_days,
                     levels (jsonb), active
rewards            — id, shop_id, name, pts_required, type, value, level_required, active
loyalty_transactions — id, customer_id, order_id, delta_pts, type (earn/spend/bonus),
                     description, created_at
orders             — id, customer_id, shop_id, total, items (jsonb), created_at
```

La table `loyalty_config` stocke les niveaux en JSONB pour éviter une table de jointure inutile. Un seul enregistrement par shop.

---

## Intégration POS

Le widget fidélité dans le POS (composant existant avec "Passer sans fidélité") doit être complété :
1. Champ de recherche client (téléphone ou nom) → appelle `/api/customers/search`.
2. Affichage du profil client trouvé : nom, badge, points.
3. Sélecteur de récompense si le client en a de disponibles.
4. À la validation du paiement : `POST /api/loyalty/apply-reward` si récompense sélectionnée, puis crédit automatique des points via une transaction.

---

## Dans le scope

- Liste CRM paginée et filtrable
- Fiche client avec historique commandes + points
- Notes caissier (lecture/écriture)
- Config programme (règles points, niveaux, récompenses)
- POS widget complet (search + apply reward)
- Envoi QR par SMS/email (via Supabase Edge Function — wrapper simple)

## Hors scope

- Application mobile cliente (portail QR — sprint 9 ou ultérieur)
- Notifications push / marketing automatisé
- Multi-shop par fidélité croisée
- Import CSV de clients existants
- Rapports d'engagement avancés

---

## Accent couleur CRM

La section CRM utilise le violet comme couleur d'accent : `#8b5cf6` / `#a78bfa`. Badges statut : Gold = `#fbbf24`, Silver = `#94a3b8`, Standard = `#64748b`. Ce standard est établi depuis les mockups S6 et doit rester cohérent dans tous les composants du sprint 8.
