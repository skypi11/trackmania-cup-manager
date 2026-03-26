// modules/display-predictions.js — Prédictions

import { db } from '../../shared/firebase-config.js';
import { state } from './state.js';
import { t } from '../../shared/i18n.js';
import { pName, dateLang } from './utils.js';
import { updateDoc, doc, addDoc, collection } from 'firebase/firestore';

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
    const edition = state.data.editions.find(e => e.id === edId);
    if (edition?.status === 'live' || edition?.status === 'terminee') { alert('Les prédictions sont fermées pour cette édition.'); return; }
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

function recapCardHtml(pred, players) {
    const rankLabels = ['🥇', '🥈', '🥉'];
    const finalistNames = (pred.finalists || []).map(id => pName(players.find(p => p.id === id)) || '?');
    const top3Parts = (pred.top3 || []).map((id, i) => {
        if (!id) return null;
        const p = players.find(p => p.id === id);
        return p ? `${rankLabels[i]} ${pName(p)}` : null;
    }).filter(Boolean);

    let html = `<div style="background:rgba(0,217,54,0.04);border:1px solid rgba(0,217,54,0.15);border-radius:10px;padding:14px;margin-bottom:14px">
        <div style="font-weight:700;font-size:0.9rem;margin-bottom:10px">🔮 Ta prédiction</div>
        <div style="margin-bottom:${top3Parts.length ? '8px' : '0'}">
            <span style="font-size:0.72rem;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.05em">Finalistes (${finalistNames.length})</span>
            <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:5px">`;
    finalistNames.forEach(name => {
        html += `<span style="background:rgba(255,255,255,0.07);border-radius:6px;padding:3px 8px;font-size:0.8rem">${name}</span>`;
    });
    html += `</div></div>`;
    if (top3Parts.length) {
        html += `<div>
            <span style="font-size:0.72rem;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.05em">Top 3</span>
            <div style="display:flex;gap:12px;margin-top:5px;font-size:0.85rem">${top3Parts.map(p => `<span>${p}</span>`).join('')}</div>
        </div>`;
    }
    if (pred.scored) {
        html += `<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);font-weight:700;color:var(--color-accent)">Score : ${pred.score} pt${pred.score !== 1 ? 's' : ''}</div>`;
    }
    html += `</div>`;
    return html;
}

// ── Prédictions communauté (visible dès que l'édition est live) ───────────────

