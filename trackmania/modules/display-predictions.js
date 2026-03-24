// modules/display-predictions.js — Prédictions

import { db } from '../../shared/firebase-config.js';
import { state } from './state.js';
import { t } from '../../shared/i18n.js';
import { pName, dateLang } from './utils.js';
import { updateDoc, doc, addDoc, collection } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';

const cupId = new URLSearchParams(window.location.search).get('cup') || 'monthly';

// ── Handlers interactifs ──────────────────────────────────────────────────────

window.togglePredFinalist = function(edId, playerId) {
    if (!state.predState[edId]) state.predState[edId] = { finalists: new Set(), top3: [null,null,null] };
    const s = state.predState[edId];
    if (s.finalists.has(playerId)) s.finalists.delete(playerId);
    else s.finalists.add(playerId);
    renderPredForm(edId);
};

window.setPredTop = function(edId, rank, playerId) {
    if (!state.predState[edId]) state.predState[edId] = { finalists: new Set(), top3: [null,null,null] };
    const s = state.predState[edId];
    s.top3 = s.top3.map((p, i) => (p === playerId && i !== rank - 1) ? null : p);
    s.top3[rank - 1] = s.top3[rank - 1] === playerId ? null : playerId;
    renderPredForm(edId);
};

window.submitPrediction = async function(edId) {
    if (!state.currentUser) { alert(t('predictions.login')); return; }
    const s = state.predState[edId];
    if (!s || s.finalists.size === 0) { alert(t('predictions.select')); return; }
    const myPart = state.data.participants.find(p => p.userId === state.currentUser.uid);
    if (!myPart) { alert(t('predictions.must.reg')); return; }

    const existing = state.data.predictions.find(p => p.editionId === edId && p.playerId === myPart.id);
    const payload = {
        editionId: edId,
        playerId: myPart.id,
        cupId,
        finalists: [...s.finalists],
        top3: s.top3,
        createdAt: new Date().toISOString(),
        score: null, scored: false
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

// ── Formulaire de prédiction (rendu interne) ──────────────────────────────────

function renderPredForm(edId) {
    const container = document.getElementById(`pred-form-${edId}`);
    if (!container) return;
    const edition = state.data.editions.find(e => e.id === edId);
    if (!edition) return;

    const myPart = state.currentUser ? state.data.participants.find(p => p.userId === state.currentUser.uid) : null;
    const myPred = myPart ? state.data.predictions.find(p => p.editionId === edId && p.playerId === myPart.id) : null;

    if (!state.predState[edId] && myPred) {
        state.predState[edId] = { finalists: new Set(myPred.finalists || []), top3: myPred.top3 || [null,null,null] };
    }
    if (!state.predState[edId]) state.predState[edId] = { finalists: new Set(), top3: [null,null,null] };
    const s = state.predState[edId];

    const inscribedIds = new Set(state.data.results
        .filter(r => r.editionId === edId && (r.phase === 'inscription' || r.phase === 'qualification'))
        .map(r => r.playerId));
    const players = state.data.participants.filter(p => inscribedIds.has(p.id));

    const rankLabels = ['🥇 1er', '🥈 2ème', '🥉 3ème'];

    let html = `<div class="pred-section-title">Qui sera en finale ?</div>`;
    html += `<p style="font-size:0.78rem;color:var(--color-text-secondary);margin-bottom:8px">Sélectionne les joueurs que tu penses voir en finale</p>`;
    html += `<div class="pred-player-grid">`;
    players.forEach(p => {
        const sel = s.finalists.has(p.id) ? ' selected-finalist' : '';
        html += `<div class="pred-player-chip${sel}" onclick="togglePredFinalist('${edId}','${p.id}')">${pName(p)}</div>`;
    });
    html += `</div>`;

    html += `<div class="pred-section-title" style="margin-top:16px">Ton top 3</div>`;
    html += `<p style="font-size:0.78rem;color:var(--color-text-secondary);margin-bottom:8px">Clique sur une position puis un joueur (+3 pts si correct)</p>`;
    [0,1,2].forEach(i => {
        const rankClass = `selected-top${i+1}`;
        html += `<div style="margin-bottom:6px">
            <span style="font-size:0.82rem;font-weight:700;margin-right:8px">${rankLabels[i]}</span>
            <div class="pred-player-grid" style="display:inline-flex;flex-wrap:wrap;gap:6px">`;
        players.forEach(p => {
            const isChosen = s.top3[i] === p.id;
            html += `<div class="pred-player-chip${isChosen ? ' ' + rankClass : ''}" onclick="setPredTop('${edId}',${i+1},'${p.id}')">${pName(p)}</div>`;
        });
        html += `</div></div>`;
    });

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
        .filter(e => e.status === 'upcoming' || new Date(e.date) > today)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const past = state.data.editions
        .filter(e => e.status === 'terminee' || new Date(e.date) <= today)
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
        html += '<div class="card"><h2>🔮 Prédis l\'édition suivante</h2>';
        upcoming.forEach(e => {
            const dateStr = e.date ? new Date(e.date).toLocaleDateString(dateLang(), { day: 'numeric', month: 'long', year: 'numeric' }) : '';
            const inscribedIds = new Set(state.data.results
                .filter(r => r.editionId === e.id && (r.phase === 'inscription' || r.phase === 'qualification'))
                .map(r => r.playerId));
            if (inscribedIds.size === 0) return;

            const predCount = state.data.predictions.filter(p => p.editionId === e.id).length;
            html += `<div class="pred-edition-card">
                <div class="pred-edition-header">
                    <div style="flex:1;font-weight:800">${e.name}</div>
                    <div style="font-size:0.8rem;color:var(--color-text-secondary)">${dateStr}</div>
                    <span class="pred-badge open">Ouvert</span>
                    <span style="font-size:0.75rem;color:rgba(255,255,255,0.3)">${predCount} prédiction${predCount !== 1 ? 's' : ''}</span>
                </div>
                <div class="pred-body">
                    <div id="pred-form-${e.id}"></div>
                </div>
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
        if (inscribedIds.size > 0) renderPredForm(e.id);
    });
}
