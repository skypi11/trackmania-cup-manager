# Plan dev — LAN Springs League Series #2 (16-17 mai 2026)

> Document de référence pour le développement de la partie LAN du site RL.
> Créé le 2026-04-28. Branche de travail : `lan-2026`.

## 1. Contexte

- **Événement** : Springs League Series #2, LAN finale de la saison RL
- **Dates** : Samedi 16 et dimanche 17 mai 2026
- **Lieu** : Salle Culturelle, 2 Rue des Écoles, 58470 Magny-Cours
- **Organisation** : Le Teï Teï / Riskone01 / Skypi11 / Silver
- **Cashprize** : 800 € / 500 € / 300 € (1600 € total)

## 2. Format de la compétition

### Jour 1 — Samedi (Phase Suisse)

- **16 équipes** en Suisse :
  - 9 meilleures de la Poule 1
  - 7 meilleures de la Poule 2 (3 forfaits dans la P2 → 7 au lieu de 8)
- **5 rounds** au format BO5
- **1 seul tournoi à 16 équipes** joué en 2 vagues physiques (4 PCs disponibles → max 4 matchs simultanés)
- **Pas de timeout** (sauf matchs scène)
- Le classement final du Jour 1 détermine le seeding du Jour 2

### Jour 2 — Dimanche (Bracket double élimination — 8 équipes)

Top 8 de la Suisse → bracket double élim avec seeding :

| Match | Affiche |
|-------|---------|
| Quart 1 | Seed 1 vs Seed 8 |
| Quart 2 | Seed 2 vs Seed 7 |
| Quart 3 | Seed 3 vs Seed 6 |
| Quart 4 | Seed 4 vs Seed 5 |

**Format des phases :**

| Phase | Matchs | BO |
|-------|--------|-----|
| Phase 1 | Quarts WB (4 matchs) | BO5 |
| Phase 2 | Demis WB + LB R1 (en 2 vagues 2.1/2.2) | BO5 |
| Phase 3 | LB R2 (LB 3.1 + LB 3.2) | BO5 |
| Phase 4 | Finale WB (WB 4.1) + LB R3 (LB 4.1) | BO7 |
| Phase 5 | Finale LB (LB 5.1) | BO7 |
| Finale | Grande Finale (1 seul BO7, **pas de bracket reset**) | BO7 |

Timeout : 2 min par série pendant le Jour 2.

## 3. Règles métier — détaillées

### Système de classement Suisse

- **Victoire série** : 3 points
- **Défaite série** : 0 point
- **Bonus** : +0.1 par manche gagnée
- Système identique à celui utilisé en ligue actuellement

### Appariements Suisse

**Round 1** : appariements basés sur les poules d'origine (P1 vs P2) selon le classement final ligue. Avec 9 P1 + 7 P2, on a 7 paires P1↔P2 + 1 paire P1 interne (4e P1 vs 5e P1).

**Rounds 2-5** : algo Suisse classique, géré automatiquement :
- Équipes au même score s'affrontent
- Pas de revanche (deux équipes ne se rencontrent jamais deux fois)
- Override admin possible si besoin

### Saisie des scores

- **Saisie par 1 admin unique** (parmi 4) → pas de problème de conflits
- **Score saisi en buts par manche** :
  - Pour chaque manche : `[home_goals] - [away_goals]`
  - Le système déduit qui gagne la manche, puis qui gagne la série
  - BO5 : première équipe à 3 manches gagnées
  - BO7 : première équipe à 4 manches gagnées
- Pas de stats individuelles (goals/assists/saves/MVP) à saisir

### Bracket — auto-progression

- Quand un match du bracket se termine, le vainqueur monte (WB) et le perdant descend (LB) **automatiquement**
- Si l'admin édite un score a posteriori → **rétro-propagation** automatique sur les matchs suivants
- Bouton "annuler" possible si erreur

### Pas de forfait pendant la LAN

Tout est calé, pas de gestion forfait à prévoir côté code (admin gérera au cas par cas si jamais).

### Match sur scène

- Flag booléen sur chaque match
- Affichage spécial sur les écrans géants (badge "🎭 SUR SCÈNE", couleur différente)

