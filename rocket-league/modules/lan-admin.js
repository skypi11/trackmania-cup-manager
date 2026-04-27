// modules/lan-admin.js — UI admin LAN (router + sous-onglet "Préparation")
import { state } from './state.js';
import { esc, toast } from './utils.js';
import { buildStandings } from './standings.js';
import {
  ensureLanDoc, updateLanConfig, getLanQuotas, getQualifiedTeams,
  getLanName, getLanLocation, getLanDates, LAN_DOC_ID,
  setupLanListener, setupLanMatchesListener,
} from './lan.js';
import { admLanSwiss } from './lan-swiss-admin.js';

state.lanAdmSec = state.lanAdmSec || 'preparation';

// Router principal : affiche le sous-menu + délègue au sous-onglet courant
export async function admLan() {
  if (!state.isAdmin) return;
  const wrap = document.getElementById('adm-content');

  // Listeners live (idempotents) — on les active dès qu'on entre dans l'admin LAN
  setupLanListener();
  setupLanMatchesListener();

  // Sous-menu commun à toutes les sections LAN
  wrap.innerHTML = `
    <div class="lan-subnav">
      <button class="lan-sub ${state.lanAdmSec==='preparation'?'active':''}" onclick="window.lanGoSec('preparation')">📋 Préparation</button>
      <button class="lan-sub ${state.lanAdmSec==='swiss'?'active':''}" onclick="window.lanGoSec('swiss')">🇨🇭 Suisse (Jour 1)</button>
      <button class="lan-sub ${state.lanAdmSec==='bracket'?'active':''}" onclick="window.lanGoSec('bracket')" disabled style="opacity:.4;cursor:not-allowed" title="Phase 2 — à venir">🏆 Bracket (Jour 2)</button>
    </div>
    <div id="lan-sec-content"><div class="loading"></div></div>
  `;

  if (state.lanAdmSec === 'swiss') return admLanSwiss();
  if (state.lanAdmSec === 'bracket') {
    document.getElementById('lan-sec-content').innerHTML =
      `<div class="empty" style="padding:30px;text-align:center;color:var(--text2)">Phase 2 — Bracket à venir.</div>`;
    return;
  }
  return admLanPreparation();
}

window.lanGoSec = function(sec) {
  state.lanAdmSec = sec;
  admLan();
};

