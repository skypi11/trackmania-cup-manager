// modules/admin-forms.js — Formulaires admin (CRUD participants & éditions)

import { db } from '../../shared/firebase-config.js';
import { state } from './state.js';
import { t } from '../../shared/i18n.js';
import { pName, showToast } from './utils.js';
import { storeTmxThumbs } from './display-editions.js';
import { updateDoc, deleteDoc, addDoc, doc, collection, arrayUnion } from 'firebase/firestore';

const cupId = new URLSearchParams(window.location.search).get('cup') || 'monthly';

// Pre-fill saison field with current year
const saisonInput = document.getElementById('editionSaison');
if (saisonInput && !saisonInput.value) saisonInput.value = new Date().getFullYear();

// ── Add participant ───────────────────────────────────────────────────────────

document.getElementById('addParticipantForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('playerName').value.trim();
    const team = document.getElementById('playerTeam').value.trim();
    if (state.data.participants.some(p => pName(p).toLowerCase() === name.toLowerCase())) {
        alert(t('admin.player.exists')); return;
    }
    await addDoc(collection(db, 'participants'), { name, team: team || 'Sans équipe', cupId });
    e.target.reset();
});

// ── Add edition ───────────────────────────────────────────────────────────────

document.getElementById('addEditionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dateVal     = document.getElementById('editionDate').value;
    const time        = document.getElementById('editionTime').value;
    const club        = document.getElementById('editionClub').value.trim();
    const salon       = document.getElementById('editionSalon').value.trim();
    const password    = document.getElementById('editionPassword').value.trim();
    const status      = document.getElementById('editionStatus').value;
    const description = document.getElementById('editionDesc').value.trim();
    const youtubeUrl  = document.getElementById('editionYoutube').value.trim();
    const saison      = parseInt(document.getElementById('editionSaison').value) || (dateVal ? new Date(dateVal).getFullYear() : new Date().getFullYear());
    const nbMaps         = parseInt(document.getElementById('editionNbMaps').value) || 6;
    const nbQualifPerMap = parseInt(document.getElementById('editionNbQualifPerMap').value) || 3;
    const mapTmxValsCreate = Object.fromEntries([1,2,3,4,5,6,7].map(n => [n, document.getElementById(`editionMap${n}tmx`)?.value.trim() || '']));
    const newEditionRef = await addDoc(collection(db, 'editions'), {
        name: document.getElementById('editionName').value.trim(),
        date: dateVal,
        status,
        saison,
        statusHistory: [{ status, at: new Date().toISOString() }],
        ...(time        ? { time }        : {}),
        ...(club        ? { club }        : {}),
        ...(salon       ? { salon }       : {}),
        ...(password    ? { password }    : {}),
        ...(description ? { description } : {}),
        ...(youtubeUrl  ? { youtubeUrl }  : {}),
        ...(Object.fromEntries([1,2,3,4,5,6,7].flatMap(n => [[`map${n}tmx`, mapTmxValsCreate[n]], [`map${n}name`, document.getElementById(`editionMap${n}name`)?.value.trim() || '']]))),
        nbMaps,
        nbQualifPerMap,
        cupId
    });
    storeTmxThumbs(newEditionRef.id, mapTmxValsCreate);
    e.target.reset();
    document.getElementById('editionSaison').value = new Date().getFullYear();
});

// ── Edit participant ──────────────────────────────────────────────────────────

window.openEditParticipant = (id) => {
    const p = state.data.participants.find(p => p.id === id);
    if (!p) return;
    document.getElementById('editParticipantId').value = id;
    document.getElementById('editPlayerName').value = pName(p);
    document.getElementById('editPlayerTeam').value = p.team === 'Sans équipe' ? '' : p.team;
    document.getElementById('editParticipantModal').classList.add('open');
};
window.closeEditParticipant = () => {
    document.getElementById('editParticipantModal').classList.remove('open');
};
document.getElementById('editParticipantForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editParticipantId').value;
    const name = document.getElementById('editPlayerName').value.trim();
    const team = document.getElementById('editPlayerTeam').value.trim();
    const duplicate = state.data.participants.find(p => pName(p).toLowerCase() === name.toLowerCase() && p.id !== id);
    if (duplicate) { alert(t('admin.pseudo.used')); return; }
    await updateDoc(doc(db, 'participants', id), { pseudoTM: name, name, team: team || 'Sans équipe' });
    window.closeEditParticipant();
});

// ── Edit edition ──────────────────────────────────────────────────────────────

