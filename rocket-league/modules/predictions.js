// modules/predictions.js
import { db } from '../../shared/firebase-config.js';
import { collection, getDocs, getDoc, setDoc, updateDoc, doc } from 'firebase/firestore';
import { state } from './state.js';
import { t } from './i18n.js';
import { esc, toast, openModal, closeModal } from './utils.js';
import { fetchAll, refreshMatches } from './data.js';

// Cooldown pour éviter de relire les deux collections à chaque ouverture d'onglet
const PRED_COOLDOWN_MS = 60_000;
let _lastPredFetch = 0;

// Helper : ref Firestore vers les données de saison d'un prédicteur
function _predSeasonRef(uid) { return doc(db, 'rl_pred_season', uid); }

// Champs compte uniquement — on ignore explicitement les anciens champs saison
// qui pourraient traîner dans rl_predictors (avant migration)
const PRED_ACCOUNT_FIELDS = ['uid','discordId','discordUsername','discordAvatar','lastLogin','adminChecked','linkedPlayerId'];

function _pickAccountFields(data) {
  const out = {};
  PRED_ACCOUNT_FIELDS.forEach(k => { if (k in data) out[k] = data[k]; });
  return out;
}

async function refreshPredictors(force = false) {
  if (!state.curUser) return;
  const now = Date.now();
  if (!force && now - _lastPredFetch < PRED_COOLDOWN_MS) return;
  try {
    const [accSnap, seasonSnap] = await Promise.all([
      getDocs(collection(db, 'rl_predictors')),
      getDocs(collection(db, 'rl_pred_season')),
    ]);
    state.predictorsMap = {};
    // Comptes : on ne prend QUE les champs compte (pas les anciens votes/jbets)
    accSnap.forEach(d => { state.predictorsMap[d.id] = { id: d.id, ..._pickAccountFields(d.data()) }; });
    // Données saison — merged par-dessus
    seasonSnap.forEach(d => {
      if (!state.predictorsMap[d.id]) state.predictorsMap[d.id] = { id: d.id };
      Object.assign(state.predictorsMap[d.id], d.data());
    });
    _lastPredFetch = now;
  } catch(e) {
    console.warn('refreshPredictors: lecture collection refusée, fallback doc perso', e.code);
    try {
      const [own, ownSeason] = await Promise.all([
        getDoc(doc(db, 'rl_predictors', state.curUser.uid)),
        getDoc(_predSeasonRef(state.curUser.uid)),
      ]);
      const merged = { id: state.curUser.uid };
      if (own.exists()) Object.assign(merged, _pickAccountFields(own.data()));
      if (ownSeason.exists()) Object.assign(merged, ownSeason.data());
      state.predictorsMap[state.curUser.uid] = merged;
    } catch(e2) { console.warn('refreshPredictors fallback failed:', e2); }
  }
}

export async function loadPredictions() {
  try {
    await fetchAll();
    await refreshMatches();
    try { await refreshPredictors(); } catch(e) { console.warn('refreshPredictors failed:', e); }
    if (state.curUser) {
      try {
        await resolveJetonBets(state.curUser.uid);
        await checkJetonReset(state.curUser.uid);
      } catch(e) { console.warn('jetons init failed:', e); }
    }
    renderPredictorBanner();
    renderPredictions();
  } catch(e) {
    console.error('loadPredictions error:', e);
    const el = document.getElementById('pred-content');
    if (el) el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text2)">Impossible de charger les prédictions.<br><span style="font-size:.75rem;color:var(--text3)">${e.message||''}</span></div>`;
  }
}

function renderPredictorBanner() {
  const banner = document.getElementById('pred-banner');
  if (!banner) return;
  if (!state.curUser) {
    banner.innerHTML = `
      <div class="pred-login-banner">
        <div class="pred-login-banner-icon">
          <svg width="40" height="30" viewBox="0 0 127.14 96.36" fill="#5865F2"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>
        </div>
        <h3>Participez aux prédictions !</h3>
        <p>Connectez-vous avec Discord et pronostiquez les résultats de chaque match.<br>Grimpez dans le classement et défiez la communauté Springs E-Sport.</p>
        <div class="pred-login-perks">
          <div class="pred-login-perk"><span class="pred-login-perk-icon">✦</span> Votez pour vos équipes</div>
          <div class="pred-login-perk"><span class="pred-login-perk-icon">✦</span> Suivez votre score</div>
          <div class="pred-login-perk"><span class="pred-login-perk-icon">✦</span> Classement communauté</div>
        </div>
        <button class="btn-discord" style="font-size:.88rem;padding:9px 22px;border-radius:8px" onclick="doAuth()">
          <svg width="20" height="15" viewBox="0 0 127.14 96.36" fill="currentColor"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>
          Se connecter avec Discord
        </button>
      </div>`;
    return;
  }
  banner.innerHTML = '';
}

function _teamStats(teamId) {
  const played = Object.values(state.matchesMap).filter(m =>
    m.status === 'played' && (m.homeTeamId === teamId || m.awayTeamId === teamId)
  ).sort((a,b) => new Date(a.scheduledAt||0) - new Date(b.scheduledAt||0));
  let w = 0, l = 0;
  const form = played.slice(-5).map(m => {
    const isHome = m.homeTeamId === teamId;
    const myScore = isHome ? (m.homeScore||0) : (m.awayScore||0);
    const oppScore = isHome ? (m.awayScore||0) : (m.homeScore||0);
    const win = myScore > oppScore;
    if (win) w++; else l++;
    return win;
  });
  // recalc proprement
  w = 0; l = 0;
  played.forEach(m => {
    const isHome = m.homeTeamId === teamId;
    const win = isHome ? (m.homeScore||0) > (m.awayScore||0) : (m.awayScore||0) > (m.homeScore||0);
    if (win) w++; else l++;
  });
  const formDots = form.map(win =>
    `<span class="pred-form-dot pred-form-${win?'w':'l'}" title="${win?'V':'D'}"></span>`
  ).join('');
  return { w, l, played: played.length, formDots };
}

