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

// ── Admin résultats ───────────────────────────────────────────────────────────

window.displayAdminResults = function() {
    const container = document.getElementById('adminResultsContent');
    if (!container) return;

    const editions = [...state.data.editions].sort((a, b) => new Date(b.date) - new Date(a.date));
    const selectedId = document.getElementById('admResultEditionSelect')?.value || '';

    const editionOptions = editions.map(e =>
        `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${e.name} (${e.date})</option>`
    ).join('');

    let detailHtml = '';
    if (selectedId) {
        const e = editions.find(ed => ed.id === selectedId);
        if (e) {
            const playerOpts = state.data.participants
                .sort((a, b) => pName(a).localeCompare(pName(b)))
                .map(p => `<option value="${p.id}">${pName(p)}</option>`).join('');

            const edResults = state.data.results.filter(r => r.editionId === selectedId);
            const inscriptions = edResults.filter(r => r.phase === 'inscription').sort((a,b) => pName(state.data.participants.find(p=>p.id===a.playerId)).localeCompare(pName(state.data.participants.find(p=>p.id===b.playerId))));
            const quals = edResults.filter(r => r.phase === 'qualification').sort((a,b) => (a.map||0)-(b.map||0) || (a.position||0)-(b.position||0));
            const finale = edResults.filter(r => r.phase === 'finale').sort((a,b) => (a.position||99)-(b.position||99));

            const renderGroup = (title, results, phase) => {
                if (results.length === 0) return `<div style="color:var(--color-text-secondary);font-size:0.82rem;margin-bottom:14px">${title} : aucun résultat.</div>`;
                return `<div style="margin-bottom:18px">
                    <div style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--color-text-secondary);margin-bottom:8px">${title} (${results.length})</div>
                    ${results.map(r => {
                        const player = state.data.participants.find(p => p.id === r.playerId);
                        const label = phase === 'qualification' ? `Map ${r.map} · P${r.position}` : phase === 'finale' ? `P${r.position}` : 'Inscrit';
                        return `<div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
                            <span style="flex:1;font-size:0.85rem">${pName(player)}</span>
                            <span style="font-size:0.75rem;color:var(--color-text-secondary)">${label}</span>
                            <button onclick="deleteResult('${r.id}')" style="padding:3px 8px;border-radius:6px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:#ef4444;font-size:0.72rem;cursor:pointer;font-family:inherit">✕</button>
                        </div>`;
                    }).join('')}
                </div>`;
            };

            detailHtml = `
            <div class="card" style="margin-bottom:16px">
                <h3 style="margin-bottom:14px;font-size:1rem">➕ Ajouter un résultat</h3>
                <div class="form-row">
                    <div class="form-group">
                        <label style="font-size:0.82rem">Phase</label>
                        <select id="admResultPhase" onchange="admOnPhaseChange()" style="font-family:inherit">
                            <option value="">— Choisir —</option>
                            <option value="inscription">Inscription</option>
                            <option value="qualification">Qualification</option>
                            <option value="finale">Finale</option>
                        </select>
                    </div>
                    <div class="form-group" id="admMapField" style="display:none">
                        <label style="font-size:0.82rem">Map</label>
                        <select id="admResultMap" style="font-family:inherit">
                            ${Array.from({length: e.nbMaps || 6}, (_,i) => i+1).map(n => `<option value="${n}">Map ${n}</option>`).join('')}
                            <option value="7">Map Finale</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label style="font-size:0.82rem">Joueur</label>
                        <select id="admResultPlayer" style="font-family:inherit">
                            <option value="">— Sélectionner —</option>
                            ${playerOpts}
                        </select>
                    </div>
                    <div class="form-group" id="admQualPosField" style="display:none">
                        <label style="font-size:0.82rem">Position map</label>
                        <select id="admResultQualPos" style="font-family:inherit">
                            ${Array.from({length: e.nbQualifPerMap || 3}, (_,i) => i+1).map(pos => `<option value="${pos}">${pos}e</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" id="admPositionField" style="display:none">
                        <label style="font-size:0.82rem">Position finale</label>
                        <input type="number" id="admResultPosition" min="1" placeholder="Ex: 1" style="font-family:inherit">
                    </div>
                </div>
                <button onclick="admSubmitResult('${selectedId}')" class="btn btn-primary">Ajouter le résultat</button>
            </div>
            <div class="card">
                <h3 style="margin-bottom:16px;font-size:1rem">Résultats enregistrés (${edResults.length})</h3>
                ${renderGroup('Inscriptions', inscriptions, 'inscription')}
                ${renderGroup('Qualifications', quals, 'qualification')}
                ${renderGroup('Finale', finale, 'finale')}
            </div>`;
        }
    }

    container.innerHTML = `
    <div class="card" style="margin-bottom:16px">
        <div class="form-group" style="margin:0">
            <label style="font-size:0.85rem;font-weight:600;margin-bottom:8px;display:block">Sélectionner une édition</label>
            <select id="admResultEditionSelect" onchange="window.displayAdminResults()"
                style="width:100%;padding:9px 12px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.14);color:#fff;font-size:0.9rem;font-family:inherit">
                <option value="">— Choisir une édition —</option>
                ${editionOptions}
            </select>
        </div>
    </div>
    ${detailHtml}`;
};

window.admOnPhaseChange = function() {
    const phase = document.getElementById('admResultPhase')?.value;
    if (!phase) return;
    document.getElementById('admMapField').style.display    = phase === 'qualification' ? '' : 'none';
    document.getElementById('admQualPosField').style.display = phase === 'qualification' ? '' : 'none';
    document.getElementById('admPositionField').style.display = phase === 'finale' ? '' : 'none';
};

window.admSubmitResult = async function(editionId) {
    const phase    = document.getElementById('admResultPhase')?.value;
    const playerId = document.getElementById('admResultPlayer')?.value;
    if (!phase || !playerId) { showToast('⚠️ Sélectionne une phase et un joueur.'); return; }

    const data = { editionId, playerId, phase, cupId };
    if (phase === 'qualification') {
        data.map      = parseInt(document.getElementById('admResultMap')?.value) || 1;
        data.position = parseInt(document.getElementById('admResultQualPos')?.value) || 1;
    } else if (phase === 'finale') {
        data.position = parseInt(document.getElementById('admResultPosition')?.value) || 1;
    }
    await addDoc(collection(db, 'results'), data);
    showToast('✅ Résultat ajouté');
    // Réinitialiser le formulaire
    document.getElementById('admResultPhase').value = '';
    document.getElementById('admResultPlayer').value = '';
    admOnPhaseChange();
};

// ── Liste admin : Éditions ────────────────────────────────────────────────────

window.displayAdminEditions = function() {
    const container = document.getElementById('adminEditionsList');
    if (!container) return;

    const editions = [...state.data.editions].sort((a, b) => new Date(b.date) - new Date(a.date));

    const statusInfo = {
        fermee:       { label: '🔒 Fermée',       color: 'rgba(255,255,255,0.12)', text: '#888' },
        inscriptions: { label: '📋 Inscriptions', color: 'rgba(0,217,54,0.15)',    text: '#00D936' },
        en_cours:     { label: '🎯 En cours',      color: 'rgba(245,158,11,0.2)',   text: '#f59e0b' },
        terminee:     { label: '✅ Terminée',      color: 'rgba(255,255,255,0.06)', text: '#555' },
    };

    if (editions.length === 0) {
        container.innerHTML = '<p style="color:var(--color-text-secondary);font-size:0.85rem">Aucune édition.</p>';
        return;
    }

    container.innerHTML = editions.map(e => {
        const s = statusInfo[e.status] || statusInfo.fermee;
        const inscrits   = state.data.results.filter(r => r.editionId === e.id && r.phase === 'inscription').length;
        const qualifies  = state.data.results.filter(r => r.editionId === e.id && r.phase === 'qualification').length;
        const finalistes = state.data.results.filter(r => r.editionId === e.id && r.phase === 'finale').length;
        return `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:12px 16px;margin-bottom:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <div style="flex:1;min-width:160px">
                <div style="font-weight:700;margin-bottom:3px">${e.name}</div>
                <div style="font-size:0.78rem;color:var(--color-text-secondary)">${e.date}${e.time ? ' · ' + e.time : ''} · Saison ${e.saison || '?'}</div>
            </div>
            <span style="padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;background:${s.color};color:${s.text};white-space:nowrap">${s.label}</span>
            <div style="font-size:0.78rem;color:var(--color-text-secondary);white-space:nowrap">
                ${inscrits} inscrits · ${qualifies} qualif · ${finalistes} finalistes
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
                <button onclick="openEditEdition('${e.id}')" style="padding:5px 12px;border-radius:7px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:var(--color-text-primary);font-size:0.78rem;font-weight:600;cursor:pointer;font-family:inherit" title="Modifier">✏️ Modifier</button>
                <button onclick="deleteEdition('${e.id}')" style="padding:5px 10px;border-radius:7px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:#ef4444;font-size:0.78rem;font-weight:600;cursor:pointer;font-family:inherit" title="Supprimer">🗑️</button>
            </div>
        </div>`;
    }).join('');
};

// ── Liste admin : Joueurs ─────────────────────────────────────────────────────

window.displayAdminPlayers = function() {
    const container = document.getElementById('adminPlayersList');
    if (!container) return;

    const search = (document.getElementById('adminSearchPlayers')?.value || '').toLowerCase();
    const players = state.data.participants
        .filter(p => !search || pName(p).toLowerCase().includes(search) || (p.pseudo || '').toLowerCase().includes(search))
        .sort((a, b) => pName(a).localeCompare(pName(b)));

    if (players.length === 0) {
        container.innerHTML = '<p style="color:var(--color-text-secondary);font-size:0.85rem">Aucun joueur trouvé.</p>';
        return;
    }

    container.innerHTML = `
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
        <thead>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.1);text-align:left">
                <th style="padding:8px 10px;color:var(--color-text-secondary);font-weight:600;white-space:nowrap">Pseudo site</th>
                <th style="padding:8px 10px;color:var(--color-text-secondary);font-weight:600;white-space:nowrap">Pseudo TM</th>
                <th style="padding:8px 10px;color:var(--color-text-secondary);font-weight:600;white-space:nowrap">Login TM</th>
                <th style="padding:8px 10px;color:var(--color-text-secondary);font-weight:600;white-space:nowrap">Équipe</th>
                <th style="padding:8px 10px;color:var(--color-text-secondary);font-weight:600;white-space:nowrap">Discord</th>
                <th style="padding:8px 10px;color:var(--color-text-secondary);font-weight:600;white-space:nowrap">Auth</th>
                <th style="padding:8px 10px"></th>
            </tr>
        </thead>
        <tbody>
        ${players.map(p => {
            const discordLinked = p.discordId ? `<span style="color:#7b8cff;font-size:0.75rem">@${p.discordUsername || p.discordId}</span>` : `<span style="color:#ef4444;font-size:0.75rem">—</span>`;
            const authType = (p.userId || '').startsWith('discord_')
                ? `<span style="color:#7b8cff;font-size:0.72rem">Discord</span>`
                : p.userId
                    ? `<span style="color:#f59e0b;font-size:0.72rem">Google</span>`
                    : `<span style="color:#555;font-size:0.72rem">—</span>`;
            return `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05)" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
                <td style="padding:8px 10px;font-weight:600">${p.pseudo || '—'}</td>
                <td style="padding:8px 10px;color:var(--color-text-secondary)">${p.pseudoTM || p.name || '—'}</td>
                <td style="padding:8px 10px;color:var(--color-text-secondary)">${p.loginTM || '—'}</td>
                <td style="padding:8px 10px;color:var(--color-text-secondary)">${p.team === 'Sans équipe' ? '—' : (p.team || '—')}</td>
                <td style="padding:8px 10px">${discordLinked}</td>
                <td style="padding:8px 10px">${authType}</td>
                <td style="padding:8px 10px;white-space:nowrap;text-align:right">
                    <button onclick="openEditParticipant('${p.id}')" style="padding:4px 10px;border-radius:6px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:var(--color-text-primary);font-size:0.75rem;font-weight:600;cursor:pointer;font-family:inherit;margin-right:4px">✏️</button>
                    <button onclick="deleteParticipant('${p.id}')" style="padding:4px 8px;border-radius:6px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:#ef4444;font-size:0.75rem;font-weight:600;cursor:pointer;font-family:inherit">🗑️</button>
                </td>
            </tr>`;
        }).join('')}
        </tbody>
    </table>
    </div>`;
};

// ── Migration Discord ─────────────────────────────────────────────────────────

window.displayDiscordMigration = function() {
    const container = document.getElementById('discordMigrationList');
    if (!container) return;

    // Participants sans discordId OU dont le userId ne commence pas par "discord_"
    const toMigrate = state.data.participants.filter(p =>
        !p.discordId || !String(p.userId || '').startsWith('discord_')
    );

    if (toMigrate.length === 0) {
        container.innerHTML = '<div style="color:var(--color-accent);font-size:0.85rem">✅ Tous les joueurs ont un compte Discord lié.</div>';
        return;
    }

    container.innerHTML = toMigrate.map(p => {
        const id = p.id;
        const name = pName(p);
        const currentDiscordId = p.discordId || '';
        const currentDiscordUsername = p.discordUsername || '';
        const userId = p.userId || '';
        const linkedIcon = currentDiscordId ? '🟡' : '🔴';
        const linkedLabel = currentDiscordId
            ? `Discord partiellement lié (ID: ${currentDiscordId}, userId: ${userId})`
            : 'Aucun Discord lié';
        return `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px 16px;margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                <span style="font-weight:700">${name}</span>
                <span style="font-size:0.75rem;color:var(--color-text-secondary)">${linkedIcon} ${linkedLabel}</span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
                <div class="form-group" style="margin:0;flex:1;min-width:160px">
                    <label style="font-size:0.75rem;color:var(--color-text-secondary);margin-bottom:4px;display:block">Discord ID (Snowflake) *</label>
                    <input type="text" id="migDiscordId-${id}" value="${currentDiscordId}" placeholder="Ex: 123456789012345678"
                        style="width:100%;padding:7px 10px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);color:#fff;font-size:0.85rem;font-family:inherit">
                </div>
                <div class="form-group" style="margin:0;flex:1;min-width:140px">
                    <label style="font-size:0.75rem;color:var(--color-text-secondary);margin-bottom:4px;display:block">Pseudo Discord (optionnel)</label>
                    <input type="text" id="migDiscordUsername-${id}" value="${currentDiscordUsername}" placeholder="Ex: PlayerXYZ"
                        style="width:100%;padding:7px 10px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);color:#fff;font-size:0.85rem;font-family:inherit">
                </div>
                <button onclick="linkDiscordManual('${id}')" style="padding:7px 16px;border-radius:8px;background:rgba(88,101,242,0.15);border:1px solid rgba(88,101,242,0.35);color:#7b8cff;font-size:0.82rem;font-weight:700;cursor:pointer;font-family:inherit;flex-shrink:0;white-space:nowrap">
                    🔗 Lier
                </button>
            </div>
            <div id="migMsg-${id}" style="margin-top:6px;font-size:0.8rem;display:none"></div>
        </div>`;
    }).join('');
};

window.linkDiscordManual = async function(participantId) {
    const discordId = document.getElementById(`migDiscordId-${participantId}`)?.value.trim();
    const discordUsername = document.getElementById(`migDiscordUsername-${participantId}`)?.value.trim() || '';
    const msgEl = document.getElementById(`migMsg-${participantId}`);

    if (!discordId) {
        if (msgEl) { msgEl.style.cssText = 'display:block;color:var(--color-danger)'; msgEl.textContent = '⚠️ Le Discord ID est obligatoire.'; }
        return;
    }

    try {
        await updateDoc(doc(db, 'participants', participantId), {
            discordId,
            discordUsername,
            userId: `discord_${discordId}`
        });
        if (msgEl) { msgEl.style.cssText = 'display:block;color:var(--color-accent)'; msgEl.textContent = '✅ Compte lié avec succès !'; }
        // Rafraîchir la liste après 1.5s
        setTimeout(() => window.displayDiscordMigration(), 1500);
    } catch(e) {
        console.error('Discord link error:', e);
        if (msgEl) { msgEl.style.cssText = 'display:block;color:var(--color-danger)'; msgEl.textContent = '❌ Erreur lors de la mise à jour.'; }
    }
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
