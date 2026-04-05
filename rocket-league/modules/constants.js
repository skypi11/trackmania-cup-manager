// modules/constants.js
export const TWITCH = 'springsesport';

export const DISCORD_CLIENT_ID = '1483592495215673407';
export const DISCORD_REDIRECT = 'https://springs-esport.vercel.app/api/discord-callback';
export const DISCORD_AUTH_URL = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT)}&response_type=code&scope=identify`;

export const SCHEDULE = {
  1: {
    teams: ['Exaltia Espada','Celestia Esport','Zx9 Gaming','Toon Esport','Aran Esport','Horus esport','Kuro neko 2','VENUM E-SPORT','Ascend E-Sport','Aveon Esport','Little Gigantes','Delta Mythics Minotaure','NLS Vision','LIONERA ESPORT','Noctiq Esports','EVYL ESPORT'],
    weeks: [
      {A:['Exaltia Espada','Celestia Esport','Zx9 Gaming','Toon Esport'],B:['Aran Esport','Horus esport','Kuro neko 2','VENUM E-SPORT'],C:['Ascend E-Sport','Aveon Esport','Little Gigantes','Delta Mythics Minotaure'],D:['NLS Vision','LIONERA ESPORT','Noctiq Esports','EVYL ESPORT']},
      {A:['Exaltia Espada','Aran Esport','Ascend E-Sport','NLS Vision'],B:['Celestia Esport','Horus esport','Aveon Esport','LIONERA ESPORT'],C:['Zx9 Gaming','Kuro neko 2','Little Gigantes','Noctiq Esports'],D:['Toon Esport','VENUM E-SPORT','Delta Mythics Minotaure','EVYL ESPORT']},
      {A:['Exaltia Espada','Horus esport','Little Gigantes','EVYL ESPORT'],B:['Celestia Esport','Aran Esport','Delta Mythics Minotaure','Noctiq Esports'],C:['Zx9 Gaming','VENUM E-SPORT','Ascend E-Sport','LIONERA ESPORT'],D:['Toon Esport','Kuro neko 2','Aveon Esport','NLS Vision']},
      {A:['Exaltia Espada','Kuro neko 2','Delta Mythics Minotaure','LIONERA ESPORT'],B:['Celestia Esport','VENUM E-SPORT','Little Gigantes','NLS Vision'],C:['Zx9 Gaming','Aran Esport','Aveon Esport','EVYL ESPORT'],D:['Toon Esport','Horus esport','Ascend E-Sport','Noctiq Esports']},
      {A:['Exaltia Espada','VENUM E-SPORT','Aveon Esport','Noctiq Esports'],B:['Celestia Esport','Kuro neko 2','Ascend E-Sport','EVYL ESPORT'],C:['Zx9 Gaming','Horus esport','Delta Mythics Minotaure','NLS Vision'],D:['Toon Esport','Aran Esport','Little Gigantes','LIONERA ESPORT']}
    ]
  },
  2: {
    teams: ['NightWolves Eclipse','FlopyFlop','Crossbar Esport','IP e-sport','Team TXR',"Tenss'Minions V7",'Evyl Iota','Kuro Neko 1','ALPHORIA ESPORT','Tomioka','Helios Esport','Pandaria Esport ACA','Team VDR','ITOW ESPORT','Delta Mythics Enma'],
    weeks: [
      {A:['NightWolves Eclipse','FlopyFlop','Crossbar Esport','IP e-sport'],B:['Team TXR',"Tenss'Minions V7",'Evyl Iota','Kuro Neko 1'],C:['ALPHORIA ESPORT','Tomioka','Helios Esport','Pandaria Esport ACA'],D:['Team VDR','ITOW ESPORT','Delta Mythics Enma']},
      {A:['NightWolves Eclipse','Team TXR','ALPHORIA ESPORT','Team VDR'],B:['FlopyFlop',"Tenss'Minions V7",'Tomioka','ITOW ESPORT'],C:['Crossbar Esport','Evyl Iota','Helios Esport','Delta Mythics Enma'],D:['IP e-sport','Kuro Neko 1','Pandaria Esport ACA']},
      {A:['NightWolves Eclipse',"Tenss'Minions V7",'Helios Esport'],B:['FlopyFlop','Team TXR','Pandaria Esport ACA','Delta Mythics Enma'],C:['Crossbar Esport','Kuro Neko 1','ALPHORIA ESPORT','ITOW ESPORT'],D:['IP e-sport','Evyl Iota','Tomioka','Team VDR']},
      {A:['NightWolves Eclipse','Evyl Iota','Pandaria Esport ACA','ITOW ESPORT'],B:['FlopyFlop','Kuro Neko 1','Helios Esport','Team VDR'],C:['Crossbar Esport','Team TXR','Tomioka'],D:['IP e-sport',"Tenss'Minions V7",'ALPHORIA ESPORT','Delta Mythics Enma']},
      {A:['NightWolves Eclipse','Kuro Neko 1','Tomioka','Delta Mythics Enma'],B:['FlopyFlop','Evyl Iota','ALPHORIA ESPORT'],C:['Crossbar Esport',"Tenss'Minions V7",'Pandaria Esport ACA','Team VDR'],D:['IP e-sport','Team TXR','Helios Esport','ITOW ESPORT']}
    ]
  }
};

// Gardé pour rétrocompat (ne pas supprimer)
export const FLAGS = {FR:'FR',BE:'BE',CH:'CH',DE:'DE',ES:'ES',IT:'IT',NL:'NL',PT:'PT',GB:'GB',PL:'PL',SE:'SE',NO:'NO',DK:'DK',FI:'FI',US:'US',CA:'CA',LU:'LU',MA:'MA',DZ:'DZ',TN:'TN',RO:'RO',TR:'TR',CZ:'CZ',HU:'HU',SK:'SK',RS:'RS'};

export const RL_COUNTRIES = [
    ['DZ','Algérie'],['DE','Allemagne'],['AR','Argentine'],['AU','Australie'],
    ['AT','Autriche'],['BE','Belgique'],['BY','Biélorussie'],['BR','Brésil'],
    ['BG','Bulgarie'],['CA','Canada'],['CY','Chypre'],['KR','Corée du Sud'],
    ['HR','Croatie'],['DK','Danemark'],['ES','Espagne'],['EE','Estonie'],
    ['US','États-Unis'],['FI','Finlande'],['FR','France'],['GR','Grèce'],
    ['HU','Hongrie'],['IE','Irlande'],['IS','Islande'],['IT','Italie'],
    ['JP','Japon'],['LV','Lettonie'],['LI','Liechtenstein'],['LT','Lituanie'],
    ['LU','Luxembourg'],['MK','Macédoine du Nord'],['MT','Malte'],['MA','Maroc'],
    ['MD','Moldavie'],['MC','Monaco'],['NL','Pays-Bas'],['NO','Norvège'],
    ['NZ','Nouvelle-Zélande'],['PL','Pologne'],['PT','Portugal'],
    ['CZ','République tchèque'],['RO','Roumanie'],['GB','Royaume-Uni'],
    ['RU','Russie'],['RS','Serbie'],['SK','Slovaquie'],['SI','Slovénie'],
    ['SE','Suède'],['CH','Suisse'],['TN','Tunisie'],['TR','Turquie'],['UA','Ukraine'],
];

const _RL_NAME_MAP = Object.fromEntries(RL_COUNTRIES.map(([c,n])=>[c,n]));
const _rlFi = code => `<span class="fi fi-${(code||'').toLowerCase()}" style="width:20px;height:14px;border-radius:2px;display:inline-block;flex-shrink:0"></span>`;

export const flagHtml = code => code ? _rlFi(code) : '';

export function buildRLCountryPicker(id, selected = '') {
    const code = (selected||'').toUpperCase();
    const name = _RL_NAME_MAP[code] || '';
    const displayHtml = code
        ? `${_rlFi(code)}<span>${name||code}</span>`
        : '<span style="color:#555">— Pays —</span>';
    const items = RL_COUNTRIES.map(([c,n]) => {
        const active = c === code;
        return `<div onclick="window._rlCpSelect('${id}','${c}')"
            style="padding:8px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:.88rem;color:${active?'var(--rl-blue,#0081FF)':'#e0e0e0'};background:${active?'rgba(0,129,255,.08)':'transparent'}"
            onmouseover="this.style.background='rgba(255,255,255,.07)'"
            onmouseout="this.style.background='${active?'rgba(0,129,255,.08)':'transparent'}'">
            ${_rlFi(c)}<span>${n}</span></div>`;
    }).join('');
    return `<div class="rl-cp-root" id="${id}_root" style="position:relative">
        <div onclick="window._rlCpToggle('${id}')" style="display:flex;align-items:center;justify-content:space-between;padding:8px 11px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);cursor:pointer;user-select:none;font-family:inherit;font-size:.88rem;min-height:38px;color:#f0f0f0">
            <span id="${id}_display" style="display:inline-flex;align-items:center;gap:8px">${displayHtml}</span>
            <svg width="10" height="6" viewBox="0 0 10 6" style="flex-shrink:0"><path d="M1 1l4 4 4-4" stroke="#666" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
        </div>
        <input type="hidden" id="${id}" value="${code}">
        <div class="rl-cp-dd" id="${id}_dd" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:9999;background:#1c1c1c;border:1px solid rgba(255,255,255,.14);border-radius:8px;max-height:220px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.6)">
            ${items}
        </div>
    </div>`;
}
window._rlCpToggle = function(id) {
    const dd = document.getElementById(`${id}_dd`);
    if (!dd) return;
    const open = dd.style.display !== 'none';
    document.querySelectorAll('.rl-cp-dd').forEach(d => { d.style.display='none'; });
    if (!open) dd.style.display = 'block';
};
window._rlCpSelect = function(id, code) {
    const input = document.getElementById(id);
    const display = document.getElementById(`${id}_display`);
    const dd = document.getElementById(`${id}_dd`);
    const name = _RL_NAME_MAP[code] || code;
    if (input) input.value = code;
    if (display) display.innerHTML = `${_rlFi(code)}<span>${name}</span>`;
    if (dd) dd.style.display = 'none';
};
document.addEventListener('click', e => {
    if (!e.target.closest('.rl-cp-root'))
        document.querySelectorAll('.rl-cp-dd').forEach(d => { d.style.display='none'; });
}, true);

export const I18N = {
  fr:{
    login:'Connexion',logout:'Déconnexion',
    nav_accueil:'Accueil',nav_classement:'Classement',nav_equipes:'Équipes',nav_resultats:'Matchs',nav_stats:'Stats',nav_predictions:'Prédictions',
    lbl_live:'LIVE — SPRINGS E-SPORT',lbl_compet:'Compétition',lbl_fmt:'Format',lbl_pools:'Poules',lbl_weeks:'Semaines',lbl_lan:'LAN',lbl_pts:'Points',lbl_preview:'Classement — Aperçu',
    col_rank:'#',col_team:'Équipe',col_p:'J',col_w:'V',col_l:'D',col_pts:'Pts',col_gw:'B+',col_gl:'B-',col_diff:'Diff',
    week:'Sem.',all:'Tout',played:'Joués',sched:'À venir',
    no_match:'Aucun match pour ce filtre.',no_team:'Aucune équipe.',
    lan_q:'LAN',roster:'Roster',
    adm_t:'Équipes',adm_p:'Joueurs',adm_r:'Résultats',adm_c:'Calendrier',
    f_name:'Nom équipe',f_tag:'Tag (ex: EXA)',f_logo:'URL Logo',f_pool:'Poule',
    f_prl:'Pseudo Rocket League',f_disc:'Pseudo Discord',f_track:'URL Tracker RL',f_age:'Âge',f_country:'Pays (code FR, BE...)',f_photo:'URL Photo',f_team:'Équipe',
    save:'Enregistrer',cancel:'Annuler',delete:'Supprimer',add_t:'+ Ajouter équipe',add_p:'+ Ajouter joueur',
    init_cal:'Initialiser le calendrier',
    init_warn:'Cette action crée tous les matchs des 5 semaines. Les équipes doivent être créées au préalable avec les noms EXACTS du planning.',
    f_vod:'Lien VOD',f_score:'Score',enter_res:'Saisir résultat',
    mo_enter:'Saisir le résultat',stats_h:'Stats du match',
    saved:'Enregistré !',deleted:'Supprimé.',err_save:'Erreur lors de l\'enregistrement.',
    confirm_del:'Confirmer la suppression ?',no_players:'Aucun joueur dans cette équipe.'
  },
  en:{
    login:'Login',logout:'Logout',
    nav_accueil:'Home',nav_classement:'Standings',nav_equipes:'Teams',nav_resultats:'Matches',nav_stats:'Stats',nav_predictions:'Predictions',
    lbl_live:'LIVE — SPRINGS E-SPORT',lbl_compet:'Competition',lbl_fmt:'Format',lbl_pools:'Pools',lbl_weeks:'Weeks',lbl_lan:'LAN',lbl_pts:'Points',lbl_preview:'Standings — Overview',
    col_rank:'#',col_team:'Team',col_p:'P',col_w:'W',col_l:'L',col_pts:'Pts',col_gw:'GW',col_gl:'GL',col_diff:'Diff',
    week:'Wk',all:'All',played:'Played',sched:'Upcoming',
    no_match:'No matches for this filter.',no_team:'No teams found.',
    lan_q:'LAN',roster:'Roster',
    adm_t:'Teams',adm_p:'Players',adm_r:'Results',adm_c:'Schedule',
    f_name:'Team name',f_tag:'Tag (e.g. EXA)',f_logo:'Logo URL',f_pool:'Pool',
    f_prl:'Rocket League Username',f_disc:'Discord Username',f_track:'RL Tracker URL',f_age:'Age',f_country:'Country code (FR, BE...)',f_photo:'Photo URL',f_team:'Team',
    save:'Save',cancel:'Cancel',delete:'Delete',add_t:'+ Add team',add_p:'+ Add player',
    init_cal:'Initialize schedule',
    init_warn:'This creates all matches for 5 weeks. Teams must be created first with EXACT names from the schedule.',
    f_vod:'VOD Link',f_score:'Score',enter_res:'Enter result',
    mo_enter:'Enter result',stats_h:'Match stats',
    saved:'Saved!',deleted:'Deleted.',err_save:'Save error.',
    confirm_del:'Confirm deletion?',no_players:'No players in this team.'
  }
};
