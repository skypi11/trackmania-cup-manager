# Springs E-Sport — Site Cup Monthly

## Contexte
Site de gestion des compétitions Springs E-Sport (Trackmania Monthly Cup, et à venir Rocket League).
Réponses en **français** uniquement.

## Collaboration
L'utilisateur n'est **pas développeur**. Il décrit ce qu'il veut, Claude fait tout le code et les pushs. Il vérifie uniquement sur le site Vercel. Ne jamais lui demander de lancer des commandes ou de manipuler des fichiers manuellement.

## Stack technique
- **Frontend** : Vanilla JS (ES modules), HTML/CSS inline par fichier
- **Base de données** : Firebase Firestore
- **Auth** : Firebase Auth — **Discord OAuth pour tous les joueurs** (TM + RL), Google OAuth réservé aux admins uniquement
  - Flow Discord : Discord OAuth → `/api/discord-callback?state=tm_monthly|tm_mania|rl` → Firebase custom token (`discord_SNOWFLAKE`) → `signInWithCustomToken`
  - Admins : `signInWithPopup` Google (UID Google dans collection `admins`)
- **Hébergement** : Vercel → `https://springs-esport.vercel.app` (GitHub Pages encore actif en backup : `https://skypi11.github.io/trackmania-cup-manager/`)
- **Source** : GitHub → `skypi11/trackmania-cup-manager`
- **Module partagé** : `shared/firebase-config.js` (Firebase init, `db`, `auth`, `app`, `pName`, `getPoints`)

## Structure des fichiers
```
/
├── index.html                  (landing Springs E-Sport)
├── CLAUDE.md
├── shared/
│   └── firebase-config.js      (Firebase v12.10.0 + helpers partagés)
├── assets/
│   ├── springs-logo.png
│   ├── trackmania.png
│   ├── rl.webp
│   ├── SpringsLeagueSeries.png    (logo événement SLS — utilisé en watermark)
│   ├── PAGE_404.png               (sponsor)
│   └── Ibis-budget-2019.svg.png   (sponsor)
├── trackmania/
│   ├── index.html              (hub TM — Monthly Cup + Mania Cup)
│   ├── cup.html                (app principale — 300KB+, tout inline)
│   ├── overlay-quals.html      (OBS overlay qualifications)
│   ├── overlay-finale.html     (OBS overlay finale)
│   └── overlay-podium.html     (OBS overlay podium animé)
└── rocket-league/
    ├── index.html              (app RL — admin + ligue + prédictions)
    ├── lan.html                (page publique LAN, lecture seule + ?preview=swiss|bracket|finished)
    ├── display-classement.html (écran géant salle — classement Suisse plein écran 1080p/4K)
    ├── display-matchs.html     (écran géant salle — matchs en cours / scène / à venir)
    └── modules/
        ├── lan.js              (CRUD rl_lan + rl_lan_matches)
        ├── lan-swiss.js        (algos Suisse — purs)
        ├── lan-swiss-admin.js  (UI admin Suisse)
        ├── lan-bracket.js      (algos bracket double élim — purs)
        ├── lan-bracket-admin.js(UI admin bracket + visuel WB/LB/GF)
        ├── lan-public.js       (rendu page publique lan.html)
        ├── display-common.js   (init firebase + listeners partagés écrans géants)
        └── ...                 (auth, admin, data, predictions, standings, state, etc.)
```

## Collections Firestore — Trackmania
- **`participants`** : profils joueurs (`pseudo`, `pseudoTM`, `loginTM`, `pseudoRL`, `team`, `games`, `email`, `userId`, `cupId`, `discordId`, `discordUsername`, `discordAvatar`) + champs RL : `trackerUrl` (verrouillé après saisie), `trackerUrlLockedAt`, `epicId`, `dateOfBirth`, `country`
  - ⚠️ `pseudo` = pseudo affiché sur le site ; `pseudoTM` = pseudo affiché **en course** ; `loginTM` = identifiant compte Ubisoft/Nadeo (trois champs distincts)
  - `userId` = `discord_SNOWFLAKE` pour les joueurs Discord, UID Google pour les admins
  - Auto-migration : à la connexion Discord, si `discordId` ou `discordUsername` correspond à un participant existant → `userId` mis à jour automatiquement