## 4. Architecture technique

### Collections Firestore

- **`rl_lan`** : 1 document pour l'édition LAN
  - `editionId`, `seasonId`, `name`, `startDate`, `endDate`, `location`
  - `qualifiedTeams` : array des 16 teamIds Suisse
  - `swissRounds` : structure des 5 rounds
  - `bracket` : structure double élim 8 équipes
  - `currentPhase` : phase active pour pilotage écrans
- **`rl_lan_matches`** : tous les matchs de la LAN (Suisse + Bracket)
  - `lanId`, `phase` (`swiss_r1`-`swiss_r5`, `wb_qf`, `wb_sf`, `wb_f`, `lb_r1`-`lb_f`, `gf`)
  - `homeTeamId`, `awayTeamId`, `format` (`bo5`/`bo7`)
  - `games` : array `[{home, away}, ...]` des manches
  - `seriesScore` : `{home, away}` (manches gagnées)
  - `winner`, `status`, `onStage` (booléen scène)
  - `scheduledAt` (horaire estimé)
- **`rl_lan_predictions`** : prédictions joueurs
  - `lanId`, `userId`, `type` (`match`/`top8`/`podium`/`winner`)
  - `data` (selon type), `submittedAt`
- Réutilisation de **`rl_teams`** et **`rl_roster`** existants

### Pages & URLs

| URL | Type | Public |
|-----|------|--------|
| `/rocket-league/lan.html` | Page publique LAN | Tout le monde (Suisse + Bracket + Prédictions + lieu) |
| `/rocket-league/lan-admin.html` | Admin LAN | Admins uniquement (saisie scores, override appariements) |
| `/rocket-league/display-classement.html` | Écran géant | Plein écran sur place (classement live) |
| `/rocket-league/display-matchs.html` | Écran géant | Plein écran sur place (matchs en cours) |

### Vues écrans géants selon la phase

| Phase | Écran 1 | Écran 2 |
|-------|---------|---------|
| Samedi (Suisse) | Classement live | Matchs en cours |
| Entre J1 et J2 | Seeding final 1-8 + qualifiés | Bracket vide preview |
| Dimanche (Bracket) | Bracket complet | Match(s) en cours |

Pilotage : auto selon date/phase + override admin (bouton dans `lan-admin.html`).

### Layout adaptatif écran "matchs"

Maximum 4 matchs simultanés grâce au système "Groupe 1 puis Groupe 2" :
- **1 match** → fiche XXL plein écran (logos énormes, score géant)
- **2 matchs** → côte à côte
- **3-4 matchs** → grille 2×2

### Branding écrans géants

Logos visibles en permanence (top ou bottom bar) :
- Springs E-Sport (logo principal)
- Springs League Series (logo événement)
- Page 404 Informatique (sponsor)
- Ibis Budget (sponsor)

## 5. Prédictions LAN

Extension du système existant. Ouverture progressive :

| Type | Ferme à |
|------|---------|
| Match individuel | Coup d'envoi du match |
| Top 8 (qui se qualifie en bracket) | Avant début LAN — samedi 13h00 |
| Podium (1er, 2e, 3e) | Avant début bracket — dimanche 09h00 |
| Vainqueur final | Avant début bracket — dimanche 09h00 |

## 6. Plan de livraison — 5 phases

### Phase 0 — Données & qualifs ✅ LIVRÉE 2026-04-27
- [x] Création collection `rl_lan` + 1er doc édition LAN 2026
- [x] Auto-qualif des 16 équipes depuis le classement ligue (9 P1 + 7 P2)
- [x] Page admin "Préparation LAN" pour vérifier/forcer les qualifs
- [x] Badge "🏆 Qualifié LAN" sur le classement ligue public

