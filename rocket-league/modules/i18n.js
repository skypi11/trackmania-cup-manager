// modules/i18n.js
import { state } from './state.js';
import { I18N } from './constants.js';

export function t(k) { return I18N[state.lang][k] || k; }

window.setLang = function(l) {
  state.lang = l;
  document.getElementById('btn-fr').classList.toggle('active', l==='fr');
  document.getElementById('btn-en').classList.toggle('active', l==='en');
  applyI18n();
  if (window._loadTab) window._loadTab(state.curTab);
};

export function applyI18n() {
  if (window._updateAuthBtn) window._updateAuthBtn();
  const keys = ['accueil','classement','equipes','resultats','stats','predictions'];
  keys.forEach(k => { const el = document.getElementById('nav-'+k); if(el) el.textContent = t('nav_'+k); });
  const map = {
    'lbl-live':'lbl_live','lbl-compet':'lbl_compet','lbl-fmt':'lbl_fmt','lbl-pools':'lbl_pools',
    'lbl-weeks':'lbl_weeks','lbl-lan':'lbl_lan','lbl-pts':'lbl_pts','lbl-preview':'lbl_preview',
    'mo-match-title':'mo_enter'
  };
  Object.entries(map).forEach(([id,key]) => { const el=document.getElementById(id); if(el) el.textContent=t(key); });
}