- **`editions`** : éditions de cup (`name`, `date`, `status`, `cupId`) — statuts : `inscriptions`, `en_cours`, `terminee`, `upcoming` (⚠️ valeur réelle `en_cours`, pas `live`)
- **`results`** : résultats (`editionId`, `playerId`, `phase`, `position`, `map`, `cupId`) — phases : `inscription`, `qualification`, `finale`
- **`predictions`** : prédictions joueurs avant chaque édition
- **`admins`** : `{uid: true}` — admins du site
- **`siteContent`** : config site (`config_monthly`, `config_mania`)
- **`cups`** : infos des cups

## Collections Firestore — Rocket League
- **`rl_seasons`** : saisons (`name`, `year`, `status`, `registrationOpen/Close`, `leagueStart/End`, `lanStart/End`, `lanLocation`, `weeks:5`, `matchesPerWeek:3`, `prizePool:{first:800,second:500,third:300}`) — statuts : `registration`, `active`, `lan`, `finished`
- **`rl_teams`** : équipes (`seasonId`, `name`, `tag`, `logoUrl`, `rank`, `pool:'A'|'B'`, `founderId`, `managerId`, `status`) — fondateur et manager sont hors roster
- **`rl_roster`** : membres par équipe (`teamId`, `seasonId`, `playerId`, `role`, `status`, `joinedAt`) — rôles : `capitaine`, `titulaire`, `sub`, `coach` — max 5 personnes dans le roster
- **`rl_matches`** : matchs (`seasonId`, `week:1-5`, `pool`, `homeTeamId`, `awayTeamId`, `status`, `scheduledAt`, `homeScore`, `awayScore`, `homeConfirmed`, `awayConfirmed`, `adminConfirmed`, `forfeit`, `forfeitTeamId`)
- **`rl_availability`** : créneaux proposés par les managers (`matchId`, `teamId`, `slots:[{datetime}]`)
- **`rl_stats`** : stats par joueur par match (`matchId`, `seasonId`, `playerId`, `teamId`, `goals`, `assists`, `saves`, `shots`, `mvp:bool`) — saisies par les admins uniquement
- **`rl_transfers`** : transferts (`seasonId`, `playerId`, `fromTeamId`, `toTeamId`, `role`, `requestedBy`, `status`, `adminId`) — validation admin obligatoire
- **`rl_applications`** : candidatures joueurs (`seasonId`, `playerId`, `teamId`, `message`, `status`, `processedBy`) — acceptées par manager ou fondateur
- **`rl_lan`** : config LAN (1 doc par édition, ID lisible ex: `sls2-2026`) — `name`, `startDate`, `endDate`, `location`, `poolQuotas:{1:9,2:7}`, `manualQualified:[teamIds]` (override auto), `status:'preparation'|'swiss'|'between'|'bracket'|'finished'`
- **`rl_lan_matches`** : matchs de la LAN (Suisse + Bracket) — `lanId`, `phase` (`swiss_r1`-`swiss_r5`, `wb_qf`, `wb_sf`, `wb_f`, `lb_r1`-`lb_f`, `gf`), `homeTeamId`, `awayTeamId`, `format:'bo5'|'bo7'`, `games:[{home,away}]`, `seriesScore:{home,away}`, `winner`, `status`, `onStage:bool`, `scheduledAt`, `swissOrder` (ordre dans le round)

## Règles métier — Rocket League

### Format compétition
- **Springs League Series** — 2ème édition 2026
- 2 poules de 16 équipes, round-robin complet dans chaque poule (15 matchs/équipe)
- 5 semaines, 3 matchs/semaine, format BO7, 3v3 Standard
- LAN finale (16-17 mai 2026, Salle Culturelle Magny-Cours) : 16 équipes qualifiées (top 9 P1 + top 7 P2 — quotas configurables, ad-hoc 2026 à cause de 3 forfaits P2)
- LAN Jour 1 (samedi) : phase Suisse 5 rounds BO5, max 4 matchs simultanés (2 vagues), points 3V/0D + 0.1 par manche gagnée
- LAN Jour 2 (dimanche) : top 8 de la Suisse → bracket double élim (BO5 phases 1-2, BO7 phases 3+, finale BO7 sans reset)
- Mercatos : 12 avril et 26 mai 2026 (validation admin requise)
- Dotation : 1er 800€, 2ème 500€, 3ème 300€

### Rôles dans une équipe
| Rôle | Dans roster | Peut jouer | Notes |
|------|------------|-----------|-------|
| Fondateur | Non | Non | Crée/possède l'équipe, peut aussi être manager ou coach |
| Manager | Non | Non | Gère le roster, une seule équipe, entre les créneaux |
| Capitaine | Oui | Oui | Référent in-game, doit être majeur (+18) |
| Titulaire | Oui | Oui | 3 obligatoires |
| Sub | Oui | Oui | 1-2 substituts |
| Coach | Oui | Non | Optionnel, prend une place de sub |

