// modules/display-duel.js — Comparaison head-to-head entre deux joueurs

import { state } from './state.js';
import { pName } from './utils.js';
import { getPoints } from '../../shared/firebase-config.js';

function playerStats(playerId) {
    const allResults  = state.data.results.filter(r => r.playerId === playerId);
    const finaleRes   = allResults.filter(r => r.phase === 'finale');
    const participations = new Set(allResults.map(r => r.editionId)).size;
    const points      = finaleRes.reduce((sum, r) => sum + getPoints(r.position), 0);
    const wins        = finaleRes.filter(r => r.position === 1).length;
    const podiums     = finaleRes.filter(r => r.position <= 3).length;
    const positions   = finaleRes.map(r => r.position).filter(Boolean);
    const avgPos      = positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : null;
    return { participations, finales: finaleRes.length, points, wins, podiums, avgPos };
}

function h2h(idA, idB) {
    const editionsA = new Set(state.data.results.filter(r => r.playerId === idA && r.phase === 'finale').map(r => r.editionId));
    const common = state.data.results
        .filter(r => r.playerId === idB && r.phase === 'finale' && editionsA.has(r.editionId))
        .map(r => r.editionId);
    let winsA = 0, winsB = 0;
    for (const edId of common) {
        const rA = state.data.results.find(r => r.playerId === idA && r.editionId === edId && r.phase === 'finale');
        const rB = state.data.results.find(r => r.playerId === idB && r.editionId === edId && r.phase === 'finale');
        if (rA && rB) {
            if (rA.position < rB.position) winsA++;
            else if (rB.position < rA.position) winsB++;
        }
    }
    return { total: common.length, winsA, winsB };
}

function statRow(label, valA, valB, higherIsBetter = true) {
    const numA = parseFloat(valA);
    const numB = parseFloat(valB);
    const tie  = numA === numB || (isNaN(numA) && isNaN(numB));
    const aWins = !tie && (higherIsBetter ? numA > numB : numA < numB);
    const bWins = !tie && (higherIsBetter ? numB > numA : numB < numA);
    const hlA = aWins ? 'color:var(--color-accent);font-weight:700;font-size:1.05rem' : 'color:var(--color-text-secondary)';
    const hlB = bWins ? 'color:var(--color-accent);font-weight:700;font-size:1.05rem' : 'color:var(--color-text-secondary)';
    return `<tr style="border-top:1px solid rgba(255,255,255,0.05)">
        <td style="text-align:right;padding:10px 16px;${hlA}">${valA}</td>
        <td style="text-align:center;padding:10px 8px;font-size:0.78rem;color:var(--color-text-secondary);white-space:nowrap;letter-spacing:0.02em">${label}</td>
        <td style="text-align:left;padding:10px 16px;${hlB}">${valB}</td>
    </tr>`;
}