function communityPredHtml(edId, players) {
    const preds = state.data.predictions.filter(p => p.editionId === edId);
    if (preds.length === 0) return '';

    const rankLabels = ['🥇', '🥈', '🥉'];
    const sorted = [...preds].sort((a, b) => (b.score || 0) - (a.score || 0));
    const taStyle = `background:rgba(255,255,255,0.03);border-radius:8px;padding:10px 12px;margin-bottom:8px;`;

    let html = `<div style="margin-top:16px">
        <div class="pred-section-title">👥 Prédictions de la communauté (${preds.length})</div>`;

    sorted.forEach(pred => {
        const predictor = state.data.participants.find(p => p.id === pred.playerId);
        const isMe = state.currentUser && predictor?.userId === state.currentUser.uid;
        const finalistNames = (pred.finalists || []).map(id => pName(players.find(p => p.id === id)) || '?');
        const top3Parts = (pred.top3 || []).map((id, i) => {
            if (!id) return null;
            const p = players.find(p => p.id === id);
            return p ? `${rankLabels[i]} ${pName(p)}` : null;
        }).filter(Boolean);

        html += `<div style="${taStyle}${isMe ? 'border:1px solid rgba(0,217,54,0.2)' : 'border:1px solid rgba(255,255,255,0.06)'}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="font-weight:700;font-size:0.85rem">${predictor ? pName(predictor) : '?'}${isMe ? ' <span style="color:var(--color-accent);font-size:0.72rem">← toi</span>' : ''}</span>
                ${pred.scored ? `<span style="color:var(--color-accent);font-weight:700;font-size:0.85rem">${pred.score} pt${pred.score !== 1 ? 's' : ''}</span>` : ''}
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

// ── Formulaire de prédiction (rendu interne) ──────────────────────────────────

function renderPredForm(edId) {
    const container = document.getElementById(`pred-form-${edId}`);
    if (!container) return;
    const edition = state.data.editions.find(e => e.id === edId);
    if (!edition) return;

    const locked = edition.status === 'live' || edition.status === 'terminee';
    const myPart = state.currentUser ? state.data.participants.find(p => p.userId === state.currentUser.uid) : null;
    const myPred = myPart ? state.data.predictions.find(p => p.editionId === edId && p.playerId === myPart.id) : null;

    const inscribedIds = new Set(state.data.results
        .filter(r => r.editionId === edId && (r.phase === 'inscription' || r.phase === 'qualification'))
        .map(r => r.playerId));
    const players = state.data.participants.filter(p => inscribedIds.has(p.id));

    // ── Locked (live / terminée) : recap + communauté ──
    if (locked) {
        let html = '';
        if (myPred) {
            html += recapCardHtml(myPred, players);
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

    // Recap si déjà voté
    if (myPred) {
        html += recapCardHtml(myPred, players);
        html += `<p style="font-size:0.78rem;color:var(--color-text-secondary);margin-bottom:12px">Tu peux modifier ta prédiction jusqu'au début de l'édition.</p>`;
    }

    // ── Section 1 : sélection finalistes ──
    html += `<div class="pred-section-title">Qui sera en finale ?</div>
        <p style="font-size:0.78rem;color:var(--color-text-secondary);margin-bottom:8px">Sélectionne les joueurs que tu penses voir en finale</p>`;

    if (players.length > 10) {
        html += `<input id="pred-search-${edId}" type="text" placeholder="Rechercher un joueur..." oninput="filterPredSearch('${edId}')"
            style="width:100%;box-sizing:border-box;margin-bottom:8px;padding:7px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:var(--color-text-primary);font-size:0.85rem;outline:none">`;
    }

    html += `<div id="pred-grid-${edId}" class="pred-player-grid" style="max-height:200px;overflow-y:auto;padding-right:4px">`;
    players.forEach(p => {
        const sel = s.finalists.has(p.id) ? ' selected-finalist' : '';
        html += `<div class="pred-player-chip${sel}" data-name="${pName(p)}" onclick="togglePredFinalist('${edId}','${p.id}')">${pName(p)}</div>`;
    });
    html += `</div>`;
    if (s.finalists.size > 0) {
        html += `<p style="font-size:0.75rem;color:var(--color-accent);margin-top:4px">${s.finalists.size} joueur${s.finalists.size > 1 ? 's' : ''} sélectionné${s.finalists.size > 1 ? 's' : ''}</p>`;
    }

    // ── Section 2 : top 3 parmi les finalistes sélectionnés ──
    html += `<div class="pred-section-title" style="margin-top:16px">Ton top 3</div>`;
    const finalistPlayers = players.filter(p => s.finalists.has(p.id));

    if (finalistPlayers.length === 0) {
        html += `<p style="font-size:0.78rem;color:var(--color-text-secondary)">Sélectionne d'abord tes finalistes ci-dessus.</p>`;
    } else {
        html += `<p style="font-size:0.78rem;color:var(--color-text-secondary);margin-bottom:8px">Parmi tes finalistes, qui termine dans le top 3 ? (+3 pts si correct)</p>`;
        [0,1,2].forEach(i => {
            const rankClass = `selected-top${i+1}`;
            html += `<div style="margin-bottom:6px">
                <span style="font-size:0.82rem;font-weight:700;margin-right:8px">${rankLabels[i]}</span>
                <div class="pred-player-grid" style="display:inline-flex;flex-wrap:wrap;gap:6px">`;
            finalistPlayers.forEach(p => {
                const isChosen = s.top3[i] === p.id;
                html += `<div class="pred-player-chip${isChosen ? ' ' + rankClass : ''}" onclick="setPredTop('${edId}',${i+1},'${p.id}')">${pName(p)}</div>`;
            });
            html += `</div></div>`;
        });
    }

    const canSubmit = !!(state.currentUser && myPart);
    html += `<button class="btn btn-primary" style="margin-top:14px" onclick="submitPrediction('${edId}')" ${canSubmit ? '' : 'disabled title="Connecte-toi et inscris-toi pour prédire"'}>
        ${myPred ? '✏️ Modifier ma prédiction' : '✅ Envoyer ma prédiction'}
    </button>`;
    if (!state.currentUser) html += `<p style="font-size:0.78rem;color:var(--color-text-secondary);margin-top:8px">Connecte-toi pour soumettre une prédiction.</p>`;

    container.innerHTML = html;
}

// ── Affichage principal des prédictions ───────────────────────────────────────

export function displayPredictions() {
    const container = document.getElementById('predictionsContent');
    if (!container) return;

    const today = new Date();
    const upcoming = state.data.editions
        .filter(e => e.status === 'upcoming' || e.status === 'inscriptions' || e.status === 'live' || new Date(e.date) > today)
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
            if (inscribedIds.size === 0 && e.status !== 'live') return;

            const predCount = state.data.predictions.filter(p => p.editionId === e.id).length;
            const isLive = e.status === 'live';
            const badgeHtml = isLive
                ? `<span class="pred-badge" style="background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid rgba(239,68,68,0.2)">🔴 En cours — Prédictions fermées</span>`
                : `<span class="pred-badge open">Ouvert</span>`;

            // Pour les éditions live, on injecte directement le contenu verrouillé
            let bodyContent;
            if (isLive) {
                const players = state.data.participants.filter(p => inscribedIds.has(p.id));
                const myPart = state.currentUser ? state.data.participants.find(p => p.userId === state.currentUser.uid) : null;
                const myPred = myPart ? state.data.predictions.find(p => p.editionId === e.id && p.playerId === myPart.id) : null;
                let lockedHtml = '';
                if (myPred) lockedHtml += recapCardHtml(myPred, players);
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
                html += `<div class="pred-score-row" style="${isMe ? 'background:rgba(0,217,54,0.04);border-radius:6px;padding:8px 6px;' : ''}">
                    <span style="color:rgba(255,255,255,0.3);font-size:0.75rem;min-width:22px">${i+1}.</span>
                    <span style="flex:1;font-weight:${isMe?'700':'400'}">${player ? pName(player) : '?'}${isMe ? ' <span style="color:var(--color-accent);font-size:0.75rem">← toi</span>' : ''}</span>
                    <span class="pred-score-pts">${pred.score} pt${pred.score !== 1 ? 's' : ''}</span>
                </div>`;
            });
            html += '</div></div>';
        });
        html += '</div>';
    }

    container.innerHTML = html;

    upcoming.forEach(e => {
        const inscribedIds = new Set(state.data.results
            .filter(r => r.editionId === e.id && (r.phase === 'inscription' || r.phase === 'qualification'))
            .map(r => r.playerId));
        if (inscribedIds.size > 0 || e.status === 'live') renderPredForm(e.id);
    });
}
