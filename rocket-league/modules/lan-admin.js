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
import { admLanBracket } from './lan-bracket-admin.js';
import {
  setupLanPredictionsListener, lockPreLan, unlockPreLan,
  recalculateAll, isPreLanLocked,
} from './lan-predictions.js';

state.lanAdmSec = state.lanAdmSec || 'preparation';

// Router principal : affiche le sous-menu + délègue au sous-onglet courant
export async function admLan() {
  if (!state.isAdmin) return;
  const wrap = document.getElementById('adm-content');

  // Listeners live (idempotents) — on les active dès qu'on entre dans l'admin LAN
  setupLanListener();
  setupLanMatchesListener();
  setupLanPredictionsListener();

  // Sous-menu commun à toutes les sections LAN
  wrap.innerHTML = `
    <div class="lan-subnav">
      <button class="lan-sub ${state.lanAdmSec==='preparation'?'active':''}" onclick="window.lanGoSec('preparation')">📋 Préparation</button>
      <button class="lan-sub ${state.lanAdmSec==='swiss'?'active':''}" onclick="window.lanGoSec('swiss')">♟ Suisse (Jour 1)</button>
      <button class="lan-sub ${state.lanAdmSec==='bracket'?'active':''}" onclick="window.lanGoSec('bracket')">🏆 Bracket (Jour 2)</button>
    </div>
    <div id="lan-sec-content"><div class="loading"></div></div>
  `;

  if (state.lanAdmSec === 'swiss') return admLanSwiss();
  if (state.lanAdmSec === 'bracket') return admLanBracket();
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

    <!-- ── Statut de la LAN (override manuel + auto au générer R1/Bracket) ─── -->
    <div class="adm-card" style="margin-bottom:14px">
      <div class="adm-card-hdr">🚦 Statut de la LAN <span style="margin-left:10px;font-size:.7rem;color:#FFB800;font-weight:700">${(state.lanConfig?.status || 'preparation').toUpperCase()}</span></div>
      <p style="font-size:.82rem;color:var(--text2);margin:0 0 12px">
        Détermine ce que les écrans géants et la page publique affichent.
        Auto-bascule à <code>swiss</code> au "Générer R1" et à <code>bracket</code> au "Générer bracket".
        Override manuel ci-dessous si besoin.
      </p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${['preparation','swiss','between','bracket','finished'].map(s => {
          const isCur = (state.lanConfig?.status || 'preparation') === s;
          const label = {preparation:'📋 Préparation',swiss:'♟ Suisse',between:'⏸ Entre-deux',bracket:'🏆 Bracket',finished:'🏁 Terminé'}[s];
          return `<button class="${isCur?'btn-p':'btn-s'}" onclick="setLanStatusAdm('${s}')" style="font-size:.78rem">${label}</button>`;
        }).join('')}
      </div>
    </div>

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
          ${renderQualList(qP1, 1)}
        </div>
        <div>
          <div style="font-weight:700;font-size:.82rem;color:var(--text2);margin-bottom:8px">POULE 2 — ${qP2.length} qualifié(s)</div>
          ${renderQualList(qP2, 2)}
        </div>
      </div>
      <p style="font-size:.74rem;color:var(--text3);margin:0 0 6px">
        💡 Astuce : utilise <strong>↔</strong> pour déplacer une équipe dans l'autre poule (uniquement pour le seeding LAN — la poule de saison reste intacte).
      </p>

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

    <!-- ── Écrans géants ─────────────────────────────────────────────── -->
    <div class="adm-card" style="margin-bottom:14px">
      <div class="adm-card-hdr">📺 Écrans géants (salle Magny-Cours)</div>
      <p style="font-size:.82rem;color:var(--text2);margin:0 0 14px">
        Liens directs à ouvrir sur les TV / vidéoprojecteurs de la salle. Adaptés 1080p / 4K via clamp/vw/vh.
        Ouvre en <strong>plein écran</strong> (F11) pour un rendu propre.
      </p>
      <div style="display:grid;gap:10px">
        <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:rgba(255,184,0,.06);border:1px solid rgba(255,184,0,.18);border-radius:8px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <div style="font-weight:800;font-size:.92rem">🏆 Classement Suisse</div>
            <div style="font-size:.72rem;color:var(--text2);margin-top:2px">16 équipes plein écran, top 8 surligné, watermark SLS, footer sponsors</div>
          </div>
          <a href="./display-classement.html" target="_blank" rel="noopener" class="btn-p" style="text-decoration:none">🔗 Ouvrir</a>
          <button class="btn-s" onclick="copyDisplayUrl('classement')">📋 Copier le lien</button>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:rgba(255,184,0,.06);border:1px solid rgba(255,184,0,.18);border-radius:8px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <div style="font-weight:800;font-size:.92rem">🎭 Matchs en cours / Scène</div>
            <div style="font-size:.72rem;color:var(--text2);margin-top:2px">Match scène XXL symétrique + max 4 matchs simultanés (groupe 1 / groupe 2)</div>
          </div>
          <a href="./display-matchs.html" target="_blank" rel="noopener" class="btn-p" style="text-decoration:none">🔗 Ouvrir</a>
          <button class="btn-s" onclick="copyDisplayUrl('matchs')">📋 Copier le lien</button>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:rgba(123,47,190,.06);border:1px solid rgba(123,47,190,.18);border-radius:8px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <div style="font-weight:800;font-size:.92rem">📱 Page publique LAN (spectateurs)</div>
            <div style="font-size:.72rem;color:var(--text2);margin-top:2px">Site public à partager au public — bracket, classement Suisse, podium</div>
          </div>
          <a href="./lan.html" target="_blank" rel="noopener" class="btn-p" style="text-decoration:none">🔗 Ouvrir</a>
          <button class="btn-s" onclick="copyDisplayUrl('lan')">📋 Copier le lien</button>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:rgba(0,200,100,.05);border:1px solid rgba(0,200,100,.18);border-radius:8px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <div style="font-weight:800;font-size:.92rem">🔮 Pronostics LAN (joueurs / spectateurs)</div>
            <div style="font-size:.72rem;color:var(--text2);margin-top:2px">Page mobile-first à partager pour que tout le monde puisse parier</div>
          </div>
          <a href="./lan-predictions.html" target="_blank" rel="noopener" class="btn-p" style="text-decoration:none">🔗 Ouvrir</a>
          <button class="btn-s" onclick="copyDisplayUrl('predictions')">📋 Copier le lien</button>
        </div>
      </div>
      <p style="font-size:.7rem;color:var(--text3);margin:12px 0 0">
        💡 Mode aperçu : ajoute <code>?preview=swiss</code> ou <code>?preview=between</code> ou <code>?preview=bracket</code> ou <code>?preview=finished</code>
        à n'importe quelle URL ci-dessus pour visualiser un état particulier (utile pour test avant la LAN).
      </p>
    </div>

    <!-- ── Pronostics LAN ────────────────────────────────────────────── -->
    <div class="adm-card" style="margin-bottom:14px">
      <div class="adm-card-hdr">🔮 Pronostics LAN</div>
      <p style="font-size:.82rem;color:var(--text2);margin:0 0 12px">
        Verrouille les pronostics pré-LAN (champion, podium, top 8, première sortie) avant le coup d'envoi
        du R1 Suisse. Une fois verrouillés, les joueurs ne peuvent plus modifier leurs choix.
      </p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        ${isPreLanLocked()
          ? `<span style="font-size:.78rem;color:#ef4444;font-weight:700">🔒 Pré-LAN verrouillé</span>
             <button class="btn-s" onclick="unlockPreLanAdm()">↺ Déverrouiller</button>`
          : `<span style="font-size:.78rem;color:#0c8;font-weight:700">● Pré-LAN ouvert aux pronostics</span>
             <button class="btn-d" onclick="lockPreLanAdm()">🔒 Verrouiller pronostics pré-LAN</button>`}
        <button class="btn-s" style="margin-left:auto" onclick="recalcAllScoresAdm()">🧮 Recalculer tous les scores</button>
      </div>
      <p style="font-size:.7rem;color:var(--text3);margin:10px 0 0">
        💡 La résolution des paris match (Suisse + Bracket) se fait automatiquement à chaque saisie de score.
        Le bouton "Recalculer" force un re-passage complet (utile en cas de litige).
      </p>
    </div>

    <!-- ── ID technique (debug) ─────────────────────────────────────── -->
    <div style="font-size:.7rem;color:var(--text3);text-align:right">
      Doc Firestore : <code>rl_lan/${LAN_DOC_ID}</code>
    </div>
  `;
}

function renderQualList(teams, currentPool) {
  if (!teams.length) {
    return `<div class="empty" style="padding:14px;text-align:center;font-size:.82rem">Aucune équipe qualifiée pour l'instant.</div>`;
  }
  const otherPool = currentPool === 1 ? 2 : 1;
  return `<div style="display:flex;flex-direction:column;gap:6px">
    ${teams.map((t, i) => {
      const logo = t.logoUrl
        ? `<img src="${esc(t.logoUrl)}" alt="" style="width:24px;height:24px;border-radius:4px;object-fit:cover" onerror="this.style.opacity='.2'">`
        : `<div style="width:24px;height:24px;border-radius:4px;background:rgba(255,255,255,.05)"></div>`;
      const isMoved = t.pool !== currentPool;
      const movedBadge = isMoved
        ? `<span title="Déplacée depuis la Poule ${t.pool}" style="background:rgba(123,47,190,.2);color:#c79bff;font-size:.6rem;font-weight:700;padding:2px 6px;border-radius:4px;letter-spacing:.04em">↔ DEPUIS P${t.pool}</span>`
        : '';
      return `<div style="display:flex;align-items:center;gap:10px;padding:6px 10px;background:rgba(255,184,0,.06);border:1px solid rgba(255,184,0,.18);border-radius:6px;font-size:.82rem">
        <span style="font-weight:700;color:#FFB800;min-width:22px">${i + 1}.</span>
        ${logo}
        <span style="font-weight:600;flex:1;display:flex;align-items:center;gap:8px">${esc(t.name)} ${movedBadge}</span>
        <span style="color:var(--text3);font-size:.72rem">${t.pts.toFixed(1)} pts · ${t.wins}V/${t.losses}D</span>
        <button class="btn-s" onclick="movePoolTeam('${t.id}', ${otherPool})" title="Déplacer vers Poule ${otherPool}" style="font-size:.7rem;padding:3px 8px">↔ P${otherPool}</button>
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

