# Fiável — Plan de features (v2)

Track : **Genesis + Stellar Composed**. Mis à jour à partir du debrief du 25/10/2026.

## Ce qui change par rapport au debrief

| Changement | Avant | Après | Pourquoi |
|---|---|---|---|
| **B5** Règle de smart account : l'agent du propriétaire ne peut appeler que `claim_unpaid` | Should | **Must** | Reprend mot pour mot l'idée du track Composed « set its limits with OpenZeppelin's policy library ». Compose le smart account et le wallet d'agent. Thematic Alignment = 20 %. |
| **A16** Blend, découpé en deux | Could (bloc unique) | **A16a Should** + A16b Could | Une vraie intégration d'un projet live (« Plug into a live project ») renforce Composed. Le minimum (dépôt + retrait) suffit à la prouver. |
| **E9** Préflight : CLI Stellar + contrat « hello world » sur testnet | absent | **Must, avant H0** | Le plan H2–10 en dépend. |
| Point de contrôle Blend | H20 | **H14** | A16a démarre dès que la démo Must tourne de bout en bout, pas au gel des features. |
| Briques Composed dans le pitch | smart account + USDC + wallet d'agent | **smart account OZ + politique OZ (B5) + wallet d'agent (D8) + Blend (A16a)** | USDC seul compte peu comme « outil » de l'écosystème. |

Inchangé : C10 (interface en anglais) était déjà Must dans la liste « jamais coupé ». Elle le reste et doit être la langue par défaut de la démo.

**Total : 60 features, dont 44 Must, 11 Should et 5 Could.**

## A. Contrat LeaseVault (Soroban) — Dev A

| ID | Feature | Priorité | Statut |
|---|---|---|---|
| A1 | `create_lease` : loyer, garantie, délais paramétrables (mode démo), arbitre | Must | À faire |
| A2 | `fund` : verrouille loyer 1 + garantie en USDC | Must | À faire |
| A3 | `confirm_move_in` : hash de l'état des lieux, libère le loyer 1 | Must | À faire |
| A4 | `pay_rent` : paie un mois et le marque payé | Must | À faire |
| A5 | `claim_unpaid` : prélève un impayé après le délai de grâce | Must | À faire |
| A6 | `end_lease` : hash de sortie, ouvre la fenêtre de réclamation | Must | À faire |
| A7 | `release` : rend la garantie sans réclamation, appel public | Must | À faire |
| A8 | `claim_damage` : la part non contestée est rendue aussitôt | Must | À faire |
| A9 | `respond` (accepter) + `execute_claim` si le locataire se tait | Must | À faire |
| A10 | Événements à chaque action + lecture `get_lease` | Must | À faire |
| A11 | Tests unitaires des règles, cas de refus compris | Must | À faire |
| A12 | Contre-offre dans `respond` | Should | À faire |
| A13 | `refund_no_keys` : tout revient au locataire sans remise des clés | Should | À faire |
| A14 | Caution de litige de 20 € | Should | À faire |
| A15 | `resolve` : arbitrage borné | Should | À faire |
| **A16a** | **Blend minimal : dépôt de (garantie − 1 mois) dans le pool USDC testnet au `fund`, retrait au `release` / `claim_unpaid`** | **Should** | À faire |
| A16b | Partage du rendement 80/20 + fonds d'arbitrage | Could | À faire |

## B. Comptes et wallets

| ID | Feature | Priorité | Qui | Statut |
|---|---|---|---|---|
| B1 | Smart accounts passkey (OpenZeppelin smart-account-kit) pour les deux rôles | Must | Dev B | À faire |
| B2 | Bouton « USDC de test » pour alimenter les comptes | Must | Dev B | À faire |
| B3 | Wallet de l'agent coordinateur (CLI Stellar), frais seulement | Must | C | À faire |
| B4 | Frais sponsorisés : pas besoin d'XLM | Should | Dev B | À faire |
| **B5** | **Politique OZ sur le smart account : l'agent du propriétaire ne peut appeler que `claim_unpaid`** | **Must** | Dev A | À faire |
| B6 | Retrait vers la banque via un anchor SEP-24 de test | Could | Dev B | À faire |

## C. App web (PWA) — Dev B