function _teamStatsHtml(teamId) {
  const s = _teamStats(teamId);
  if (!s.played) return `<div class="pred-team-stats" style="color:var(--text3)">Aucun match</div>`;
  return `<div class="pred-team-stats"><span style="color:#0c8">${s.w}V</span><span style="color:var(--text3)">–</span><span style="color:#ef4444">${s.l}D</span>${s.formDots ? `<span style="margin-left:3px;display:flex;gap:2px;align-items:center">${s.formDots}</span>` : ''}</div>`;
}

// ── Compat helpers (ancien format string ou nouveau {winner,score}) ──
function _vWinner(v) { return typeof v === 'string' ? v : v?.winner; }
function _vScore(v)  { return typeof v === 'string' ? null : v?.score; }

// ── Cotes ─────────────────────────────────────────────────────────────
function calcMatchCotes(homeTeamId, awayTeamId) {
  function teamProb(teamId) {
    const played = Object.values(state.matchesMap).filter(m =>
      m.status === 'played' && (m.homeTeamId === teamId || m.awayTeamId === teamId)
    ).sort((a,b) => new Date(a.scheduledAt||0) - new Date(b.scheduledAt||0));
    if (!played.length) return 0.5;
    let wins = 0;
    played.forEach(m => {
      const isHome = m.homeTeamId === teamId;
      if (isHome ? (m.homeScore||0)>(m.awayScore||0) : (m.awayScore||0)>(m.homeScore||0)) wins++;
    });
    const leagueRate = (wins + 1.5) / (played.length + 3); // lissage bayésien
    const recent = played.slice(-5);
    let rWins = 0;
    recent.forEach(m => {
      const isHome = m.homeTeamId === teamId;
      if (isHome ? (m.homeScore||0)>(m.awayScore||0) : (m.awayScore||0)>(m.homeScore||0)) rWins++;
    });
    const recentRate = recent.length ? rWins / recent.length : 0.5;
    return leagueRate * 0.65 + recentRate * 0.35;
  }
  const hp = teamProb(homeTeamId), ap = teamProb(awayTeamId);
  const tt = hp + ap;
  const hCote = Math.max(1.10, Math.min(5.00, Math.round((1 / (hp/tt)) * 1.05 * 20) / 20));
  const aCote = Math.max(1.10, Math.min(5.00, Math.round((1 / (ap/tt)) * 1.05 * 20) / 20));
  return { home: hCote, away: aCote };
}

// ── Jetons ────────────────────────────────────────────────────────────
const JETONS_PER_WEEK = 20;

function getJetonWeekKey() {
  const now = new Date();
  // Semaine = vendredi 00h01 → jeudi 23h59
  const day = now.getDay(); // 0=dim, 5=ven
  const daysSinceFri = (day + 2) % 7;
  const lastFri = new Date(now);
  lastFri.setDate(now.getDate() - daysSinceFri);
  return `${lastFri.getFullYear()}-${String(lastFri.getMonth()+1).padStart(2,'0')}-${String(lastFri.getDate()).padStart(2,'0')}`;
}

// Fenêtre de la semaine courante : vendredi 00h01 → jeudi 23h59
function getCurrentWeekWindow() {
  const now = new Date();
  const day = now.getDay(); // 0=dim, 5=ven
  const daysSinceFri = (day + 2) % 7;
  const start = new Date(now);
  start.setDate(now.getDate() - daysSinceFri);
  start.setHours(0, 1, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Un match est ouvert aux pronostics si :
// - son scheduledAt est dans la fenêtre courante (ven→jeu), OU
// - son scheduledAt est dans le passé ET le match n'est pas joué (retard)
function isMatchOpenForPredictions(m) {
  if (!m.scheduledAt) {
    // Fallback sans date : comparer numéro de semaine comme avant
    const pendingWeeks = Object.values(state.matchesMap).filter(x => x.status !== 'played').map(x => x.week).filter(Boolean);
    const activeWeek = pendingWeeks.length ? Math.min(...pendingWeeks) : m.week;
    return m.week <= activeWeek + 1;
  }
  const scheduled = new Date(m.scheduledAt);
  const { start, end } = getCurrentWeekWindow();
  // Dans la fenêtre courante
  if (scheduled >= start && scheduled <= end) return true;
  // Passé + non joué (retard)
  if (scheduled < start && m.status !== 'played') return true;
  return false;
}

function nextFridayStr() {
  const now = new Date();
  const day = now.getDay();
  const daysUntilFri = (5 - day + 7) % 7 || 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntilFri);
  return next.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });
}

async function checkJetonReset(uid) {
  const key = getJetonWeekKey();
  const pred = state.predictorsMap[uid];
  if (pred?.jetonsWeekKey === key) return;
  await setDoc(_predSeasonRef(uid), { jetons: JETONS_PER_WEEK, jetonsWeekKey: key }, { merge: true });
  if (!state.predictorsMap[uid]) state.predictorsMap[uid] = { id: uid };
  state.predictorsMap[uid].jetons = JETONS_PER_WEEK;
  state.predictorsMap[uid].jetonsWeekKey = key;
}