window.openEditEdition = (id) => {
    const e = state.data.editions.find(e => e.id === id);
    if (!e) return;
    document.getElementById('editEditionId').value = id;
    document.getElementById('editEditionName').value = e.name;
    document.getElementById('editEditionDate').value = e.date;
    document.getElementById('editEditionTime').value = e.time || '';
    document.getElementById('editEditionClub').value = e.club || '';
    document.getElementById('editEditionSalon').value = e.salon || '';
    document.getElementById('editEditionPassword').value = e.password || '';
    document.getElementById('editEditionStatus').value = e.status || 'inscriptions';
    document.getElementById('editEditionDesc').value = e.description || '';
    document.getElementById('editEditionYoutube').value = e.youtubeUrl || '';
    document.getElementById('editEditionSaison').value = e.saison || new Date(e.date).getFullYear();
    document.getElementById('editEditionNbMaps').value = e.nbMaps || 6;
    document.getElementById('editEditionNbQualifPerMap').value = e.nbQualifPerMap || 3;
    [1,2,3,4,5,6,7].forEach(n => {
        document.getElementById(`editEditionMap${n}tmx`).value = e[`map${n}tmx`] || '';
        document.getElementById(`editEditionMap${n}name`).value = e[`map${n}name`] || '';
    });
    document.getElementById('editEditionModal').classList.add('open');
};
window.closeEditEdition = () => {
    document.getElementById('editEditionModal').classList.remove('open');
};
document.getElementById('editEditionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id       = document.getElementById('editEditionId').value;
    const name     = document.getElementById('editEditionName').value.trim();
    const date     = document.getElementById('editEditionDate').value;
    const time     = document.getElementById('editEditionTime').value;
    const club     = document.getElementById('editEditionClub').value.trim();
    const salon    = document.getElementById('editEditionSalon').value.trim();
    const password = document.getElementById('editEditionPassword').value.trim();
    const description = document.getElementById('editEditionDesc').value.trim();
    const youtubeUrl  = document.getElementById('editEditionYoutube').value.trim();
    const newStatus = document.getElementById('editEditionStatus').value;
    const current   = state.data.editions.find(ed => ed.id === id);
    const saison         = parseInt(document.getElementById('editEditionSaison').value) || new Date(date).getFullYear();
    const nbMaps         = parseInt(document.getElementById('editEditionNbMaps').value) || 6;
    const nbQualifPerMap = parseInt(document.getElementById('editEditionNbQualifPerMap').value) || 3;
    const mapsTmx = {}; [1,2,3,4,5,6,7].forEach(n => { mapsTmx[`map${n}tmx`] = document.getElementById(`editEditionMap${n}tmx`).value.trim(); mapsTmx[`map${n}name`] = document.getElementById(`editEditionMap${n}name`).value.trim(); });
    const updates   = { name, date, time, club, salon, password, description, youtubeUrl, status: newStatus, saison, nbMaps, nbQualifPerMap, ...mapsTmx };
    if (current && current.status !== newStatus) {
        updates.statusHistory = arrayUnion({ status: newStatus, at: new Date().toISOString() });
    }
    await updateDoc(doc(db, 'editions', id), updates);
    window.closeEditEdition();
    const mapTmxVals = {}; [1,2,3,4,5,6,7].forEach(n => { mapTmxVals[n] = mapsTmx[`map${n}tmx`]; });
    storeTmxThumbs(id, mapTmxVals);
});

// ── Delete ────────────────────────────────────────────────────────────────────

window.deleteParticipant = async (id) => {
    if (!confirm(t('msg.confirm.delete.player'))) return;
    for (const r of state.data.results.filter(r => r.playerId === id))
        await deleteDoc(doc(db, 'results', r.id));
    await deleteDoc(doc(db, 'participants', id));
};

window.deleteEdition = async (id) => {
    if (!confirm(t('msg.confirm.delete.edition'))) return;
    for (const r of state.data.results.filter(r => r.editionId === id))
        await deleteDoc(doc(db, 'results', r.id));
    await deleteDoc(doc(db, 'editions', id));
};

window.deleteResult = async (id) => {
    if (!confirm(t('msg.confirm.delete.result'))) return;
    await deleteDoc(doc(db, 'results', id));
};

// ── Diagnostic & réparation des données ──────────────────────────────────────