- Max 5 personnes dans le roster (fondateur hors roster)
- Un joueur ne peut être que dans une seule équipe
- Manager ne peut gérer qu'une seule équipe

### Inscription / création d'équipe
- Le fondateur OU le manager peut créer l'équipe
- Si manager crée l'équipe, l'admin ajoute le fondateur plus tard
- Joueur peut postuler à une équipe OU manager peut l'inviter par pseudo
- Manager ou fondateur accepte les candidatures
- Roster verrouillé à la fermeture des inscriptions (25 mars)

### Matchs
- Admin génère le calendrier (qui affronte qui chaque semaine)
- Manager saisit ses créneaux disponibles → synchronisé pour éviter les doublons
- Équipe adverse choisit un créneau
- Les deux managers confirment le résultat après le match
- Si un manager ne confirme pas → admin peut valider
- Forfait = 4-0, validé par admin
- Stats (buts, passes, saves, tirs, MVP) saisies par les admins uniquement (basé sur screenshots envoyés par managers)

### Classement
- Victoire = 1 point, Défaite = 0
- Égalité départagée par : 1) résultat direct, 2) différence de buts (BO wins)

### Profil joueur RL
- `trackerUrl` : lien tracker (toute plateforme), verrouillé après saisie — modifiable uniquement sur demande admin
- `epicId`, `dateOfBirth`, `country` requis
- Agent libre si pas dans une équipe
- Profils conservés d'une saison à l'autre

### Saisons
- Plusieurs saisons, profils et équipes conservés
- Équipes conservées si même fondateur
- Changements de roster = mercato