async function resolveJetonBets(uid) {
  const pred = state.predictorsMap[uid];
  if (!pred?.jbets) return;
  const jbets = { ...pred.jbets };
  let changed = false;
  for (const [matchId, bet] of Object.entries(jbets)) {
    if (bet.status !== 'pending') continue;
    const m = state.matchesMap[matchId];
    if (!m || m.status !== 'played') continue;
    const homeWon = (m.homeScore||0) > (m.awayScore||0);
    const awayWon = (m.awayScore||0) > (m.homeScore||0);
    const won = (bet.side === 'home' && homeWon) || (bet.side === 'away' && awayWon);
    jbets[matchId] = { ...bet, status: won ? 'won' : 'lost' };
    changed = true;
  }
  if (!changed) return;
  await updateDoc(_predSeasonRef(uid), { jbets });
  state.predictorsMap[uid].jbets = jbets;
}

// jbet optionnel : { amount, cote, status } — si présent, remplace les pts de base par floor(amount×cote)
export function calcPredPoints(vote, match, jbet) {
  if (!vote || match.status !== 'played') return 0;
  const winner = _vWinner(vote);
  const score  = _vScore(vote);
  const hw = (match.homeScore||0) > (match.awayScore||0);
  const aw = (match.awayScore||0) > (match.homeScore||0);
  const correctWinner = (winner==='home'&&hw) || (winner==='away'&&aw);
  if (!correctWinner) return 0;
  // Pts de base : 1pt, ou floor(mise × cote) si pari placé
  let base = 1;
  if (jbet?.amount > 0 && jbet?.cote > 0) {
    base = Math.max(1, Math.floor(jbet.amount * jbet.cote));
  }
  // Bonus score exact : +2pts
  if (!score) return base;
  const [hs, asc] = score.split('-').map(Number);
  if (hs === (match.homeScore||0) && asc === (match.awayScore||0)) return base + 2;
  return base;
}
window.calcPredPoints = calcPredPoints;

function _predGetCounts(matchId) {
  let home = 0, away = 0;
  Object.values(state.predictorsMap).forEach(p => {
    const v = p.votes?.[matchId];
    const w = _vWinner(v);
    if (w === 'home') home++;
    else if (w === 'away') away++;
  });
  return { home, away, total: home + away };
}

function _predVoteBtn(matchId, side, myVote, isLocked, isPlayed, sideWon) {
  const voted = myVote === side;
  if (isPlayed) {
    if (voted) return sideWon
      ? `<div class="pred-vbtn pred-vbtn-correct">✅ Correct</div>`
      : `<div class="pred-vbtn pred-vbtn-wrong">❌ Raté</div>`;
    return sideWon
      ? `<div class="pred-vbtn pred-vbtn-winner">Vainqueur</div>`
      : `<div class="pred-vbtn pred-vbtn-loser">Défaite</div>`;
  }
  if (isLocked) {
    return voted
      ? `<div class="pred-vbtn pred-vbtn-active" style="cursor:default">✓ Voté</div>`
      : `<div class="pred-vbtn pred-vbtn-locked">🔒 Fermé</div>`;
  }
  if (!state.curUser) return `<div class="pred-vbtn pred-vbtn-noauth">Connexion</div>`;
  return voted
    ? `<button class="pred-vbtn pred-vbtn-active" onclick="votePrediction('${matchId}','${side}')">✓ Voté</button>`
    : `<button class="pred-vbtn pred-vbtn-default" onclick="votePrediction('${matchId}','${side}')">Voter</button>`;
}

function _predDateLabel(d) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const matchStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((matchStart - todayStart) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  return d.toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'});
}

