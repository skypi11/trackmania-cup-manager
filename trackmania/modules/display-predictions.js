// modules/display-predictions.js — Prédictions

import { db } from '../../shared/firebase-config.js';
import { state } from './state.js';
import { t } from '../../shared/i18n.js';
import { pName, dateLang, avatarHtml, getCountdown } from './utils.js';
import tm2020Bg from '../../assets/trackmania2020.webp';
import { updateDoc, doc, addDoc, collection, getDoc, deleteDoc } from 'firebase/firestore';

// Récupère l'image de la dernière map dispo de l'édition (map7 → map1)
function getEditionMapInfo(e) {
    for (let n = 7; n >= 1; n--) {
        if (e[`map${n}thumbUrl`]) {
            return { thumb: e[`map${n}thumbUrl`], name: e[`map${n}name`] || null, mapper: e[`map${n}mapper`] || null };
        }
    }
    return null;
}

// ── Tier system : palier de progression basé sur les pts cumulés ──────────────
// Bronze 0-9 · Silver 10-29 · Gold 30-59 · Platinum 60-99 · Diamond 100+
const TIERS = [
    { key: 'diamond',  min: 100, label: 'Diamond',  color: '#a78bfa', glow: 'rgba(167,139,250,0.45)', icon: '💎' },
    { key: 'platinum', min: 60,  label: 'Platinum', color: '#22d3ee', glow: 'rgba(34,211,238,0.45)',  icon: '🏆' },
    { key: 'gold',     min: 30,  label: 'Gold',     color: '#fbbf24', glow: 'rgba(251,191,36,0.45)',  icon: '🥇' },
    { key: 'silver',   min: 10,  label: 'Silver',   color: '#94a3b8', glow: 'rgba(148,163,184,0.45)', icon: '🥈' },
    { key: 'bronze',   min: 0,   label: 'Bronze',   color: '#cd7c3a', glow: 'rgba(205,124,58,0.45)',  icon: '🥉' },
];

function getTier(pts) {
    return TIERS.find(t => pts >= t.min) || TIERS[TIERS.length - 1];
}

function getNextTier(pts) {
    // Le tier supérieur immédiat (null si déjà Diamond)
    const sorted = [...TIERS].sort((a, b) => a.min - b.min);
    return sorted.find(t => t.min > pts) || null;
}

// ── Stats personnelles d'un joueur (pour la stat bar) ─────────────────────────
function getMyPredStats() {
    if (!state.currentUser) return null;
    const me = state.data.participants.find(p => p.userId === state.currentUser.uid);
    if (!me) return null;

    const myPreds = state.data.predictions.filter(p => p.playerId === me.id && p.scored);
    const totalPts = myPreds.reduce((s, p) => s + (p.score || 0), 0);
    const bestScore = myPreds.length > 0 ? Math.max(...myPreds.map(p => p.score || 0)) : 0;
    const cupsPredicted = myPreds.length;

    // Précision podium = (top3 picks corrects ou partiels) / (top3 picks émis)
    let top3Total = 0, top3Hits = 0;
    myPreds.forEach(pred => {
        const finaleRes = state.data.results.filter(r => r.editionId === pred.editionId && r.phase === 'finale');
        const realTop3 = [1,2,3].map(pos => finaleRes.find(r => r.position === pos)?.playerId ?? null);
        const realPodiumSet = new Set(realTop3.filter(Boolean));
        (pred.top3 || []).forEach((pid, i) => {
            if (!pid) return;
            top3Total++;
            if (realTop3[i] === pid || realPodiumSet.has(pid)) top3Hits++;
        });
    });
    const podiumAccuracy = top3Total > 0 ? Math.round(top3Hits / top3Total * 100) : 0;

    // Calcul du rang au classement global
    const allTotals = {};
    state.data.predictions.filter(p => p.scored).forEach(pred => {
        if (!allTotals[pred.playerId]) allTotals[pred.playerId] = 0;
        allTotals[pred.playerId] += pred.score || 0;
    });
    const ranked = Object.entries(allTotals).sort((a, b) => b[1] - a[1]);
    const rankIdx = ranked.findIndex(([id]) => id === me.id);
    const rank = rankIdx >= 0 ? rankIdx + 1 : null;
    const totalPredictors = ranked.length;

    const tier = getTier(totalPts);
    const nextTier = getNextTier(totalPts);
    const ptsToNext = nextTier ? nextTier.min - totalPts : 0;

    return { me, totalPts, bestScore, cupsPredicted, podiumAccuracy, rank, totalPredictors, tier, nextTier, ptsToNext };
}

// Stats agrégées d'un autre joueur (pour le hall of fame / classement)
function getPlayerStats(playerId) {
    const preds = state.data.predictions.filter(p => p.playerId === playerId && p.scored);
    const totalPts = preds.reduce((s, p) => s + (p.score || 0), 0);
    const bestScore = preds.length > 0 ? Math.max(...preds.map(p => p.score || 0)) : 0;
    const cupsPredicted = preds.length;
    const tier = getTier(totalPts);
    return { totalPts, bestScore, cupsPredicted, tier };
}

// ── Carte "Dernier résultat" comparative (toi vs best) ──────────────────────

function lastResultCardHtml() {
    // Dernière édition terminée avec au moins une prédiction calculée
    const candidates = state.data.editions
        .filter(e => e.status === 'terminee')
        .filter(e => state.data.predictions.some(p => p.editionId === e.id && p.scored))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (candidates.length === 0) return '';

    const lastEd = candidates[0];
    const preds = state.data.predictions.filter(p => p.editionId === lastEd.id && p.scored);
    if (preds.length === 0) return '';

    // Best score (peut y avoir égalité — on prend le premier)
    const sorted = [...preds].sort((a, b) => (b.score || 0) - (a.score || 0));
    const best = sorted[0];
    const bestPlayer = state.data.participants.find(p => p.id === best.playerId);

    // Mon score
    const myPart = state.currentUser ? state.data.participants.find(p => p.userId === state.currentUser.uid) : null;
    const myPred = myPart ? preds.find(p => p.playerId === myPart.id) : null;
    const myRank = myPred ? sorted.findIndex(p => p.id === myPred.id) + 1 : null;

    // Background : map de la finale (toujours révélée pour une cup terminée)
    const mapInfo = getEditionMapInfo(lastEd);
    const bg = mapInfo?.thumb || '';

    const dateStr = lastEd.date ? new Date(lastEd.date).toLocaleDateString(dateLang(), { day: 'numeric', month: 'long' }) : '';

    // Carte BEST
    const bestCard = `<div class="pred-last-card best">
        <div class="pred-last-card-label">🏆 ${t('predictions.last.best')}</div>
        <div class="pred-last-card-row">
            ${bestPlayer ? avatarHtml(bestPlayer, { size: 36 }) : ''}
            <span class="pred-last-card-name">${bestPlayer ? pName(bestPlayer) : '?'}</span>
            <span class="pred-last-card-pts">${best.score}</span>
        </div>
        <div class="pred-last-card-detail">#1 / ${preds.length} prédicteurs</div>
    </div>`;

    // Carte YOU
    let youCard;
    if (myPred && myPart) {
        youCard = `<div class="pred-last-card you">
            <div class="pred-last-card-label">⭐ ${t('predictions.last.you')}</div>
            <div class="pred-last-card-row">
                ${avatarHtml(myPart, { size: 36 })}
                <span class="pred-last-card-name">${pName(myPart)}</span>
                <span class="pred-last-card-pts">${myPred.score}</span>
            </div>
            <div class="pred-last-card-detail">#${myRank} / ${preds.length} prédicteurs</div>
        </div>`;
    } else if (myPart) {
        youCard = `<div class="pred-last-card you">
            <div class="pred-last-card-label">⭐ ${t('predictions.last.you')}</div>
            <div class="pred-last-card-row">
                ${avatarHtml(myPart, { size: 36 })}
                <span class="pred-last-card-name">${pName(myPart)}</span>
            </div>
            <div class="pred-last-card-detail pred-last-empty">${t('predictions.last.no.score')}</div>
        </div>`;
    } else {
        // Pas connecté ou pas inscrit : on affiche le 2ème meilleur à la place
        const second = sorted[1];
        if (second) {
            const secondPlayer = state.data.participants.find(p => p.id === second.playerId);
            youCard = `<div class="pred-last-card">
                <div class="pred-last-card-label">🥈 #2</div>
                <div class="pred-last-card-row">
                    ${secondPlayer ? avatarHtml(secondPlayer, { size: 36 }) : ''}
                    <span class="pred-last-card-name">${secondPlayer ? pName(secondPlayer) : '?'}</span>
                    <span class="pred-last-card-pts" style="color:rgba(255,255,255,0.7)">${second.score}</span>
                </div>
                <div class="pred-last-card-detail">${preds.length} prédicteurs au total</div>
            </div>`;
        } else {
            return '';
        }
    }

    return `<div class="pred-last-result" onclick="openEditionDetail('${lastEd.id}')" style="cursor:pointer">
        ${bg ? `<div class="pred-last-bg" style="background-image:url('${bg}')"></div>` : ''}
        <div class="pred-last-overlay"></div>
        <div class="pred-last-content">
            <div class="pred-last-header">
                <div>
                    <div class="pred-last-label">📊 ${t('predictions.last.title')} · ${dateStr}</div>
                    <div class="pred-last-name">${lastEd.name}</div>
                </div>
                <button class="pred-last-cta" onclick="event.stopPropagation();openEditionDetail('${lastEd.id}')">${t('predictions.last.see.detail')} →</button>
            </div>
            <div class="pred-last-cards">
                ${youCard}
                ${bestCard}
            </div>
        </div>
    </div>`;
}