export function displayDuel() {
    const container = document.getElementById('duelContent');
    if (!container) return;

    if (!('duelPlayerA' in state)) state.duelPlayerA = '';
    if (!('duelPlayerB' in state)) state.duelPlayerB = '';

    const players = [...state.data.participants].sort((a, b) => pName(a).localeCompare(pName(b)));
    const idA = state.duelPlayerA;
    const idB = state.duelPlayerB;

    const selectOpts = (selectedId) => players.map(p =>
        `<option value="${p.id}"${p.id === selectedId ? ' selected' : ''}>${pName(p)}</option>`
    ).join('');

    let compHtml = '';
    if (idA && idB && idA !== idB) {
        const pA = players.find(p => p.id === idA);
        const pB = players.find(p => p.id === idB);
        const sA = playerStats(idA);
        const sB = playerStats(idB);
        const duel = h2h(idA, idB);
        const fmt = (n, d = 0) => n !== null ? n.toFixed(d) : '—';

        compHtml += `<div class="card" style="margin-top:16px;overflow:hidden">
            <table style="width:100%;border-collapse:collapse">
                <thead>
                    <tr>
                        <th style="text-align:right;padding:14px 16px;font-size:1.05rem;color:var(--color-accent);font-weight:700">${pName(pA)}</th>
                        <th style="text-align:center;padding:14px 8px;font-size:0.72rem;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Statistiques</th>
                        <th style="text-align:left;padding:14px 16px;font-size:1.05rem;color:var(--color-accent);font-weight:700">${pName(pB)}</th>
                    </tr>
                </thead>
                <tbody>
                    ${statRow('Points totaux', sA.points, sB.points)}
                    ${statRow('Victoires', sA.wins, sB.wins)}
                    ${statRow('Podiums', sA.podiums, sB.podiums)}
                    ${statRow('Finales', sA.finales, sB.finales)}
                    ${statRow('Participations', sA.participations, sB.participations)}
                    ${statRow('Pos. moy. finale', fmt(sA.avgPos, 1), fmt(sB.avgPos, 1), false)}
                </tbody>
            </table>
        </div>`;

        if (duel.total > 0) {
            const known  = duel.winsA + duel.winsB;
            const pctA   = known ? Math.round(duel.winsA / known * 100) : 50;
            const pctB   = 100 - pctA;
            compHtml += `<div class="card" style="margin-top:16px">
                <div style="font-size:0.85rem;color:var(--color-text-secondary);text-align:center;margin-bottom:18px">
                    Head-to-head · <strong style="color:var(--color-text-primary)">${duel.total}</strong> finale${duel.total > 1 ? 's' : ''} en commun
                </div>
                <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px">
                    <span style="font-size:1.5rem;font-weight:800;color:var(--color-accent);min-width:32px;text-align:right">${duel.winsA}</span>
                    <div style="flex:1;height:12px;border-radius:99px;overflow:hidden;background:rgba(255,255,255,0.08);display:flex">
                        <div style="width:${pctA}%;background:var(--color-accent);transition:width 0.5s ease"></div>
                        <div style="width:${pctB}%;background:var(--springs-purple);transition:width 0.5s ease"></div>
                    </div>
                    <span style="font-size:1.5rem;font-weight:800;color:var(--springs-purple);min-width:32px">${duel.winsB}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--color-text-secondary)">
                    <span>${pName(pA)}</span>
                    <span>${pName(pB)}</span>
                </div>
            </div>`;
        } else {
            compHtml += `<div class="card" style="margin-top:16px;text-align:center;color:var(--color-text-secondary);padding:28px">
                Ces deux joueurs ne se sont jamais affrontés en finale.
            </div>`;
        }
    } else if (idA && idB && idA === idB) {
        compHtml = `<div class="card" style="margin-top:16px;text-align:center;color:var(--color-text-secondary);padding:28px">
            Choisissez deux joueurs différents.
        </div>`;
    }

    container.innerHTML = `<div class="card">
        <div style="display:grid;grid-template-columns:1fr 40px 1fr;gap:12px;align-items:end">
            <div class="form-group" style="margin:0">
                <label>Joueur A</label>
                <select onchange="setDuelPlayer('A',this.value)" style="width:100%">
                    <option value="">Choisir un joueur…</option>
                    ${selectOpts(idA)}
                </select>
            </div>
            <div style="text-align:center;padding-bottom:10px;font-size:1.3rem;color:var(--color-text-secondary)">⚔️</div>
            <div class="form-group" style="margin:0">
                <label>Joueur B</label>
                <select onchange="setDuelPlayer('B',this.value)" style="width:100%">
                    <option value="">Choisir un joueur…</option>
                    ${selectOpts(idB)}
                </select>
            </div>
        </div>
    </div>${compHtml}`;
}

window.setDuelPlayer = (which, id) => {
    if (which === 'A') state.duelPlayerA = id;
    else state.duelPlayerB = id;
    displayDuel();
};