function renderPredictionCard(m) {
  const tH = state.teamsMap[m.homeTeamId] || {name:'?'};
  const tA = state.teamsMap[m.awayTeamId] || {name:'?'};
  const myPred = state.predictorsMap[state.curUser?.uid] || {};
  const myVoteRaw = myPred.votes?.[m.id] || null;
  const myWinner = _vWinner(myVoteRaw);
  const myScore  = _vScore(myVoteRaw);
  const myJbet   = myPred.jbets?.[m.id] || null;
  const counts = _predGetCounts(m.id);
  const now = new Date();
  const scheduled = m.scheduledAt ? new Date(m.scheduledAt) : null;
  const lockTime = scheduled ? new Date(scheduled.getTime() - 15*60*1000) : null;
  const isLocked = !!(lockTime && now >= lockTime);
  const total = counts.total;
  const homePct = total ? Math.round(counts.home / total * 100) : 50;
  const awayPct = total ? 100 - homePct : 50;
  const cotes = calcMatchCotes(m.homeTeamId, m.awayTeamId);

  const _logo = (t, tid) => t.logoUrl
    ? `<img class="pred-logo" src="${esc(t.logoUrl)}" onerror="this.style.display='none'" onclick="event.stopPropagation();openTeamModal('${tid}')" style="cursor:pointer" title="Voir l'équipe">`
    : `<div class="pred-logo-ph" onclick="event.stopPropagation();openTeamModal('${tid}')" style="cursor:pointer" title="Voir l'équipe">${esc((t.name||'?')[0])}</div>`;

  const hLogo = _logo(tH, m.homeTeamId);
  const aLogo = _logo(tA, m.awayTeamId);
  const timeStr = scheduled ? scheduled.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '';

  const hStats = _teamStatsHtml(m.homeTeamId);
  const aStats = _teamStatsHtml(m.awayTeamId);

  const hCls = `pred-side${myWinner==='home'?' pred-voted':''} pred-locked`;
  const aCls = `pred-side${myWinner==='away'?' pred-voted':''} pred-locked`;
  const hVoteEl = myWinner==='home' ? `<div class="pred-vote-check">✓ Voté</div>` : '';
  const aVoteEl = myWinner==='away' ? `<div class="pred-vote-check">✓ Voté</div>` : '';

  const hSide = `<div class="${hCls}">${hLogo}<div class="pred-name">${esc(tH.name)}</div>${hStats}<div class="pred-cote">×${cotes.home}</div>${hVoteEl}</div>`;
  const aSide = `<div class="${aCls}">${aLogo}<div class="pred-name">${esc(tA.name)}</div>${aStats}<div class="pred-cote">×${cotes.away}</div>${aVoteEl}</div>`;

  // Zone de vote
  let voteZone = '';
  if (myWinner) {
    const votedTeam = myWinner === 'home' ? tH : tA;
    const votedCote = myWinner === 'home' ? cotes.home : cotes.away;
    const scoreTxt = myScore ? ` · ${myScore}` : '';
    const jbetTxt = myJbet
      ? `<span class="pred-jbet-badge">🪙 ${myJbet.amount} × ${myJbet.cote} → ${Math.floor(myJbet.amount * myJbet.cote)} potentiels</span>`
      : '';
    voteZone = `<div class="pred-voted-zone">
      <span style="font-weight:700;color:var(--rl-blue)">✓ ${esc(votedTeam.name)}${scoreTxt}</span>
      ${jbetTxt}
      <span style="font-size:.6rem;color:var(--text3);margin-left:auto">🔒 Définitif</span>
    </div>`;
  } else if (isLocked) {
    voteZone = `<div class="pred-voted-zone-locked">🔒 Votes fermés (15 min avant le match)</div>`;
  } else {
    if (!isMatchOpenForPredictions(m)) {
      const { start } = getCurrentWeekWindow();
      const nextOpen = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      const dateStr = nextOpen.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
      voteZone = `<div class="pred-voted-zone-locked">📅 Pronostics ouverts à partir du ${dateStr}</div>`;
    } else if (!state.curUser) {
      voteZone = `<div class="pred-login-hint-card">Connexion Discord pour voter</div>`;
    } else {
      voteZone = `<button class="pred-vote-cta" onclick="openVoteModal('${m.id}')">Pronostiquer →</button>`;
    }
  }

  // Barres
  let barsHtml = '';
  if (myWinner || isLocked || total > 0) {
    const hPCls = myWinner==='home' ? ' pred-pct-voted' : '';
    const aPCls = myWinner==='away' ? ' pred-pct-voted' : '';
    barsHtml = `<div class="pred-bars-wrap">
      <div class="pred-bars-row">
        <span class="pred-pct${hPCls}">${homePct}%</span>
        <div class="pred-bar-bg"><div class="pred-bar-h" style="width:${homePct}%"></div></div>
        <span class="pred-pct pred-pct-r${aPCls}">${awayPct}%</span>
      </div>
      <div class="pred-votes-count">${total} vote${total!==1?'s':''}</div>
    </div>`;
  }

  const metaRight = isLocked
    ? `<span class="pred-lock-chip">🔒 ${timeStr}</span>`
    : timeStr ? `<span class="pred-date-chip">${timeStr}</span>` : '';

  return `
    <div class="pred-card">
      <div class="pred-meta">
        ${m.pool ? `<span class="pred-pool-badge">P${m.pool}</span>` : ''}
        <span class="pred-week-chip">S${m.week||'?'}</span>
        ${metaRight}
      </div>
      <div class="pred-body">
        ${hSide}
        <div class="pred-center">
          ${timeStr ? `<div class="pred-time">${timeStr}</div>` : ''}
          <div class="pred-vs-txt">vs</div>
        </div>
        ${aSide}
      </div>
      ${voteZone}
      ${barsHtml}
    </div>`;
}

function renderPendingPredRow(m, myVote) {
  const tH = state.teamsMap[m.homeTeamId] || {name:'?'};
  const tA = state.teamsMap[m.awayTeamId] || {name:'?'};
  const hLogo = tH.logoUrl ? `<img class="pred-cmpct-logo" src="${esc(tH.logoUrl)}" onerror="this.style.display='none'">` : `<div class="pred-cmpct-logo" style="display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700">${esc((tH.name||'?')[0])}</div>`;
  const aLogo = tA.logoUrl ? `<img class="pred-cmpct-logo" src="${esc(tA.logoUrl)}" onerror="this.style.display='none'">` : `<div class="pred-cmpct-logo" style="display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700">${esc((tA.name||'?')[0])}</div>`;
  const scheduled = m.scheduledAt ? new Date(m.scheduledAt) : null;
  const timeStr = scheduled ? window.formatSchedule(m.scheduledAt) : '?';
  const vw = _vWinner(myVote);
  const vs = _vScore(myVote);
  const votedName = vw === 'home' ? tH.name : tA.name;
  const scoreBadge = vs ? ` <span style="font-size:.6rem;color:var(--text3);">${vs}</span>` : '';
  return `
    <div class="pred-cmpct">
      <span class="pred-cmpct-ico">⏳</span>
      ${hLogo}
      <span class="pred-cmpct-name${vw==='home'?' won':''}">${esc(tH.name)}</span>
      <span class="pred-cmpct-score" style="font-size:.65rem;color:var(--text3);font-weight:700">vs</span>
      <span class="pred-cmpct-name${vw==='away'?' won':''}" style="text-align:right">${esc(tA.name)}</span>
      ${aLogo}
      <div class="pred-cmpct-voted-badge">✓ ${esc(votedName)}${scoreBadge}</div>
      <span class="pred-cmpct-meta">${timeStr}</span>
    </div>`;
}