window.runDataDiagnostic = async function() {
    const container = document.getElementById('diagResults');
    if (!container) return;
    container.innerHTML = '<div style="color:var(--color-text-secondary);font-size:0.85rem">Analyse en cours…</div>';

    const participantIds = new Set(state.data.participants.map(p => p.id));

    // Résultats orphelins (playerId inexistant dans participants)
    const orphaned = state.data.results.filter(r => !participantIds.has(r.playerId));
    const orphanedByPlayerId = {};
    orphaned.forEach(r => {
        if (!orphanedByPlayerId[r.playerId]) orphanedByPlayerId[r.playerId] = [];
        orphanedByPlayerId[r.playerId].push(r);
    });

    // Doublons de participants (même userId)
    const byUserId = {};
    state.data.participants.forEach(p => {
        if (p.userId) {
            if (!byUserId[p.userId]) byUserId[p.userId] = [];
            byUserId[p.userId].push(p);
        }
    });
    const duplicates = Object.values(byUserId).filter(arr => arr.length > 1);

    let html = '';

    if (duplicates.length > 0) {
        html += `<div style="margin-bottom:16px">
            <div style="font-weight:700;color:var(--color-warning);margin-bottom:8px">⚠️ ${duplicates.length} compte(s) dupliqué(s) (même userId)</div>`;
        duplicates.forEach(players => {
            html += `<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:10px 12px;margin-bottom:6px;font-size:0.8rem">`;
            players.forEach(p => {
                const nbRes = state.data.results.filter(r => r.playerId === p.id).length;
                html += `<div style="margin-bottom:3px">ID <code style="font-size:0.72rem;background:rgba(255,255,255,0.07);padding:1px 5px;border-radius:4px">${p.id}</code> — <b>${pName(p)}</b> — ${nbRes} résultat(s)</div>`;
            });
            html += `</div>`;
        });
        html += `</div>`;
    }

    if (Object.keys(orphanedByPlayerId).length > 0) {
        html += `<div>
            <div style="font-weight:700;color:var(--color-danger);margin-bottom:12px">❌ ${orphaned.length} résultat(s) orphelin(s) — ${Object.keys(orphanedByPlayerId).length} ancien(s) ID</div>`;

        Object.entries(orphanedByPlayerId).forEach(([oldId, results]) => {
            // Pour chaque résultat orphelin, trouver les joueurs qui N'ont PAS ce type de résultat dans cette édition
            const candidates = [];
            results.forEach(r => {
                const edName = state.data.editions.find(e => e.id === r.editionId)?.name || r.editionId;
                const playersWithSameResult = new Set(
                    state.data.results
                        .filter(x => x.editionId === r.editionId && x.phase === r.phase)
                        .map(x => x.playerId)
                );
                // Joueurs qui n'ont pas encore ce résultat dans cette édition
                state.data.participants
                    .filter(p => !playersWithSameResult.has(p.id))
                    .forEach(p => {
                        if (!candidates.find(c => c.id === p.id)) candidates.push(p);
                    });
            });
            candidates.sort((a,b) => pName(a).localeCompare(pName(b)));

            const phases = results.map(r => {
                const edName = state.data.editions.find(e => e.id === r.editionId)?.name || '?';
                return `<b>${r.phase}</b>${r.position ? ' P'+r.position : ''} — ${edName}`;
            }).join('<br>');

            const allOpts = state.data.participants
                .sort((a,b) => pName(a).localeCompare(pName(b)))
                .map(p => `<option value="${p.id}">${pName(p)}</option>`).join('');

            const candidateNote = candidates.length > 0
                ? `<div style="font-size:0.75rem;color:var(--color-warning);margin-bottom:6px">💡 Candidats probables (n'ont pas encore ce résultat) : <b>${candidates.map(p => pName(p)).join(', ')}</b></div>`
                : '';

            const safeId = oldId.replace(/[^a-zA-Z0-9]/g,'_');
            html += `<div style="background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:12px;margin-bottom:10px">
                <div style="font-size:0.78rem;margin-bottom:8px">${phases}</div>
                ${candidateNote}
                <div style="display:flex;gap:8px;align-items:center">
                    <select id="remap-${safeId}" style="flex:1;padding:7px 10px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);color:#fff;font-size:0.82rem;font-family:inherit">
                        <option value="">— Sélectionner le bon joueur —</option>
                        ${candidates.length > 0 ? '<optgroup label="Candidats probables">' + candidates.map(p => `<option value="${p.id}">${pName(p)}</option>`).join('') + '</optgroup><optgroup label="Tous les joueurs">' + allOpts + '</optgroup>' : allOpts}
                    </select>
                    <button onclick="repairOrphanedResults('${oldId}')" style="padding:7px 14px;border-radius:8px;background:var(--color-danger);color:#fff;border:none;font-size:0.8rem;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">Réassigner</button>
                </div>
            </div>`;
        });
        html += `</div>`;
    }

    if (orphaned.length === 0 && duplicates.length === 0) {
        html = '<div style="color:var(--color-accent);font-size:0.85rem">✅ Aucun problème détecté — toutes les données sont cohérentes.</div>';
    }

    container.innerHTML = html;
};

window.repairOrphanedResults = async function(oldPlayerId) {
    const safeId = oldPlayerId.replace(/[^a-zA-Z0-9]/g, '_');
    const sel = document.getElementById(`remap-${safeId}`);
    const newPlayerId = sel?.value;
    if (!newPlayerId) { alert('Sélectionne un joueur cible.'); return; }
    const toUpdate = state.data.results.filter(r => r.playerId === oldPlayerId);
    if (!confirm(`Réassigner ${toUpdate.length} résultat(s) vers ce joueur ?`)) return;
    for (const r of toUpdate) {
        await updateDoc(doc(db, 'results', r.id), { playerId: newPlayerId });
    }
    showToast(`✅ ${toUpdate.length} résultat(s) réassigné(s)`);
    runDataDiagnostic();
};
