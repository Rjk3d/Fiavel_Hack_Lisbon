# Fiável — Plan de features (v3)

Track : **Genesis + Stellar Composed**. Mis à jour à partir du debrief du 25/10/2026.

## Ce qui change par rapport au debrief

| Changement | Avant | Après | Pourquoi |
|---|---|---|---|
| **B5** Politique OZ : l'agent du propriétaire ne peut appeler que `claim_unpaid` | Should | **Must** | Reprend l'idée du track Composed « set its limits with OpenZeppelin's policy library ». Thematic Alignment = 20 %. |
| **Rendement Blend** | Could, bloc unique | **Option du bail acceptée par les deux parties**, découpée en A16a (Must, démarre à H14), A16b, A16c (Should) | C'est notre différenciation. Le design protège le propriétaire en priorité (voir plus bas). |
| **Agents IA** | API Claude avec outils | **Agents déterministes** : moteur de règles en TypeScript, sans LLM | Prévisibles, auditables, aucune hallucination, aucune clé d'API ni coût. Ce sont les mêmes outils et les mêmes garde-fous. |
| **E9** Préflight | absent | **Must, fait** | Contrat `hello_world` déployé sur testnet : `CA4U4VVURIG54YYGN5SJUQZT3GZIRRTPQM3NUGEP4YKIGGHA3ZQGKJX5`. |
| Briques Composed du pitch | smart account + USDC + wallet d'agent | **smart account OZ + politique OZ (B5) + wallet d'agent (D8) + Blend (A16) + USDC** | USDC seul compte peu comme « outil » de l'écosystème. |

**Total : 61 features, dont 45 Must, 13 Should et 3 Could.**

## Design du rendement (option Blend)

**Principe :** l'option est désactivée par défaut. Le propriétaire la propose dans `create_lease` ; le locataire l'accepte au `fund` après un écran de consentement (« rendement variable, non garanti, perte possible »). Le contrat enregistre l'accord des deux.

**Protection du propriétaire, appliquée par le contrat :**
1. **Mois liquide** : au moins un mois de loyer n'est jamais placé. Un impayé est payé instantanément, sans dépendre de Blend.
2. **Coussin** : avec l'option, le locataire bloque un supplément (par défaut +5 % de la garantie). Une perte sur Blend est absorbée d'abord par le coussin, puis par la part du locataire, jamais par la garantie due au propriétaire.
3. **Sortie d'urgence** : `exit_blend` est publique. Le coordinateur l'appelle si la valeur du dépôt passe sous un seuil ou si la liquidité du pool baisse. Elle rapatrie tout dans le contrat.
4. **Pool unique** : un seul pool Blend (USDC testnet), fixé à la création. Personne ne peut rediriger les fonds.

**Partage du rendement** paramétrable à la création, par défaut **70 % locataire / 20 % propriétaire / 10 % fonds d'arbitrage**. La part du propriétaire est ce qui le convainc d'accepter.

**Affichage** : solde réel lu sur Blend et projection sur 12 mois au taux du moment. Jamais de faux rendement.

**Argument « 30 ans »** (slide, projection et non promesse) : avec un passeport caution qui suit le locataire de bail en bail, 1 300 € placés à 4 % pendant 30 ans valent environ 4 200 €, contre environ 2 350 € nécessaires pour suivre 2 % d'inflation. Le passeport caution est en roadmap.

**Plan B** : passer par un coffre DeFindex, qui encapsule Blend. **Plan C** : couper, et montrer le design en slide.

**À assumer devant le jury** : pas de promesse de zéro perte. On promet que le propriétaire est couvert en priorité et que l'option est réversible. MiCA reste une zone grise (placement non-custodial choisi par les deux parties), revue juridique en roadmap.

## Agents déterministes

Les agents sont un moteur de règles en TypeScript : ils lisent l'état du bail on-chain, appliquent des règles fixes et produisent des messages à partir de modèles, avec les valeurs réelles du bail. Pas de LLM, pas de chat libre : l'utilisateur choisit parmi des questions et des actions proposées selon l'état du bail.

Les trois verrous restent : le moteur ne propose que des actions permises, l'utilisateur signe avec Face ID, le contrat rejette tout ce qui viole une règle. Le coordinateur est un processus qui tourne en boucle (script Node ou cron serverless), avec son propre wallet qui ne paie que des frais.

Argument jury : « Nos agents ne peuvent pas halluciner : chaque message et chaque action découlent d'une règle vérifiable du bail. »

## A. Contrat LeaseVault (Soroban) — Dev A