async function admLanPreparation() {
  const wrap = document.getElementById('lan-sec-content');
  wrap.innerHTML = `<div class="loading"></div>`;

  await ensureLanDoc();

  const lan = state.lanConfig || {};
  const quotas = getLanQuotas();
  const dates = getLanDates();
  const manual = lan.manualQualified || [];
  const isManual = manual.length > 0;

  // Qualifiés calculés (auto OU manuel, déjà géré par getQualifiedTeams)
  const qP1 = getQualifiedTeams(1);
  const qP2 = getQualifiedTeams(2);

  // Classement complet pour la sélection manuelle
  const stP1 = buildStandings(1);
  const stP2 = buildStandings(2);

  wrap.innerHTML = `
    <div class="stitle">🏆 Préparation LAN — ${esc(getLanName())}</div>

    <!-- ── Bloc infos générales ─────────────────────────────────────── -->
    <div class="adm-card" style="margin-bottom:14px">
      <div class="adm-card-hdr">📋 Informations générales</div>
      <div class="form-grid">
        <div class="fg full"><label>Nom de l'événement</label>
          <input class="finput" id="lan-name" value="${esc(lan.name || '')}" placeholder="Springs League Series #2 — LAN">
        </div>
        <div class="fg"><label>Date de début</label>
          <input class="finput" id="lan-start" type="date" value="${esc(dates.start)}">
        </div>
        <div class="fg"><label>Date de fin</label>
          <input class="finput" id="lan-end" type="date" value="${esc(dates.end)}">
        </div>
        <div class="fg full"><label>Lieu (adresse complète)</label>
          <input class="finput" id="lan-location" value="${esc(lan.location || '')}" placeholder="Salle X, 1 rue Y, 12345 Ville">
        </div>
        <div class="f-actions" style="grid-column:1/-1">
          <button class="btn-p" onclick="saveLanInfo()">💾 Enregistrer</button>
        </div>
      </div>
    </div>

    <!-- ── Bloc quotas par poule ────────────────────────────────────── -->
    <div class="adm-card" style="margin-bottom:14px">
      <div class="adm-card-hdr">🎯 Quotas de qualification par poule</div>
      <p style="font-size:.82rem;color:var(--text2);margin:0 0 12px">
        Nombre d'équipes qualifiées en LAN par poule (auto-sélection des meilleures du classement).
        Total = ${quotas[1] + quotas[2]} équipes (objectif&nbsp;: 16 pour la phase Suisse).
      </p>
      <div class="form-grid">
        <div class="fg"><label>Poule 1 — top</label>
          <input class="finput" id="lan-q1" type="number" min="0" max="16" value="${quotas[1]}">
        </div>
        <div class="fg"><label>Poule 2 — top</label>
          <input class="finput" id="lan-q2" type="number" min="0" max="16" value="${quotas[2]}">
        </div>
        <div class="f-actions" style="grid-column:1/-1">
          <button class="btn-p" onclick="saveLanQuotas()">💾 Enregistrer quotas</button>
        </div>
      </div>
    </div>

    <!-- ── Bloc qualifiés ────────────────────────────────────────────── -->
    <div class="adm-card" style="margin-bottom:14px">
      <div class="adm-card-hdr">
        ✅ Équipes qualifiées
        <span style="margin-left:10px;font-size:.7rem;color:${isManual?'#f59e0b':'#0c8'};font-weight:700">
          ${isManual ? `MODE MANUEL (${manual.length} équipes)` : 'MODE AUTO (depuis classement)'}
        </span>
      </div>
      <p style="font-size:.82rem;color:var(--text2);margin:0 0 12px">
        ${isManual
          ? `Les ${manual.length} équipes ci-dessous sont forcées manuellement, indépendamment du classement.`
          : `Les équipes ci-dessous sont les meilleures du classement actuel (selon les quotas). Mise à jour automatique à chaque match joué.`}
      </p>

      <div class="lan-qual-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
        <div>
          <div style="font-weight:700;font-size:.82rem;color:var(--text2);margin-bottom:8px">POULE 1 — ${qP1.length} qualifié(s)</div>
          ${renderQualList(qP1)}
        </div>
        <div>
          <div style="font-weight:700;font-size:.82rem;color:var(--text2);margin-bottom:8px">POULE 2 — ${qP2.length} qualifié(s)</div>
          ${renderQualList(qP2)}
        </div>
      </div>

      <div class="f-actions">
        ${isManual
          ? `<button class="btn-s" onclick="resetLanManual()">↺ Repasser en mode auto</button>`
          : `<button class="btn-s" onclick="openLanManualEditor()">✏️ Forcer manuellement la liste</button>`}
      </div>
    </div>

    <!-- ── Éditeur manuel (caché par défaut) ────────────────────────── -->
    <div class="adm-card" id="lan-manual-editor" style="display:none;margin-bottom:14px">
      <div class="adm-card-hdr">✏️ Sélection manuelle des qualifiés</div>
      <p style="font-size:.82rem;color:var(--text2);margin:0 0 12px">
        Coche les équipes qualifiées. La liste manuelle remplacera l'auto-sélection.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div>
          <div style="font-weight:700;font-size:.82rem;color:var(--text2);margin-bottom:8px">POULE 1</div>
          ${renderManualPicker(stP1, manual, 1)}
        </div>
        <div>
          <div style="font-weight:700;font-size:.82rem;color:var(--text2);margin-bottom:8px">POULE 2</div>
          ${renderManualPicker(stP2, manual, 2)}
        </div>
      </div>
      <div class="f-actions" style="margin-top:14px">
        <button class="btn-p" onclick="saveLanManual()">💾 Enregistrer la sélection manuelle</button>
        <button class="btn-s" onclick="document.getElementById('lan-manual-editor').style.display='none'">✕ Annuler</button>
      </div>
    </div>

    <!-- ── ID technique (debug) ─────────────────────────────────────── -->
    <div style="font-size:.7rem;color:var(--text3);text-align:right">
      Doc Firestore : <code>rl_lan/${LAN_DOC_ID}</code>
    </div>
  `;
}