### Phase 1 — Suisse ✅ LIVRÉE 2026-04-28
- [x] Génération auto des appariements R1 (P1↔P2 selon classement ligue + 4P1vs5P1 interne)
- [x] Algo Swiss greedy R2-R5 (V/D > pts > diff buts, pas de revanche, override admin via reset)
- [x] Saisie scores manche par manche (modal table HTML, score live, auto-tab 1 chiffre, raccourcis clavier)
- [x] Flag scène par match (toggle direct sur la carte)
- [x] Classement live (3V / 0D / +0.1 par manche)
- [ ] **TODO modif modal saisie** (à préciser au prochain run)
- [ ] Onglet "Suisse" sur la page publique LAN (sera fait dans Phase 5)

### Phase 2 — Bracket double élim (3-4 jours)
- [ ] Top 8 Suisse → bracket auto-rempli (1v8, 2v7, 3v6, 4v5)
- [ ] Saisie scores BO5 phases 1-2, BO7 phases 3+
- [ ] Auto-progression vainqueur (WB) / perdant (LB)
- [ ] Rétro-propagation si édition d'un score après coup
- [ ] Onglet "Bracket" sur la page publique LAN

### Phase 3 — Écrans géants (2-3 jours)
- [ ] `display-classement.html` plein écran
- [ ] `display-matchs.html` plein écran (layout adaptatif 1/2/3-4)
- [ ] Branding permanent (4 logos)
- [ ] Switch de vue auto selon la phase + override admin
- [ ] Match scène mis en avant (badge spécial)
- [ ] Mise à jour temps réel via Firestore live

### Phase 4 — Prédictions LAN (2-3 jours)
- [ ] Type "match" (ferme au coup d'envoi)
- [ ] Type "top 8" (ferme avant samedi)
- [ ] Type "podium" (ferme avant dimanche)
- [ ] Type "vainqueur" (ferme avant dimanche)
- [ ] Onglet "Prédictions" sur la page publique LAN

### Phase 5 — Page publique LAN + polissage (1-2 jours)
- [ ] `/rocket-league/lan.html` complète (Suisse + Bracket + Prédictions + adresse/lieu)
- [ ] Lien depuis `rocket-league/index.html`
- [ ] Tests bout en bout sur preview Vercel
- [ ] Mise à jour CLAUDE.md avec la nouvelle collection `rl_lan*`

**Total estimé : ~15 jours de boulot — déploiement preview en continu pour tester.**

## 7. Hors scope (pas pour cette LAN)

- ❌ Overlay OBS (pas demandé pour cette LAN, peut-être plus tard)
- ❌ Discord webhook automatique (pas configuré côté RL)
- ❌ Stats individuelles par joueur (pas saisies en ligue donc pas en LAN)
- ❌ Confirmation manager des scores (admin only)

## 8. Workflow Git

- Branche de travail : `lan-2026`
- Preview Vercel auto sur cette branche → URL de test sans toucher la prod
- Merge sur `main` uniquement quand tout est validé

## 9. Planning officiel (rappel)

### Samedi 16 mai
- 08:00-10:00 — Ouverture portes / setup
- 10:00-12:00 — Springs Show (présentation équipes + test serveur)
- 12:00-13:00 — Pause + photo de groupe
- 13:00-14:30 — Round 1
- 14:30-16:00 — Round 2
- 16:00-17:30 — Round 3
- 17:30-19:00 — Round 4
- 19:00-20:30 — Round 5
- 20:30-21:30 — Fin du Jour 1
- 21:30-23:00 — After game

### Dimanche 17 mai
- 08:00 — Ouverture portes
- 08:30-09:00 — Test serveur
- 09:00-09:45 — BO5 Phase 1 (quarts WB)
- 09:45-10:30 — BO5 Phase 2.1 (WB 2.1 + LB 2.1)
- 10:30-11:15 — BO5 Phase 2.2 (WB 2.2 + LB 2.2)
- 11:15-12:15 — BO5 Phase 3 (LB 3.1 + LB 3.2)
- 12:15-13:00 — Pause
- 13:00-14:00 — BO7 Phase 4 (LB 4.1)
- 14:00-15:00 — BO7 Phase 4 (WB 4.1)
- 15:00-16:00 — BO7 Phase 5 (LB 5.1)
- 16:00-17:00 — Finale BO7
- 17:00-17:30 — Remise des prix
- 17:30-18:00 — Clôture
