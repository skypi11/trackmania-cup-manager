// modules/admin.js
import { db } from '../../shared/firebase-config.js';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch, getDoc, setDoc, query, where, deleteField } from 'firebase/firestore';
import { state } from './state.js';
import { t } from './i18n.js';
import { esc, toast, openModal, closeModal } from './utils.js';
import { refreshTeams, refreshPlayers, refreshMatches } from './data.js';
import { buildStandings } from './standings.js';
import { SCHEDULE, flagHtml, buildRLCountryPicker } from './constants.js';
import { admLan } from './lan-admin.js';

export async function loadAdm(sec) {
  if (!state.isAdmin) return;
  if (sec==='equipes')        await admTeams();
  else if (sec==='joueurs')   await admPlayers();
  else if (sec==='resultats') await admResults();
  else if (sec==='calendrier') admCalendar();
  else if (sec==='discord')   await admDiscord();
  else if (sec==='lan')       await admLan();
}

window.showAdm = async function(sec) {
  state.admSec=sec;
  document.querySelectorAll('.adm-sub').forEach(b=>b.classList.remove('active'));
  document.getElementById('as-'+sec)?.classList.add('active');
  await loadAdm(sec);
};

// ── Admin: Équipes ────────────────────────────────
async function admTeams() {
  await refreshTeams();
  const wrap = document.getElementById('adm-content');
  const sorted = Object.values(state.teamsMap).sort((a,b)=>a.pool-b.pool||a.name.localeCompare(b.name));
  wrap.innerHTML = `
    <div class="stitle">${t('add_t')}</div>
    <div class="form-grid" id="team-form">
      <div class="fg"><label>${t('f_name')}</label><input class="finput" id="tf-name" placeholder="Exaltia Espada"></div>
      <div class="fg"><label>${t('f_tag')}</label><input class="finput" id="tf-tag" placeholder="EXA" maxlength="6"></div>
      <div class="fg"><label>${t('f_logo')}</label><input class="finput" id="tf-logo" placeholder="https://..." type="url"></div>
      <div class="fg"><label>${t('f_pool')}</label>
        <select class="finput" id="tf-pool"><option value="1">Poule 1</option><option value="2">Poule 2</option></select>
      </div>
      <div class="f-actions" style="grid-column:1/-1">
        <button class="btn-p" onclick="saveTeam()">💾 ${t('save')}</button>
        <button class="btn-s" onclick="clearTeamForm()">✕ ${t('cancel')}</button>
      </div>
    </div>
    <div class="adm-sep"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div class="stitle" style="margin:0">Équipes existantes</div>
      <span style="font-size:.72rem;color:var(--text2)">${sorted.length} équipes</span>
    </div>
    <div class="adm-teams-grid">
      ${sorted.map(t2=>`
        <div class="adm-team-card" onclick="editTeam('${t2.id}')" style="cursor:pointer">
          <img class="adm-tc-logo" src="${t2.logoUrl||''}" alt="" onerror="this.style.opacity='.2'">
          <div class="adm-tc-info">
            <div class="adm-tc-name">${esc(t2.name)}</div>
            <div class="adm-tc-meta">
              <span class="pool-badge p${t2.pool}">Poule ${t2.pool}</span>
              ${t2.tag?`<span class="adm-tc-tag">${esc(t2.tag)}</span>`:''}
            </div>
          </div>
          <button class="btn-d" onclick="event.stopPropagation();deleteTeam('${t2.id}')">✕</button>
        </div>`).join('')||`<div class="empty" style="grid-column:1/-1">${t('no_team')}</div>`}
    </div>`;
}

window.saveTeam = async function() {
  const name = document.getElementById('tf-name').value.trim();
  const tag  = document.getElementById('tf-tag').value.trim();
  const logo = document.getElementById('tf-logo').value.trim();
  const pool = parseInt(document.getElementById('tf-pool').value);
  if (!name) { toast('Nom requis','err'); return; }
  try {
    if (state.editTeamId) {
      await updateDoc(doc(db,'rl_teams',state.editTeamId),{name,tag,logoUrl:logo,pool});
    } else {
      await addDoc(collection(db,'rl_teams'),{name,tag,logoUrl:logo,pool,createdAt:serverTimestamp()});
    }
    toast(t('saved'),'ok');
    state.editTeamId=null;
    await admTeams();
  } catch(e) { toast(t('err_save'),'err'); console.error(e); }
};

window.editTeam = function(id) {
  const tm = state.teamsMap[id]; if(!tm) return;
  state.editTeamId = id;
  document.getElementById('mo-team-edit-title').textContent = tm.name;
  document.getElementById('mt-name').value  = tm.name||'';
  document.getElementById('mt-tag').value   = tm.tag||'';
  document.getElementById('mt-logo').value  = tm.logoUrl||'';
  document.getElementById('mt-pool').value  = String(tm.pool||1);
  openModal('mo-team-edit');
};

window.saveTeamModal = async function() {
  const name = document.getElementById('mt-name').value.trim();
  const tag  = document.getElementById('mt-tag').value.trim();
  const logo = document.getElementById('mt-logo').value.trim();
  const pool = parseInt(document.getElementById('mt-pool').value);
  if (!name) { toast('Nom requis','err'); return; }
  try {
    await updateDoc(doc(db,'rl_teams',state.editTeamId),{name,tag,logoUrl:logo,pool});
    toast('Enregistré','ok');
    state.editTeamId=null;
    closeModal('mo-team-edit');
    await admTeams();
  } catch(e) { toast('Erreur','err'); console.error(e); }
};