function renderQualList(teams) {
  if (!teams.length) {
    return `<div class="empty" style="padding:14px;text-align:center;font-size:.82rem">Aucune équipe qualifiée pour l'instant.</div>`;
  }
  return `<div style="display:flex;flex-direction:column;gap:6px">
    ${teams.map((t, i) => {
      const logo = t.logoUrl
        ? `<img src="${esc(t.logoUrl)}" alt="" style="width:24px;height:24px;border-radius:4px;object-fit:cover" onerror="this.style.opacity='.2'">`
        : `<div style="width:24px;height:24px;border-radius:4px;background:rgba(255,255,255,.05)"></div>`;
      return `<div style="display:flex;align-items:center;gap:10px;padding:6px 10px;background:rgba(255,184,0,.06);border:1px solid rgba(255,184,0,.18);border-radius:6px;font-size:.82rem">
        <span style="font-weight:700;color:#FFB800;min-width:22px">${i + 1}.</span>
        ${logo}
        <span style="font-weight:600;flex:1">${esc(t.name)}</span>
        <span style="color:var(--text3);font-size:.72rem">${t.pts.toFixed(1)} pts · ${t.wins}V/${t.losses}D</span>
      </div>`;
    }).join('')}
  </div>`;
}

function renderManualPicker(teams, currentManual, pool) {
  const selected = new Set(currentManual);
  return `<div style="display:flex;flex-direction:column;gap:4px;max-height:340px;overflow-y:auto;padding:8px;background:rgba(0,0,0,.2);border-radius:6px">
    ${teams.map((t, i) => {
      const checked = selected.has(t.id) ? 'checked' : '';
      return `<label style="display:flex;align-items:center;gap:8px;padding:5px 8px;cursor:pointer;border-radius:4px;font-size:.78rem" onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background='transparent'">
        <input type="checkbox" class="lan-manual-cb" data-team="${t.id}" data-pool="${pool}" ${checked}>
        <span style="color:var(--text3);min-width:22px">${i + 1}.</span>
        <span style="flex:1">${esc(t.name)}</span>
        <span style="color:var(--text3);font-size:.7rem">${t.pts.toFixed(1)}</span>
      </label>`;
    }).join('')}
  </div>`;
}

// ── Actions exposées sur window ───────────────────────────────────────
window.saveLanInfo = async function () {
  const name = document.getElementById('lan-name').value.trim();
  const start = document.getElementById('lan-start').value;
  const end = document.getElementById('lan-end').value;
  const location = document.getElementById('lan-location').value.trim();
  if (!name) { toast('Nom requis', 'err'); return; }
  try {
    await updateLanConfig({ name, startDate: start, endDate: end, location });
    toast('Infos LAN enregistrées', 'ok');
  } catch (e) {
    console.error(e);
    toast('Erreur lors de l\'enregistrement', 'err');
  }
};

window.saveLanQuotas = async function () {
  const q1 = parseInt(document.getElementById('lan-q1').value, 10);
  const q2 = parseInt(document.getElementById('lan-q2').value, 10);
  if (Number.isNaN(q1) || Number.isNaN(q2) || q1 < 0 || q2 < 0) {
    toast('Quotas invalides', 'err'); return;
  }
  try {
    await updateLanConfig({ poolQuotas: { 1: q1, 2: q2 } });
    toast(`Quotas mis à jour : ${q1} + ${q2} = ${q1 + q2} équipes`, 'ok');
    await admLan();
  } catch (e) {
    console.error(e);
    toast('Erreur lors de l\'enregistrement', 'err');
  }
};

window.openLanManualEditor = function () {
  const ed = document.getElementById('lan-manual-editor');
  if (!ed) return;
  ed.style.display = 'block';
  ed.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.saveLanManual = async function () {
  const cbs = document.querySelectorAll('.lan-manual-cb:checked');
  const ids = Array.from(cbs).map(cb => cb.dataset.team);
  if (!ids.length) {
    if (!confirm('Aucune équipe sélectionnée — cela revient à passer en mode auto. Continuer ?')) return;
  }
  try {
    await updateLanConfig({ manualQualified: ids });
    toast(`Sélection manuelle enregistrée (${ids.length} équipes)`, 'ok');
    await admLan();
  } catch (e) {
    console.error(e);
    toast('Erreur lors de l\'enregistrement', 'err');
  }
};

window.resetLanManual = async function () {
  if (!confirm('Repasser en mode auto ? La liste manuelle sera effacée.')) return;
  try {
    await updateLanConfig({ manualQualified: [] });
    toast('Mode auto réactivé', 'ok');
    await admLan();
  } catch (e) {
    console.error(e);
    toast('Erreur', 'err');
  }
};