// ── Statut LAN : override manuel ──────────────────────────────────────
window.setLanStatusAdm = async function (status) {
  const labels = { preparation:'Préparation', swiss:'Suisse', between:'Entre-deux', bracket:'Bracket', finished:'Terminé' };
  if (!labels[status]) return;
  if (state.lanConfig?.status === status) return;
  if (!confirm(`Passer le statut LAN à "${labels[status]}" ?\n\nCela change ce qui s'affiche sur la page publique et les écrans géants.`)) return;
  try {
    await updateLanConfig({ status });
    toast(`🚦 Statut LAN → ${labels[status]}`, 'ok');
    await admLan();
  } catch (e) { console.error(e); toast('Erreur', 'err'); }
};

// ── Écrans géants : copie d'URL ───────────────────────────────────────
window.copyDisplayUrl = async function (which) {
  const map = {
    classement: '/rocket-league/display-classement.html',
    matchs: '/rocket-league/display-matchs.html',
    lan: '/rocket-league/lan.html',
    predictions: '/rocket-league/lan-predictions.html',
  };
  const path = map[which];
  if (!path) return;
  const url = `https://springs-esport.vercel.app${path}`;
  try {
    await navigator.clipboard.writeText(url);
    toast(`📋 Lien copié : ${url}`, 'ok');
  } catch (e) {
    console.error(e);
    toast('Impossible de copier — copie manuelle : ' + url, 'err');
  }
};