| ID | Feature | Priorité | Statut |
|---|---|---|---|
| C1 | Onboarding : choix du rôle, compte Face ID | Must | À faire |
| C2 | Propriétaire : formulaire de bail + lien d'invitation | Must | À faire |
| C3 | Locataire : conditions, acceptation, financement | Must | À faire |
| C4 | Timeline du bail en étapes | Must | À faire |
| C5 | Carte « Votre garantie » avec solde lu on-chain | Must | À faire |
| C6 | Paiement du loyer + historique | Must | À faire |
| C7 | Réclamation (propriétaire) et réponse (locataire) | Must | À faire |
| C8 | Lien Stellar Expert sur chaque action | Must | À faire |
| C9 | Mode démo : 1 mois = 1 minute, compte à rebours visible | Must | À faire |
| C10 | Interface en anglais (langue par défaut pour le jury) | Must | À faire |
| C11 | Manifest PWA + icônes | Must | À faire |
| C12 | Upload des photos d'état des lieux, hash calculé dans le navigateur | Should | À faire |
| C13 | Écran d'arbitrage | Should | À faire |
| C14 | Écran rendement : solde Blend réel + projection face à l'inflation | Could | À faire |
| C15 | Service worker hors ligne | Could | À faire |

## D. Agents IA — C

| ID | Feature | Priorité | Statut |
|---|---|---|---|
| D1 | Moteur d'agent : route backend + API Claude avec outils | Must | À faire |
| D2 | Outil `get_lease_status` | Must | À faire |
| D3 | Outil `get_rent_history` (via les événements) | Must | À faire |
| D4 | Outil `explain_lease_rule` (conditions on-chain) | Must | À faire |
| D5 | Outil `request_contract_action` : transaction non signée | Must | À faire |
| D6 | Garde-fous backend : rôle, bail et montant vérifiés | Must | À faire |
| D7 | Tenant Guardian : chat côté locataire | Must | À faire |
| D8 | Lease Coordinator : `call_public_function` quand un délai expire | Must | À faire |
| D9 | Scène de refus « saisis la caution maintenant » | Must | À faire |
| D10 | Landlord Assistant : chat côté propriétaire (même moteur) | Should | À faire |
| D11 | Outil `prepare_claim` : réclamation avec preuves | Should | À faire |
| D12 | Journal visible des actions des agents | Should | À faire |
| D13 | Rappels proactifs | Could | À faire |

## E. Preuves et soumission — C

| ID | Feature | Priorité | Statut |
|---|---|---|---|
| **E9** | **Préflight avant H0 : Rust + CLI Stellar installés, contrat « hello world » déployé sur testnet** | **Must** | À faire |
| E1 | 5 interviews + comptage d'annonces Idealista/OLX | Must | À faire |
| E2 | README : problème, setup, variables, démo, travail antérieur, usage de l'IA | Must | À faire |
| E3 | Schéma d'architecture + ID des contrats (LeaseVault, pool Blend, politique OZ) | Must | À faire |
| E4 | Liens des transactions testnet (financement, impayé, refus, libération, dépôt Blend) | Must | À faire |
| E5 | Vidéo de 2 à 4 min | Must | À faire |
| E6 | Deck PDF | Must | À faire |
| E7 | Journal des prompts | Must | À faire |
| E8 | Clé API IA hors du repo, avec plafond de dépense | Must | À faire |

## Points de contrôle (révisés)

- **Avant H0** : E9 fait. Sinon, le premier bloc de Dev A passe dessus.
- **H2** : interface du contrat figée. Les appels Blend (A16a) sont prévus dans la signature de `fund` et `release` dès maintenant, derrière une option.
- **H8** : contrat v1 sur testnet, appelable par le front et par l'agent.
- **H14** : démo Must de bout en bout, **B5 compris**. Si elle tourne, A16a démarre. Sinon, tous les Should sont coupés.
- **H20** : gel des features. A16a est gardé seulement s'il passe sur testnet sans erreur. Sinon, Blend passe en slide de roadmap.
- **H24** : la démo tourne 3 fois de suite ; on enregistre la vidéo.

## Ordre de coupe en cas de retard

1. Could : A16b, B6, C14, C15, D13.
2. Agents secondaires : D12, D11, D10.
3. Litiges avancés : A15, C13, A14, A12.
4. Confort : B4, C12.
5. Blend minimal : A16a (dernier Should coupé, car c'est la brique Composed la plus forte).
6. Jamais coupé : tous les Must, B5 et E9 compris.

## Scénario de démo : ajouts

- **0:55–1:25 (loyer en retard)** : l'agent de Manuel déclenche `claim_unpaid` via son smart account, ce que la politique B5 autorise.
- **1:25–1:55 (le refus)** : on montre deux verrous. Le contrat rejette la saisie anticipée de la garantie. **La politique OZ rejette l'agent quand il tente d'appeler une autre fonction que `claim_unpaid`.**
- **2:25–2:50 (sous le capot)** : on nomme les quatre briques Composed et on montre le solde Blend réel si A16a est en place.
