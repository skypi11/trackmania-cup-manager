// modules/admin-forms.js — Formulaires admin (CRUD participants & éditions)

import { db } from '../../shared/firebase-config.js';
import { state } from './state.js';
import { t } from '../../shared/i18n.js';
import { pName, showToast, buildCountryPicker, displayCountry } from './utils.js';
import { storeTmxThumbs } from './display-editions.js';
import { updateDoc, deleteDoc, addDoc, doc, collection, arrayUnion, getDocs, query, where, writeBatch } from 'firebase/firestore';

const cupId = new URLSearchParams(window.location.search).get('cup') || 'monthly';

// Pre-fill saison field with current year
const saisonInput = document.getElementById('editionSaison');
if (saisonInput && !saisonInput.value) saisonInput.value = new Date().getFullYear();

// Initialiser les pickers de pays
document.getElementById('playerCountry_picker').innerHTML = buildCountryPicker('playerCountry');
document.getElementById('editPlayerCountry_picker').innerHTML = buildCountryPicker('editPlayerCountry');

// ── Add participant ───────────────────────────────────────────────────────────

document.getElementById('addParticipantForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name     = document.getElementById('playerName').value.trim();
    const pseudoTM = document.getElementById('playerPseudoTM').value.trim();
    const loginTM  = document.getElementById('playerLoginTM').value.trim();
    const country  = document.getElementById('playerCountry').value.trim();
    const team     = document.getElementById('playerTeam').value.trim();
    if (state.data.participants.some(p => pName(p).toLowerCase() === name.toLowerCase())) {
        alert(t('admin.player.exists')); return;
    }
    await addDoc(collection(db, 'participants'), {
        name, pseudo: name, team: team || 'Sans équipe', cupId,
        createdAt: new Date().toISOString(),
        ...(pseudoTM ? { pseudoTM } : {}),
        ...(loginTM  ? { loginTM  } : {}),
        ...(country  ? { country  } : {}),
    });
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
    document.getElementById('editParticipantId').value    = id;
    document.getElementById('editPlayerName').value       = p.pseudo || pName(p);
    document.getElementById('editPlayerPseudoTM').value   = p.pseudoTM || '';
    document.getElementById('editPlayerLoginTM').value    = p.loginTM  || '';
    document.getElementById('editPlayerCountry_picker').innerHTML = buildCountryPicker('editPlayerCountry', p.country || '');
    document.getElementById('editPlayerTeam').value       = p.team === 'Sans équipe' ? '' : (p.team || '');
    document.getElementById('editParticipantModal').classList.add('open');
};
window.closeEditParticipant = () => {
    document.getElementById('editParticipantModal').classList.remove('open');
};
document.getElementById('editParticipantForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id       = document.getElementById('editParticipantId').value;
    const name     = document.getElementById('editPlayerName').value.trim();
    const pseudoTM = document.getElementById('editPlayerPseudoTM').value.trim();
    const loginTM  = document.getElementById('editPlayerLoginTM').value.trim();
    const country  = document.getElementById('editPlayerCountry').value.trim();
    const team     = document.getElementById('editPlayerTeam').value.trim();
    const duplicate = state.data.participants.find(p => (p.pseudo || pName(p)).toLowerCase() === name.toLowerCase() && p.id !== id);
    if (duplicate) { alert(t('admin.pseudo.used')); return; }
    await updateDoc(doc(db, 'participants', id), { pseudo: name, name, pseudoTM, loginTM, country, team: team || 'Sans équipe' });
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

// ── Admin résultats — 3 onglets spécialisés ──────────────────────────────────

let _admResultTab = 'inscriptions';

window.displayAdminResults = function(tab) {
    if (tab) _admResultTab = tab;
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
        if (e) detailHtml = _admBuildResultDetail(e, selectedId);
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

function _admBuildResultDetail(e, editionId) {
    const edResults = state.data.results.filter(r => r.editionId === editionId);
    const allPlayers = [...state.data.participants].sort((a,b) => pName(a).localeCompare(pName(b)));
    const tab = _admResultTab;

    const tabDefs = [
        { id: 'inscriptions',   label: '📋 Inscriptions' },
        { id: 'qualifications', label: '🏁 Qualifications' },
        { id: 'finale',         label: '🏆 Finale' },
    ];

    const tabBar = `<div style="display:flex;gap:4px;margin-bottom:20px;background:rgba(255,255,255,0.04);border-radius:10px;padding:4px">
        ${tabDefs.map(td => `<button onclick="window.displayAdminResults('${td.id}')" style="flex:1;padding:8px;border-radius:7px;font-size:0.82rem;font-weight:600;cursor:pointer;font-family:inherit;border:none;transition:all 0.15s;${td.id===tab ? 'background:rgba(255,255,255,0.12);color:#f0f0f0' : 'background:transparent;color:#777'}">${td.label}</button>`).join('')}
    </div>`;

    let content = '';
    if (tab === 'inscriptions')   content = _admInscriptionsTab(e, editionId, edResults, allPlayers);
    else if (tab === 'qualifications') content = _admQualificationsTab(e, editionId, edResults, allPlayers);
    else                          content = _admFinaleTab(e, editionId, edResults, allPlayers);

    return `<div class="card">${tabBar}${content}</div>`;
}

function _admInscriptionsTab(e, editionId, edResults, allPlayers) {
    const inscriptions = edResults.filter(r => r.phase === 'inscription');
    const inscribedIds = new Set(inscriptions.map(r => r.playerId));

    const rows = allPlayers.map(p => {
        const isIn = inscribedIds.has(p.id);
        const res  = inscriptions.find(r => r.playerId === p.id);
        const action = isIn ? `admRemoveResult('${res.id}')` : `admAddInscription('${editionId}','${p.id}')`;
        return `<div onclick="${action}" style="display:flex;align-items:center;gap:10px;padding:9px 13px;border-radius:8px;border:1px solid ${isIn ? 'rgba(0,217,54,0.3)' : 'rgba(255,255,255,0.07)'};background:${isIn ? 'rgba(0,217,54,0.07)' : 'rgba(255,255,255,0.02)'};cursor:pointer">
            <span style="font-size:1rem;flex-shrink:0">${isIn ? '✅' : '⬜'}</span>
            <span style="font-size:0.85rem;font-weight:${isIn ? '600' : '400'};color:${isIn ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'}">${pName(p)}</span>
        </div>`;
    }).join('');

    return `<div style="font-size:0.82rem;color:var(--color-text-secondary);margin-bottom:14px">${inscriptions.length} inscrit(s) sur ${allPlayers.length} — cliquer pour ajouter / retirer</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">${rows}</div>`;
}

function _admQualificationsTab(e, editionId, edResults, allPlayers) {
    const quals    = edResults.filter(r => r.phase === 'qualification');
    const nbMaps   = e.nbMaps || 6;
    const nbQualif = e.nbQualifPerMap || 3;

    // Seulement les joueurs inscrits à cette édition
    const inscritIds = new Set(edResults.filter(r => r.phase === 'inscription').map(r => r.playerId));
    const inscritPlayers = inscritIds.size > 0
        ? allPlayers.filter(p => inscritIds.has(p.id))
        : allPlayers; // fallback si aucune inscription saisie
    const playerOpts = inscritPlayers.map(p => `<option value="${p.id}">${pName(p)}</option>`).join('');

    const mapsHtml = Array.from({length: nbMaps}, (_, i) => i + 1).map(mapN => {
        const mapQuals = quals.filter(r => r.map == mapN).sort((a,b) => (a.position||0)-(b.position||0));
        const filledPos = new Set(mapQuals.map(r => r.position));
        const emptyPos  = Array.from({length: nbQualif}, (_, i) => i + 1).filter(p => !filledPos.has(p));
        const allFilled = emptyPos.length === 0;

        const filledRows = mapQuals.map(r => {
            const player = allPlayers.find(p => p.id === r.playerId);
            return `<div style="display:flex;align-items:center;gap:10px;padding:4px 0">
                <span style="font-size:0.75rem;font-weight:700;color:var(--color-accent);width:22px;flex-shrink:0">P${r.position}</span>
                <span style="font-size:0.85rem;flex:1">${pName(player)}</span>
                <button onclick="admRemoveResult('${r.id}')" style="padding:2px 7px;border-radius:5px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:#ef4444;font-size:0.72rem;cursor:pointer;font-family:inherit">✕</button>
            </div>`;
        }).join('');

        const emptySelects = !allFilled ? `
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:${mapQuals.length ? '10px' : '0'};padding-top:${mapQuals.length ? '10px' : '0'};${mapQuals.length ? 'border-top:1px solid rgba(255,255,255,0.06)' : ''}">
            ${emptyPos.map(pos => `<div style="display:flex;flex-direction:column;gap:4px">
                <label style="font-size:0.72rem;font-weight:700;color:var(--color-accent)">P${pos}</label>
                <select id="admQual_${mapN}_${pos}" style="padding:6px 10px;border-radius:7px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.14);color:#fff;font-size:0.82rem;font-family:inherit;min-width:140px">
                    <option value="">— Joueur —</option>${playerOpts}
                </select>
            </div>`).join('')}
            <button onclick="admSubmitMapQuals('${editionId}',${mapN},[${emptyPos.join(',')}])" style="padding:7px 14px;border-radius:7px;background:var(--color-accent);color:#000;border:none;font-size:0.8rem;font-weight:700;cursor:pointer;font-family:inherit;height:34px;align-self:flex-end">Valider</button>
        </div>` : '';

        const mapName = e['map'+mapN+'name'] ? ` <span style="font-weight:400;color:#555">· ${e['map'+mapN+'name']}</span>` : '';
        const filled = mapQuals.length;
        const total  = nbQualif;
        const progressColor = allFilled ? '#00D936' : filled === 0 ? '#ef4444' : '#f59e0b';
        const progressLabel = allFilled
            ? `<span style="font-size:0.72rem;padding:2px 8px;border-radius:10px;background:rgba(0,217,54,0.1);color:#00D936">✅ Complet</span>`
            : `<span style="font-size:0.72rem;padding:2px 8px;border-radius:10px;background:rgba(255,255,255,0.05);color:${progressColor};font-weight:700">${filled}/${total}</span>`;

        return `<div style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
            <div style="font-size:0.8rem;font-weight:700;color:var(--color-text-secondary);margin-bottom:${filledRows || !allFilled ? '8px' : '0'};display:flex;align-items:center;gap:8px">Map ${mapN}${mapName}${progressLabel}</div>
            ${filledRows}${emptySelects}
        </div>`;
    }).join('');

    return `<div style="font-size:0.82rem;color:var(--color-text-secondary);margin-bottom:14px">${quals.length} / ${nbMaps * nbQualif} qualifications saisies</div>
    ${mapsHtml}`;
}

function _admFinaleTab(e, editionId, edResults, allPlayers) {
    const finale = edResults.filter(r => r.phase === 'finale').sort((a,b) => (a.position||99)-(b.position||99));
    const medals = {1:'🥇',2:'🥈',3:'🥉'};

    // Seulement les joueurs qualifiés (au moins une qualif sur une map)
    const qualIds = new Set(edResults.filter(r => r.phase === 'qualification').map(r => r.playerId));
    const finaleIds = new Set(finale.map(r => r.playerId));
    const qualPlayers = qualIds.size > 0
        ? allPlayers.filter(p => qualIds.has(p.id) && !finaleIds.has(p.id)) // exclure déjà dans la finale
        : allPlayers.filter(p => !finaleIds.has(p.id));
    const playerOpts = qualPlayers.map(p => `<option value="${p.id}">${pName(p)}</option>`).join('');

    const rows = finale.map(r => {
        const player = allPlayers.find(p => p.id === r.playerId);
        return `<div style="display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
            <span style="width:24px;text-align:center;flex-shrink:0">${medals[r.position] || ''}</span>
            <span style="font-size:0.82rem;font-weight:700;color:var(--color-text-secondary);width:24px;flex-shrink:0">P${r.position}</span>
            <span style="font-size:0.9rem;flex:1;font-weight:${r.position<=3?'700':'400'}">${pName(player)}</span>
            <button onclick="admRemoveResult('${r.id}')" style="padding:3px 8px;border-radius:6px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:#ef4444;font-size:0.72rem;cursor:pointer;font-family:inherit">✕</button>
        </div>`;
    }).join('');

    return `${rows ? `<div style="margin-bottom:18px">${rows}</div>` : ''}
    <div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:12px;display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
        <div>
            <label style="font-size:0.78rem;color:var(--color-text-secondary);display:block;margin-bottom:5px">Position</label>
            <input type="number" id="admFinalePos" min="1" max="99" placeholder="1" style="width:72px;padding:7px 10px;border-radius:7px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.14);color:#fff;font-size:0.9rem;font-family:inherit">
        </div>
        <div style="flex:1;min-width:160px">
            <label style="font-size:0.78rem;color:var(--color-text-secondary);display:block;margin-bottom:5px">Joueur</label>
            <select id="admFinalePlayer" style="width:100%;padding:7px 10px;border-radius:7px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.14);color:#fff;font-size:0.9rem;font-family:inherit">
                <option value="">— Sélectionner —</option>${playerOpts}
            </select>
        </div>
        <button onclick="admSubmitFinaleResult('${editionId}')" style="padding:8px 16px;border-radius:7px;background:var(--color-accent);color:#000;border:none;font-size:0.85rem;font-weight:700;cursor:pointer;font-family:inherit">Ajouter</button>
    </div>`;
}

window.admAddInscription = async function(editionId, playerId) {
    await addDoc(collection(db, 'results'), { editionId, playerId, phase: 'inscription', cupId });
};

window.admRemoveResult = async function(id) {
    await deleteDoc(doc(db, 'results', id));
};

window.admSubmitMapQuals = async function(editionId, mapN, positions) {
    const toAdd = [];
    const selectedIds = [];
    for (const pos of positions) {
        const playerId = document.getElementById(`admQual_${mapN}_${pos}`)?.value;
        if (!playerId) continue;
        // Doublon sur la même map (deux selects avec le même joueur)
        if (selectedIds.includes(playerId)) {
            const name = pName(state.data.participants.find(p => p.id === playerId));
            showToast(`⚠️ ${name} sélectionné deux fois sur la même map`);
            return;
        }
        // Déjà qualifié sur cette map
        if (state.data.results.some(r => r.editionId === editionId && r.phase === 'qualification' && r.map === mapN && r.playerId === playerId)) {
            const name = pName(state.data.participants.find(p => p.id === playerId));
            showToast(`⚠️ ${name} est déjà qualifié sur cette map`);
            return;
        }
        selectedIds.push(playerId);
        toAdd.push({ editionId, playerId, phase: 'qualification', map: mapN, position: pos, cupId });
    }
    if (!toAdd.length) { showToast('⚠️ Aucun joueur sélectionné'); return; }
    await Promise.all(toAdd.map(d => addDoc(collection(db, 'results'), d)));
    showToast(`✅ ${toAdd.length} qualification(s) enregistrée(s)`);
};

window.admSubmitFinaleResult = async function(editionId) {
    const pos      = parseInt(document.getElementById('admFinalePos')?.value);
    const playerId = document.getElementById('admFinalePlayer')?.value;
    if (!pos || !playerId) { showToast('⚠️ Position et joueur requis'); return; }
    const existing = state.data.results.find(r => r.editionId === editionId && r.phase === 'finale' && r.position === pos);
    if (existing) { showToast(`⚠️ Position P${pos} déjà attribuée`); return; }
    await addDoc(collection(db, 'results'), { editionId, playerId, phase: 'finale', position: pos, cupId });
    document.getElementById('admFinalePos').value = '';
    document.getElementById('admFinalePlayer').value = '';
    showToast('✅ Résultat ajouté');
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

    // ── Détection doublons ──
    const allParticipants = state.data.participants;
    const pseudoGroups = {};
    allParticipants.forEach(p => {
        const key = (p.pseudoTM || p.pseudo || '').toLowerCase().trim();
        if (!key) return;
        if (!pseudoGroups[key]) pseudoGroups[key] = [];
        pseudoGroups[key].push(p);
    });
    const duplicateGroups = Object.values(pseudoGroups).filter(g => g.length > 1);
    const duplicatesHtml = duplicateGroups.length === 0 ? '' : `
    <div style="margin-bottom:16px;padding:12px 16px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:10px">
        <div style="font-weight:700;color:var(--color-warning);margin-bottom:10px;font-size:0.85rem">⚠️ ${duplicateGroups.length} doublon(s) détecté(s)</div>
        ${duplicateGroups.map(group => `
        <div style="margin-bottom:8px;padding:10px 12px;background:rgba(255,255,255,0.03);border-radius:8px">
            <div style="font-size:0.8rem;color:var(--color-text-secondary);margin-bottom:8px">Même pseudo : <strong style="color:#f0f0f0">${pName(group[0])}</strong></div>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${group.map(p => {
                const authLabel = (p.userId||'').startsWith('discord_') ? '🟣 Discord' : p.userId ? '🟡 Google' : '⚫ Sans compte';
                const resultsCount = state.data.results.filter(r => r.playerId === p.id).length;
                return `<div style="flex:1;min-width:180px;padding:8px 10px;background:rgba(255,255,255,0.05);border-radius:7px;font-size:0.78rem">
                    <div style="font-weight:600;margin-bottom:3px">${p.pseudo||'?'}</div>
                    <div style="color:var(--color-text-secondary)">ID: <code style="font-size:0.72rem">${p.id.substring(0,8)}…</code></div>
                    <div style="color:var(--color-text-secondary)">${authLabel} · ${resultsCount} résultat(s)</div>
                    ${p.discordUsername ? `<div style="color:#7b8cff">@${p.discordUsername}</div>` : ''}
                </div>`;
            }).join('')}
            </div>
            ${group.length === 2 ? (() => {
                const r0 = state.data.results.filter(r => r.playerId === group[0].id).length;
                const r1 = state.data.results.filter(r => r.playerId === group[1].id).length;
                const recommended = r0 >= r1 ? 0 : 1; // recommander de garder celui avec le plus de résultats
                const btn = (keepIdx, delIdx) => {
                    const keep = group[keepIdx], del = group[delIdx];
                    const keepR = keepIdx === 0 ? r0 : r1;
                    const delR  = delIdx  === 0 ? r0 : r1;
                    const isRec = keepIdx === recommended;
                    return `<button onclick="confirmMerge('${keep.id}','${del.id}')"
                        style="padding:6px 14px;border-radius:7px;background:${isRec ? 'rgba(0,217,54,0.15)' : 'rgba(255,255,255,0.06)'};border:1px solid ${isRec ? 'rgba(0,217,54,0.4)' : 'rgba(255,255,255,0.15)'};color:${isRec ? 'var(--color-accent)' : '#aaa'};font-size:0.78rem;font-weight:700;cursor:pointer;font-family:inherit">
                        ✅ Garder <code style="font-size:0.72rem">${keep.id.substring(0,6)}</code> (${keepR} résultat${keepR>1?'s':''})
                        &nbsp;·&nbsp;
                        🗑️ Supprimer <code style="font-size:0.72rem">${del.id.substring(0,6)}</code> (${delR} résultat${delR>1?'s':''})
                        ${isRec ? ' ⭐' : ''}
                    </button>`;
                };
                return `<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">
                    <div style="font-size:0.74rem;color:var(--color-text-secondary)">Choisir quel profil conserver :</div>
                    ${btn(0,1)}
                    ${btn(1,0)}
                </div>`;
            })() : ''}
        </div>`).join('')}
    </div>`;

    container.innerHTML = duplicatesHtml + `
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
        <thead>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.1);text-align:left">
                <th style="padding:8px 10px;color:var(--color-text-secondary);font-weight:600;white-space:nowrap">Pseudo site</th>
                <th style="padding:8px 10px;color:var(--color-text-secondary);font-weight:600;white-space:nowrap">Pseudo TM</th>
                <th style="padding:8px 10px;color:var(--color-text-secondary);font-weight:600;white-space:nowrap">Login TM</th>
                <th style="padding:8px 10px;color:var(--color-text-secondary);font-weight:600;white-space:nowrap">Pays</th>
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
            const isNew = p.createdAt && (Date.now() - new Date(p.createdAt).getTime()) < 7 * 86400000;
            const isIncomplete = !p.loginTM || !p.country;
            const newBadge = isNew ? `<span style="display:inline-block;padding:1px 6px;border-radius:4px;background:rgba(0,217,54,0.2);color:var(--color-accent);font-size:0.68rem;font-weight:700;letter-spacing:0.5px;margin-left:6px;vertical-align:middle">NOUVEAU</span>` : '';
            const incompleteBadge = isIncomplete ? `<span title="${[!p.loginTM ? 'Login TM manquant' : '', !p.country ? 'Pays manquant' : ''].filter(Boolean).join(' · ')}" style="display:inline-block;margin-left:5px;vertical-align:middle;font-size:0.85rem;cursor:default">⚠️</span>` : '';
            return `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05)${isNew ? ';background:rgba(0,217,54,0.03)' : ''}" onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background='${isNew ? 'rgba(0,217,54,0.03)' : ''}'">
                <td style="padding:8px 10px;font-weight:600">${p.pseudo || '—'}${newBadge}${incompleteBadge}</td>
                <td style="padding:8px 10px;color:var(--color-text-secondary)">${p.pseudoTM || p.name || '—'}</td>
                <td style="padding:8px 10px;color:var(--color-text-secondary);font-size:0.75rem">${p.loginTM || '—'}</td>
                <td style="padding:8px 10px;color:var(--color-text-secondary)">${displayCountry(p.country)}</td>
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

// ── Fusion de doublons ────────────────────────────────────────────────────────

window.confirmMerge = function(keepId, deleteId) {
    const keep = state.data.participants.find(p => p.id === keepId);
    const del  = state.data.participants.find(p => p.id === deleteId);
    if (!keep || !del) return;
    const keepAuth   = (keep.userId||'').startsWith('discord_') ? 'Discord' : 'Google';
    const deleteAuth = (del.userId||'').startsWith('discord_') ? 'Discord' : 'Google';
    const resultsCount = state.data.results.filter(r => r.playerId === deleteId).length;
    if (!confirm(
        `Fusionner les deux profils "${pName(keep)}" ?\n\n` +
        `✅ CONSERVER : profil ${keepAuth} (${keep.id.substring(0,8)}…)\n` +
        `🗑️ SUPPRIMER : profil ${deleteAuth} (${del.id.substring(0,8)}…)\n\n` +
        `${resultsCount} résultat(s) seront transférés vers le profil conservé.\n` +
        `Les champs manquants du profil conservé seront complétés avec les données du profil supprimé.\n\n` +
        `Cette action est irréversible.`
    )) return;
    window.mergeParticipants(keepId, deleteId);
};

window.mergeParticipants = async function(keepId, deleteId) {
    const keep = state.data.participants.find(p => p.id === keepId);
    const del  = state.data.participants.find(p => p.id === deleteId);
    if (!keep || !del) { showToast('Joueur introuvable', 'error'); return; }

    try {
        const batch = writeBatch(db);

        // 1. Transférer tous les résultats du profil supprimé vers le profil conservé
        const resultsToMove = state.data.results.filter(r => r.playerId === deleteId);
        for (const r of resultsToMove) {
            batch.update(doc(db, 'results', r.id), { playerId: keepId });
        }

        // 2. Compléter les champs manquants du profil conservé avec ceux du profil supprimé
        const updates = {};
        const fields = ['pseudoTM','loginTM','country','team','discordId','discordUsername','discordAvatar','email','epicId','dateOfBirth','trackerUrl'];
        fields.forEach(f => {
            if (!keep[f] && del[f]) updates[f] = del[f];
        });
        // Si le profil conservé n'a pas de userId Discord et le supprimé en a un, prendre celui du supprimé
        if (!(keep.userId||'').startsWith('discord_') && (del.userId||'').startsWith('discord_')) {
            updates.userId = del.userId;
            if (del.discordId) updates.discordId = del.discordId;
            if (del.discordUsername) updates.discordUsername = del.discordUsername;
            if (del.discordAvatar) updates.discordAvatar = del.discordAvatar;
        }
        if (Object.keys(updates).length > 0) {
            batch.update(doc(db, 'participants', keepId), updates);
        }

        // 3. Supprimer le doublon
        batch.delete(doc(db, 'participants', deleteId));

        await batch.commit();
        showToast(`✅ Fusion réussie — ${resultsToMove.length} résultat(s) transféré(s)`, 'success');
        window.displayAdminPlayers();
    } catch(e) {
        console.error('Merge error:', e);
        showToast('❌ Erreur lors de la fusion', 'error');
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
