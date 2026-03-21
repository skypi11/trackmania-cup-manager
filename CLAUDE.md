# Springs E-Sport — Site Cup Monthly

## Contexte
Site de gestion des compétitions Springs E-Sport (Trackmania Monthly Cup, et à venir Rocket League).
Réponses en **français** uniquement.

## Stack technique
- **Frontend** : Vanilla JS (ES modules), HTML/CSS inline par fichier
- **Base de données** : Firebase Firestore
- **Auth** : Firebase Auth (Google OAuth)
- **Hébergement** : Vercel → `https://springs-esport.vercel.app`
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
    └── index.html              (coming soon)
```

## Collections Firestore
- **`participants`** : profils joueurs (`pseudo`, `pseudoTM`, `pseudoRL`, `team`, `games`, `email`, `userId`, `cupId`, `discordId`, `discordUsername`)
- **`editions`** : éditions de cup (`name`, `date`, `status`, `cupId`) — statuts : `inscriptions`, `live`, `terminee`, `upcoming`
- **`results`** : résultats (`editionId`, `playerId`, `phase`, `position`, `map`, `cupId`) — phases : `inscription`, `qualification`, `finale`
- **`predictions`** : prédictions joueurs avant chaque édition
- **`admins`** : `{uid: true}` — admins du site
- **`siteContent`** : config site (`config_monthly`, `config_mania`)
- **`cups`** : infos des cups

## Règles importantes
- `cupId` identifie la cup : `'monthly'` ou `'mania'`. Les anciens docs sans `cupId` sont traités comme `'monthly'`.
- `cupFilter` : `item => (item.cupId || 'monthly') === cupId`
- Système de points F1 : `[25, 18, 15, 12, 10, 8, 6, 4, 2, 1]` — défini dans `shared/firebase-config.js`
- `pName(p)` : `p?.pseudoTM || p?.pseudo || p?.name || '?'`
- Qualification = top 3 par map (jusqu'à 7 maps). Plusieurs entrées `qualification` par joueur par édition (une par map).
- **Participations = éditions distinctes** (pas le nombre de résultats de qualification) → `new Set(results.map(r => r.editionId)).size`

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
```
- Police : **Inter** (Google Fonts)
- Style : dark, minimaliste, gaming

## Overlays OBS
URL pattern : `https://springs-esport.vercel.app/trackmania/overlay-quals.html?cup=monthly`
- Paramètres : `cup`, `edition` (optionnel, auto-détecte), `maps` (défaut 6), `lives` (défaut 3)
- Les overlays importent `db` depuis `../shared/firebase-config.js`
- Fond transparent pour quals/finale, fond plein pour podium

## Conventions de code
- Toutes les fonctions interactives sur `window` dans `cup.html`
- ES modules (`type="module"`) partout
- Pas de framework JS — vanilla uniquement
- CSS et JS inline dans chaque HTML (sauf le module shared)
- Nouveau code : importer `db`, `auth`, `app`, `pName`, `getPoints` depuis `../shared/firebase-config.js`

## Déploiement
- Push sur `main` → Vercel redéploie automatiquement
- Toujours push après chaque modification (mémoire feedback : push automatique sans confirmation)

## URLs importantes
- Site : `https://springs-esport.vercel.app`
- Discord redirect URI : `https://springs-esport.vercel.app/trackmania/cup.html` (dynamique via `window.location.origin`)
- Firebase Auth domain autorisé : `springs-esport.vercel.app`
- Google OAuth origins : `https://springs-esport.vercel.app`
- Google OAuth redirect : `https://springs-esport.vercel.app/__/auth/handler`

## Ce qui est prévu / en cours
- [ ] Système de prédictions (base Firestore prête, UI à faire)
- [ ] Section Rocket League (coming soon pour l'instant)
- [ ] Domaine custom (à acheter sur Namecheap/Porkbun, à connecter sur Vercel)
- [ ] OAuth Ubisoft (Nadeo API — nécessite accord) / Epic Games (plus accessible)
