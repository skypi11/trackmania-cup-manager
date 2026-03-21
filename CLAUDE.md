# Springs E-Sport — Site Cup Monthly

## Contexte
Site de gestion des compétitions Springs E-Sport (Trackmania Monthly Cup, et à venir Rocket League).
Réponses en **français** uniquement.

## Stack technique
- **Frontend** : Vanilla JS (ES modules), HTML/CSS inline par fichier
- **Base de données** : Firebase Firestore
- **Auth** : Firebase Auth (Google OAuth)
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
│   └── rl.webp
├── trackmania/
│   ├── index.html              (hub TM — Monthly Cup + Mania Cup)
│   ├── cup.html                (app principale — 300KB+, tout inline)
│   ├── overlay-quals.html      (OBS overlay qualifications)
│   ├── overlay-finale.html     (OBS overlay finale)
│   └── overlay-podium.html     (OBS overlay podium animé)
└── rocket-league/
    └── index.html              (app RL — en construction)
```

## Collections Firestore — Trackmania
- **`participants`** : profils joueurs (`pseudo`, `pseudoTM`, `pseudoRL`, `team`, `games`, `email`, `userId`, `cupId`, `discordId`, `discordUsername`) + champs RL : `trackerUrl` (verrouillé après saisie), `trackerUrlLockedAt`, `epicId`, `dateOfBirth`, `country`
- **`editions`** : éditions de cup (`name`, `date`, `status`, `cupId`) — statuts : `inscriptions`, `live`, `terminee`, `upcoming`
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
- **`rl_lan`** : brackets LAN (`seasonId`, `status`, `qualifiedTeams:[16 teamIds]`, `swissRounds:[{round, matches}]`, `bracket:{upper,lower,final}`)

## Règles métier — Rocket League

### Format compétition
- **Springs League Series** — 2ème édition 2026
- 2 poules de 16 équipes, round-robin complet dans chaque poule (15 matchs/équipe)
- 5 semaines, 3 matchs/semaine, format BO7, 3v3 Standard
- Top 8 de chaque poule → LAN finale (16 équipes mélangées)
- LAN : Samedi ronde suisse (5 rounds BO5) + Dimanche double élimination (BO5/BO7)
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
- Discord redirect URI : dynamique via `window.location.origin + '/trackmania/cup.html'`
- Firebase Auth domain autorisé : `springs-esport.vercel.app`
- Google OAuth origins : `https://springs-esport.vercel.app`
- Google OAuth redirect : `https://springs-esport.vercel.app/__/auth/handler`
- reCAPTCHA v3 : domaine `springs-esport.vercel.app` ajouté (throttle 24h suite aux erreurs 403 initiales)

## Discord
- Serveur Springs E-Sport avec webhooks configurés
- Webhook TM : existant
- Webhook RL : channel dédié à créer/configurer

## Roadmap
### En cours / priorité
- [ ] Vercel login (throttle App Check 24h — attendre)
- [ ] Section Rocket League — Phase 1 : profils, équipes, roster, agents libres

### Planifié
- [ ] RL Phase 2 : calendrier matchs, créneaux, résultats, stats
- [ ] RL Phase 3 : classements, égalités
- [ ] RL Phase 4 : brackets LAN visuels (Ronde Suisse + Double Élim)
- [ ] RL Phase 5 : Discord notifications, mercato, candidatures
- [ ] TM : Système de prédictions
- [ ] Domaine custom (Namecheap/Porkbun → Vercel)
- [ ] OAuth Epic Games (portail dev Epic)
- [ ] OAuth Ubisoft/Nadeo (nécessite accord)