function renderPlayedPredRow(m, myVote) {
  const tH = state.teamsMap[m.homeTeamId] || {name:'?'};
  const tA = state.teamsMap[m.awayTeamId] || {name:'?'};
  const homeWon = (m.homeScore||0) > (m.awayScore||0);
  const awayWon = (m.awayScore||0) > (m.homeScore||0);
  const myJbet = state.predictorsMap[state.curUser?.uid]?.jbets?.[m.id] || null;
  const pts = calcPredPoints(myVote, m, myJbet);
  const correct = pts >= 1;
  const exact = pts === 3;
  const hLogo = tH.logoUrl ? `<img class="pred-cmpct-logo" src="${esc(tH.logoUrl)}" onerror="this.style.display='none'">` : `<div class="pred-cmpct-logo" style="display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700">${esc((tH.name||'?')[0])}</div>`;
  const aLogo = tA.logoUrl ? `<img class="pred-cmpct-logo" src="${esc(tA.logoUrl)}" onerror="this.style.display='none'">` : `<div class="pred-cmpct-logo" style="display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700">${esc((tA.name||'?')[0])}</div>`;
  const ptsBadge = !correct
    ? `<span class="pred-cmpct-pts ko">0pt</span>`
    : exact
      ? `<span class="pred-cmpct-pts exact">+${pts}pts★</span>`
      : `<span class="pred-cmpct-pts ok">+${pts}pt${pts>1?'s':''}</span>`;
  return `
    <div class="pred-cmpct${!correct?' pred-wrong':''}">
      <span class="pred-cmpct-ico">${correct?'✅':'❌'}</span>
      ${hLogo}
      <span class="pred-cmpct-name${homeWon?' won':awayWon?' lost':''}">${esc(tH.name)}</span>
      <span class="pred-cmpct-score">${m.homeScore||0}–${m.awayScore||0}</span>
      <span class="pred-cmpct-name${awayWon?' won':homeWon?' lost':''}" style="text-align:right">${esc(tA.name)}</span>
      ${aLogo}
      ${ptsBadge}
    </div>`;
}

