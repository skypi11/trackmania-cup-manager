// modules/display-predictions.js — Prédictions

import { db } from '../../shared/firebase-config.js';
import { state } from './state.js';
import { t } from '../../shared/i18n.js';
import { pName, dateLang } from './utils.js';
import { updateDoc, doc, addDoc, collection, getDoc, deleteDoc } from 'firebase/firestore';

const cupId = new URLSearchParams(window.location.search).get('cup') || 'monthly';

// ── Handlers interactifs ──────────────────────────────────────────────────────

window.togglePredFinalist = function(edId, playerId) {
    if (!state.predState[edId]) state.predState[edId] = { finalists: new Set(), top3: [null,null,null] };
    const s = state.predState[edId];
    if (s.finalists.has(playerId)) {
        s.finalists.delete(playerId);
        s.top3 = s.top3.map(p => p === playerId ? null : p);
    } else {
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

window.calculatePredictionScores = async function(edId) {
    if (!state.isAdmin) return;
    const finaleRes = state.data.results.filter(r => r.editionId === edId && r.phase === 'finale');
    if (finaleRes.length === 0) { alert(t('predictions.no.finals')); return; }

    const finalistIds = new Set(finaleRes.map(r => r.playerId));
    const top3 = [1,2,3].map(pos => finaleRes.find(r => r.position === pos)?.playerId ?? null);

    const preds = state.data.predictions.filter(p => p.editionId === edId);
    for (const pred of preds) {
        let score = 0;
        (pred.finalists || []).forEach(pid => { if (finalistIds.has(pid)) score += 1; });
        (pred.top3 || []).forEach((pid, i) => { if (pid && pid === top3[i]) score += 3; });
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
        if (realFinalistIds) {
            const ok = realFinalistIds.has(id);
            return `<span style="display:inline-flex;align-items:center;gap:4px;background:${ok ? 'rgba(0,217,54,0.12)' : 'rgba(239,68,68,0.1)'};border:1px solid ${ok ? 'rgba(0,217,54,0.25)' : 'rgba(239,68,68,0.25)'};border-radius:6px;padding:3px 9px;font-size:0.8rem;color:${ok ? 'var(--color-accent)' : '#ef4444'}"><span>${ok ? '✓' : '✗'}</span>${name}</span>`;
        }
        return `<span style="background:rgba(255,255,255,0.07);border-radius:6px;padding:3px 9px;font-size:0.8rem">${name}</span>`;
    });

    const top3Parts = (pred.top3 || []).map((id, i) => {
        if (!id) return null;
        const p = players.find(pl => pl.id === id);
        const name = pName(p) || '?';
        if (realTop3) {
            const exact = realTop3[i] === id;
            const inFinale = realFinalistIds?.has(id);
            const color = exact ? 'var(--color-accent)' : (inFinale ? 'var(--color-warning)' : '#ef4444');
            const icon = exact ? '✓' : (inFinale ? '↕' : '✗');
            return `<span style="color:${color};font-size:0.85rem">${rankLabels[i]} ${icon} ${name}</span>`;
        }
        return `<span style="font-size:0.85rem">${rankLabels[i]} ${name}</span>`;
    }).filter(Boolean);

    let html = `<div style="background:rgba(0,217,54,0.04);border:1px solid rgba(0,217,54,0.15);border-radius:10px;padding:14px;margin-bottom:14px">
        <div style="font-weight:700;font-size:0.88rem;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
            <span>🔮 Ta prédiction</span>
            ${pred.scored ? `<span style="background:rgba(0,217,54,0.12);border:1px solid rgba(0,217,54,0.25);border-radius:99px;padding:3px 12px;color:var(--color-accent);font-size:0.82rem">${pred.score} pt${pred.score !== 1 ? 's' : ''}</span>` : ''}
        </div>
        <div style="margin-bottom:${top3Parts.length ? '10px' : '0'}">
            <div style="font-size:0.7rem;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Finalistes (${finalistItems.length})</div>
            <div style="display:flex;flex-wrap:wrap;gap:5px">${finalistItems.join('')}</div>
        </div>`;
    if (top3Parts.length) {
        html += `<div>
            <div style="font-size:0.7rem;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Top 3</div>
            <div style="display:flex;flex-wrap:wrap;gap:12px">${top3Parts.map(p => `<span>${p}</span>`).join('')}</div>
        </div>`;
    }
    if (realFinalistIds) {
        html += `<div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);font-size:0.7rem;color:rgba(255,255,255,0.3)">✓ correct &nbsp;·&nbsp; ↕ en finale mais mauvaise place &nbsp;·&nbsp; ✗ absent de la finale</div>`;
    }
    html += `</div>`;
    return html;
}

// ── Stats communauté (pré-live) — joueurs les plus prédits ───────────────────

function communityStatsHtml(edId, players) {
    const preds = state.data.predictions.filter(p => p.editionId === edId);
    if (preds.length < 2) return '';

    const counts = {};
    preds.forEach(pred => {
        (pred.finalists || []).forEach(id => { counts[id] = (counts[id] || 0) + 1; });
    });
    const total = preds.length;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (sorted.length === 0) return '';

    let html = `<div style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.07)">
        <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.3);margin-bottom:12px">
            👥 Ce que pense la communauté · ${total} prédiction${total > 1 ? 's' : ''}
        </div>`;

    sorted.forEach(([id, count]) => {
        const player = players.find(p => p.id === id);
        const name = pName(player) || '?';
        const pct = Math.round(count / total * 100);
        html += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:7px">
            <span style="min-width:110px;font-size:0.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</span>
            <div style="flex:1;height:6px;border-radius:99px;background:rgba(255,255,255,0.07);overflow:hidden">
                <div style="width:${pct}%;height:100%;background:var(--color-accent);border-radius:99px;transition:width 0.4s ease"></div>
            </div>
            <span style="font-size:0.75rem;color:var(--color-text-secondary);min-width:32px;text-align:right">${pct}%</span>
        </div>`;
    });
    html += '</div>';
    return html;
}

// ── Prédictions communauté (visible dès que l'édition est live) ───────────────

function communityPredHtml(edId, players) {
    const preds = state.data.predictions.filter(p => p.editionId === edId);
    if (preds.length === 0) return '';

    const rankLabels = ['🥇', '🥈', '🥉'];
    const sorted = [...preds].sort((a, b) => (b.score || 0) - (a.score || 0));
    const taStyle = `border-radius:8px;padding:10px 12px;margin-bottom:6px;`;

    // Stats joueurs les plus prédits (en haut)
    const counts = {};
    preds.forEach(pred => { (pred.finalists || []).forEach(id => { counts[id] = (counts[id] || 0) + 1; }); });
    const top5 = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    let statsHtml = '';
    if (top5.length > 0) {
        statsHtml = `<div style="margin-bottom:14px;padding:12px;background:rgba(255,255,255,0.02);border-radius:8px;border:1px solid rgba(255,255,255,0.06)">
            <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.3);margin-bottom:10px">Finalistes les plus prédits</div>`;
        top5.forEach(([id, count]) => {
            const player = players.find(p => p.id === id);
            const pct = Math.round(count / preds.length * 100);
            statsHtml += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
                <span style="min-width:110px;font-size:0.82rem">${pName(player) || '?'}</span>
                <div style="flex:1;height:5px;border-radius:99px;background:rgba(255,255,255,0.07);overflow:hidden">
                    <div style="width:${pct}%;height:100%;background:var(--color-accent);border-radius:99px"></div>
                </div>
                <span style="font-size:0.75rem;color:var(--color-text-secondary);min-width:32px;text-align:right">${pct}%</span>
            </div>`;
        });
        statsHtml += '</div>';
    }

    let html = `<div style="margin-top:16px">
        <div class="pred-section-title">👥 Prédictions de la communauté (${preds.length})</div>
        ${statsHtml}`;

    sorted.forEach(pred => {
        const predictor = state.data.participants.find(p => p.id === pred.playerId);
        const isMe = state.currentUser && predictor?.userId === state.currentUser.uid;
        const finalistNames = (pred.finalists || []).map(id => pName(players.find(p => p.id === id)) || '?');
        const top3Parts = (pred.top3 || []).map((id, i) => {
            if (!id) return null;
            const p = players.find(pl => pl.id === id);
            return p ? `${rankLabels[i]} ${pName(p)}` : null;
        }).filter(Boolean);

        const predName = predictor ? pName(predictor) : '?';
        const adminDeleteBtn = state.isAdmin
            ? `<button onclick="deletePrediction('${pred.id}','${predName.replace(/'/g,"\\'")}\")" title="Supprimer" style="background:none;border:none;cursor:pointer;color:rgba(239,68,68,0.5);font-size:0.85rem;padding:2px 4px;line-height:1" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='rgba(239,68,68,0.5)'">🗑️</button>`
            : '';
        html += `<div style="${taStyle}${isMe ? 'background:rgba(0,217,54,0.05);border:1px solid rgba(0,217,54,0.18)' : 'background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05)'}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="font-weight:700;font-size:0.85rem">${predName}${isMe ? ' <span style="color:var(--color-accent);font-size:0.72rem">← toi</span>' : ''}</span>
                <span style="display:flex;align-items:center;gap:6px">
                    ${pred.scored ? `<span style="color:var(--color-accent);font-weight:700;font-size:0.85rem">${pred.score} pt${pred.score !== 1 ? 's' : ''}</span>` : ''}
                    ${adminDeleteBtn}
                </span>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;${top3Parts.length ? 'margin-bottom:5px' : ''}">
                ${finalistNames.map(n => `<span style="background:rgba(255,255,255,0.06);border-radius:5px;padding:2px 7px;font-size:0.75rem">${n}</span>`).join('')}
            </div>
            ${top3Parts.length ? `<div style="font-size:0.78rem;color:var(--color-text-secondary)">${top3Parts.join(' · ')}</div>` : ''}
        </div>`;
    });

    html += `</div>`;
    return html;
}

// ── Leaderboard global des meilleurs prédicteurs ──────────────────────────────

function globalLeaderboardHtml() {
    const scoredPreds = state.data.predictions.filter(p => p.scored);
    if (scoredPreds.length === 0) return '';

    const totals = {};
    scoredPreds.forEach(pred => {
        if (!totals[pred.playerId]) totals[pred.playerId] = { total: 0, count: 0 };
        totals[pred.playerId].total += pred.score || 0;
        totals[pred.playerId].count++;
    });

    const ranked = Object.entries(totals).sort((a, b) => b[1].total - a[1].total).slice(0, 10);
    if (ranked.length === 0) return '';

    const medals = ['🥇', '🥈', '🥉'];
    let html = `<div class="card" style="margin-top:16px">
        <h2 style="margin-bottom:14px">🏆 Meilleurs prédicteurs</h2>`;

    ranked.forEach(([id, data], i) => {
        const player = state.data.participants.find(p => p.id === id);
        const isMe = state.currentUser && player?.userId === state.currentUser.uid;
        html += `<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;margin-bottom:3px;${isMe ? 'background:rgba(0,217,54,0.05);border:1px solid rgba(0,217,54,0.14)' : 'border-bottom:1px solid rgba(255,255,255,0.04)'}">
            <span style="min-width:22px;text-align:center;font-size:${i < 3 ? '1rem' : '0.75rem'};${i >= 3 ? 'color:rgba(255,255,255,0.3)' : ''}">${medals[i] || (i + 1)}</span>
            <span style="flex:1;font-weight:${isMe ? '700' : '400'};font-size:0.88rem">${player ? pName(player) : '?'}${isMe ? ' <span style="color:var(--color-accent);font-size:0.72rem">← toi</span>' : ''}</span>
            <span style="font-size:0.75rem;color:var(--color-text-secondary)">${data.count} éd.</span>
            <span style="font-weight:700;color:${i === 0 ? 'var(--color-accent)' : 'var(--color-text-primary)'};min-width:52px;text-align:right">${data.total} pts</span>
        </div>`;
    });

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
            html += `<p style="color:var(--color-text-secondary);font-size:0.85rem;font-style:italic;margin-bottom:12px">Tu n'avais pas fait de prédiction pour cette édition.</p>`;
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
        html += `<p style="font-size:0.78rem;color:var(--color-text-secondary);margin-bottom:14px">Tu peux modifier ta prédiction jusqu'au début de l'édition.</p>`;
    }

    // ── Étape 1 : finalistes ──
    const stepStyle = `display:flex;align-items:center;gap:10px;margin-bottom:10px`;
    const stepNumStyle = (active) => `width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:700;flex-shrink:0;${active ? 'background:var(--color-accent);color:#000' : 'background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.4)'}`;

    html += `<div style="${stepStyle}">
        <div style="${stepNumStyle(true)}">1</div>
        <div style="font-weight:700;font-size:0.9rem">Qui sera en finale ?</div>
        ${s.finalists.size > 0 ? `<span style="margin-left:auto;font-size:0.78rem;color:var(--color-accent);font-weight:600">${s.finalists.size} sélectionné${s.finalists.size > 1 ? 's' : ''}</span>` : ''}
    </div>
    <p style="font-size:0.78rem;color:var(--color-text-secondary);margin-bottom:8px;padding-left:32px">Sélectionne les joueurs que tu penses voir en finale (+1 pt par bonne réponse)</p>`;

    if (players.length > 10) {
        html += `<input id="pred-search-${edId}" type="text" placeholder="Rechercher un joueur..." oninput="filterPredSearch('${edId}')"
            style="width:100%;box-sizing:border-box;margin-bottom:8px;padding:7px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:var(--color-text-primary);font-size:0.85rem;outline:none">`;
    }

    html += `<div id="pred-grid-${edId}" class="pred-player-grid" style="max-height:200px;overflow-y:auto;padding-right:4px;margin-bottom:4px">`;
    players.forEach(p => {
        const sel = s.finalists.has(p.id) ? ' selected-finalist' : '';
        html += `<div class="pred-player-chip${sel}" data-name="${pName(p)}" onclick="togglePredFinalist('${edId}','${p.id}')">${pName(p)}</div>`;
    });
    html += `</div>`;

    // ── Étape 2 : top 3 ──
    const step2Active = s.finalists.size > 0;
    html += `<div style="${stepStyle};margin-top:18px">
        <div style="${stepNumStyle(step2Active)}">2</div>
        <div style="font-weight:700;font-size:0.9rem;${step2Active ? '' : 'color:rgba(255,255,255,0.3)'}">Ton top 3</div>
    </div>`;

    const finalistPlayers = players.filter(p => s.finalists.has(p.id));
    if (finalistPlayers.length === 0) {
        html += `<p style="font-size:0.78rem;color:rgba(255,255,255,0.2);padding-left:32px">Sélectionne d'abord tes finalistes ci-dessus.</p>`;
    } else {
        html += `<p style="font-size:0.78rem;color:var(--color-text-secondary);margin-bottom:10px;padding-left:32px">Parmi tes finalistes, qui termine dans le top 3 ? (+3 pts si position exacte)</p>`;
        [0,1,2].forEach(i => {
            const rankClass = `selected-top${i+1}`;
            html += `<div style="margin-bottom:8px;padding-left:32px">
                <span style="font-size:0.82rem;font-weight:700;margin-right:8px">${rankLabels[i]}</span>
                <div class="pred-player-grid" style="display:inline-flex;flex-wrap:wrap;gap:6px;margin-top:4px">`;
            finalistPlayers.forEach(p => {
                const isChosen = s.top3[i] === p.id;
                html += `<div class="pred-player-chip${isChosen ? ' ' + rankClass : ''}" onclick="setPredTop('${edId}',${i+1},'${p.id}')">${pName(p)}</div>`;
            });
            html += `</div></div>`;
        });
    }

    const canSubmit = !!(state.currentUser && myPart);
    html += `<div style="margin-top:16px;padding-left:32px">
        <button class="btn btn-primary" onclick="submitPrediction('${edId}')" ${canSubmit ? '' : 'disabled title="Connecte-toi et inscris-toi pour prédire"'}>
            ${myPred ? '✏️ Modifier ma prédiction' : '✅ Envoyer ma prédiction'}
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
            <h2 style="margin:0">🔮 Mon historique</h2>
            <div style="display:flex;gap:14px">
                <span style="font-size:0.78rem;color:var(--color-text-secondary)">${rows.length} éd. prédite${rows.length > 1 ? 's' : ''}</span>
                <span style="font-size:0.85rem;font-weight:700;color:var(--color-accent)">${totalPts} pts total</span>
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
            : `<span style="font-size:0.75rem;color:rgba(255,255,255,0.3);font-style:italic">Non calculé</span>`;

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

    if (upcoming.length === 0 && past.length === 0) {
        html = '<div class="card"><div class="empty-state"><span class="empty-state-icon">🔮</span><p>Aucune prédiction disponible pour le moment</p></div></div>';
        container.innerHTML = html;
        return;
    }

    if (upcoming.length > 0) {
        html += '<div class="card"><h2>🔮 Prédictions</h2>';
        upcoming.forEach(e => {
            const dateStr = e.date ? new Date(e.date).toLocaleDateString(dateLang(), { day: 'numeric', month: 'long', year: 'numeric' }) : '';
            const inscribedIds = new Set(state.data.results
                .filter(r => r.editionId === e.id && (r.phase === 'inscription' || r.phase === 'qualification'))
                .map(r => r.playerId));
            if (inscribedIds.size === 0 && e.status !== 'en_cours') return;

            const predCount = state.data.predictions.filter(p => p.editionId === e.id).length;
            const isLive = e.status === 'en_cours';
            const badgeHtml = isLive
                ? `<span class="pred-badge" style="background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid rgba(239,68,68,0.2)">🔴 En cours — Prédictions fermées</span>`
                : `<span class="pred-badge open">Ouvert</span>`;

            let bodyContent;
            if (isLive) {
                const players = state.data.participants.filter(p => inscribedIds.has(p.id));
                const myPart = state.currentUser ? state.data.participants.find(p => p.userId === state.currentUser.uid) : null;
                const myPred = myPart ? state.data.predictions.find(p => p.editionId === e.id && p.playerId === myPart.id) : null;
                const finaleResults = state.data.results.filter(r => r.editionId === e.id && r.phase === 'finale');
                const hasResults = finaleResults.length > 0;
                let lockedHtml = '';
                if (myPred) lockedHtml += recapCardHtml(myPred, players, hasResults ? finaleResults : null);
                else if (myPart) lockedHtml += `<p style="color:var(--color-text-secondary);font-size:0.85rem;font-style:italic;margin-bottom:12px">Tu n'avais pas fait de prédiction pour cette édition.</p>`;
                lockedHtml += communityPredHtml(e.id, players);
                bodyContent = lockedHtml;
            } else {
                bodyContent = `<div id="pred-form-${e.id}"></div>`;
            }

            html += `<div class="pred-edition-card">
                <div class="pred-edition-header">
                    <div style="flex:1;font-weight:800">${e.name}</div>
                    <div style="font-size:0.8rem;color:var(--color-text-secondary)">${dateStr}</div>
                    ${badgeHtml}
                    <span style="font-size:0.75rem;color:rgba(255,255,255,0.3)">${predCount} prédiction${predCount !== 1 ? 's' : ''}</span>
                </div>
                <div class="pred-body">${bodyContent}</div>
            </div>`;
        });
        html += '</div>';
    }

    if (past.length > 0) {
        html += '<div class="card"><h2>📊 Résultats des prédictions</h2>';
        past.forEach(e => {
            const preds = state.data.predictions.filter(p => p.editionId === e.id && p.scored);
            if (preds.length === 0) {
                if (!state.isAdmin) return;
                html += `<div class="pred-edition-card">
                    <div class="pred-edition-header">
                        <div style="flex:1;font-weight:700">${e.name}</div>
                        <span class="pred-badge closed">Non calculé</span>
                    </div>
                    <div class="pred-body">
                        <button class="btn btn-secondary" onclick="calculatePredictionScores('${e.id}')">⚡ Calculer les scores</button>
                    </div>
                </div>`;
                return;
            }

            const ranked = [...preds].sort((a, b) => (b.score || 0) - (a.score || 0));
            const dateStr = e.date ? new Date(e.date).toLocaleDateString(dateLang(), { day: 'numeric', month: 'long' }) : '';
            const adminCalc = state.isAdmin ? `<button class="btn btn-secondary btn-small" style="margin-left:auto" onclick="calculatePredictionScores('${e.id}')">🔄 Recalculer</button>` : '';
            html += `<div class="pred-edition-card">
                <div class="pred-edition-header">
                    <div style="flex:1;font-weight:700">${e.name}</div>
                    <div style="font-size:0.8rem;color:var(--color-text-secondary)">${dateStr}</div>
                    <span class="pred-badge scored">Calculé</span>
                    ${adminCalc}
                </div>
                <div class="pred-body">`;
            ranked.forEach((pred, i) => {
                const player = state.data.participants.find(p => p.id === pred.playerId);
                const isMe = state.currentUser && player?.userId === state.currentUser.uid;
                const rName = player ? pName(player) : '?';
                const adminDel = state.isAdmin
                    ? `<button onclick="deletePrediction('${pred.id}','${rName.replace(/'/g,"\\'")}\")" title="Supprimer" style="background:none;border:none;cursor:pointer;color:rgba(239,68,68,0.4);font-size:0.8rem;padding:0 2px" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='rgba(239,68,68,0.4)'">🗑️</button>`
                    : '';
                html += `<div class="pred-score-row" style="${isMe ? 'background:rgba(0,217,54,0.04);border-radius:6px;padding:8px 6px;' : ''}">
                    <span style="color:rgba(255,255,255,0.3);font-size:0.75rem;min-width:22px">${i+1}.</span>
                    <span style="flex:1;font-weight:${isMe?'700':'400'}">${rName}${isMe ? ' <span style="color:var(--color-accent);font-size:0.75rem">← toi</span>' : ''}</span>
                    <span class="pred-score-pts">${pred.score} pt${pred.score !== 1 ? 's' : ''}</span>
                    ${adminDel}
                </div>`;
            });
            html += '</div></div>';
        });
        html += '</div>';
    }

    // Historique personnel
    html += myHistoryHtml();

    // Leaderboard global
    html += globalLeaderboardHtml();

    container.innerHTML = html;

    upcoming.forEach(e => {
        const inscribedIds = new Set(state.data.results
            .filter(r => r.editionId === e.id && (r.phase === 'inscription' || r.phase === 'qualification'))
            .map(r => r.playerId));
        if (inscribedIds.size > 0 || e.status === 'en_cours') renderPredForm(e.id);
    });
}