// ── Pronostics LAN ────────────────────────────────────────────────────
window.lockPreLanAdm = async function () {
  if (!confirm('Verrouiller les pronostics pré-LAN ?\n\nLes joueurs ne pourront plus modifier leur champion, leur podium, leur top 8 et leur première sortie.\n\nFais-le juste avant de générer le R1 Suisse.')) return;
  try {
    await lockPreLan();
    toast('🔒 Pronostics pré-LAN verrouillés', 'ok');
    await admLan();
  } catch (e) { console.error(e); toast('Erreur', 'err'); }
};

window.unlockPreLanAdm = async function () {
  if (!confirm('Déverrouiller les pronostics pré-LAN ? Les joueurs pourront à nouveau les modifier.')) return;
  try {
    await unlockPreLan();
    toast('● Pronostics pré-LAN rouverts', 'ok');
    await admLan();
  } catch (e) { console.error(e); toast('Erreur', 'err'); }
};

window.recalcAllScoresAdm = async function () {
  try {
    const n = await recalculateAll();
    toast(`🧮 ${n} doc(s) mis à jour`, 'ok');
  } catch (e) { console.error(e); toast('Erreur recalcul', 'err'); }
};

// Déplace une équipe vers l'autre poule (override LAN — n'affecte pas la poule de saison)
// Si la cible est la poule native de l'équipe, l'override est retiré.
window.movePoolTeam = async function (teamId, targetPool) {
  const team = state.teamsMap[teamId];
  if (!team) { toast('Équipe introuvable', 'err'); return; }
  const overrides = { ...((state.lanConfig?.poolOverrides) || {}) };

  // Si la cible = la poule native, on retire l'override
  if (team.pool === targetPool) {
    delete overrides[teamId];
  } else {
    overrides[teamId] = targetPool;
  }

  try {
    await updateLanConfig({ poolOverrides: overrides });
    toast(`${team.name} → Poule ${targetPool}`, 'ok');
    await admLan();
  } catch (e) {
    console.error(e);
    toast('Erreur lors du déplacement', 'err');
  }
};