function renderPredLeaderboard() {
  const playedMatches = Object.values(state.matchesMap).filter(m => m.status === 'played');
  const rkCls = i => i===0?'pred-lb-rk1':i===1?'pred-lb-rk2':i===2?'pred-lb-rk3':'pred-lb-rkn';
  const rkIcon = i => i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}`;

  // Index des joueurs RL par uid — les joueurs qui votent n'ont pas forcément
  // de doc dans rl_predictors (créé uniquement pour les spectateurs purs),
  // donc on utilise leur pseudo RL comme fallback pour l'affichage.
  const playersByUid = {};
  Object.values(state.playersMap || {}).forEach(pl => {
    if (pl.userId) playersByUid[pl.userId] = pl;
  });

  const entries = Object.values(state.predictorsMap)
    .map(p => {
      const pl = playersByUid[p.id];
      const displayName = p.discordUsername || pl?.pseudoRL || pl?.pseudoDiscord || null;
      const displayAvatar = p.discordAvatar || pl?.discordAvatar || pl?.photoUrl || null;
      return { ...p, _displayName: displayName, _displayAvatar: displayAvatar };
    })
    .filter(p => p._displayName) // ignorer ceux qu'on ne peut pas afficher
    .map(p => {
      const votes = p.votes || {};
      const jbets = p.jbets || {};
      let pts = 0, voted = 0, correct = 0, exact = 0;
      playedMatches.forEach(m => {
        if (!votes[m.id]) return;
        voted++;
        const jbet = jbets[m.id] || null;
        const pp = calcPredPoints(votes[m.id], m, jbet);
        pts += pp;
        if (pp >= 1) correct++;
        // exact = score prédit correct (base sans mise = 3, avec mise base+2)
        const sc = _vScore(votes[m.id]);
        if (sc && pp > 0) {
          const [hs, asc] = sc.split('-').map(Number);
          if (hs === (m.homeScore||0) && asc === (m.awayScore||0)) exact++;
        }
      });
      return { p, pts, voted, correct, exact };
    })
    .filter(e => e.voted >= 1)
    .sort((a,b) => b.pts-a.pts || b.correct-a.correct);

  const rows = entries.slice(0,15).map((e,i) => {
    const name = e.p._displayName;
    const avatar = e.p._displayAvatar;
    const isMe = state.curUser && e.p.id === state.curUser.uid;
    const av = avatar
      ? `<img class="pred-lb-av" src="${esc(avatar)}" onerror="this.src='';">`
      : `<div class="pred-lb-av-ph">${esc((name[0]||'?').toUpperCase())}</div>`;
    const ptsColor = e.pts>=10?'#0c8':e.pts>=5?'#f59e0b':'var(--text)';
    return `<div class="pred-lb-row${isMe?' pred-lb-me':''}">
      <div class="pred-lb-rank ${rkCls(i)}">${rkIcon(i)}</div>
      ${av}
      <div class="pred-lb-name${isMe?' me':''}">${esc(name)}${isMe?` <span style="font-size:.65rem;color:var(--text3)">(vous)</span>`:''}</div>
      <div class="pred-lb-score" style="color:var(--text2)">${e.correct}/${e.voted}</div>
      <div class="pred-lb-score" style="color:#FFB800;font-weight:700">${e.exact > 0 ? `${e.exact}★` : '–'}</div>
      <div class="pred-lb-pct" style="color:${ptsColor};font-size:.9rem">${e.pts} pts</div>
    </div>`;
  }).join('');

  return `<div class="pred-lb" style="margin-bottom:24px">
    <div class="pred-lb-hdr">
      <div class="pred-lb-title">Classement des prédicteurs</div>
      <div style="font-size:.6rem;color:var(--text3)">Vainqueur=1pt (×mise si pari) · Score exact=+2pts &nbsp;·&nbsp; ${entries.length} participant${entries.length!==1?'s':''}</div>
    </div>
    ${rows || `<div class="pred-lb-empty">Les classements apparaîtront après les premiers matchs joués.</div>`}
  </div>`;
}

function _rulesBox() {
  return `<div class="pred-rules-box">
    <div class="pred-rule-item"><span class="pred-rule-icon">🎯</span><div class="pred-rule-text"><strong>Pronostique</strong>Clique sur un match → choisis l'équipe gagnante + score BO7 (optionnel)</div></div>
    <div class="pred-rule-item"><span class="pred-rule-icon">🔒</span><div class="pred-rule-text"><strong>Définitif</strong>Le vote est verrouillé dès confirmation — aucune modification possible</div></div>
    <div class="pred-rule-item"><span class="pred-rule-icon">⏱</span><div class="pred-rule-text"><strong>Deadline</strong>Votes fermés 15 min avant le coup d'envoi</div></div>
    <div class="pred-rule-item"><span class="pred-rule-icon">🏆</span><div class="pred-rule-text"><strong>Points</strong>Bon vainqueur = <b>1pt</b> · +2pts si score exact · Mise jetons : floor(mise × cote) pts</div></div>
    <div class="pred-rule-item"><span class="pred-rule-icon">🪙</span><div class="pred-rule-text"><strong>Jetons</strong><b>${JETONS_PER_WEEK} jetons</b>/semaine (reset vendredi). Mise × cote = pts si correct (remplace le 1pt de base)</div></div>
    <div class="pred-rule-item"><span class="pred-rule-icon">📊</span><div class="pred-rule-text"><strong>Cotes</strong>Calculées sur le classement + les 5 derniers matchs de chaque équipe</div></div>
  </div>`;
}

function renderPredictions() {
  const el = document.getElementById('pred-content');
  if (!el) return;
  const now = new Date();
  const myVotes = state.predictorsMap[state.curUser?.uid]?.votes || {};

  // Matchs à venir (scheduledAt dans le futur, non joués)
  const upcoming = Object.values(state.matchesMap)
    .filter(m => m.homeTeamId && m.awayTeamId && m.scheduledAt && m.status !== 'played' && new Date(m.scheduledAt) > now)
    .sort((a,b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  // Mes votes en attente : matchs non joués sur lesquels j'ai déjà voté
  const myPending = Object.values(state.matchesMap)
    .filter(m => m.status !== 'played' && m.scheduledAt && myVotes[m.id])
    .sort((a,b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  // Mes résultats : matchs joués sur lesquels j'ai voté
  const myPlayed = Object.values(state.matchesMap)
    .filter(m => m.status === 'played' && m.scheduledAt && myVotes[m.id])
    .sort((a,b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));

  let html = _rulesBox();
  html += renderPredLeaderboard();

  // Solde jetons
  if (state.curUser) {
    const myPred = state.predictorsMap[state.curUser.uid] || {};
    const jetons = myPred.jetons ?? JETONS_PER_WEEK;
    html += `<div class="jeton-bar">
      <span class="jeton-icon">🪙</span>
      <div class="jeton-balance">
        <div class="jeton-balance-val">${jetons} jetons disponibles</div>
        <div class="jeton-balance-lbl">Reset ${nextFridayStr()}</div>
      </div>
    </div>`;
  }

  // Section À voter
  html += `<div class="pred-sec-title">À voter <span class="pred-sec-cnt">${upcoming.length} match${upcoming.length!==1?'s':''}</span></div>`;
  if (!upcoming.length) {
    html += `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:20px;text-align:center;color:var(--text2);font-size:.85rem;margin-bottom:20px">Aucun match programmé à venir.</div>`;
  } else {
    // Grouper par date
    const byDate = {};
    upcoming.forEach(m => {
      const d = new Date(m.scheduledAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!byDate[key]) byDate[key] = { label: _predDateLabel(d), matches: [] };
      byDate[key].matches.push(m);
    });
    Object.values(byDate).forEach(({ label, matches }) => {
      html += `<div class="pred-date-sep"><span class="pred-date-lbl">${label}</span><span class="pred-week-cnt">${matches.length} match${matches.length>1?'s':''}</span></div>`;
      html += `<div class="pred-cards-grid">${matches.map(m => renderPredictionCard(m)).join('')}</div>`;
    });
  }

  // Section Mes votes en attente
  if (state.curUser && myPending.length) {
    html += `<div class="pred-sec-title" style="margin-top:24px">Mes votes en attente <span class="pred-sec-cnt">${myPending.length} match${myPending.length!==1?'s':''}</span></div>`;
    html += `<div class="pred-played-list">${myPending.map(m => renderPendingPredRow(m, myVotes[m.id])).join('')}</div>`;
  }

  // Section Mes résultats
  if (state.curUser && myPlayed.length) {
    const correct = myPlayed.filter(m => calcPredPoints(myVotes[m.id], m) >= 1).length;
    html += `<div class="pred-sec-title" style="margin-top:24px">Mes résultats <span class="pred-sec-cnt">${correct}/${myPlayed.length} correctes</span></div>`;
    html += `<div class="pred-played-list">${myPlayed.map(m => renderPlayedPredRow(m, myVotes[m.id])).join('')}</div>`;
  }

  el.innerHTML = html;
}

// État temporaire du modal de vote
let _voteState = {};