| ID | Feature | Priorité | Statut |
|---|---|---|---|
| A1 | `create_lease` : loyer, garantie, délais paramétrables (mode démo), arbitre, option Blend + partage | Must | À faire |
| A2 | `fund` : verrouille loyer 1 + garantie (+ coussin si option) en USDC, accord du locataire enregistré | Must | À faire |
| A3 | `confirm_move_in` : hash de l'état des lieux, libère le loyer 1 | Must | À faire |
| A4 | `pay_rent` : paie un mois et le marque payé | Must | À faire |
| A5 | `claim_unpaid` : prélève un impayé après le délai de grâce (mois liquide d'abord) | Must | À faire |
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
| **A16a** | **Blend : dépôt de (garantie − 1 mois) au `fund`, retrait au `release` / `claim_unpaid` ; coussin absorbe les pertes** | **Must (démarre à H14)** | À faire |
| A16b | `exit_blend` public : rapatrie tout si la valeur ou la liquidité passe sous un seuil | Should | À faire |
| A16c | Partage du rendement 70/20/10 au `release` | Should | À faire |

## B. Comptes et wallets

| ID | Feature | Priorité | Qui | Statut |
|---|---|---|---|---|
| B1 | Smart accounts passkey (OpenZeppelin smart-account-kit) pour les deux rôles | Must | Dev B | À faire |
| B2 | Bouton « USDC de test » pour alimenter les comptes | Must | Dev B | À faire |
| B3 | Wallet de l'agent coordinateur (CLI Stellar), frais seulement | Must | C | À faire |
| B4 | Frais sponsorisés : pas besoin d'XLM | Should | Dev B | À faire |
| **B5** | **Politique OZ sur le smart account : l'agent du propriétaire ne peut appeler que `claim_unpaid`** | **Must** | Dev A | À faire |
| B6 | Retrait vers la banque via un anchor SEP-24 de test | Could | Dev B | À faire |

## C. App web (front Vite, branche `front`) — Dev B

| ID | Feature | Priorité | Statut |
|---|---|---|---|
| C1 | Onboarding : choix du rôle, compte Face ID | Must | À faire |
| C2 | Propriétaire : formulaire de bail (option Blend comprise) + lien d'invitation | Must | À faire |
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
| C14 | Écran rendement : consentement, solde Blend réel, projection 12 mois et 30 ans | Should | À faire |
| C15 | Service worker hors ligne | Could | À faire |

## D. Agents déterministes — C

| ID | Feature | Priorité | Statut |
|---|---|---|---|
| D1 | Moteur de règles (TypeScript) : état du bail → messages modèles + actions proposées | Must | À faire |
| D2 | Outil `get_lease_status` | Must | À faire |
| D3 | Outil `get_rent_history` (via les événements) | Must | À faire |
| D4 | Outil `explain_lease_rule` : un modèle par règle, rempli avec les valeurs on-chain | Must | À faire |
| D5 | Outil `request_contract_action` : transaction non signée, signée par l'utilisateur | Must | À faire |
| D6 | Garde-fous : rôle, bail et montant vérifiés avant de proposer une action | Must | À faire |
| D7 | Tenant Guardian : panneau d'assistant côté locataire (questions et actions guidées) | Must | À faire |
| D8 | Lease Coordinator : boucle qui appelle les fonctions publiques à l'expiration des délais, et `exit_blend` si besoin | Must | À faire |
| D9 | Scène de refus « saisis la caution maintenant » : explication + appel rejeté par le contrat | Must | À faire |
| D10 | Landlord Assistant : même moteur, règles côté propriétaire | Should | À faire |
| D11 | Outil `prepare_claim` : réclamation avec preuves | Should | À faire |
| D12 | Journal visible des actions des agents | Should | À faire |
| D13 | Rappels proactifs | Could | À faire |

## E. Preuves et soumission — C

| ID | Feature | Priorité | Statut |
|---|---|---|---|
| E9 | Préflight : Rust + CLI Stellar, contrat « hello world » sur testnet | Must | **Fait** |
| E1 | 5 interviews + comptage d'annonces Idealista/OLX | Must | À faire |
| E2 | README : problème, setup, variables, démo, travail antérieur, usage de l'IA | Must | En cours |
| E3 | Schéma d'architecture + ID des contrats (LeaseVault, pool Blend, politique OZ) | Must | À faire |
| E4 | Liens des transactions testnet (financement, dépôt Blend, impayé, refus, libération) | Must | À faire |
| E5 | Vidéo de 2 à 4 min | Must | À faire |
| E6 | Deck PDF (dont slides rendement 30 ans et vision obligations tokenisées) | Must | À faire |
| E7 | Journal des prompts (IA utilisée pour coder) | Must | À faire |
| E8 | Clé secrète du coordinateur hors du repo | Must | À faire |

## Points de contrôle

- **H2** : interface du contrat figée, option Blend et `exit_blend` compris dans les signatures.
- **H8** : contrat v1 sur testnet, appelable par le front et par le moteur d'agents.
- **H14** : démo Must de bout en bout (hors Blend), **B5 compris**. Si elle tourne, A16a démarre. Sinon, tous les Should sont coupés et Blend passe au plan B ou C.
- **H20** : gel des features. A16a est gardé seulement s'il passe sur testnet sans erreur.
- **H24** : la démo tourne 3 fois de suite ; on enregistre la vidéo.

## Ordre de coupe en cas de retard

1. Could : B6, C15, D13.
2. Agents secondaires : D12, D11, D10.
3. Litiges avancés : A15, C13, A14, A12.
4. Confort : B4, C12.
5. Rendement avancé : A16c, puis A16b (garder le seuil d'urgence en slide).
6. A16a : plan B (DeFindex), puis plan C (slide).
7. Jamais coupé : A1–A11, B1–B3, B5, C1–C11, D1–D9, E1–E9.

## Scénario de démo (3 minutes)

| Temps | Scène | Ce que le jury voit |
|---|---|---|
| 0:00–0:25 | Le problème | Ana et Manuel, les chiffres portugais, la méfiance symétrique |
| 0:25–0:55 | Création du bail | Manuel crée le bail avec l'option rendement ; Ana lit l'explication de l'agent, accepte et finance avec Face ID ; dépôt Blend visible |
| 0:55–1:25 | Loyer en retard | Le mois expire ; l'agent de Manuel propose `claim_unpaid`, autorisé par la politique B5 ; payé depuis le mois liquide |
| 1:25–1:55 | Le refus | « Saisis toute la caution » : l'agent explique la règle ; le contrat rejette l'appel ; la politique OZ rejette l'agent sur une autre fonction |
| 1:55–2:25 | Fin du bail | Aucune réclamation ; le coordinateur appelle `release` ; garantie + rendement partagés ; lien de la transaction |
| 2:25–2:50 | Sous le capot | Architecture, briques Composed, projection 30 ans, roadmap |
| 2:50–3:00 | Clôture | Slogan et appel à l'action |