## Règles métier — Trackmania
- `cupId` identifie la cup : `'monthly'` ou `'mania'`. Les anciens docs sans `cupId` sont traités comme `'monthly'`.
- `cupFilter` : `item => (item.cupId || 'monthly') === cupId`
- Système de points F1 : `[25, 18, 15, 12, 10, 8, 6, 4, 2, 1]` — défini dans `shared/firebase-config.js`
- `pName(p)` : `p?.pseudoTM || p?.pseudo || p?.name || '?'`
- Qualification = top 3 par map (jusqu'à 7 maps). Plusieurs entrées `qualification` par joueur par édition (une par map).
- **Participations = éditions distinctes** → `new Set(results.map(r => r.editionId)).size`

## Design / Charte graphique
```css
--color-bg-primary: #0f0f0f
--color-bg-secondary: #1a1a1a
--color-bg-elevated: #252525
--color-text-primary: #f0f0f0
--color-text-secondary: #777
--color-accent: #00D936        /* vert TM */
--color-warning: #f59e0b
--color-danger: #ef4444
--springs-orange: #FFB800
--springs-purple: #7B2FBE
--rl-blue: #0081FF             /* couleur accent RL */
--rl-orange: #FF6B35           /* couleur secondaire RL */
```
- Police : **Inter** (Google Fonts)
- Style : dark, minimaliste, gaming

## Overlays OBS (Trackmania)
URL pattern : `https://springs-esport.vercel.app/trackmania/overlay-quals.html?cup=monthly`
- Paramètres : `cup`, `edition` (optionnel), `maps` (défaut 6), `lives` (défaut 3)
- Les overlays importent `db` depuis `../shared/firebase-config.js`

## Conventions de code
- Toutes les fonctions interactives sur `window`
- ES modules (`type="module"`) partout
- Pas de framework JS — vanilla uniquement
- CSS et JS inline dans chaque HTML (sauf le module shared)
- Importer `db`, `auth`, `app`, `pName`, `getPoints` depuis `../shared/firebase-config.js`

## Déploiement
- Push sur `main` → Vercel redéploie automatiquement
- Toujours push après chaque modification (sans confirmation)

## URLs importantes
- Site Vercel : `https://springs-esport.vercel.app`
- Site GitHub Pages (backup) : `https://skypi11.github.io/trackmania-cup-manager/`
- Discord OAuth redirect URI : `https://springs-esport.vercel.app/api/discord-callback` (unique, state param détermine la destination)
- State param Discord : `tm_monthly` → cup.html?cup=monthly | `tm_mania` → cup.html?cup=mania | `rl` → rocket-league/
- Firebase Auth domain autorisé : `springs-esport.vercel.app`
- Google OAuth origins : `https://springs-esport.vercel.app`
- Google OAuth redirect : `https://springs-esport.vercel.app/__/auth/handler`
- reCAPTCHA v3 : domaine `springs-esport.vercel.app` ajouté (throttle 24h suite aux erreurs 403 initiales)

## Discord
- Serveur Springs E-Sport avec webhooks configurés
- Webhook TM : existant
- Webhook RL : channel dédié à créer/configurer

## Roadmap

### État actuel RL (mars 2026)
- ✅ Auth + profils joueurs (epicId, tracker, discord, pays)
- ✅ Création/validation équipe (draft → pending → approved/rejected)
- ✅ Inscription à une ligue (admin approve/reject)
- ✅ Création de ligue (formulaire : format RR/Swiss, semaines, dates)
- ✅ Génération calendrier round-robin par pool (admin)
- ✅ Classements temps réel (V/D/pts/diff, top 8 → LAN badge)
- ✅ Saisie scores (manager + confirmation adverse + override admin)
- ✅ Administration : édition équipes/joueurs, forfait, reset match, gestion joueurs
- ✅ LAN — Phase 0 : config `rl_lan`, qualifs auto/manuelles, badges "Qualifié LAN" sur classement (Phase 0 livrée 2026-04-27)
- ✅ LAN — Phase 1 : Suisse complète — génération R1 (P1↔P2 + 4P1vs5P1) + algo Swiss greedy R2-R5, saisie scores manche par manche (table HTML), classement live, flag "match scène" (Phase 1 livrée 2026-04-28)
- ✅ LAN — Phase 2 : Bracket double élim 8 équipes — BO5/BO7, auto-progression + rétro-propage, visuel grille unique WB/LB/GF avec connecteurs SVG en L (Phase 2 livrée 2026-04-28)
- ✅ LAN — Phase 5 : page publique `/rocket-league/lan.html` — hero adaptatif au status (champion XXL si finished / countdown si preparation / live indicator + match scène si en cours), Suisse compactée (top 8 + toggle, rounds en accordéon), bracket read-only, podium, sponsors. Mode aperçu via `?preview=swiss|between|bracket|finished` (Phase 5 livrée 2026-04-28)
- ✅ LAN — Phase 3 : écrans géants — `display-classement.html` (16 équipes plein écran, top 8 surligné, watermark SLS, footer sponsors) + `display-matchs.html` (match scène XXL symétrique, max 4 simultanés respectant le format groupe 1/groupe 2). Adaptatif 1080p/4K via clamp() + vw/vh, mode preview, App Check (Phase 3 livrée 2026-04-29)
- ❌ LAN — Phase 4 : prédictions LAN étendues (match / top 8 / podium / vainqueur)
- ❌ Mercato (transferts inter-équipes)
- ❌ Discord webhooks

### Décisions d'architecture
- **Ligue uniquement** — tournois supprimés, code propre centré sur la ligue
- Collection `rl_competitions` (type toujours `'league'`)

### Fonctionnalités TM livrées (session 2026-04-05)
- ✅ TM : Auth Discord unifiée — joueurs TM connectés via Discord (même flow que RL), admins conservent Google
- ✅ TM : Formulaire profil enrichi — pseudo site (pré-rempli Discord), pseudo TM (affiché en course), login TM (compte Ubisoft), équipe
- ✅ TM : Auto-migration — connexion Discord rattache automatiquement un compte existant si discordId ou discordUsername correspond

### Fonctionnalités TM livrées (session 2026-03-25)
- ✅ TM : nbMaps / nbQualifPerMap configurables par édition
- ✅ TM : Discord notifications admin avec 4 templates (Rappel, Annonce, Résultats, Libre)
- ✅ TM : Onglet ⚔️ Duel — comparaison tête-à-tête en miroir (stats, streaks, achievements, graphe, H2H)
- ✅ TM : Onglet 📋 Règles et Format — éditeur admin bilingue FR/EN, fallback FR si EN vide

### Planifié (ordre priorité)
- [ ] RL LAN Phase 4 : prédictions LAN étendues (match individuel + top 8 + podium + vainqueur)
- [ ] RL : Mercato (transferts inter-équipes, validation admin)
- [ ] RL : Discord webhook notifications
- [ ] TM : Système de prédictions
- [ ] Domaine custom (Namecheap/Porkbun → Vercel)
- [ ] OAuth Epic Games (portail dev Epic)
- [ ] OAuth Ubisoft/Nadeo (nécessite accord)

**Note :** Plan détaillé de la LAN dans `PLAN_LAN_2026.md` à la racine.