window.openVoteModal = function(matchId) {
  if (!state.curUser) { toast('Connexion requise', 'err'); return; }
  const m = state.matchesMap[matchId];
  if (!m) return;
  const scheduled = m.scheduledAt ? new Date(m.scheduledAt) : null;
  const lockTime = scheduled ? new Date(scheduled.getTime() - 15*60*1000) : null;
  if (lockTime && new Date() >= lockTime) { toast('Votes fermés', 'err'); return; }

  const tH = state.teamsMap[m.homeTeamId] || {name:'?'};
  const tA = state.teamsMap[m.awayTeamId] || {name:'?'};
  const cotes = calcMatchCotes(m.homeTeamId, m.awayTeamId);
  const myJetons = state.predictorsMap[state.curUser.uid]?.jetons ?? JETONS_PER_WEEK;

  if (!isMatchOpenForPredictions(m)) {
    const { start } = getCurrentWeekWindow();
    const nextOpen = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const dateStr = nextOpen.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    toast(`Pronostics ouverts à partir du ${dateStr}`, 'err');
    return;
  }

  _voteState = { matchId, cotes, myJetons, winner: null, scoreH: null, betAmount: 0 };

  document.getElementById('mo-vote-pred-title').textContent = `${tH.name} vs ${tA.name}`;

  const _logo = t => t.logoUrl
    ? `<img class="vote-modal-team-logo" src="${esc(t.logoUrl)}" onerror="this.style.display='none'">`
    : `<div class="vote-modal-team-logo-ph">${esc((t.name||'?')[0])}</div>`;

  // Toutes les chips visibles dès l'ouverture, groupées par équipe
  const hScores = ['4-0','4-1','4-2','4-3'];
  const aScores = ['0-4','1-4','2-4','3-4'];
  const hChips = hScores.map(s => `<button class="pred-score-chip vm-chip" id="vm-sc-${s.replace('-','_')}" onclick="_voteChip('home','${s}')">${s}</button>`).join('');
  const aChips = aScores.map(s => `<button class="pred-score-chip vm-chip" id="vm-sc-${s.replace('-','_')}" onclick="_voteChip('away','${s}')">${s}</button>`).join('');

  document.getElementById('mo-vote-pred-body').innerHTML = `
    <div class="vote-modal-teams">
      <button class="vote-modal-team" id="vm-btn-home" onclick="_voteSelectWinner('home')">
        ${_logo(tH)}
        <div class="vote-modal-team-name">${esc(tH.name)}</div>
        <div class="vote-modal-team-cote">×${cotes.home}</div>
      </button>
      <div class="vote-modal-vs">VS</div>
      <button class="vote-modal-team" id="vm-btn-away" onclick="_voteSelectWinner('away')">
        ${_logo(tA)}
        <div class="vote-modal-team-name">${esc(tA.name)}</div>
        <div class="vote-modal-team-cote">×${cotes.away}</div>
      </button>
    </div>

    <div class="vote-modal-section">
      <div class="vote-modal-section-title">Score BO7 — optionnel <span style="color:#FFB800;font-weight:700">(+2pts si exact)</span></div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-size:.6rem;color:var(--text3);margin-bottom:4px">${esc(tH.name)} gagne</div>
          <div class="vote-modal-chips">${hChips}</div>
        </div>
        <div>
          <div style="font-size:.6rem;color:var(--text3);margin-bottom:4px">${esc(tA.name)} gagne</div>
          <div class="vote-modal-chips">${aChips}</div>
        </div>
      </div>
    </div>

    ${myJetons > 0 ? `
    <div class="vote-modal-section">
      <div class="vote-modal-section-title">Miser des jetons — optionnel <span style="font-size:.6rem;color:var(--text3)">(mise × cote = pts si correct)</span></div>
      <div style="font-size:.72rem;color:var(--text2);margin-bottom:8px">Solde : <b style="color:#FFB800">${myJetons} 🪙</b></div>
      <div class="bet-row">
        <input type="range" class="bet-slider" id="vm-bet-slider" min="0" max="${myJetons}" value="0" step="1" oninput="_voteUpdateBet(this.value)">
        <span class="bet-display" id="vm-bet-display">Pas de mise</span>
      </div>
    </div>` : ''}

    <button class="vote-modal-confirm" id="vm-confirm-btn" disabled onclick="confirmVotePred('${matchId}')">
      Choisis une équipe pour confirmer
    </button>
  `;

  // Sélectionner une équipe (clic sur bouton équipe — pas de score)
  window._voteSelectWinner = function(side) {
    _voteState.winner = side;
    _voteState.scoreH = null;
    document.querySelectorAll('.vm-chip').forEach(b => b.classList.remove('active'));
    _updateConfirmBtn(tH, tA, cotes);
  };

  // Clic sur un chip de score → sélectionne aussi l'équipe gagnante
  window._voteChip = function(side, score) {
    if (_voteState.scoreH === score && _voteState.winner === side) {
      // Toggle off
      _voteState.scoreH = null;
      document.getElementById('vm-sc-' + score.replace('-','_'))?.classList.remove('active');
    } else {
      _voteState.winner = side;
      _voteState.scoreH = score;
      document.querySelectorAll('.vm-chip').forEach(b => b.classList.remove('active'));
      document.getElementById('vm-sc-' + score.replace('-','_'))?.classList.add('active');
    }
    _updateConfirmBtn(tH, tA, cotes);
  };

  function _updateConfirmBtn(tH, tA, cotes) {
    const { winner, scoreH, betAmount } = _voteState;
    const btn = document.getElementById('vm-confirm-btn');
    const hBtn = document.getElementById('vm-btn-home');
    const aBtn = document.getElementById('vm-btn-away');
    if (!winner) { btn.disabled = true; btn.textContent = 'Choisis une équipe pour confirmer'; return; }
    hBtn?.classList.toggle('selected', winner === 'home');
    aBtn?.classList.toggle('selected', winner === 'away');
    const cote = winner === 'home' ? cotes.home : cotes.away;
    const team = winner === 'home' ? tH.name : tA.name;
    const scoreTxt = scoreH ? ` · ${scoreH}` : '';
    const betTxt = betAmount > 0 ? ` · ${betAmount}🪙` : '';
    btn.disabled = false;
    btn.textContent = `🔒 ${esc(team)}${scoreTxt}${betTxt} (×${cote}) — Confirmer`;
  }

  window._voteUpdateBet = function(val) {
    _voteState.betAmount = parseInt(val) || 0;
    const { betAmount, winner } = _voteState;
    const cote = winner === 'home' ? cotes.home : cotes.away;
    const potPts = betAmount > 0 ? Math.floor(betAmount * cote) : 0;
    const el = document.getElementById('vm-bet-display');
    if (el) el.innerHTML = betAmount > 0 ? `${betAmount} 🪙 → <b style="color:#0c8">${potPts} pts</b> potentiels` : 'Pas de mise';
    _updateConfirmBtn(tH, tA, cotes);
  };

  openModal('mo-vote-pred');
};

