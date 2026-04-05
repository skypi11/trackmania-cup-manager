// modules/utils.js
export function skelRows(n=10) {
  const ws=[90,120,80,140,110,95,130,100,120,85];
  return `<div class="stbl-wrap" style="border-radius:var(--r);overflow:hidden">${[...Array(n)].map((_,i)=>`<div class="skel-row">
    <span class="skel" style="width:20px;height:12px;flex-shrink:0"></span>
    <div style="display:flex;align-items:center;gap:8px;flex:1">
      <span class="skel" style="width:26px;height:26px;border-radius:4px;flex-shrink:0"></span>
      <span class="skel" style="width:${ws[i%ws.length]}px;height:12px"></span>
    </div>
    ${['24px','24px','24px','36px','24px','24px','28px','50px'].map(w=>`<span class="skel" style="width:${w};height:12px;flex-shrink:0"></span>`).join('')}
  </div>`).join('')}</div>`;
}

export function skelTeams(n=8) {
  const ws=[65,80,55,75,60,70,85,50];
  return `<div class="teams-grid">${[...Array(n)].map((_,i)=>`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;overflow:hidden">
    <div style="background:var(--bg3);padding:24px 20px;display:flex;align-items:center;justify-content:center;min-height:120px;border-bottom:1px solid var(--border)"><span class="skel" style="width:76px;height:76px;border-radius:8px"></span></div>
    <div style="padding:14px 16px"><span class="skel" style="width:${ws[i%ws.length]}%;height:14px;margin-bottom:8px"></span><span class="skel" style="width:40%;height:10px;display:block"></span></div>
  </div>`).join('')}</div>`;
}

export function skelMatches(n=3) {
  return [...Array(n)].map(()=>`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);margin-bottom:10px;overflow:hidden">
    <div style="padding:7px 13px;border-bottom:1px solid var(--border)"><span class="skel" style="width:160px;height:10px;display:inline-block"></span></div>
    <div style="display:grid;grid-template-columns:1fr 90px 1fr;padding:14px 18px;gap:12px;align-items:center">
      <div style="display:flex;align-items:center;gap:9px"><span class="skel" style="width:34px;height:34px;border-radius:5px;flex-shrink:0"></span><span class="skel" style="width:90px;height:12px"></span></div>
      <span class="skel" style="width:60px;height:28px;border-radius:6px;margin:0 auto;display:block"></span>
      <div style="display:flex;align-items:center;gap:9px;justify-content:flex-end"><span class="skel" style="width:90px;height:12px"></span><span class="skel" style="width:34px;height:34px;border-radius:5px;flex-shrink:0"></span></div>
    </div>
  </div>`).join('');
}

export function openModal(id) { document.getElementById(id).classList.add('open'); }
export function closeModal(id) { document.getElementById(id).classList.remove('open'); }
window.closeModal = closeModal;

export function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function toast(msg, type='ok') {
  const el=document.getElementById('toast');
  el.textContent=msg; el.className='show '+type;
  clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),3000);
}