window.clearTeamForm = function() {
  state.editTeamId=null;
  ['tf-name','tf-tag','tf-logo'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('tf-pool').value='1';
};

window.deleteTeam = async function(id) {
  if (!confirm(t('confirm_del'))) return;
  try { await deleteDoc(doc(db,'rl_teams',id)); toast(t('deleted'),'ok'); await admTeams(); }
  catch(e) { toast(t('err_save'),'err'); }
};

// ── Admin: Joueurs ────────────────────────────────
async function admPlayers() {
  await refreshTeams(); await refreshPlayers();
  const wrap = document.getElementById('adm-content');
  const teamOpts = Object.values(state.teamsMap).sort((a,b)=>a.name.localeCompare(b.name))
    .map(t=>`<option value="${t.id}">${esc(t.name)} (P${t.pool})</option>`).join('');
  const filterOpts = `<option value="">Toutes les équipes</option>`+
    Object.values(state.teamsMap).sort((a,b)=>a.name.localeCompare(b.name))
    .map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');

  const renderPlayerCard = (p) => {
    const tm = state.teamsMap[p.teamId]||{};
    const rc = (p.role||'').toLowerCase();
    const avatar = (p.discordAvatar||p.photoUrl)
      ? `<img class="adm-pa" src="${p.discordAvatar||p.photoUrl}" alt="" onerror="this.outerHTML='<div class=adm-pa-ph>👤</div>'">`
      : `<div class="adm-pa-ph">👤</div>`;
    return `<div class="adm-player-card" onclick="editPlayer('${p.id}')" style="cursor:pointer">
      ${avatar}
      <div class="adm-pi">
        <div class="adm-pi-top">
          <span class="adm-pi-name">${esc(p.pseudoRL||p.pseudoDiscord||'?')}</span>
          ${p.role?`<span class="role-bdg ${rc}">${p.role.toUpperCase()}</span>`:''}
        </div>
        <div class="adm-pi-sub">
          <span>${esc(tm.name||'— Agent libre —')}</span>
          ${p.country?`<span>${flagHtml(p.country)}</span>`:''}
          ${p.age?`<span>${p.age} ans</span>`:''}
        </div>
      </div>
      <button class="btn-d" onclick="event.stopPropagation();deletePlayer('${p.id}')">✕</button>
    </div>`;
  };
  const renderList = (teamFilter='') => {
    let ps = Object.values(state.playersMap);
    if (teamFilter) ps = ps.filter(p=>p.teamId===teamFilter);
    ps.sort((a,b)=>(a.pseudoRL||'').localeCompare(b.pseudoRL||''));
    if (!ps.length) return `<div class="empty">${t('no_players')}</div>`;
    return ps.map(renderPlayerCard).join('');
  };

  wrap.innerHTML = `
    <div class="stitle">${t('add_p')}</div>
    <div class="form-grid">
      <div class="fg"><label>${t('f_prl')}</label><input class="finput" id="pf-rl" placeholder="SkyPi11"></div>
      <div class="fg"><label>${t('f_disc')}</label><input class="finput" id="pf-disc" placeholder="pseudo#0000"></div>
      <div class="fg full"><label>${t('f_track')}</label><input class="finput" id="pf-track" placeholder="https://rocketleague.tracker.network/..." type="url"></div>
      <div class="fg"><label>${t('f_age')}</label><input class="finput" id="pf-age" type="number" min="1" max="99" placeholder="22"></div>
      <div class="fg"><label>${t('f_country')}</label><div id="pf-country-picker"></div></div>
      <div class="fg"><label>Rôle</label>
        <select class="finput" id="pf-role">
          <option value="titulaire">Titulaire</option>
          <option value="capitaine">Capitaine</option>
          <option value="sub">Substitut</option>
          <option value="coach">Coach</option>
          <option value="fondateur">Fondateur</option>
          <option value="manager">Manager</option>
        </select>
      </div>
      <div class="fg full"><label>${t('f_team')}</label><select class="finput" id="pf-team"><option value="">${t('f_team')}...</option>${teamOpts}</select></div>
      <div class="fg full"><label>${t('f_photo')}</label><input class="finput" id="pf-photo" placeholder="https://..." type="url"></div>
      <div class="fg full"><label>Google UID <span style="font-size:.68rem;color:var(--text3);font-weight:400">(pour lier le compte Google du joueur)</span></label><input class="finput" id="pf-uid" placeholder="Coller l'UID du joueur..." style="font-family:monospace;font-size:.76rem"></div>
      <div class="f-actions" style="grid-column:1/-1">
        <button class="btn-p" onclick="savePlayer()">💾 ${t('save')}</button>
        <button class="btn-s" onclick="clearPlayerForm()">✕ ${t('cancel')}</button>
      </div>
    </div>
    <div class="adm-sep"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div class="stitle" style="margin:0">Joueurs enregistrés <span style="font-size:.72rem;color:var(--text2);font-weight:400">(${Object.keys(state.playersMap).length})</span></div>
      <div class="adm-filter-grp">
        <span class="adm-filter-lbl">Équipe</span>
        <select class="adm-sel" onchange="filterPlayerList(this.value)">${filterOpts}</select>
      </div>
    </div>
    <div id="player-list">${renderList()}</div>`;
  document.getElementById('pf-country-picker').innerHTML = buildRLCountryPicker('pf-country', '');
}

window.filterPlayerList = function(teamId) {
  const ps = Object.values(state.playersMap).filter(p=>!teamId||p.teamId===teamId)
    .sort((a,b)=>(a.pseudoRL||'').localeCompare(b.pseudoRL||''));
  document.getElementById('player-list').innerHTML = ps.map(p=>{
    const tm=state.teamsMap[p.teamId]||{};
    const rc=(p.role||'').toLowerCase();
    const avatar = (p.discordAvatar||p.photoUrl)
      ? `<img class="adm-pa" src="${p.discordAvatar||p.photoUrl}" alt="" onerror="this.outerHTML='<div class=adm-pa-ph>👤</div>'">`
      : `<div class="adm-pa-ph">👤</div>`;
    return `<div class="adm-player-card" onclick="editPlayer('${p.id}')" style="cursor:pointer">
      ${avatar}
      <div class="adm-pi">
        <div class="adm-pi-top">
          <span class="adm-pi-name">${esc(p.pseudoRL||p.pseudoDiscord||'?')}</span>
          ${p.role?`<span class="role-bdg ${rc}">${p.role.toUpperCase()}</span>`:''}
        </div>
        <div class="adm-pi-sub">
          <span>${esc(tm.name||'— Agent libre —')}</span>
          ${p.country?`<span>${flagHtml(p.country)}</span>`:''}
          ${p.age?`<span>${p.age} ans</span>`:''}
        </div>
      </div>
      <button class="btn-d" onclick="event.stopPropagation();deletePlayer('${p.id}')">✕</button>
    </div>`;
  }).join('')||`<div class="empty">${t('no_players')}</div>`;
};

window.savePlayer = async function() {
  const rl    = document.getElementById('pf-rl').value.trim();
  const disc  = document.getElementById('pf-disc').value.trim();
  const track = document.getElementById('pf-track').value.trim();
  const age   = parseInt(document.getElementById('pf-age').value)||null;
  const cntry = document.getElementById('pf-country').value.trim().toUpperCase();
  const photo = document.getElementById('pf-photo').value.trim();
  const teamId= document.getElementById('pf-team').value;
  const role  = document.getElementById('pf-role').value;
  const uid   = document.getElementById('pf-uid').value.trim();
  if (!rl&&!disc) { toast('Pseudo requis','err'); return; }
  try {
    const data = {pseudoRL:rl,pseudoDiscord:disc,trackerUrl:track,age,country:cntry,photoUrl:photo,teamId,role,...(uid?{userId:uid}:{})};
    if (state.editPlayerId) { await updateDoc(doc(db,'rl_players',state.editPlayerId),data); }
    else { await addDoc(collection(db,'rl_players'),{...data,createdAt:serverTimestamp()}); }
    toast(t('saved'),'ok');
    state.editPlayerId=null;
    await admPlayers();
  } catch(e) { toast(t('err_save'),'err'); console.error(e); }
};

window.editPlayer = function(id) {
  const p=state.playersMap[id]; if(!p) return;
  state.editPlayerId=id;
  document.getElementById('mo-player-title').textContent = p.pseudoRL||p.pseudoDiscord||'Joueur';
  // Remplir les options équipes
  const teamOpts = `<option value="">— Sans équipe —</option>`+
    Object.values(state.teamsMap).sort((a,b)=>a.name.localeCompare(b.name))
      .map(t=>`<option value="${t.id}">${esc(t.name)} (P${t.pool})</option>`).join('');
  document.getElementById('mp-team').innerHTML = teamOpts;
  // Remplir les champs
  document.getElementById('mp-rl').value      = p.pseudoRL||'';
  document.getElementById('mp-disc').value    = p.pseudoDiscord||'';
  document.getElementById('mp-track').value   = p.trackerUrl||'';
  document.getElementById('mp-age').value     = p.age||'';
  document.getElementById('mp-country-picker').innerHTML = buildRLCountryPicker('mp-country', p.country||'');
  document.getElementById('mp-photo').value   = p.photoUrl||'';
  document.getElementById('mp-team').value    = p.teamId||'';
  document.getElementById('mp-role').value    = p.role||'titulaire';
  document.getElementById('mp-uid').value     = p.userId||'';
  // Statut Discord
  const discInfo = document.getElementById('mp-discord-info');
  if (p.userId && p.discordId) {
    const avatar = p.discordAvatar ? `<img src="${esc(p.discordAvatar)}" style="width:20px;height:20px;border-radius:50%;margin-right:6px;vertical-align:middle">` : '';
    discInfo.innerHTML = `<div style="display:flex;align-items:center;gap:8px;background:rgba(0,200,100,.08);border:1px solid rgba(0,200,100,.2);border-radius:7px;padding:7px 12px;font-size:.78rem">
      ${avatar}<span style="color:#0c8;font-weight:600">✅ Discord lié</span>
      <a href="https://discord.com/users/${esc(p.discordId)}" target="_blank" rel="noopener"
         style="margin-left:auto;color:#5865F2;font-size:.72rem;text-decoration:none;border:1px solid #5865F2;border-radius:5px;padding:2px 8px;transition:background .2s"
         onmouseover="this.style.background='rgba(88,101,242,.15)'" onmouseout="this.style.background=''">
        💬 Ouvrir dans Discord
      </a>
    </div>`;
  } else {
    discInfo.innerHTML = `<div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:7px;padding:7px 12px;font-size:.75rem;color:#f59e0b">
      ⚠️ Pas encore lié à un compte Discord
    </div>`;
  }
  openModal('mo-player');
};

window.savePlayerModal = async function() {
  const rl    = document.getElementById('mp-rl').value.trim();
  const disc  = document.getElementById('mp-disc').value.trim();
  const track = document.getElementById('mp-track').value.trim();
  const age   = parseInt(document.getElementById('mp-age').value)||null;
  const cntry = document.getElementById('mp-country').value.trim().toUpperCase();
  const photo = document.getElementById('mp-photo').value.trim();
  const teamId= document.getElementById('mp-team').value;
  const role  = document.getElementById('mp-role').value;
  const uid   = document.getElementById('mp-uid').value.trim();
  if (!rl&&!disc) { toast('Pseudo requis','err'); return; }
  try {
    const data = {pseudoRL:rl,pseudoDiscord:disc,trackerUrl:track,age,country:cntry,photoUrl:photo,teamId,role,...(uid?{userId:uid}:{})};
    await updateDoc(doc(db,'rl_players',state.editPlayerId),data);
    toast(t('saved'),'ok');
    state.editPlayerId=null;
    closeModal('mo-player');
    await admPlayers();
  } catch(e) { toast(t('err_save'),'err'); console.error(e); }
};

window.clearPlayerForm = function() {
  state.editPlayerId=null;
  ['pf-rl','pf-disc','pf-track','pf-age','pf-country','pf-photo'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('pf-team').value='';
  document.getElementById('pf-role').value='titulaire';
  document.getElementById('pf-uid').value='';
};

window.deletePlayer = async function(id) {
  if (!confirm(t('confirm_del'))) return;
  try { await deleteDoc(doc(db,'rl_players',id)); toast(t('deleted'),'ok'); await admPlayers(); }
  catch(e){ toast(t('err_save'),'err'); }
};

// ── Admin: Résultats ─────────────────────────────
function _renderAdmMatches() {
  const pool   = document.getElementById('ar-pool')?.value  || 'all';
  const week   = document.getElementById('ar-week')?.value  || 'all';
  const teamId = document.getElementById('ar-team')?.value  || '';
  const status = document.getElementById('ar-status')?.value|| 'pending';

  let matches = Object.values(state.matchesMap);
  if (pool   !== 'all') matches = matches.filter(m => m.pool  === parseInt(pool));
  if (week   !== 'all') matches = matches.filter(m => m.week  === parseInt(week));
  if (teamId)           matches = matches.filter(m => m.homeTeamId===teamId || m.awayTeamId===teamId);
  if (status === 'pending') matches = matches.filter(m => m.status !== 'played');
  else if (status === 'played') matches = matches.filter(m => m.status === 'played');
  matches.sort((a,b) => a.pool-b.pool || a.week-b.week || (a.group||'').localeCompare(b.group||''));

  const list = document.getElementById('match-list');
  if (!list) return;
  if (!matches.length) {
    list.innerHTML = `<div class="empty">${status==='pending'?'Tous les matchs ont été saisis !':'Aucun match trouvé.'}</div>`;
    return;
  }

  // Grouper par semaine
  const byWeek = {};
  matches.forEach(m => { const w=m.week||0; if(!byWeek[w])byWeek[w]=[]; byWeek[w].push(m); });

  list.innerHTML = Object.keys(byWeek).sort((a,b)=>a-b).map(w => {
    const wm = byWeek[w];
    const pendingCount = wm.filter(m=>m.status!=='played').length;
    const countLabel = pendingCount > 0
      ? `<span style="color:#f59e0b">${pendingCount} à saisir</span>`
      : `<span style="color:#0c8">${wm.length} saisis ✓</span>`;
    const cards = wm.map(m => {
      const ht = state.teamsMap[m.homeTeamId]||{name:'?',logoUrl:''};
      const at = state.teamsMap[m.awayTeamId]||{name:'?',logoUrl:''};
      const played = m.status === 'played';
      const badge = played
        ? `<span class="badge-ok">✓ Saisi</span>`
        : `<span class="badge-pending">⏳ À saisir</span>`;
      const scoreOrVs = played
        ? `<span class="amc-score">${m.homeScore} – ${m.awayScore}</span>`
        : `<span class="amc-vs">VS</span>`;
      const schedDisp = !played && m.scheduledAt ? `<span>📅 ${formatSchedule(m.scheduledAt)}</span>` : '';
      const resetBtn = played ? `<button class="amc-btn-icon" onclick="event.stopPropagation();resetMatch('${m.id}')" title="Réinitialiser">↺</button>` : '';
      return `<div class="adm-match-card ${played?'amc-played':'amc-pending'}" onclick="openMatchEntry('${m.id}')">
        <div class="amc-body">
          <div class="amc-team">
            <img class="amc-logo" src="${ht.logoUrl||''}" alt="" onerror="this.src=''">
            <span class="amc-name">${esc(ht.name)}</span>
          </div>
          <div class="amc-center">${badge}${scoreOrVs}</div>
          <div class="amc-team away">
            <img class="amc-logo" src="${at.logoUrl||''}" alt="" onerror="this.src=''">
            <span class="amc-name">${esc(at.name)}</span>
          </div>
        </div>
        <div class="amc-foot">
          <div class="amc-meta"><span>P${m.pool} · Gr.${m.group||'?'}</span>${schedDisp}</div>
          ${resetBtn ? `<div class="amc-actions">${resetBtn}</div>` : ''}
        </div>
      </div>`;
    }).join('');
    return `<div class="adm-week-hdr"><span class="adm-week-title">Semaine ${w}</span><span class="adm-week-count">${countLabel}</span></div>${cards}`;
  }).join('');
}

function _saveAdmFilters() {
  return {
    status: document.getElementById('ar-status')?.value || 'pending',
    pool:   document.getElementById('ar-pool')?.value   || 'all',
    week:   document.getElementById('ar-week')?.value   || 'all',
    team:   document.getElementById('ar-team')?.value   || '',
  };
}
function _restoreAdmFilters(f) {
  if (!f) return;
  const s=document.getElementById('ar-status'), p=document.getElementById('ar-pool'),
        w=document.getElementById('ar-week'), t=document.getElementById('ar-team');
  if(s&&f.status) s.value=f.status;
  if(p&&f.pool)   p.value=f.pool;
  if(w&&f.week)   w.value=f.week;
  if(t&&f.team)   t.value=f.team;
}

async function admResults(savedFilters) {
  await refreshMatches();
  const wrap = document.getElementById('adm-content');
  const teamOpts = `<option value="">Toutes les équipes</option>`
    + Object.values(state.teamsMap).sort((a,b)=>a.pool-b.pool||a.name.localeCompare(b.name))
        .map(t=>`<option value="${t.id}">P${t.pool} · ${esc(t.name)}</option>`).join('');
  wrap.innerHTML = `
    <div class="adm-filters-bar">
      <div class="adm-filter-grp">
        <span class="adm-filter-lbl">Statut</span>
        <select class="adm-sel" id="ar-status" onchange="_renderAdmMatches()" style="font-weight:600">
          <option value="pending">⏳ À saisir</option>
          <option value="played">✓ Saisis</option>
          <option value="all">Tous</option>
        </select>
      </div>
      <div class="adm-filter-grp">
        <span class="adm-filter-lbl">Poule</span>
        <select class="adm-sel" id="ar-pool" onchange="_renderAdmMatches()">
          <option value="all">Toutes</option>
          <option value="1">Poule 1</option>
          <option value="2">Poule 2</option>
        </select>
      </div>
      <div class="adm-filter-grp">
        <span class="adm-filter-lbl">Semaine</span>
        <select class="adm-sel" id="ar-week" onchange="_renderAdmMatches()">
          <option value="all">Toutes</option>
          <option value="1">Sem. 1</option><option value="2">Sem. 2</option>
          <option value="3">Sem. 3</option><option value="4">Sem. 4</option>
          <option value="5">Sem. 5</option>
        </select>
      </div>
      <div class="adm-filter-grp" style="margin-left:auto">
        <span class="adm-filter-lbl">Équipe</span>
        <select class="adm-sel" id="ar-team" onchange="_renderAdmMatches()">${teamOpts}</select>
      </div>
    </div>
    <div id="match-list"></div>`;
  window._renderAdmMatches = _renderAdmMatches;
  _restoreAdmFilters(savedFilters);
  _renderAdmMatches();
}

window.admFilterMatch = function() { _renderAdmMatches(); };

function formatSchedule(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = d - now;
  const time = d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  if (diff < 0) return d.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'}) + ' ' + time;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const matchStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((matchStart - todayStart) / 86400000);
  if (dayDiff === 0) return `Aujourd'hui · ${time}`;
  if (dayDiff === 1) return `Demain · ${time}`;
  if (dayDiff < 7) return d.toLocaleDateString('fr-FR',{weekday:'long'}) + ` · ${time}`;
  return d.toLocaleDateString('fr-FR',{day:'numeric',month:'long'}) + ` · ${time}`;
}

function toLocalDT(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

window.openScheduleMatch = function(matchId) {
  window._admFiltersSaved = _saveAdmFilters();
  const m = state.matchesMap[matchId]; if(!m) return;
  const ht = state.teamsMap[m.homeTeamId]||{name:'?'};
  const at = state.teamsMap[m.awayTeamId]||{name:'?'};
  const cur = toLocalDT(m.scheduledAt);
  const streamed = m.officialStream ? 'checked' : '';
  document.getElementById('mo-match-title').textContent = `📅 ${ht.name} vs ${at.name}`;
  document.getElementById('mo-match-body').innerHTML = `
    <div class="fg" style="margin-bottom:14px">
      <label>Date et heure du match</label>
      <input class="finput" id="sc-date" type="datetime-local" value="${cur}">
    </div>
    <label class="stream-toggle">
      <input type="checkbox" id="sc-stream" ${streamed}>
      <div class="stream-toggle-box">
        <span class="stream-toggle-icon">🎥</span>
        <div>
          <div class="stream-toggle-title">Stream officiel Springs E-Sport</div>
          <div class="stream-toggle-sub">Afficher ce match sur la page d'accueil</div>
        </div>
      </div>
    </label>
    <div class="f-actions" style="margin-top:16px">
      <button class="btn-p" onclick="saveSchedule('${matchId}')">💾 Enregistrer</button>
      <button class="btn-s" onclick="closeModal('mo-match')">Annuler</button>
    </div>`;
  openModal('mo-match');
};

window.saveSchedule = async function(matchId) {
  const val = document.getElementById('sc-date').value;
  if (!val) { toast('Date requise','err'); return; }
  const officialStream = document.getElementById('sc-stream').checked;
  try {
    await updateDoc(doc(db,'rl_matches',matchId),{scheduledAt: new Date(val).toISOString(), officialStream});
    toast('Date enregistrée','ok');
    closeModal('mo-match');
    await admResults(window._admFiltersSaved);
  } catch(e){toast(t('err_save'),'err');}
};

window.resetMatch = async function(id) {
  if(!confirm('Remettre ce match à zéro ?')) return;
  try {
    await updateDoc(doc(db,'rl_matches',id),{status:'scheduled',homeScore:null,awayScore:null,games:[],vodUrl:''});
    toast('Match réinitialisé','ok');
    await admResults(window._admFiltersSaved);
  } catch(e){toast(t('err_save'),'err');}
};

window.openMatchEntry = async function(matchId) {
  window._admFiltersSaved = _saveAdmFilters();
  const m = state.matchesMap[matchId]; if (!m) return;
  const ht = state.teamsMap[m.homeTeamId]||{name:'?'};
  const at = state.teamsMap[m.awayTeamId]||{name:'?'};
  const existGames = (m.games && m.games.length) ? m.games : [];

  const renderGameRows = () => {
    const rows = document.getElementById('game-rows');
    if (!rows) return;
    const games = getGameRows();
    rows.innerHTML = games.map((g, i) => `
      <div class="game-row" data-idx="${i}">
        <span class="game-row-num">M${i+1}</span>
        <input class="score-inp sm" type="number" min="0" max="20" value="${g.homeGoals}" placeholder="0" data-side="home">
        <span class="game-row-sep">—</span>
        <input class="score-inp sm" type="number" min="0" max="20" value="${g.awayGoals}" placeholder="0" data-side="away">
        <button class="btn-rm-game" onclick="removeGameRow(${i})" title="Supprimer">×</button>
      </div>`).join('');
    updateMatchScore();
  };

  window._currentMatchGames = existGames.map(g => ({homeGoals: g.homeGoals||0, awayGoals: g.awayGoals||0}));
  if (!window._currentMatchGames.length) window._currentMatchGames.push({homeGoals:0, awayGoals:0});

  document.getElementById('mo-match-title').textContent = 'Saisir le résultat';
  document.getElementById('mo-match-body').innerHTML = `
    <div class="ge-modal-hdr">
      <div class="ge-hdr-team">
        <img class="ge-hdr-logo" src="${ht.logoUrl||''}" alt="" onerror="this.style.opacity='.2'">
        <span class="ge-hdr-name">${esc(ht.name)}</span>
      </div>
      <span class="ge-hdr-vs">VS</span>
      <div class="ge-hdr-team away">
        <img class="ge-hdr-logo" src="${at.logoUrl||''}" alt="" onerror="this.style.opacity='.2'">
        <span class="ge-hdr-name">${esc(at.name)}</span>
      </div>
    </div>
    <div class="games-entry-wrap">
      <div id="game-rows"></div>
      <button class="btn-add-game" onclick="addGameRow()">+ Manche</button>
      <div class="ge-total" id="ge-total"></div>
    </div>
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:14px">
      <div style="font-size:.65rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">📅 Planification</div>
      <div style="display:grid;grid-template-columns:1fr auto;align-items:end;gap:12px">
        <div class="fg">
          <label>Date et heure</label>
          <input class="finput" id="si-date" type="datetime-local" value="${toLocalDT(m.scheduledAt)}">
        </div>
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer;padding-bottom:7px;white-space:nowrap">
          <input type="checkbox" id="si-stream" ${m.officialStream?'checked':''}>
          <span style="font-size:.78rem;font-weight:700">🎥 Stream officiel</span>
        </label>
      </div>
      <button class="btn-s" style="margin-top:10px;width:100%" onclick="saveMatchSchedule('${matchId}')">📅 Enregistrer la date uniquement</button>
    </div>
    <div class="fg" style="margin-top:12px">
      <label>${t('f_vod')}</label>
      <input class="finput" id="si-vod" type="url" placeholder="https://youtube.com/..." value="${m.vodUrl||''}">
    </div>
    <div class="forfait-section">
      <div class="forfait-lbl">🏳 Déclarer forfait</div>
      <div class="forfait-btns">
        <button class="btn-forfait" onclick="declareForfeit('${matchId}','${m.homeTeamId}')">🏳 ${esc(ht.name)}</button>
        <button class="btn-forfait" onclick="declareForfeit('${matchId}','${m.awayTeamId}')">🏳 ${esc(at.name)}</button>
      </div>
    </div>
    <div class="f-actions" style="margin-top:14px">
      <button class="btn-p" onclick="saveMatchResult('${matchId}')">✓ Enregistrer le résultat</button>
      <button class="btn-s" onclick="closeModal('mo-match')">${t('cancel')}</button>
    </div>`;

  renderGameRows();
  // attach input listeners for live score update
  document.getElementById('game-rows').addEventListener('input', () => {
    syncGameRowsFromDOM();
    updateMatchScore();
  });

  openModal('mo-match');
};

window.getGameRows = function() { return window._currentMatchGames || []; };

window.syncGameRowsFromDOM = function() {
  const rows = document.querySelectorAll('#game-rows .game-row');
  rows.forEach((row, i) => {
    const h = parseInt(row.querySelector('[data-side="home"]').value)||0;
    const a = parseInt(row.querySelector('[data-side="away"]').value)||0;
    if (window._currentMatchGames[i]) {
      window._currentMatchGames[i] = {homeGoals: h, awayGoals: a};
    }
  });
};

window.addGameRow = function() {
  syncGameRowsFromDOM();
  window._currentMatchGames.push({homeGoals:0, awayGoals:0});
  const rows = document.getElementById('game-rows');
  const i = window._currentMatchGames.length - 1;
  const div = document.createElement('div');
  div.className = 'game-row';
  div.dataset.idx = i;
  div.innerHTML = `
    <span class="game-row-num">M${i+1}</span>
    <input class="score-inp sm" type="number" min="0" max="20" value="0" placeholder="0" data-side="home">
    <span class="game-row-sep">—</span>
    <input class="score-inp sm" type="number" min="0" max="20" value="0" placeholder="0" data-side="away">
    <button class="btn-rm-game" onclick="removeGameRow(${i})" title="Supprimer">×</button>`;
  rows.appendChild(div);
  updateMatchScore();
  div.querySelector('[data-side="home"]').focus();
};

window.removeGameRow = function(idx) {
  syncGameRowsFromDOM();
  if (window._currentMatchGames.length <= 1) return;
  window._currentMatchGames.splice(idx, 1);
  // re-render
  const rows = document.getElementById('game-rows');
  if (!rows) return;
  rows.innerHTML = window._currentMatchGames.map((g, i) => `
    <div class="game-row" data-idx="${i}">
      <span class="game-row-num">M${i+1}</span>
      <input class="score-inp sm" type="number" min="0" max="20" value="${g.homeGoals}" placeholder="0" data-side="home">
      <span class="game-row-sep">—</span>
      <input class="score-inp sm" type="number" min="0" max="20" value="${g.awayGoals}" placeholder="0" data-side="away">
      <button class="btn-rm-game" onclick="removeGameRow(${i})" title="Supprimer">×</button>
    </div>`).join('');
  updateMatchScore();
};

window.updateMatchScore = function() {
  syncGameRowsFromDOM();
  const games = window._currentMatchGames;
  let hw = 0, aw = 0, hg = 0, ag = 0;
  games.forEach((g, i) => {
    const h = g.homeGoals||0, a = g.awayGoals||0;
    hg += h; ag += a;
    if (h > a) hw++; else if (a > h) aw++;
    const row = document.querySelector(`#game-rows .game-row[data-idx="${i}"]`);
    if (row) {
      row.classList.toggle('gr-h', h > a);
      row.classList.toggle('gr-a', a > h);
    }
  });
  const el = document.getElementById('ge-total');
  if (!el) return;
  const goalsLbl = (hg > 0 || ag > 0) ? `<span class="ge-goals">${hg} bts — ${ag} bts</span>` : '';
  el.innerHTML = `<span class="ge-score ${hw>aw?'win':''}"><strong>${hw}</strong></span><span class="ge-sep">–</span><span class="ge-score ${aw>hw?'win':''}"><strong>${aw}</strong></span>${goalsLbl}`;
};

window.saveMatchSchedule = async function(matchId) {
  const dateVal = document.getElementById('si-date')?.value;
  const officialStream = document.getElementById('si-stream')?.checked || false;
  if (!dateVal) { toast('Aucune date saisie','err'); return; }
  try {
    await updateDoc(doc(db,'rl_matches',matchId),{
      scheduledAt: new Date(dateVal).toISOString(),
      officialStream
    });
    toast('Date enregistrée','ok');
    closeModal('mo-match');
    await admResults(window._admFiltersSaved);
  } catch(e) { toast(t('err_save'),'err'); console.error(e); }
};

window.saveMatchResult = async function(matchId) {
  syncGameRowsFromDOM();
  const games = (window._currentMatchGames||[]).filter(g => g.homeGoals != null && g.awayGoals != null);
  if (!games.length) { toast('Ajoutez au moins une manche','err'); return; }
  let homeScore = 0, awayScore = 0;
  games.forEach(g => {
    if ((g.homeGoals||0) > (g.awayGoals||0)) homeScore++;
    else if ((g.awayGoals||0) > (g.homeGoals||0)) awayScore++;
  });
  const vod = document.getElementById('si-vod').value.trim();
  const dateVal = document.getElementById('si-date')?.value;
  const officialStream = document.getElementById('si-stream')?.checked || false;
  try {
    await updateDoc(doc(db,'rl_matches',matchId),{status:'played', homeScore, awayScore, games, vodUrl:vod, officialStream, forfeit:false, forfeitTeamId:null, ...(dateVal?{scheduledAt:new Date(dateVal).toISOString()}:{})});
    toast(t('saved'),'ok');
    closeModal('mo-match');
    await admResults(window._admFiltersSaved);
  } catch(e) { toast(t('err_save'),'err'); console.error(e); }
};

window.declareForfeit = async function(matchId, loserTeamId) {
  const m = state.matchesMap[matchId]; if (!m) return;
  const loser = state.teamsMap[loserTeamId]||{name:'?'};
  const isHome = m.homeTeamId === loserTeamId;
  if (!confirm(`Déclarer forfait pour ${loser.name} ?\nScore enregistré : ${isHome?'0 – 4':'4 – 0'}`)) return;
  const homeScore = isHome ? 0 : 4;
  const awayScore = isHome ? 4 : 0;
  const dateVal = document.getElementById('si-date')?.value;
  const officialStream = document.getElementById('si-stream')?.checked || false;
  try {
    await updateDoc(doc(db,'rl_matches',matchId),{
      status:'played', homeScore, awayScore, games:[], vodUrl:'',
      forfeit:true, forfeitTeamId:loserTeamId, officialStream,
      ...(dateVal?{scheduledAt:new Date(dateVal).toISOString()}:{})
    });
    toast(`Forfait ${loser.name} enregistré`,'ok');
    closeModal('mo-match');
    await admResults(window._admFiltersSaved);
  } catch(e) { toast(t('err_save'),'err'); console.error(e); }
};

// ── Admin: Calendrier ────────────────────────────
function admCalendar() {
  document.getElementById('adm-content').innerHTML=`
    <div class="cal-box">
      <div class="stitle">Initialiser les équipes</div>
      <div class="cal-info">
        <p>Crée les 32 équipes (Poule 1 + Poule 2) depuis le planning. Les équipes déjà existantes sont ignorées.</p>
        <p style="margin-top:10px"><strong>Poule 1 (${SCHEDULE[1].teams.length} équipes) :</strong></p>
        <div class="name-chips">${SCHEDULE[1].teams.map(n=>`<span class="chip">${esc(n)}</span>`).join('')}</div>
        <p style="margin-top:10px"><strong>Poule 2 (${SCHEDULE[2].teams.length} équipes) :</strong></p>
        <div class="name-chips">${SCHEDULE[2].teams.map(n=>`<span class="chip">${esc(n)}</span>`).join('')}</div>
      </div>
      <button class="btn-p" onclick="initTeams()" id="btn-init-teams">🏟️ Créer les équipes</button>
      <div id="init-teams-result"></div>
      <div class="stitle" style="margin-top:24px">Initialiser les joueurs</div>
      <div class="cal-info"><p>Crée tous les joueurs depuis le formulaire d'inscription (${PLAYERS_DATA.reduce((s,t)=>s+t.players.length,0)} joueurs, 31 équipes). Les joueurs déjà existants sont ignorés.</p></div>
      <button class="btn-p" onclick="initPlayers()" id="btn-init-players">👥 Créer les joueurs</button>
      <div id="init-players-result"></div>
      <div class="stitle" style="margin-top:24px">${t('init_cal')}</div>
      <div class="cal-info"><p>${t('init_warn')}</p></div>
      <button class="btn-p" onclick="initCalendar()">🚀 ${t('init_confirm')||t('init_cal')}</button>
      <div id="init-result"></div>
    </div>`;
}

// ── Admin: Liaison Discord ────────────────────────────────────────────
let _discPreds = {}; // cache predictors pour linkAllExact

async function admDiscord() {
  const wrap = document.getElementById('adm-content');
  wrap.innerHTML = '<div style="padding:20px;color:var(--text2)">Chargement...</div>';
  if (window._fetchAll) await window._fetchAll();

  const predSnap = await getDocs(collection(db, 'rl_predictors'));
  _discPreds = {};
  predSnap.forEach(d => { _discPreds[d.id] = { id: d.id, ...d.data() }; });

  const players = Object.values(state.playersMap).sort((a,b) => {
    const ta = state.teamsMap[a.teamId]?.name || '';
    const tb = state.teamsMap[b.teamId]?.name || '';
    return ta.localeCompare(tb) || (a.pseudoRL||'').localeCompare(b.pseudoRL||'');
  });

  const linked   = players.filter(p => p.userId);
  const unlinked = players.filter(p => !p.userId);
  const linkedUids = new Set(linked.map(p => p.userId).filter(Boolean));
  const freePreds = Object.values(_discPreds).filter(pr => !linkedUids.has(pr.id));

  function score(player, pred) {
    const a = (player.pseudoDiscord||'').toLowerCase();
    const b = (pred.discordUsername||'').toLowerCase();
    if (!a || !b) return 0;
    if (a === b) return 2;
    if (a.includes(b) || b.includes(a)) return 1;
    return 0;
  }

  // Compter les matchs exacts disponibles
  const exactCount = unlinked.filter(p =>
    freePreds.some(pr => (pr.discordUsername||'').toLowerCase() === (p.pseudoDiscord||'').toLowerCase())
  ).length;

  function playerRow(p) {
    const team = state.teamsMap[p.teamId];
    const roleLabels = { titulaire:'Tit.', capitaine:'Cap.', sub:'Sub', coach:'Coach', manager:'Mgr', fondateur:'Fond.' };
    const sorted = [...freePreds].sort((a,b) => score(p,b) - score(p,a));
    const best = sorted[0];
    const bestScore = best ? score(p, best) : 0;
    const av = pr => pr?.discordAvatar
      ? `<img src="${esc(pr.discordAvatar)}" style="width:18px;height:18px;border-radius:50%;flex-shrink:0">`
      : `<div style="width:18px;height:18px;border-radius:50%;background:var(--bg3);display:inline-flex;align-items:center;justify-content:center;font-size:.55rem;font-weight:700;flex-shrink:0">${(pr?.discordUsername||'?')[0].toUpperCase()}</div>`;
    const searchKey = `${p.pseudoRL||''} ${p.pseudoDiscord||''} ${team?.name||''}`.toLowerCase();

    // Zone de suggestion selon le score
    let suggestHtml = '';
    if (!freePreds.length) {
      suggestHtml = `<span style="font-size:.72rem;color:var(--text3)">Aucun compte dispo</span>`;
    } else if (bestScore === 2) {
      // Match exact — bouton direct
      suggestHtml = `
        <div style="display:flex;align-items:center;gap:6px">
          ${av(best)}
          <span style="font-size:.78rem;font-weight:700;color:#0c8">${esc(best.discordUsername)}</span>
          <span style="font-size:.65rem;color:#0c8;border:1px solid rgba(0,204,136,.4);border-radius:4px;padding:1px 5px">✅ exact</span>
          <button class="btn-p" style="font-size:.7rem;padding:3px 10px;margin-left:2px" onclick="linkPlayerDirect('${p.id}','${esc(best.id)}')">Lier</button>
          <button class="btn-s" style="font-size:.7rem;padding:3px 6px" title="Choisir un autre" onclick="toggleAltSel('${p.id}')">▾</button>
          <button class="btn-s" style="font-size:.65rem;padding:2px 5px;color:var(--text3)" onclick="toggleManualUid('${p.id}')" title="UID manuel">✏️</button>
        </div>`;
    } else if (bestScore === 1) {
      // Match partiel — suggestion avec confirmation
      suggestHtml = `
        <div style="display:flex;align-items:center;gap:6px">
          ${av(best)}
          <span style="font-size:.78rem;font-weight:600;color:#f59e0b">${esc(best.discordUsername)}</span>
          <span style="font-size:.65rem;color:#f59e0b;border:1px solid rgba(245,158,11,.4);border-radius:4px;padding:1px 5px">🔶 approx</span>
          <button class="btn-p" style="font-size:.7rem;padding:3px 10px;margin-left:2px" onclick="linkPlayerDirect('${p.id}','${esc(best.id)}')">Lier</button>
          <button class="btn-s" style="font-size:.7rem;padding:3px 6px" onclick="toggleAltSel('${p.id}')">Autre ▾</button>
          <button class="btn-s" style="font-size:.65rem;padding:2px 5px;color:var(--text3)" onclick="toggleManualUid('${p.id}')" title="UID manuel">✏️</button>
        </div>`;
    } else {
      // Aucun match — dropdown compact d'emblée
      const opts = sorted.map(pr => `<option value="${esc(pr.id)}">${esc(pr.discordUsername)}</option>`).join('');
      suggestHtml = `
        <div style="display:flex;gap:5px;align-items:center">
          <select class="finput" id="sel-${p.id}" style="font-size:.72rem;padding:3px 6px;max-width:180px">
            <option value="">— Choisir —</option>${opts}
          </select>
          <button class="btn-p" style="font-size:.7rem;padding:3px 8px" onclick="linkPlayerDiscord('${p.id}')">Lier</button>
          <button class="btn-s" style="font-size:.65rem;padding:2px 5px;color:var(--text3)" onclick="toggleManualUid('${p.id}')" title="UID manuel">✏️</button>
        </div>`;
    }

    // Dropdown alternatif (caché par défaut, pour changer de suggestion)
    const altOpts = sorted.map(pr => `<option value="${esc(pr.id)}">${esc(pr.discordUsername)}</option>`).join('');
    const altDropdown = bestScore > 0 ? `
      <div id="alt-${p.id}" style="display:none;margin-top:5px;display:none;gap:5px;align-items:center">
        <select class="finput" id="sel-${p.id}" style="font-size:.72rem;padding:3px 6px;max-width:200px">
          <option value="">— Choisir —</option>${altOpts}
        </select>
        <button class="btn-p" style="font-size:.7rem;padding:3px 8px" onclick="linkPlayerDiscord('${p.id}')">Lier</button>
      </div>` : '';

    // Champ UID manuel (caché)
    const manualHtml = `
      <div id="manual-${p.id}" style="display:none;margin-top:5px;display:none;gap:4px;align-items:center">
        <input class="finput" id="uid-${p.id}" placeholder="discord_000..." style="font-size:.7rem;padding:3px 6px;flex:1;max-width:200px">
        <button class="btn-s" style="font-size:.7rem;padding:3px 6px" onclick="linkPlayerManual('${p.id}')">OK</button>
      </div>`;

    return `<tr class="disc-row" data-search="${esc(searchKey)}">
      <td style="padding:8px 8px;white-space:nowrap">
        <div style="font-weight:700;font-size:.8rem">${esc(p.pseudoRL||'?')}</div>
        <div style="font-size:.65rem;color:var(--text2)">${esc(team?.name||'—')} · ${roleLabels[p.role]||p.role||''}</div>
      </td>
      <td style="padding:8px 8px;font-size:.72rem;color:var(--text2);white-space:nowrap">${esc(p.pseudoDiscord||'—')}</td>
      <td style="padding:8px 8px">
        ${suggestHtml}
        ${altDropdown}
        ${manualHtml}
      </td>
    </tr>`;
  }

  function linkedRow(p) {
    const team = state.teamsMap[p.teamId];
    const pred = _discPreds[p.userId];
    const discordName = p.discordUsername || pred?.discordUsername || p.discordId || p.userId?.replace('discord_','') || '?';
    const avatar = pred?.discordAvatar || p.discordAvatar || '';
    const searchKey = `${p.pseudoRL||''} ${discordName} ${team?.name||''}`.toLowerCase();
    return `<tr class="disc-row-linked" data-search="${esc(searchKey)}">
      <td style="padding:7px 8px;font-size:.78rem;font-weight:700;white-space:nowrap">${esc(p.pseudoRL||'?')}</td>
      <td style="padding:7px 8px;font-size:.72rem;color:var(--text2);white-space:nowrap">${esc(team?.name||'—')}</td>
      <td style="padding:7px 8px">
        <div style="display:flex;align-items:center;gap:5px">
          ${avatar ? `<img src="${esc(avatar)}" style="width:16px;height:16px;border-radius:50%">` : ''}
          <span style="font-size:.76rem;color:#0c8;font-weight:600">${esc(discordName)}</span>
        </div>
      </td>
      <td style="padding:7px 8px">
        <button class="btn-s" style="font-size:.65rem;padding:2px 6px;color:#ef4444;border-color:#ef4444" onclick="unlinkPlayer('${p.id}')">Délier</button>
      </td>
    </tr>`;
  }

  // Panneau comptes Discord en attente — séparés en "à vérifier" et "vérifiés"
  const freePendingNew     = freePreds.filter(pr => !pr.adminChecked);
  const freePendingChecked = freePreds.filter(pr =>  pr.adminChecked);

  function predCard(pr, checked) {
    const av = pr.discordAvatar
      ? `<img src="${esc(pr.discordAvatar)}" style="width:28px;height:28px;border-radius:50%">`
      : `<div style="width:28px;height:28px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700">${(pr.discordUsername||'?')[0].toUpperCase()}</div>`;
    if (checked) {
      return `<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;white-space:nowrap;opacity:.45">
        ${av}
        <span style="font-size:.75rem;font-weight:600;color:var(--text2)">${esc(pr.discordUsername||'?')}</span>
        <span style="font-size:.6rem;color:#0c8;border:1px solid rgba(0,204,136,.3);border-radius:3px;padding:1px 5px">✓ Vérifié</span>
        <button onclick="unmarkPredChecked('${pr.id}')" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:.65rem;padding:0 2px" title="Remettre en attente">↩</button>
      </div>`;
    }
    return `<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;white-space:nowrap">
      ${av}
      <span style="font-size:.75rem;font-weight:600">${esc(pr.discordUsername||'?')}</span>
      <button onclick="markPredChecked('${pr.id}')" style="background:none;border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--text2);font-size:.65rem;padding:2px 7px;transition:all .15s" onmouseover="this.style.borderColor='#0c8';this.style.color='#0c8'" onmouseout="this.style.borderColor='';this.style.color=''" title="Marquer comme vérifié — pas un joueur">Pas un joueur ✓</button>
    </div>`;
  }

  const freePredCards = `
    ${freePendingNew.length ? freePendingNew.map(pr => predCard(pr, false)).join('') : '<span style="font-size:.75rem;color:#0c8">✅ Tous vérifiés</span>'}
    ${freePendingChecked.length ? `
      <div style="width:100%;height:1px;background:var(--border);margin:6px 0"></div>
      ${freePendingChecked.map(pr => predCard(pr, true)).join('')}
    ` : ''}
  `;

  wrap.innerHTML = `
    <!-- Compteurs + action globale -->
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 16px;text-align:center">
        <div style="font-size:1.3rem;font-weight:800;color:#0c8">${linked.length}</div>
        <div style="font-size:.65rem;color:var(--text2)">Liés</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 16px;text-align:center">
        <div style="font-size:1.3rem;font-weight:800;color:#f59e0b">${unlinked.length}</div>
        <div style="font-size:.65rem;color:var(--text2)">Non liés</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 16px;text-align:center">
        <div style="font-size:1.3rem;font-weight:800;color:${freePendingNew.length > 0 ? '#5865F2' : '#0c8'}">${freePendingNew.length}</div>
        <div style="font-size:.65rem;color:var(--text2)">À vérifier${freePendingChecked.length ? ` <span style="color:var(--text3)">(+${freePendingChecked.length} vérifiés)</span>` : ''}</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
        ${exactCount > 0 ? `
        <button class="btn-p" onclick="linkAllExact()">
          ⚡ Lier ${exactCount} match${exactCount>1?'s':''} exact${exactCount>1?'s':''}
        </button>` : ''}
        <button onclick="resetPredSeason()" style="background:none;border:1px solid #ef4444;color:#ef4444;padding:6px 14px;border-radius:6px;font-size:.75rem;font-weight:700;cursor:pointer" title="Remet à zéro votes, mises et jetons pour tous les prédicteurs">
          🗑️ Reset saison prédictions
        </button>
      </div>
    </div>

    <!-- Comptes Discord en attente (non encore liés) -->
    ${freePreds.length ? `
    <div style="margin-bottom:18px">
      <div style="font-size:.7rem;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">
        Comptes Discord connectés non liés à un joueur
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${freePredCards}</div>
    </div>` : ''}

    ${unlinked.length ? `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <div class="stitle" style="margin:0">⚠️ Non liés (${unlinked.length})</div>
      <input class="finput" placeholder="🔍 Rechercher…" oninput="filterDiscordRows(this.value,'disc-row')"
        style="flex:1;max-width:260px;font-size:.78rem;padding:4px 10px">
    </div>
    <div style="overflow-x:auto;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="font-size:.65rem;color:var(--text2);text-transform:uppercase;border-bottom:1px solid var(--border)">
          <th style="padding:5px 8px;text-align:left">Joueur · Équipe</th>
          <th style="padding:5px 8px;text-align:left">pseudoDiscord</th>
          <th style="padding:5px 8px;text-align:left">Suggestion / Liaison</th>
        </tr></thead>
        <tbody>${unlinked.map(playerRow).join('')}</tbody>
      </table>
    </div>` : '<div style="color:#0c8;font-size:.85rem;margin-bottom:20px">✅ Tous les joueurs sont liés !</div>'}

    ${linked.length ? `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <div class="stitle" style="margin:0">✅ Liés (${linked.length})</div>
      <input class="finput" placeholder="🔍 Rechercher…" oninput="filterDiscordRows(this.value,'disc-row-linked')"
        style="flex:1;max-width:260px;font-size:.78rem;padding:4px 10px">
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="font-size:.65rem;color:var(--text2);text-transform:uppercase;border-bottom:1px solid var(--border)">
          <th style="padding:5px 8px;text-align:left">Joueur</th>
          <th style="padding:5px 8px;text-align:left">Équipe</th>
          <th style="padding:5px 8px;text-align:left">Discord</th>
          <th style="padding:5px 8px"></th>
        </tr></thead>
        <tbody>${linked.map(linkedRow).join('')}</tbody>
      </table>
    </div>` : ''}
  `;
}

window.filterDiscordRows = function(val, cls) {
  const q = val.toLowerCase();
  document.querySelectorAll('.' + cls).forEach(tr => {
    tr.style.display = tr.dataset.search?.includes(q) ? '' : 'none';
  });
};

window.toggleManualUid = function(playerId) {
  const el = document.getElementById('manual-' + playerId);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'flex' : 'none';
};

window.linkAllExact = async function() {
  const linkedUids = new Set(Object.values(state.playersMap).filter(p=>p.userId).map(p=>p.userId));
  const freePreds = Object.values(_discPreds).filter(pr => !linkedUids.has(pr.id));
  const toLink = [];
  for (const p of Object.values(state.playersMap)) {
    if (p.userId) continue;
    const match = freePreds.find(pr =>
      (pr.discordUsername||'').toLowerCase() === (p.pseudoDiscord||'').toLowerCase()
    );
    if (match) toLink.push({ player: p, pred: match });
  }
  if (!toLink.length) { toast('Aucun match exact', 'err'); return; }
  const batch = writeBatch(db);
  for (const { player, pred } of toLink) {
    batch.update(doc(db, 'rl_players', player.id), {
      userId: pred.id, discordId: pred.discordId, discordAvatar: pred.discordAvatar || '',
    });
    if (state.playersMap[player.id]) Object.assign(state.playersMap[player.id], { userId: pred.id, discordId: pred.discordId });
  }
  await batch.commit();
  toast(`${toLink.length} joueur(s) liés automatiquement !`, 'ok');
  await admDiscord();
};

window.linkPlayerDirect = async function(playerId, predUid) {
  const pred = _discPreds[predUid];
  if (!pred) { toast('Compte introuvable', 'err'); return; }
  await updateDoc(doc(db, 'rl_players', playerId), {
    userId: predUid, discordId: pred.discordId, discordAvatar: pred.discordAvatar || '', discordUsername: pred.discordUsername || '',
  });
  if (state.playersMap[playerId]) Object.assign(state.playersMap[playerId], { userId: predUid, discordId: pred.discordId, discordUsername: pred.discordUsername });
  toast(`${pred.discordUsername} lié !`, 'ok');
  await admDiscord();
};

window.linkPlayerDiscord = async function(playerId) {
  const predUid = document.getElementById('sel-' + playerId)?.value;
  if (!predUid) { toast('Sélectionne un compte Discord', 'err'); return; }
  const pred = _discPreds[predUid];
  if (!pred) { toast('Compte introuvable', 'err'); return; }
  await updateDoc(doc(db, 'rl_players', playerId), {
    userId: predUid, discordId: pred.discordId, discordAvatar: pred.discordAvatar || '', discordUsername: pred.discordUsername || '',
  });
  if (state.playersMap[playerId]) Object.assign(state.playersMap[playerId], { userId: predUid, discordId: pred.discordId, discordUsername: pred.discordUsername });
  toast(`${pred.discordUsername} lié !`, 'ok');
  await admDiscord();
};

window.toggleAltSel = function(playerId) {
  const el = document.getElementById('alt-' + playerId);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'flex' : 'none';
};

window.linkPlayerManual = async function(playerId) {
  const uid = document.getElementById('uid-' + playerId)?.value.trim();
  if (!uid) { toast('UID vide', 'err'); return; }
  await updateDoc(doc(db, 'rl_players', playerId), { userId: uid });
  if (state.playersMap[playerId]) state.playersMap[playerId].userId = uid;
  toast('Lien forcé', 'ok');
  await admDiscord();
};

window.unlinkPlayer = async function(playerId) {
  if (!confirm('Délier ce joueur de son compte Discord ?')) return;
  await updateDoc(doc(db, 'rl_players', playerId), { userId: '', discordId: '', discordAvatar: '' });
  if (state.playersMap[playerId]) { state.playersMap[playerId].userId = ''; state.playersMap[playerId].discordId = ''; }
  toast('Lien supprimé', 'ok');
  await admDiscord();
};

window.markPredChecked = async function(uid) {
  await updateDoc(doc(db, 'rl_predictors', uid), { adminChecked: true });
  if (_discPreds[uid]) _discPreds[uid].adminChecked = true;
  await admDiscord();
};

window.unmarkPredChecked = async function(uid) {
  await updateDoc(doc(db, 'rl_predictors', uid), { adminChecked: false });
  if (_discPreds[uid]) _discPreds[uid].adminChecked = false;
  await admDiscord();
};

window.resetPredSeason = async function() {
  if (!confirm('⚠️ Reset saison prédictions\n\nCeci va effacer tous les votes, mises de jetons et classements pour tous les prédicteurs.\n\nLes comptes Discord ne seront PAS supprimés.\n\nConfirmer ?')) return;
  try {
    const [seasonSnap, accSnap] = await Promise.all([
      getDocs(collection(db, 'rl_pred_season')),
      getDocs(collection(db, 'rl_predictors')),
    ]);
    const batch = writeBatch(db);
    // Supprimer tous les docs rl_pred_season
    seasonSnap.forEach(d => batch.delete(d.ref));
    // Nettoyer les anciens champs saison encore présents dans rl_predictors (migration)
    const seasonFieldsClear = { votes: deleteField(), jbets: deleteField(), jetons: deleteField(), jetonsWeekKey: deleteField(), points: deleteField() };
    accSnap.forEach(d => {
      const data = d.data();
      if (data.votes || data.jbets || data.jetons || data.points) {
        batch.update(d.ref, seasonFieldsClear);
      }
    });
    await batch.commit();
    state.predictorsMap = {};
    toast(`Reset effectué — données saison supprimées`, 'ok');
    await admDiscord();
  } catch(e) { toast('Erreur lors du reset', 'err'); console.error(e); }
};

const PLAYERS_DATA = [
  {team:'LIONERA ESPORT',players:[
    {discord:'Le M',pseudoRL:'MaasteerrzZ',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/MaasteerrzZ/overview'},
    {discord:'Le S',pseudoRL:'Stormṁ',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Stormṁ/overview'},
    {discord:'Magiik',pseudoRL:'Magiik .',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Magiik%20./overview'},
    {discord:'Dreek',pseudoRL:'Dreeq',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198959361908/overview'},
  ]},
  {team:'Horus esport',players:[
    {discord:'kyloren65000',pseudoRL:'kyloren64000',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Kyloren64000/overview'},
    {discord:'k1ra_rl',pseudoRL:'nosidop',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/nosidop/overview'},
    {discord:'volcaaa.',pseudoRL:'volcaaa.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Volcaaa./overview'},
    {discord:'nxsi.nb1',pseudoRL:'clark.µ',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/clark.%C2%B5/overview'},
  ]},
  {team:'NLS Vision',players:[
    {discord:'hayden0670',pseudoRL:'HaydeN_RL',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/HaydeN_RL/overview'},
    {discord:'ryze6194',pseudoRL:'TR l Ryze',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/TR%20l%20Ryze/overview'},
    {discord:'zyroxxzz',pseudoRL:'ZyrOx',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198975345135/overview'},
    {discord:'xMax1m3x',pseudoRL:'Twitch_xMax1m3x',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Twitch_xMax1m3x/overview'},
  ]},
  {team:'Noctiq Esports',players:[
    {discord:'kenzg_',pseudoRL:'Kenz ケ',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Kenz%20%E3%82%B1/overview'},
    {discord:'Qex',pseudoRL:'Qex.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198261848930/overview'},
    {discord:'ostrum',pseudoRL:'ost',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198367991752/overview'},
    {discord:'zemstalinho',pseudoRL:'Zemstalinho',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Zemstalinho/overview'},
    {discord:'Bensai',pseudoRL:'bensai.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/bensai./overview'},
  ]},
  {team:'Exaltia Espada',players:[
    {discord:'rxqza.',pseudoRL:'Reqza.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198869204404/overview'},
    {discord:'pat7___',pseudoRL:'Pat7',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/P%C3%A0t7%20%E3%83%84/overview'},
    {discord:'soldatryan',pseudoRL:'Ryan',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561199014767010/overview'},
    {discord:'Webou',pseudoRL:'Webou',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Webbouu/overview'},
  ]},
  {team:'Toon Esport',players:[
    {discord:'wylo_nexto',pseudoRL:'μHexiacμ',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/%CE%BCHexiac%CE%BC/overview'},
    {discord:'eruprime',pseudoRL:'eru prime-',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198876915921/overview'},
    {discord:'teken09',pseudoRL:'TeKeN_',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/TeKeN_-/overview'},
    {discord:'nnekos',pseudoRL:'nekos',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198898043893/overview'},
  ]},
  {team:'Aran Esport',players:[
    {discord:'Bachiiraa',pseudoRL:'Meguruu.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Meguruu./overview'},
    {discord:'Fiftyie',pseudoRL:'Fiftyie',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/FIFTYIE/overview'},
    {discord:'Neyto',pseudoRL:'Neyto',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Neyto%20-_-/mmr?playlist=11'},
    {discord:'lapotyk',pseudoRL:'Adopted Cherry',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Adopted%20cherry/mmr?playlist=11'},
  ]},
  {team:'EVYL ESPORT',players:[
    {discord:'knighthd',pseudoRL:'Knight-HD',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198015642335/overview'},
    {discord:'Franix',pseudoRL:'Franix.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198851963163/overview'},
    {discord:'m8lari.',pseudoRL:'Lari.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561199014056197/overview'},
    {discord:'algo.rl',pseudoRL:'ALGØ',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198936868030/overview'},
  ]},
  {team:'Celestia Esport',players:[
    {discord:'looping_59',pseudoRL:'Looping',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198161071828/overview'},
    {discord:'kalyypso',pseudoRL:'Kalyypso.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/kalyypso./overview'},
    {discord:'baptoufr',pseudoRL:'Baptou',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Baptouuu./overview'},
    {discord:'Tto',pseudoRL:'TT0.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/TT0./overview'},
  ]},
  {team:'Aveon Esport',players:[
    {discord:'mentarl',pseudoRL:'Menta.µ',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Menta.%C2%B5/overview'},
    {discord:'1tryzer',pseudoRL:'mars-puissant639',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/mars-puissant639/overview'},
    {discord:'noctarll_',pseudoRL:'noctarll_',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198357038893/overview'},
    {discord:'drakyy_.',pseudoRL:'FairyDraky',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/FairyDraky/overview'},
  ]},
  {team:'Little Gigantes',players:[
    {discord:'azuros_',pseudoRL:'azuros_',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561199014571997/mmr?playlist=11'},
    {discord:'juninhorl',pseudoRL:'JuninhoRL',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/JuninhoRL/overview'},
    {discord:'wowx3',pseudoRL:'WOWX3',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/WOWX3/overview'},
    {discord:'toinou1XX',pseudoRL:'ToinouXx_',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/ToinouXx_/overview'},
  ]},
  {team:'Delta Mythics Minotaure',players:[
    {discord:'bucheron44',pseudoRL:'Bucheron44',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Bucheron44/overview'},
    {discord:'1tersport',pseudoRL:'1tersport',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/1tersport/overview'},
    {discord:'terrain_.',pseudoRL:'terrain_メ',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/terrain_%E3%83%A1/overview'},
    {discord:'usoopmarto_94130',pseudoRL:'Maktoufoh',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Maktoufoh/overview'},
  ]},
  {team:'Ascend E-Sport',players:[
    {discord:'Vey-San',pseudoRL:'Vey-San',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Vey-San/overview'},
    {discord:'Sanskye',pseudoRL:'Sanskye',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Sanskye/overview'},
    {discord:'Van_Dyyk_',pseudoRL:'gardien-N1',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/gardien-N1/overview'},
    {discord:'Sniip',pseudoRL:'sniiip_',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/sniiip_/overview'},
  ]},
  {team:'VENUM E-SPORT',players:[
    {discord:'cosmoze_',pseudoRL:'CøsmøZe',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/C%C3%B8sm%C3%B8Ze/overview'},
    {discord:'sysco52',pseudoRL:'Sysco-52',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Sysco-52/overview'},
    {discord:'saso_riz',pseudoRL:'zdr sasori',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/xbl/zdr%20sasori/overview'},
    {discord:'msstick',pseudoRL:'MssTck',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198354213915/overview'},
  ]},
  {team:'Kuro neko 2',players:[
    {discord:'Strikex',pseudoRL:'STRIKEX_.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/STRIKEX_./overview'},
    {discord:'Nyr',pseudoRL:'nµr',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/n%C2%B5r/overview'},
    {discord:'Piraterie',pseudoRL:'Piraterie ツ',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Piraterie%20%E3%83%84/overview'},
    {discord:'Ipsyion',pseudoRL:'Ipsyion',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Ipsyion/overview'},
  ]},
  {team:'Zx9 Gaming',players:[
    {discord:'ampoinou',pseudoRL:'Tralors',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198314316281/overview'},
    {discord:'blacklotus81',pseudoRL:'lotus!',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198323530884/overview'},
    {discord:'onlyonesneax',pseudoRL:'Haewon 사랑',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Haewon%20%EC%82%AC%EB%9E%91/overview'},
    {discord:'zzyk0',pseudoRL:'Zzyk0',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Zzyk0/overview'},
  ]},
  {team:'Helios Esport',players:[
    {discord:'oihan.',pseudoRL:'OihanGaming',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/OihanGaming/overview'},
    {discord:'sliress',pseudoRL:'Sliress',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Sliress%20-NO%20CHAT/overview'},
    {discord:'bretzsgn1409',pseudoRL:'Bretzrl',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/Bretzrl/overview'},
    {discord:'newp0w',pseudoRL:'NynpowerShot',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198797829671/overview'},
  ]},
  {team:'Team TXR',players:[
    {discord:'scary_4lpha',pseudoRL:'scarynho',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/psn/scarynho/overview'},
    {discord:'godzz_',pseudoRL:'GodZzinho',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/GodZzinho/overview'},
    {discord:'sifiel',pseudoRL:'Sifielinho',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Sifiel/overview'},
    {discord:'teamtxr',pseudoRL:'Smd_.07',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Smd_.07/overview'},
  ]},
  {team:'ALPHORIA ESPORT',players:[
    {discord:'zoro_02100',pseudoRL:'Zorojuro_02',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/ZoroJuro_02/overview'},
    {discord:'Yoda-RL',pseudoRL:'Yoda-RL',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Yoda-RL/overview'},
    {discord:'Waazz.',pseudoRL:'Waazz.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Waazz./overview'},
    {discord:'tenshi0878',pseudoRL:'Luffytaroo',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198289570598/overview'},
  ]},
  {team:'Pandaria Esport ACA',players:[
    {discord:'rhyte',pseudoRL:'Rhyte',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198444307929/overview'},
    {discord:'primito_',pseudoRL:'Primitø.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198293883794/overview'},
    {discord:'yamichiwan',pseudoRL:'Yami 黒',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198185228282/overview'},
    {discord:'mavriikz',pseudoRL:'mavriikzkami',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/mavriikzkami/overview'},
  ]},
  {team:'Crossbar Esport',players:[
    {discord:'MattLaPatate63',pseudoRL:'MattLaPatate63',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/MattLaPatate63/overview'},
    {discord:'baisemortt_91443',pseudoRL:'nono-220507',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/nono-220507/overview'},
    {discord:'eos_trunks',pseudoRL:'EoS_Trunks',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/EoS_Trunks/overview'},
    {discord:'naarrowww',pseudoRL:'Naarrow',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Naarrow/overview'},
    {discord:'dumzii',pseudoRL:'Duumzii',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Duumzii/overview'},
  ]},
  {team:'Delta Mythics',players:[
    {discord:'_freeze26',pseudoRL:'Frêeze-_-',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Fr%C3%AAeze-_-/overview'},
    {discord:'.reepty',pseudoRL:'Reeptyヤ',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Reepty%E3%83%A4/overview'},
    {discord:'.j0cks.',pseudoRL:'J0ckS.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198212630897/overview'},
    {discord:'maycko',pseudoRL:'mhka',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561199039428116/overview'},
  ]},
  {team:'ITOW ESPORT',players:[
    {discord:'Zowkii',pseudoRL:'zowkii',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198194357991/overview'},
    {discord:'Mesco',pseudoRL:'Mesco7.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Mesco7./overview'},
    {discord:'yxss',pseudoRL:'Yxss07',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Yxss07/overview'},
    {discord:'redeathy',pseudoRL:'redeathys',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/redeathys/overview'},
  ]},
  {team:'IP e-sport',players:[
    {discord:'portosrl',pseudoRL:'Portos',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198327477501/overview'},
    {discord:'natlop',pseudoRL:'El Natlop',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/El%20Natlop/overview'},
    {discord:'asm0.',pseudoRL:'Asm0.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Asm0./overview'},
    {discord:'X_Razer',pseudoRL:'X_Razer',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/X_Razer/overview'},
  ]},
  {team:'NightWolves Eclipse',players:[
    {discord:'coco7241',pseudoRL:'Cofeats',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Cofeats/overview'},
    {discord:'trendzr',pseudoRL:'Trendz .',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Trendz%20./overview'},
    {discord:'irzorikow',pseudoRL:'IrZø',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/IrZ%C3%B8/overview'},
    {discord:'evory_77',pseudoRL:'Evory_99.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Evory_99./overview'},
  ]},
  {team:'Tomioka',players:[
    {discord:'rayzerl',pseudoRL:'Little Mx!',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198074025087/overview'},
    {discord:'noxx_26',pseudoRL:'N7Xxµ',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/N7Xx%C2%B5/overview'},
    {discord:'jesuisungrosporc',pseudoRL:'CochonXsauvage',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/CochonXsauvage/mmr?playlist=11'},
    {discord:'teyko28',pseudoRL:'Teykô',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Teyk%C3%B4./overview'},
  ]},
  {team:'Evyl Iota',players:[
    {discord:'bryyyy__',pseudoRL:'Bryyyy',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198285467100/overview'},
    {discord:'matatore',pseudoRL:'Mata.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/Matatore/overview'},
    {discord:'chiff.',pseudoRL:'chiff.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198888306302/overview'},
    {discord:'rayzax',pseudoRL:'Rayzax_',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Rayzax_/overview'},
  ]},
  {team:"Tenss'Minions V7",players:[
    {discord:'imsmoo_',pseudoRL:'Imsmoo',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198328808830/overview'},
    {discord:'tenss.',pseudoRL:'tenssito.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/tenssito./overview'},
    {discord:'_vasick',pseudoRL:'vasick',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561199019121061/overview'},
    {discord:'valga9',pseudoRL:'have 0 aura',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/have%200%20aura/overview'},
    {discord:'wyrqzz',pseudoRL:'wxrqzz!',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198010982800/overview'},
  ]},
  {team:'FlopyFlop',players:[
    {discord:'zimo27',pseudoRL:'zimo .',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/zimo%20./overview'},
    {discord:'ndraac',pseudoRL:'NdRaac',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/NdRaac/overview'},
    {discord:'celestinho08',pseudoRL:'Celestinho.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Celestinho./overview'},
    {discord:'noxl78',pseudoRL:'EL NoxLitO',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/EL%20NoxLitO/mmr?playlist=11'},
  ]},
  {team:'Team VDR',players:[
    {discord:'v1ruz404',pseudoRL:'ViRuZ',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198216147864/overview'},
    {discord:'dorianfcov',pseudoRL:'DorianFcov.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/DorianFcov./mmr?playlist=11'},
    {discord:'.vulfur',pseudoRL:'Reyza',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Vulfur/overview'},
    {discord:'raphany7',pseudoRL:'raphany7-',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/raphany7/overview'},
  ]},
  {team:'Kuro Neko 1',players:[
    {discord:'Joyko',pseudoRL:'† Sylvya †',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198356826140/overview'},
    {discord:'Blankajr',pseudoRL:'Blanka.',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/steam/76561198029701590/overview'},
    {discord:'Flaykow',pseudoRL:'bes iris',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/Bes%20iris/overview'},
    {discord:'AOTIK',pseudoRL:'ΛӨƬIIK',trackerUrl:'https://rocketleague.tracker.network/rocket-league/profile/epic/AOTIIK%20%E3%82%B7/overview'},
  ]},
];

window.initPlayers = async function() {
  const btn = document.getElementById('btn-init-players');
  btn.disabled = true; btn.textContent = '...';
  try {
    await refreshTeams(true); await refreshPlayers(true);
    const nameToId = {};
    Object.values(state.teamsMap).forEach(t => { nameToId[t.name.trim().toLowerCase()] = t.id; });
    const existDiscords = new Set(Object.values(state.playersMap).map(p => p.pseudoDiscord?.toLowerCase()));
    const batch = writeBatch(db);
    let created = 0, skipped = 0, missing = [];
    for (const td of PLAYERS_DATA) {
      const teamId = nameToId[td.team.trim().toLowerCase()];
      if (!teamId) { missing.push(td.team); continue; }
      for (const p of td.players) {
        if (existDiscords.has(p.discord.toLowerCase())) { skipped++; continue; }
        batch.set(doc(collection(db,'rl_players')), {
          pseudoDiscord: p.discord, pseudoRL: p.pseudoRL, trackerUrl: p.trackerUrl,
          teamId, createdAt: serverTimestamp()
        });
        created++;
      }
    }
    await batch.commit();
    await refreshPlayers(true);
    const msg = document.getElementById('init-players-result');
    msg.className = 'init-msg ok';
    msg.textContent = `✓ ${created} joueurs créés.${skipped?` ${skipped} déjà existants ignorés.`:''}${missing.length?` Équipes non trouvées : ${missing.join(', ')}.`:''}`;
  } catch(e) {
    document.getElementById('init-players-result').className='init-msg err';
    document.getElementById('init-players-result').textContent='Erreur : '+e.message;
    console.error(e);
  }
  btn.disabled=false; btn.textContent='👥 Créer les joueurs';
};

window.initTeams = async function() {
  const btn = document.getElementById('btn-init-teams');
  btn.disabled = true; btn.textContent = '...';
  try {
    await refreshTeams(true);
    const existingNames = new Set(Object.values(state.teamsMap).map(t => t.name.trim().toLowerCase()));
    const batch = writeBatch(db);
    let created = 0, skipped = 0;
    for (const [pool, pd] of Object.entries(SCHEDULE)) {
      for (const name of pd.teams) {
        if (existingNames.has(name.trim().toLowerCase())) { skipped++; continue; }
        batch.set(doc(collection(db,'rl_teams')), {
          name: name.trim(), pool: parseInt(pool), tag: '', logoUrl: '', createdAt: serverTimestamp()
        });
        created++;
      }
    }
    await batch.commit();
    await refreshTeams(true);
    const msg = document.getElementById('init-teams-result');
    msg.className = 'init-msg ok';
    msg.textContent = `✓ ${created} équipes créées.${skipped ? ` ${skipped} déjà existantes ignorées.` : ''}`;
  } catch(e) {
    const msg = document.getElementById('init-teams-result');
    msg.className = 'init-msg err';
    msg.textContent = 'Erreur : ' + e.message;
  }
  btn.disabled = false; btn.textContent = '🏟️ Créer les équipes';
};

window.initCalendar = async function() {
  const btn=document.querySelector('#adm-content .btn-p');
  btn.disabled=true; btn.textContent='...';
  try {
    await refreshTeams(true);
    const nameToId={};
    Object.values(state.teamsMap).forEach(t=>{nameToId[t.name.trim().toLowerCase()]=t.id;});
    const batch=writeBatch(db);
    let created=0,skipped=0,missing=[];
    for(const [pool,pd] of Object.entries(SCHEDULE)){
      pd.weeks.forEach((week,wi)=>{
        const wNum=wi+1;
        Object.entries(week).forEach(([grp,teams])=>{
          for(let i=0;i<teams.length;i++){
            for(let j=i+1;j<teams.length;j++){
              const hId=nameToId[teams[i].trim().toLowerCase()];
              const aId=nameToId[teams[j].trim().toLowerCase()];
              if(!hId||!aId){
                if(!hId) missing.push(teams[i]);
                if(!aId) missing.push(teams[j]);
                skipped++; continue;
              }
              batch.set(doc(collection(db,'rl_matches')),{
                pool:parseInt(pool),week:wNum,group:grp,
                homeTeamId:hId,awayTeamId:aId,
                status:'scheduled',homeScore:null,awayScore:null,vodUrl:''
              });
              created++;
            }
          }
        });
      });
    }
    await batch.commit();
    const uniq=[...new Set(missing)];
    const msg=document.getElementById('init-result');
    msg.className='init-msg ok';
    msg.textContent=`✓ ${created} matchs créés.${skipped?` ${skipped} ignorés (équipes manquantes : ${uniq.join(', ')})`:''} `;
  } catch(e){
    document.getElementById('init-result').className='init-msg err';
    document.getElementById('init-result').textContent='Erreur : '+e.message;
  }
  btn.disabled=false; btn.textContent='🚀 Initialiser';
};