window.confirmVotePred = async function(matchId) {
  if (!state.curUser) return;
  const { winner, scoreH, betAmount, cotes } = _voteState;
  const score = scoreH;
  if (!winner) { toast('Choisis une équipe', 'err'); return; }

  const uid = state.curUser.uid;
  const currentVotes = { ...(state.predictorsMap[uid]?.votes || {}) };
  if (_vWinner(currentVotes[matchId])) { toast('Tu as déjà voté pour ce match', 'err'); return; }

  const voteData = { winner, ...(score ? { score } : {}) };
  currentVotes[matchId] = voteData;

  const updates = { votes: currentVotes };

  // Mise de jetons
  if (betAmount > 0) {
    const cote = winner === 'home' ? cotes.home : cotes.away;
    const currentJbets = { ...(state.predictorsMap[uid]?.jbets || {}) };
    currentJbets[matchId] = { side: winner, amount: betAmount, cote, status: 'pending' };
    updates.jbets = currentJbets;
    const newJetons = Math.max(0, (state.predictorsMap[uid]?.jetons ?? JETONS_PER_WEEK) - betAmount);
    updates.jetons = newJetons;
  }

  try {
    await setDoc(_predSeasonRef(uid), updates, { merge: true });
    if (!state.predictorsMap[uid]) state.predictorsMap[uid] = { id: uid };
    Object.assign(state.predictorsMap[uid], updates);
    closeModal('mo-vote-pred');
    toast(`Pronostic enregistré${betAmount > 0 ? ` · ${betAmount} 🪙 misés` : ''} 🔒`, 'ok');
    renderPredictions();
  } catch(e) { toast('Erreur lors du vote', 'err'); console.error(e); }
};

window.votePrediction = async function(matchId, side) {
  if (!state.curUser) { toast('Connectez-vous pour voter', 'err'); return; }
  const m = state.matchesMap[matchId];
  if (!m) return;
  const scheduled = m.scheduledAt ? new Date(m.scheduledAt) : null;
  const lockTime = scheduled ? new Date(scheduled.getTime() - 15*60*1000) : null;
  if (lockTime && new Date() >= lockTime) { toast('Les votes sont fermés (15 min avant le match)', 'err'); return; }
  if (m.status === 'played') { toast('Ce match est terminé', 'err'); return; }

  const uid = state.curUser.uid;
  const currentVotes = { ...(state.predictorsMap[uid]?.votes || {}) };
  // Bloquer si already voted (pas de changement de vainqueur)
  if (_vWinner(currentVotes[matchId])) { toast('Tu as déjà voté pour ce match', 'err'); return; }
  currentVotes[matchId] = { winner: side };

  try {
    await setDoc(_predSeasonRef(uid), { votes: currentVotes }, { merge: true });
    if (!state.predictorsMap[uid]) state.predictorsMap[uid] = { id: uid };
    state.predictorsMap[uid].votes = currentVotes;
    renderPredictions();
    renderPredictorBanner();
  } catch(e) { toast('Erreur lors du vote', 'err'); console.error(e); }
};

window.votePredictionScore = async function(matchId, score) {
  if (!state.curUser) return;
  const m = state.matchesMap[matchId];
  if (!m) return;
  const scheduled = m.scheduledAt ? new Date(m.scheduledAt) : null;
  const lockTime = scheduled ? new Date(scheduled.getTime() - 15*60*1000) : null;
  if (lockTime && new Date() >= lockTime) { toast('Les votes sont fermés', 'err'); return; }

  const uid = state.curUser.uid;
  const currentVotes = { ...(state.predictorsMap[uid]?.votes || {}) };
  const existing = currentVotes[matchId];
  if (!_vWinner(existing)) { toast('Vote le vainqueur d\'abord', 'err'); return; }

  // Toggle : re-cliquer le même score = le retirer
  const newScore = _vScore(existing) === score ? null : score;
  currentVotes[matchId] = { winner: _vWinner(existing), ...(newScore ? {score: newScore} : {}) };

  try {
    await setDoc(_predSeasonRef(uid), { votes: currentVotes }, { merge: true });
    state.predictorsMap[uid].votes = currentVotes;
    renderPredictions();
  } catch(e) { toast('Erreur lors du vote', 'err'); console.error(e); }
};