// ── Sparkline : courbe SVG des scores du joueur sur les cups passées ─────────

function sparklineHtml() {
    if (!state.currentUser) return '';
    const myPart = state.data.participants.find(p => p.userId === state.currentUser.uid);
    if (!myPart) return '';

    // Cups terminées triées chronologiquement, score = 0 si non prédit
    const eds = state.data.editions
        .filter(e => e.status === 'terminee')
        .filter(e => state.data.predictions.some(p => p.editionId === e.id && p.scored))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (eds.length === 0) return '';

    const myPreds = state.data.predictions.filter(p => p.playerId === myPart.id && p.scored);
    const points = eds.map(e => {
        const pred = myPreds.find(p => p.editionId === e.id);
        return { ed: e, score: pred?.score ?? 0, hasPred: !!pred };
    });

    if (points.every(p => !p.hasPred)) return '';

    const W = 600, H = 80, padX = 8, padY = 12;
    const maxScore = Math.max(19, ...points.map(p => p.score));
    const minX = padX, maxX = W - padX;
    const minY = padY, maxY = H - padY;
    const stepX = points.length > 1 ? (maxX - minX) / (points.length - 1) : 0;
    const yFor = (s) => maxY - (s / maxScore) * (maxY - minY);

    const coords = points.map((p, i) => ({ x: minX + i * stepX, y: yFor(p.score), score: p.score, hasPred: p.hasPred }));

    // Path lissé via courbes de Bézier simples
    let path = '';
    coords.forEach((c, i) => {
        if (i === 0) path += `M ${c.x.toFixed(1)} ${c.y.toFixed(1)}`;
        else {
            const prev = coords[i - 1];
            const cx = (prev.x + c.x) / 2;
            path += ` Q ${cx.toFixed(1)} ${prev.y.toFixed(1)} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`;
        }
    });
    const fillPath = `${path} L ${coords[coords.length - 1].x.toFixed(1)} ${maxY} L ${coords[0].x.toFixed(1)} ${maxY} Z`;

    const totalPts = points.reduce((s, p) => s + p.score, 0);
    const bestPt = Math.max(...points.map(p => p.score));
    const cupCount = points.filter(p => p.hasPred).length;

    return `<div class="pred-sparkline">
        <div class="pred-sparkline-header">
            <div class="pred-sparkline-title">📈 ${t('predictions.progress.title')}</div>
            <div class="pred-sparkline-stats">
                <span><b>${totalPts}</b> pts</span>
                <span><b>${bestPt}</b> meilleure</span>
                <span><b>${cupCount}</b> cups</span>
            </div>
        </div>
        <svg class="pred-sparkline-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
            <defs>
                <linearGradient id="pred-spark-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#00D936" stop-opacity="0.35"/>
                    <stop offset="100%" stop-color="#00D936" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <path d="${fillPath}" fill="url(#pred-spark-fill)"/>
            <path d="${path}" fill="none" stroke="#00D936" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            ${coords.map((c, i) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${c.score === bestPt && c.hasPred ? 4 : 3}" fill="${c.score === bestPt && c.hasPred ? '#fbbf24' : '#00D936'}" stroke="#0f0f0f" stroke-width="1.5"><title>${points[i].ed.name} : ${c.score} pt${c.score !== 1 ? 's' : ''}</title></circle>`).join('')}
        </svg>
    </div>`;
}

// Scroll vers le formulaire de prédiction (depuis le bouton CTA du hero)
window.scrollToPredForm = function(edId) {
    const el = document.getElementById(`pred-form-${edId}`) || document.getElementById(`pred-card-${edId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
window.scrollToPredHof = function() {
    document.getElementById('pred-hof')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ── Dashboard perso : stat bar tier + 4 cards + progression ──────────────────

function statBarHtml() {
    const stats = getMyPredStats();

    // Cas non connecté
    if (!state.currentUser) {
        return `<div class="pred-dashboard tier-bronze">
            <div class="pred-dash-empty">${t('predictions.dash.guest')}</div>
        </div>`;
    }
    // Cas connecté mais pas inscrit comme participant
    if (!stats) {
        return `<div class="pred-dashboard tier-bronze">
            <div class="pred-dash-empty">${t('predictions.dash.no.cup')}</div>
        </div>`;
    }

    const { me, totalPts, bestScore, cupsPredicted, podiumAccuracy, rank, totalPredictors, tier, nextTier, ptsToNext } = stats;
    const rankLine = rank
        ? `${t('predictions.dash.rank')} <b>#${rank}</b> / ${totalPredictors}`
        : t('predictions.dash.no.preds');

    // Barre de progression vers le tier suivant
    let progressHtml = '';
    if (nextTier) {
        const span = nextTier.min - tier.min;
        const within = totalPts - tier.min;
        const pct = Math.min(100, Math.max(0, Math.round(within / span * 100)));
        progressHtml = `<div class="pred-dash-progress" style="--tier-color:${tier.color}">
            <div class="pred-dash-progress-bar"><div class="pred-dash-progress-fill" style="width:${pct}%"></div></div>
            <div class="pred-dash-progress-label">${t('predictions.dash.next.tier').replace('{n}', ptsToNext).replace('{tier}', `<b>${nextTier.icon} ${nextTier.label}</b>`)}</div>
        </div>`;
    } else {
        progressHtml = `<div class="pred-dash-progress" style="--tier-color:${tier.color}">
            <div class="pred-dash-progress-label" style="text-align:center;width:100%">${t('predictions.dash.diamond.max')}</div>
        </div>`;
    }

    const tierTooltip = t('predictions.tiers.tooltip').replace('{tier}', tier.label).replace('{pts}', totalPts);
    return `<div class="pred-dashboard tier-${tier.key}" style="--tier-color:${tier.color};--tier-glow:${tier.glow}">
        <div class="pred-dash-row">
            <div class="pred-dash-tier tier-${tier.key}" title="${tierTooltip}" style="cursor:help">
                <span class="pred-dash-tier-icon">${tier.icon}</span>
                <span>${tier.label}</span>
            </div>
            <div class="pred-dash-identity">
                <div class="pred-dash-name">${pName(me)}</div>
                <div class="pred-dash-rank">${rankLine}</div>
            </div>
            ${avatarHtml(me, { size: 48 })}
        </div>
        <div class="pred-dash-cards">
            <div class="pred-dash-card highlight">
                <div class="pred-dash-card-label">${t('predictions.dash.pts')}</div>
                <div class="pred-dash-card-value">${totalPts}</div>
            </div>
            <div class="pred-dash-card">
                <div class="pred-dash-card-label">${t('predictions.dash.best')}</div>
                <div class="pred-dash-card-value">${bestScore}<span class="pred-dash-card-suffix">pts</span></div>
            </div>
            <div class="pred-dash-card">
                <div class="pred-dash-card-label">${t('predictions.dash.cups')}</div>
                <div class="pred-dash-card-value">${cupsPredicted}</div>
            </div>
            <div class="pred-dash-card">
                <div class="pred-dash-card-label">${t('predictions.dash.accuracy')}</div>
                <div class="pred-dash-card-value">${podiumAccuracy}<span class="pred-dash-card-suffix">%</span></div>
            </div>
        </div>
        ${progressHtml}
    </div>`;
}

const cupId = new URLSearchParams(window.location.search).get('cup') || 'monthly';

// Limite dure du nombre de finalistes qu'un utilisateur peut pronostiquer.
// Évite que les gens cochent tout le monde par flemme.
const PRED_MAX_FINALISTS = 10;

// ── Handlers interactifs ──────────────────────────────────────────────────────

window.togglePredFinalist = function(edId, playerId) {
    if (!state.predState[edId]) state.predState[edId] = { finalists: new Set(), top3: [null,null,null] };
    const s = state.predState[edId];
    if (s.finalists.has(playerId)) {
        s.finalists.delete(playerId);
        s.top3 = s.top3.map(p => p === playerId ? null : p);
    } else {
        // Bloque l'ajout au-delà de la limite
        if (s.finalists.size >= PRED_MAX_FINALISTS) return;
        s.finalists.add(playerId);
    }
    renderPredForm(edId);
};

window.setPredTop = function(edId, rank, playerId) {
    if (!state.predState[edId]) state.predState[edId] = { finalists: new Set(), top3: [null,null,null] };
    const s = state.predState[edId];
    s.top3 = s.top3.map((p, i) => (p === playerId && i !== rank - 1) ? null : p);
    s.top3[rank - 1] = s.top3[rank - 1] === playerId ? null : playerId;
    renderPredForm(edId);
};

window.filterPredSearch = function(edId) {
    const input = document.getElementById(`pred-search-${edId}`);
    if (!input) return;
    const query = input.value.toLowerCase();
    document.getElementById(`pred-grid-${edId}`)?.querySelectorAll('.pred-player-chip').forEach(chip => {
        chip.style.display = (chip.dataset.name || '').toLowerCase().includes(query) ? '' : 'none';
    });
};

window.submitPrediction = async function(edId) {
    if (!state.currentUser) { alert(t('predictions.login')); return; }
    const freshSnap = await getDoc(doc(db, 'editions', edId));
    const freshStatus = freshSnap.exists() ? freshSnap.data().status : null;
    if (freshStatus === 'en_cours' || freshStatus === 'terminee') { alert('Les prédictions sont fermées pour cette édition.'); return; }
    const s = state.predState[edId];
    if (!s || s.finalists.size === 0) { alert(t('predictions.select')); return; }
    const myPart = state.data.participants.find(p => p.userId === state.currentUser.uid);
    if (!myPart) { alert(t('predictions.must.reg')); return; }

    const existing = state.data.predictions.find(p => p.editionId === edId && p.playerId === myPart.id);
    const payload = {
        editionId: edId, playerId: myPart.id, cupId,
        finalists: [...s.finalists], top3: s.top3,
        createdAt: new Date().toISOString(), score: null, scored: false
    };
    if (existing) {
        await updateDoc(doc(db, 'predictions', existing.id), payload);
    } else {
        await addDoc(collection(db, 'predictions'), payload);
    }
    alert(t('predictions.saved'));
};

window.deletePrediction = async function(predId, playerName) {
    if (!state.isAdmin) return;
    if (!confirm(`Supprimer la prédiction de ${playerName} ?`)) return;
    await deleteDoc(doc(db, 'predictions', predId));
    state.data.predictions = state.data.predictions.filter(p => p.id !== predId);
    displayPredictions();
};

// Barème de points :
//   - +1 par finaliste correctement prédit
//   - +3 par position du top 3 exacte (1er, 2ème ou 3ème pile à la bonne place)
//   - +1 BONUS PARTIEL si pick top3 dans le podium mais mauvaise place
// Max théorique : 10 finalistes + 3 top3 exacts = 19 pts
function computePredScore(pred, finalistIds, top3) {
    const realPodiumSet = new Set(top3.filter(Boolean));
    let score = 0;
    (pred.finalists || []).forEach(pid => { if (finalistIds.has(pid)) score += 1; });
    (pred.top3 || []).forEach((pid, i) => {
        if (!pid) return;
        if (pid === top3[i]) score += 3;
        else if (realPodiumSet.has(pid)) score += 1;
    });
    return score;
}

window.calculatePredictionScores = async function(edId) {
    if (!state.isAdmin) return;
    const finaleRes = state.data.results.filter(r => r.editionId === edId && r.phase === 'finale');
    if (finaleRes.length === 0) { alert(t('predictions.no.finals')); return; }

    const finalistIds = new Set(finaleRes.map(r => r.playerId));
    const top3 = [1,2,3].map(pos => finaleRes.find(r => r.position === pos)?.playerId ?? null);

    const preds = state.data.predictions.filter(p => p.editionId === edId);
    for (const pred of preds) {
        const score = computePredScore(pred, finalistIds, top3);
        await updateDoc(doc(db, 'predictions', pred.id), { score, scored: true });
    }
    alert(t('predictions.calc', {n: preds.length}));
};

// ── Carte récapitulatif ───────────────────────────────────────────────────────
// finaleResults : tableau des results phase=finale de cette édition (pour feedback coloré)

function recapCardHtml(pred, players, finaleResults = null) {
    const rankLabels = ['🥇', '🥈', '🥉'];
    const realFinalistIds = finaleResults ? new Set(finaleResults.map(r => r.playerId)) : null;
    const realTop3 = finaleResults ? [1,2,3].map(pos => finaleResults.find(r => r.position === pos)?.playerId ?? null) : null;

    const finalistItems = (pred.finalists || []).map(id => {
        const p = players.find(pl => pl.id === id);
        const name = pName(p) || '?';
        const avatar = p ? avatarHtml(p, { size: 20 }) : '';
        if (realFinalistIds) {
            const ok = realFinalistIds.has(id);
            return `<span style="display:inline-flex;align-items:center;gap:5px;background:${ok ? 'rgba(0,217,54,0.12)' : 'rgba(239,68,68,0.1)'};border:1px solid ${ok ? 'rgba(0,217,54,0.25)' : 'rgba(239,68,68,0.25)'};border-radius:99px;padding:2px 10px 2px 3px;font-size:0.8rem;color:${ok ? 'var(--color-accent)' : '#ef4444'}">${avatar}<span style="margin-left:1px">${ok ? '✓' : '✗'} ${name}</span></span>`;
        }
        return `<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,0.07);border-radius:99px;padding:2px 10px 2px 3px;font-size:0.8rem">${avatar}<span>${name}</span></span>`;
    });

    const realPodiumSet = realTop3 ? new Set(realTop3.filter(Boolean)) : null;
    const top3Parts = (pred.top3 || []).map((id, i) => {
        if (!id) return null;
        const p = players.find(pl => pl.id === id);
        const name = pName(p) || '?';
        if (realTop3) {
            const exact = realTop3[i] === id;
            const inPodium = realPodiumSet.has(id);
            const inFinale = realFinalistIds?.has(id);
            let color, icon;
            if (exact)        { color = 'var(--color-accent)'; icon = '✓'; }       // +3
            else if (inPodium){ color = '#fbbf24';            icon = '↕'; }        // +1 partiel
            else if (inFinale){ color = 'rgba(255,255,255,0.45)'; icon = '◌'; }    // 0 (juste +1 finaliste)
            else              { color = '#ef4444';            icon = '✗'; }        // 0
            return `<span style="color:${color};font-size:0.85rem">${rankLabels[i]} ${icon} ${name}</span>`;
        }
        return `<span style="font-size:0.85rem">${rankLabels[i]} ${name}</span>`;
    }).filter(Boolean);

    let html = `<div style="background:rgba(0,217,54,0.04);border:1px solid rgba(0,217,54,0.15);border-radius:10px;padding:14px;margin-bottom:14px">
        <div style="font-weight:700;font-size:0.88rem;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
            <span>🔮 ${t('predictions.my.pred')}</span>
            ${pred.scored ? `<span style="background:rgba(0,217,54,0.12);border:1px solid rgba(0,217,54,0.25);border-radius:99px;padding:3px 12px;color:var(--color-accent);font-size:0.82rem">${pred.score} pt${pred.score !== 1 ? 's' : ''}</span>` : ''}
        </div>
        <div style="margin-bottom:${top3Parts.length ? '10px' : '0'}">
            <div style="font-size:0.7rem;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">${t('predictions.finalists')} (${finalistItems.length})</div>
            <div style="display:flex;flex-wrap:wrap;gap:5px">${finalistItems.join('')}</div>
        </div>`;
    if (top3Parts.length) {
        html += `<div>
            <div style="font-size:0.7rem;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">${t('predictions.step2')}</div>
            <div style="display:flex;flex-wrap:wrap;gap:12px">${top3Parts.map(p => `<span>${p}</span>`).join('')}</div>
        </div>`;
    }
    if (realFinalistIds) {
        html += `<div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);font-size:0.7rem;color:rgba(255,255,255,0.3)">${t('predictions.legend')}</div>`;
    }
    html += `</div>`;
    return html;
}

// ── Stats communauté (pré-live) — joueurs les plus prédits ───────────────────
// Rend les Top N finalistes prédits avec : avatar joueur, % et avatars empilés
// des prédicteurs qui ont voté pour lui (jusqu'à C_MAX_VISIBLE_VOTERS visibles + "+X")

const C_MAX_VISIBLE_VOTERS = 5;

function topFinalistsBarsHtml(preds, players, opts = {}) {
    const { limit = 8, compact = false } = opts;
    const total = preds.length;
    if (total === 0) return '';

    // Compter les votes par joueur, et associer la liste des prédicteurs
    const counts = {};
    const voters = {};
    preds.forEach(pred => {
        const predictor = state.data.participants.find(p => p.id === pred.playerId);
        (pred.finalists || []).forEach(id => {
            counts[id] = (counts[id] || 0) + 1;
            if (!voters[id]) voters[id] = [];
            if (predictor) voters[id].push(predictor);
        });
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit);
    if (sorted.length === 0) return '';

    // Couleurs progressives selon position
    const barColor = (i) => {
        if (i === 0) return 'linear-gradient(90deg, #fbbf24, #f59e0b)';
        if (i === 1) return 'linear-gradient(90deg, #94a3b8, #64748b)';
        if (i === 2) return 'linear-gradient(90deg, #cd7c3a, #92400e)';
        return 'var(--color-accent)';
    };

    let html = '';
    sorted.forEach(([id, count], i) => {
        const player = players.find(p => p.id === id) || state.data.participants.find(p => p.id === id);
        const name = pName(player) || '?';
        const pct = Math.round(count / total * 100);
        const playerAvatar = player ? avatarHtml(player, { size: compact ? 22 : 26 }) : '';
        const playerVoters = (voters[id] || []).slice(0, C_MAX_VISIBLE_VOTERS);
        const overflow = (voters[id]?.length || 0) - playerVoters.length;
        const votersHtml = playerVoters.map((v, j) => {
            const tooltip = pName(v).replace(/"/g, '&quot;');
            return `<span title="${tooltip}" style="margin-left:${j === 0 ? '0' : '-6px'};z-index:${20 - j};display:inline-flex">${avatarHtml(v, { size: 20 })}</span>`;
        }).join('') + (overflow > 0
            ? `<span title="+${overflow}" style="margin-left:-4px;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);font-size:0.6rem;font-weight:700;border:1.5px solid #0f0f0f">+${overflow}</span>`
            : '');

        html += `<div style="display:flex;align-items:center;gap:10px;padding:${compact ? '6px 0' : '8px 0'};${i > 0 ? 'border-top:1px solid rgba(255,255,255,0.04)' : ''}">
            <span style="font-size:0.7rem;color:rgba(255,255,255,0.3);font-weight:700;min-width:18px">#${i + 1}</span>
            ${playerAvatar}
            <span style="flex:1;min-width:0;font-size:${compact ? '0.82rem' : '0.88rem'};font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</span>
            <div style="display:flex;align-items:center;flex-shrink:0">${votersHtml}</div>
            <span style="font-size:0.72rem;color:var(--color-text-secondary);min-width:48px;text-align:right;font-weight:700">${count} <span style="opacity:0.55;font-weight:400">(${pct}%)</span></span>
        </div>
        <div style="height:4px;border-radius:99px;background:rgba(255,255,255,0.06);overflow:hidden;margin-bottom:${compact ? '4px' : '2px'}">
            <div style="width:${pct}%;height:100%;background:${barColor(i)};border-radius:99px;transition:width 0.4s ease"></div>
        </div>`;
    });
    return html;
}

function communityStatsHtml(edId, players) {
    const preds = state.data.predictions.filter(p => p.editionId === edId);
    if (preds.length < 2) return '';

    const total = preds.length;
    const bars = topFinalistsBarsHtml(preds, players, { limit: 8, compact: false });
    if (!bars) return '';

    return `<div style="margin-top:20px;padding:16px 18px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:12px">
        <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.4);margin-bottom:14px;display:flex;align-items:center;justify-content:space-between">
            <span>👥 ${t('predictions.community')}</span>
            <span style="color:rgba(255,255,255,0.55)">${t('predictions.preds.count').replace('{n}', total)}</span>
        </div>
        ${bars}
    </div>`;
}

// ── Prédictions communauté (visible dès que l'édition est live) ───────────────

function communityPredHtml(edId, players) {
    const preds = state.data.predictions.filter(p => p.editionId === edId);
    if (preds.length === 0) return '';

    const rankLabels = ['🥇', '🥈', '🥉'];
    const sorted = [...preds].sort((a, b) => (b.score || 0) - (a.score || 0));
    const taStyle = `border-radius:8px;padding:10px 12px;margin-bottom:6px;`;

    // Stats joueurs les plus prédits (en haut) — avec avatars des prédicteurs
    const bars = topFinalistsBarsHtml(preds, players, { limit: 8, compact: true });
    let statsHtml = '';
    if (bars) {
        statsHtml = `<div style="margin-bottom:16px;padding:14px 16px;background:rgba(255,255,255,0.02);border-radius:10px;border:1px solid rgba(255,255,255,0.06)">
            <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.4);margin-bottom:12px">${t('predictions.top.predicted')}</div>
            ${bars}
        </div>`;
    }

    let html = `<div style="margin-top:16px">
        <div class="pred-section-title">👥 ${t('predictions.community.full')} (${preds.length})</div>
        ${statsHtml}`;

    sorted.forEach(pred => {
        const predictor = state.data.participants.find(p => p.id === pred.playerId);
        const isMe = state.currentUser && predictor?.userId === state.currentUser.uid;
        const finalistChips = (pred.finalists || []).map(id => {
            const p = players.find(pl => pl.id === id);
            const nm = pName(p) || '?';
            const av = p ? avatarHtml(p, { size: 16 }) : '';
            return `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(255,255,255,0.06);border-radius:99px;padding:2px 8px 2px 3px;font-size:0.74rem">${av}${nm}</span>`;
        });
        const top3Parts = (pred.top3 || []).map((id, i) => {
            if (!id) return null;
            const p = players.find(pl => pl.id === id);
            return p ? `${rankLabels[i]} ${pName(p)}` : null;
        }).filter(Boolean);

        const predName = predictor ? pName(predictor) : '?';
        const predAvatar = predictor ? avatarHtml(predictor, { size: 26 }) : '';
        const adminDeleteBtn = state.isAdmin
            ? `<button onclick="deletePrediction('${pred.id}','${predName.replace(/'/g,"\\'")}\")" title="Supprimer" style="background:none;border:none;cursor:pointer;color:rgba(239,68,68,0.5);font-size:0.85rem;padding:2px 4px;line-height:1" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='rgba(239,68,68,0.5)'">🗑️</button>`
            : '';
        html += `<div style="${taStyle}${isMe ? 'background:rgba(0,217,54,0.05);border:1px solid rgba(0,217,54,0.18)' : 'background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05)'}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <span style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:0.88rem">${predAvatar}<span>${predName}${isMe ? ' <span style="color:var(--color-accent);font-size:0.72rem">← toi</span>' : ''}</span></span>
                <span style="display:flex;align-items:center;gap:6px">
                    ${pred.scored ? `<span style="color:var(--color-accent);font-weight:700;font-size:0.85rem">${pred.score} pt${pred.score !== 1 ? 's' : ''}</span>` : ''}
                    ${adminDeleteBtn}
                </span>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:5px;${top3Parts.length ? 'margin-bottom:6px' : ''}">
                ${finalistChips.join('')}
            </div>
            ${top3Parts.length ? `<div style="font-size:0.78rem;color:var(--color-text-secondary)">${top3Parts.join(' · ')}</div>` : ''}
        </div>`;
    });

    html += `</div>`;
    return html;
}

// ── Leaderboard global des meilleurs prédicteurs ──────────────────────────────

function hallOfFameHtml() {
    const scoredPreds = state.data.predictions.filter(p => p.scored);
    if (scoredPreds.length === 0) return '';

    const totals = {};
    scoredPreds.forEach(pred => {
        if (!totals[pred.playerId]) totals[pred.playerId] = { total: 0, count: 0 };
        totals[pred.playerId].total += pred.score || 0;
        totals[pred.playerId].count++;
    });
    const ranked = Object.entries(totals).sort((a, b) => b[1].total - a[1].total);
    if (ranked.length === 0) return '';

    const podium = ranked.slice(0, 3);
    const myPart = state.currentUser ? state.data.participants.find(p => p.userId === state.currentUser.uid) : null;
    const myIdx = myPart ? ranked.findIndex(([id]) => id === myPart.id) : -1;

    // ── PODIUM XL ──
    const podiumStepHtml = (entry, cls, medal) => {
        if (!entry) return '<div></div>';
        const [id, data] = entry;
        const player = state.data.participants.find(p => p.id === id);
        const isMe = state.currentUser && player?.userId === state.currentUser.uid;
        const name = player ? pName(player) : '?';
        const av = player ? avatarHtml(player, { size: cls === 'gold' ? 90 : 64 }) : '';
        const tier = getTier(data.total);
        return `<div class="pred-hof-step ${cls}">
            <div class="pred-hof-medal">${medal}</div>
            <div class="pred-hof-avatar">${av}</div>
            <div class="pred-hof-name">${name}${isMe ? ` <div style="color:var(--color-accent);font-size:0.72rem;font-weight:800;margin-top:3px;text-transform:uppercase;letter-spacing:1px">← ${t('predictions.hof.you')}</div>` : ''}</div>
            <div class="pred-hof-pts">${data.total} pt${data.total !== 1 ? 's' : ''}</div>
            <div class="pred-hof-meta">
                <span>${data.count} cups</span>
                <span class="pred-hof-tier-badge" style="color:${tier.color}">${tier.icon} ${tier.label}</span>
            </div>
        </div>`;
    };

    let html = `<div id="pred-hof" class="pred-hof">
        <div class="pred-hof-header">
            <div class="pred-hof-title">🏆 ${t('predictions.hof.title')}</div>
            <div class="pred-hof-subtitle">${t('predictions.hof.subtitle')}</div>
        </div>
        <div class="pred-hof-podium">
            ${podiumStepHtml(podium[1], 'silver', '🥈')}
            ${podiumStepHtml(podium[0], 'gold',   '🥇')}
            ${podiumStepHtml(podium[2], 'bronze', '🥉')}
        </div>`;

    // ── Liste 4-10 + injection de "ta position" si hors top 10 ──
    const rest = ranked.slice(3, 10);
    let myInjected = '';
    if (myIdx >= 10) {
        const [id, data] = ranked[myIdx];
        const player = state.data.participants.find(p => p.id === id);
        const tier = getTier(data.total);
        myInjected = `<div class="pred-hof-list-row me" style="margin-top:8px">
            <span class="pred-hof-list-rank">#${myIdx + 1}</span>
            ${avatarHtml(player, { size: 28 })}
            <span class="pred-hof-list-name">${pName(player)} <span style="color:var(--color-accent);font-size:0.72rem;font-weight:800;margin-left:6px;text-transform:uppercase;letter-spacing:1px">← ${t('predictions.hof.you')}</span></span>
            <span class="pred-hof-list-tier" style="color:${tier.color};border:1px solid currentColor">${tier.icon} ${tier.label}</span>
            <span class="pred-hof-list-pts me">${data.total} pts</span>
        </div>`;
    }

    if (rest.length > 0 || myInjected) {
        html += `<div class="pred-hof-list">`;
        rest.forEach(([id, data], i) => {
            const rank = i + 4;
            const player = state.data.participants.find(p => p.id === id);
            const isMe = state.currentUser && player?.userId === state.currentUser.uid;
            const tier = getTier(data.total);
            html += `<div class="pred-hof-list-row${isMe ? ' me' : ''}">
                <span class="pred-hof-list-rank">#${rank}</span>
                ${player ? avatarHtml(player, { size: 28 }) : ''}
                <span class="pred-hof-list-name">${player ? pName(player) : '?'}${isMe ? ` <span style="color:var(--color-accent);font-size:0.72rem;font-weight:800;margin-left:6px;text-transform:uppercase;letter-spacing:1px">← ${t('predictions.hof.you')}</span>` : ''}</span>
                <span class="pred-hof-list-tier" style="color:${tier.color};border:1px solid currentColor">${tier.icon} ${tier.label}</span>
                <span class="pred-hof-list-pts${isMe ? ' me' : ''}">${data.total} pts</span>
            </div>`;
        });
        html += myInjected;
        html += `</div>`;
    }

    html += `</div>`;
    return html;
}

// ── Formulaire de prédiction ──────────────────────────────────────────────────

function renderPredForm(edId) {
    const container = document.getElementById(`pred-form-${edId}`);
    if (!container) return;
    const edition = state.data.editions.find(e => e.id === edId);
    if (!edition) return;

    const locked = edition.status === 'en_cours' || edition.status === 'terminee';
    const myPart = state.currentUser ? state.data.participants.find(p => p.userId === state.currentUser.uid) : null;
    const myPred = myPart ? state.data.predictions.find(p => p.editionId === edId && p.playerId === myPart.id) : null;

    const inscribedIds = new Set(state.data.results
        .filter(r => r.editionId === edId && (r.phase === 'inscription' || r.phase === 'qualification'))
        .map(r => r.playerId));
    const players = state.data.participants.filter(p => inscribedIds.has(p.id));

    // ── Locked : recap + communauté ──
    if (locked) {
        const finaleResults = state.data.results.filter(r => r.editionId === edId && r.phase === 'finale');
        const hasResults = finaleResults.length > 0;
        let html = '';
        if (myPred) {
            html += recapCardHtml(myPred, players, hasResults ? finaleResults : null);
        } else if (myPart) {
            html += `<p style="color:var(--color-text-secondary);font-size:0.85rem;font-style:italic;margin-bottom:12px">${t('predictions.no.pred')}</p>`;
        }
        html += communityPredHtml(edId, players);
        container.innerHTML = html;
        return;
    }

    if (!state.predState[edId] && myPred) {
        state.predState[edId] = { finalists: new Set(myPred.finalists || []), top3: myPred.top3 || [null,null,null] };
    }
    if (!state.predState[edId]) state.predState[edId] = { finalists: new Set(), top3: [null,null,null] };
    const s = state.predState[edId];

    const rankLabels = ['🥇 1er', '🥈 2ème', '🥉 3ème'];
    let html = '';

    if (myPred) {
        html += recapCardHtml(myPred, players);
        html += `<p style="font-size:0.78rem;color:var(--color-text-secondary);margin-bottom:14px">${t('predictions.modify.hint')}</p>`;
    }

    // ── Étape 1 : finalistes ──
    const stepStyle = `display:flex;align-items:center;gap:10px;margin-bottom:10px`;
    const stepNumStyle = (active) => `width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:700;flex-shrink:0;${active ? 'background:var(--color-accent);color:#000' : 'background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.4)'}`;

    const maxReached = s.finalists.size >= PRED_MAX_FINALISTS;
    const counterColor = maxReached ? '#ef4444' : 'var(--color-accent)';
    html += `<div style="${stepStyle}">
        <div style="${stepNumStyle(true)}">1</div>
        <div style="font-weight:700;font-size:0.9rem">${t('predictions.step1')}</div>
        <span style="margin-left:auto;font-size:0.78rem;color:${counterColor};font-weight:600">${s.finalists.size} / ${PRED_MAX_FINALISTS}</span>
    </div>
    <p style="font-size:0.78rem;color:var(--color-text-secondary);margin-bottom:8px;padding-left:32px">${t('predictions.step1.hint')} <span style="color:rgba(255,255,255,0.4)">(max ${PRED_MAX_FINALISTS})</span></p>`;

    if (players.length > 10) {
        html += `<input id="pred-search-${edId}" type="text" placeholder="Rechercher un joueur..." oninput="filterPredSearch('${edId}')"
            style="width:100%;box-sizing:border-box;margin-bottom:8px;padding:7px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:var(--color-text-primary);font-size:0.85rem;outline:none">`;
    }

    html += `<div id="pred-grid-${edId}" class="pred-player-grid" style="max-height:240px;overflow-y:auto;padding-right:4px;margin-bottom:4px">`;
    players.forEach(p => {
        const isSelected = s.finalists.has(p.id);
        const sel = isSelected ? ' selected-finalist' : '';
        // Quand la limite est atteinte, les chips non-sélectionnés deviennent grisés et non-cliquables
        const disabled = maxReached && !isSelected;
        const disabledStyle = disabled ? 'opacity:0.3;pointer-events:none;cursor:not-allowed' : '';
        html += `<div class="pred-player-chip${sel}" data-name="${pName(p)}" style="${disabledStyle}" onclick="togglePredFinalist('${edId}','${p.id}')">${avatarHtml(p, { size: 24 })}<span>${pName(p)}</span></div>`;
    });
    html += `</div>`;

    // ── Étape 2 : top 3 ──
    const step2Active = s.finalists.size > 0;
    html += `<div style="${stepStyle};margin-top:18px">
        <div style="${stepNumStyle(step2Active)}">2</div>
        <div style="font-weight:700;font-size:0.9rem;${step2Active ? '' : 'color:rgba(255,255,255,0.3)'}">${t('predictions.step2')}</div>
    </div>`;

    const finalistPlayers = players.filter(p => s.finalists.has(p.id));
    if (finalistPlayers.length === 0) {
        html += `<p style="font-size:0.78rem;color:rgba(255,255,255,0.2);padding-left:32px">${t('predictions.step2.wait')}</p>`;
    } else {
        html += `<p style="font-size:0.78rem;color:var(--color-text-secondary);margin-bottom:10px;padding-left:32px">${t('predictions.step2.hint')}</p>`;
        [0,1,2].forEach(i => {
            const rankClass = `selected-top${i+1}`;
            html += `<div style="margin-bottom:8px;padding-left:32px">
                <span style="font-size:0.82rem;font-weight:700;margin-right:8px">${rankLabels[i]}</span>
                <div class="pred-player-grid" style="display:inline-flex;flex-wrap:wrap;gap:6px;margin-top:4px">`;
            finalistPlayers.forEach(p => {
                const isChosen = s.top3[i] === p.id;
                html += `<div class="pred-player-chip${isChosen ? ' ' + rankClass : ''}" onclick="setPredTop('${edId}',${i+1},'${p.id}')">${avatarHtml(p, { size: 22 })}<span>${pName(p)}</span></div>`;
            });
            html += `</div></div>`;
        });
    }

    const canSubmit = !!(state.currentUser && myPart);
    html += `<div style="margin-top:16px;padding-left:32px">
        <button class="btn btn-primary" onclick="submitPrediction('${edId}')" ${canSubmit ? '' : 'disabled title="Connecte-toi et inscris-toi pour prédire"'}>
            ${myPred ? t('predictions.edit') : t('predictions.send')}
        </button>
        ${!state.currentUser ? '<p style="font-size:0.78rem;color:var(--color-text-secondary);margin-top:8px">Connecte-toi pour soumettre une prédiction.</p>' : ''}
    </div>`;

    // Stats communauté en bas du formulaire
    html += communityStatsHtml(edId, players);

    container.innerHTML = html;
}

// ── Historique personnel ──────────────────────────────────────────────────────

function myHistoryHtml() {
    if (!state.currentUser) return '';
    const myPart = state.data.participants.find(p => p.userId === state.currentUser.uid);
    if (!myPart) return '';

    const myPreds = state.data.predictions.filter(p => p.playerId === myPart.id);
    if (myPreds.length === 0) return '';

    // Uniquement les éditions terminées
    const pastEditions = state.data.editions
        .filter(e => e.status === 'terminee')
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    const rows = pastEditions
        .map(e => ({ edition: e, pred: myPreds.find(p => p.editionId === e.id) }))
        .filter(({ pred }) => pred);

    if (rows.length === 0) return '';

    const totalPts = rows.reduce((s, { pred }) => s + (pred.score || 0), 0);
    const bestScore = Math.max(...rows.map(({ pred }) => pred.score || 0));

    let html = `<div class="card" style="margin-top:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <h2 style="margin:0">🔮 ${t('predictions.my.history')}</h2>
            <div style="display:flex;gap:14px">
                <span style="font-size:0.78rem;color:var(--color-text-secondary)">${t('predictions.editions').replace('{n}', rows.length)}</span>
                <span style="font-size:0.85rem;font-weight:700;color:var(--color-accent)">${t('predictions.total.pts').replace('{n}', totalPts)}</span>
            </div>
        </div>`;

    rows.forEach(({ edition: e, pred }) => {
        const inscribedIds = new Set(state.data.results
            .filter(r => r.editionId === e.id && (r.phase === 'inscription' || r.phase === 'qualification'))
            .map(r => r.playerId));
        const players = state.data.participants.filter(p => inscribedIds.has(p.id));
        const finaleResults = state.data.results.filter(r => r.editionId === e.id && r.phase === 'finale');
        const dateStr = e.date ? new Date(e.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

        const scoreBadge = pred.scored
            ? `<span style="background:${pred.score >= bestScore && bestScore > 0 ? 'rgba(0,217,54,0.12)' : 'rgba(255,255,255,0.06)'};border:1px solid ${pred.score >= bestScore && bestScore > 0 ? 'rgba(0,217,54,0.25)' : 'rgba(255,255,255,0.1)'};border-radius:99px;padding:3px 12px;font-size:0.82rem;font-weight:700;color:${pred.score >= bestScore && bestScore > 0 ? 'var(--color-accent)' : 'var(--color-text-primary)'}">
                ${pred.score} pt${pred.score !== 1 ? 's' : ''}${pred.score >= bestScore && bestScore > 0 ? ' 🏅' : ''}
              </span>`
            : `<span style="font-size:0.75rem;color:rgba(255,255,255,0.3);font-style:italic">${t('predictions.not.calc')}</span>`;

        html += `<details style="border:1px solid rgba(255,255,255,0.07);border-radius:10px;margin-bottom:8px;overflow:hidden">
            <summary style="padding:12px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;list-style:none;user-select:none" onclick="this.parentElement.querySelectorAll('.pred-history-body').forEach(el => el.style.display = this.parentElement.open ? 'none' : 'block')">
                <span style="flex:1;font-weight:700;font-size:0.9rem">${e.name}</span>
                <span style="font-size:0.75rem;color:var(--color-text-secondary)">${dateStr}</span>
                ${scoreBadge}
                <span style="color:rgba(255,255,255,0.3);font-size:0.7rem;margin-left:4px">▼</span>
            </summary>
            <div class="pred-history-body" style="padding:0 14px 14px">
                ${recapCardHtml(pred, players, finaleResults.length > 0 ? finaleResults : null)}
            </div>
        </details>`;
    });

    html += `</div>`;
    return html;
}

// ── Affichage principal ───────────────────────────────────────────────────────

export function displayPredictions() {
    const container = document.getElementById('predictionsContent');
    if (!container) return;

    const today = new Date();
    const upcoming = state.data.editions
        .filter(e => e.status === 'upcoming' || e.status === 'inscriptions' || e.status === 'en_cours' || new Date(e.date) > today)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const past = state.data.editions
        .filter(e => e.status === 'terminee')
        .filter(e => state.data.predictions.some(p => p.editionId === e.id))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

    let html = '';

    // ─── 1. STAT BAR perso (dashboard tier + cards + progression) ───
    html += statBarHtml();

    if (upcoming.length === 0 && past.length === 0) {
        html += `<div class="card"><div class="empty-state"><span class="empty-state-icon">🔮</span><p>${t('predictions.no.pred.yet')}</p></div></div>`;
        container.innerHTML = html;
        return;
    }

    // ─── 2. HERO CUP EN COURS + FORM ───
    if (upcoming.length > 0) {
        html += `<div class="card"><h2 style="margin-bottom:18px">🔮 ${t('predictions.section')}</h2>`;
        let renderedAny = false;
        upcoming.forEach(e => {
            const dateStr = e.date ? new Date(e.date).toLocaleDateString(dateLang(), { day: 'numeric', month: 'long', year: 'numeric' }) : '';
            const inscribedIds = new Set(state.data.results
                .filter(r => r.editionId === e.id && (r.phase === 'inscription' || r.phase === 'qualification'))
                .map(r => r.playerId));
            if (inscribedIds.size === 0 && e.status !== 'en_cours') return;
            renderedAny = true;

            const predCount = state.data.predictions.filter(p => p.editionId === e.id).length;
            const isLive = e.status === 'en_cours';

            const myPart = state.currentUser ? state.data.participants.find(p => p.userId === state.currentUser.uid) : null;
            const myPred = myPart ? state.data.predictions.find(p => p.editionId === e.id && p.playerId === myPart.id) : null;

            // ── HERO CARD ─────────────────────────────────────────────────
            // ⚠️ Maps SECRÈTES jusqu'au lancement : pas d'image map en fond avant en_cours/terminee
            const mapsRevealed = (e.status === 'en_cours' || e.status === 'terminee');
            const mapInfo = mapsRevealed ? getEditionMapInfo(e) : null;
            const heroBg = mapInfo?.thumb || tm2020Bg;
            const cd = !isLive ? getCountdown(e.date, e.time) : null;

            const heroClass = `pred-hero${isLive ? ' live' : ''}${myPred && !isLive ? ' predicted' : ''}`;
            const statusPill = isLive
                ? `<span class="pred-hero-status"><span class="pred-hero-live-dot"></span>${t('predictions.hero.live.now')}</span>`
                : `<span class="pred-hero-status">${t('predictions.hero.open')}</span>`;
            const minePill = (myPred && !isLive) ? `<span class="pred-hero-mine-badge">${t('predictions.hero.mine')}</span>` : '';
            // Live counter "X/Y ont prédit" — bien plus parlant que juste "X prédictions"
            const countLabel = (inscribedIds.size > 0)
                ? t('predictions.live.predicted.of').replace('{n}', predCount).replace('{total}', inscribedIds.size)
                : t('predictions.live.predictors').replace('{n}', predCount);
            const countPill = `<span class="pred-hero-pred-count">👥 ${countLabel}</span>`;

            let ctaHtml;
            if (isLive) {
                ctaHtml = `<button class="pred-hero-cta locked" disabled>🔒 ${t('predictions.hero.cta.locked')}</button>`;
            } else if (!state.currentUser) {
                ctaHtml = `<button class="pred-hero-cta" onclick="openAuthModal()">${t('predictions.hero.cta.predict')} →</button>`;
            } else if (!myPart) {
                ctaHtml = `<button class="pred-hero-cta locked" disabled>${t('predictions.must.reg')}</button>`;
            } else {
                const ctaLabel = myPred ? t('predictions.hero.cta.edit') : t('predictions.hero.cta.predict');
                ctaHtml = `<button class="pred-hero-cta" onclick="scrollToPredForm('${e.id}')">${ctaLabel} →</button>`;
            }

            const subsLabel = inscribedIds.size > 0
                ? t('predictions.hero.subscribers').replace('{n}', inscribedIds.size)
                : t('predictions.hero.no.subs');

            html += `<div class="${heroClass}">
                <div class="pred-hero-bg" style="background-image:url('${heroBg}')"></div>
                <div class="pred-hero-overlay"></div>
                <div class="pred-hero-accent"></div>
                <div class="pred-hero-body">
                    <div class="pred-hero-left">
                        <div class="pred-hero-pills">
                            ${statusPill}
                            ${minePill}
                            ${countPill}
                        </div>
                        <div class="pred-hero-name">${e.name}</div>
                        <div class="pred-hero-meta">
                            <span>📅 ${dateStr}</span>
                            <span>👥 ${subsLabel}</span>
                        </div>
                        ${ctaHtml}
                    </div>
                    ${cd ? `<div class="pred-hero-countdown">
                        <div class="pred-hero-countdown-label">${t('predictions.hero.starts.in')}</div>
                        <div class="pred-hero-countdown-value">${cd}</div>
                    </div>` : ''}
                </div>
            </div>`;

            // ── BODY (form or locked content) ─────────────────────────────
            let bodyContent;
            if (isLive) {
                const players = state.data.participants.filter(p => inscribedIds.has(p.id));
                const finaleResults = state.data.results.filter(r => r.editionId === e.id && r.phase === 'finale');
                const hasResults = finaleResults.length > 0;
                let lockedHtml = '';
                if (myPred) lockedHtml += recapCardHtml(myPred, players, hasResults ? finaleResults : null);
                else if (myPart) lockedHtml += `<p style="color:var(--color-text-secondary);font-size:0.85rem;font-style:italic;margin-bottom:12px">${t('predictions.no.pred')}</p>`;
                lockedHtml += communityPredHtml(e.id, players);
                bodyContent = lockedHtml;
            } else {
                bodyContent = `<div id="pred-form-${e.id}"></div>`;
            }

            html += `<div id="pred-card-${e.id}" class="pred-edition-card" style="margin-top:-8px">
                <div class="pred-body">${bodyContent}</div>
            </div>`;
        });
        if (!renderedAny) {
            html += `<div class="empty-state"><span class="empty-state-icon">🔮</span><p>${t('predictions.no.upcoming')}</p></div>`;
        }
        html += '</div>';
    }

    // ─── 3. HALL OF FAME XL (top 3 podium + classement complet) ───
    html += hallOfFameHtml();

    // ─── 4. DERNIER RÉSULTAT (carte comparative toi vs best) ───
    html += lastResultCardHtml();

    // ─── 5. SPARKLINE progression personnelle ───
    html += sparklineHtml();

    // ─── 6. MES PRÉDICTIONS PASSÉES (pliable, par cup) ───
    html += myHistoryHtml();

    // ─── 7. RÉSULTATS PAR CUP (pliable, classement spécifique de chaque cup) ───
    if (past.length > 0) {
        const adminUnscored = past.filter(e => state.isAdmin && !state.data.predictions.some(p => p.editionId === e.id && p.scored));
        const scored = past.filter(e => state.data.predictions.some(p => p.editionId === e.id && p.scored));

        if (scored.length > 0 || adminUnscored.length > 0) {
            html += `<details class="card" style="margin-top:16px">
                <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:10px;padding:4px 0">
                    <h2 style="margin:0;flex:1">📊 ${t('predictions.results')}</h2>
                    <span style="font-size:0.78rem;color:rgba(255,255,255,0.4)">${scored.length} ${scored.length === 1 ? 'cup' : 'cups'}</span>
                    <span style="font-size:0.8rem;color:rgba(255,255,255,0.3)">▼</span>
                </summary>
                <div style="margin-top:14px">`;

            // ── Cards admin "non calculé" ──
            adminUnscored.forEach(e => {
                const dateStr = e.date ? new Date(e.date).toLocaleDateString(dateLang(), { day: 'numeric', month: 'long' }) : '';
                html += `<div class="pred-past">
                    <div class="pred-past-header">
                        <div class="pred-past-header-overlay"></div>
                        <div class="pred-past-header-row">
                            <div style="flex:1">
                                <div class="pred-past-name">${e.name}</div>
                                <div class="pred-past-date">${dateStr}</div>
                            </div>
                            <span class="pred-past-badge unscored">${t('predictions.not.calc')}</span>
                        </div>
                    </div>
                    <div class="pred-past-empty">
                        <button class="btn btn-secondary" onclick="calculatePredictionScores('${e.id}')">${t('predictions.calc.btn')}</button>
                    </div>
                </div>`;
            });

            // ── Cards "calculé" — style premium ──
            scored.forEach(e => {
                const preds = state.data.predictions.filter(p => p.editionId === e.id && p.scored);
                const ranked = [...preds].sort((a, b) => (b.score || 0) - (a.score || 0));
                const dateStr = e.date ? new Date(e.date).toLocaleDateString(dateLang(), { day: 'numeric', month: 'long', year: 'numeric' }) : '';
                const mapInfo = getEditionMapInfo(e);
                const bgImg = mapInfo?.thumb ? `<div class="pred-past-header-bg" style="background-image:url('${mapInfo.thumb}')"></div>` : '';
                const adminCalc = state.isAdmin
                    ? `<button class="pred-past-recalc-btn" onclick="event.stopPropagation();calculatePredictionScores('${e.id}')">${t('predictions.recalc')}</button>`
                    : '';

                html += `<div class="pred-past">
                    <div class="pred-past-header">
                        ${bgImg}
                        <div class="pred-past-header-overlay"></div>
                        <div class="pred-past-header-row">
                            <div style="flex:1;min-width:0">
                                <div class="pred-past-name">${e.name}</div>
                                <div class="pred-past-date">${dateStr} · ${preds.length} ${preds.length === 1 ? 'prédicteur' : 'prédicteurs'}</div>
                            </div>
                            <span class="pred-past-badge">${t('predictions.scored')}</span>
                            ${adminCalc}
                        </div>
                    </div>
                    <div class="pred-past-rows">`;

                ranked.forEach((pred, i) => {
                    const player = state.data.participants.find(p => p.id === pred.playerId);
                    const isMe = state.currentUser && player?.userId === state.currentUser.uid;
                    const rName = player ? pName(player) : '?';
                    // Tier basé sur le score CUMULÉ all-time (plus représentatif que le score d'1 cup)
                    const playerCumStats = player ? getPlayerStats(player.id) : null;
                    const tier = playerCumStats?.tier || getTier(0);

                    let rowClass = '';
                    if (i === 0) rowClass = 'gold';
                    else if (i === 1) rowClass = 'silver';
                    else if (i === 2) rowClass = 'bronze';
                    if (isMe) rowClass += ' me';
                    if (pred.score === 0) rowClass += ' zero-pts';

                    let rankCell;
                    if (i === 0) rankCell = '🥇';
                    else if (i === 1) rankCell = '🥈';
                    else if (i === 2) rankCell = '🥉';
                    else rankCell = `#${i + 1}`;

                    const adminDel = state.isAdmin
                        ? `<button onclick="event.stopPropagation();deletePrediction('${pred.id}','${rName.replace(/'/g,"\\'")}\")" title="Supprimer" style="background:none;border:none;cursor:pointer;color:rgba(239,68,68,0.4);font-size:0.85rem;padding:2px 4px" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='rgba(239,68,68,0.4)'">🗑️</button>`
                        : '';

                    html += `<div class="pred-past-row ${rowClass}">
                        <span class="pred-past-rank">${rankCell}</span>
                        <span class="pred-past-name-cell">
                            ${player ? avatarHtml(player, { size: 30 }) : ''}
                            <span class="pred-past-name-text">${rName}${isMe ? ` <span style="color:var(--color-accent);font-size:0.7rem;font-weight:800;margin-left:4px;text-transform:uppercase;letter-spacing:0.8px">← ${t('predictions.hof.you')}</span>` : ''}</span>
                        </span>
                        <span class="pred-past-tier" style="color:${tier.color}">${tier.icon} ${tier.label}</span>
                        <span class="pred-past-pts">${pred.score} pt${pred.score !== 1 ? 's' : ''}</span>
                        ${adminDel}
                    </div>`;
                });
                html += '</div></div>';
            });
            html += '</div></details>';
        }
    }

    // ─── 8. COMMENT ÇA MARCHE (pliable, en bas) ───
    // Construction du bloc "Les rangs" : 5 cards Bronze/Silver/Gold/Platinum/Diamond
    // dans l'ordre croissant pour montrer la progression.
    const tiersAsc = [...TIERS].reverse(); // bronze→diamond
    const tiersGridHtml = tiersAsc.map((tier, i) => {
        const next = tiersAsc[i + 1];
        const range = next
            ? t('predictions.tiers.range').replace('{min}', `${tier.min}-${next.min - 1}`)
            : t('predictions.tiers.range.max').replace('{min}', tier.min);
        return `<div class="pred-tier-card ${tier.key}">
            <div class="pred-tier-card-icon">${tier.icon}</div>
            <div class="pred-tier-card-name">${t('predictions.tiers.' + tier.key)}</div>
            <div class="pred-tier-card-range">${range}</div>
        </div>`;
    }).join('');

    html += `<details class="pred-howto">
        <summary class="pred-howto-summary">
            <span class="pred-howto-summary-icon">📖</span>
            <span>${t('predictions.howto.title')}</span>
            <span class="pred-howto-summary-arrow">▼</span>
        </summary>
        <div class="pred-howto-body">
            <p>${t('predictions.howto.intro')}</p>
            <div class="pred-howto-rules">
                <div class="pred-howto-rule"><span class="pred-howto-rule-icon">+1</span><span>${t('predictions.howto.rule1')}</span></div>
                <div class="pred-howto-rule exact"><span class="pred-howto-rule-icon">+3</span><span>${t('predictions.howto.rule2')}</span></div>
                <div class="pred-howto-rule bonus"><span class="pred-howto-rule-icon">+1</span><span>${t('predictions.howto.rule3')}</span></div>
            </div>
            <div class="pred-howto-example">💡 ${t('predictions.howto.example')}</div>
            <div class="pred-howto-max">🎯 ${t('predictions.howto.max')}</div>
            <div class="pred-howto-auto">⚡ ${t('predictions.howto.auto')}</div>
            <div style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.06)">
                <div style="font-weight:800;font-size:0.95rem;margin-bottom:6px">🏅 ${t('predictions.tiers.title')}</div>
                <p style="margin:0 0 4px;font-size:0.85rem">${t('predictions.tiers.intro')}</p>
                <div class="pred-tiers-grid">${tiersGridHtml}</div>
            </div>
        </div>
    </details>`;

    container.innerHTML = html;

    upcoming.forEach(e => {
        const inscribedIds = new Set(state.data.results
            .filter(r => r.editionId === e.id && (r.phase === 'inscription' || r.phase === 'qualification'))
            .map(r => r.playerId));
        if (inscribedIds.size > 0 || e.status === 'en_cours') renderPredForm(e.id);
    });
}
