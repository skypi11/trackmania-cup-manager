// modules/standings.js
import { state } from './state.js';
import { t } from './i18n.js';
import { esc } from './utils.js';

export function calcPts(own, opp) {
  if (own==null||opp==null) return 0;
  return (own>opp?3:0) + own*0.1;
}

export function buildStandings(pool) {
  const teams = Object.values(state.teamsMap).filter(t=>t.pool===pool);
  const map = {};
  teams.forEach(t => { map[t.id]={...t,played:0,wins:0,losses:0,pts:0,gw:0,gl:0,form:[]}; });
  Object.values(state.matchesMap).forEach(m => {
    if (m.pool!==pool||m.status!=='played') return;
    const h=map[m.homeTeamId], a=map[m.awayTeamId];
    if (!h||!a) return;
    h.played++; a.played++;
    if (m.games && m.games.length) {
      m.games.forEach(g => {
        h.gw += (g.homeGoals||0); h.gl += (g.awayGoals||0);
        a.gw += (g.awayGoals||0); a.gl += (g.homeGoals||0);
      });
    }
    // wins/losses from homeScore/awayScore (still reliable)
    const hp=calcPts(m.homeScore,m.awayScore), ap=calcPts(m.awayScore,m.homeScore);
    h.pts=Math.round((h.pts+hp)*100)/100;
    a.pts=Math.round((a.pts+ap)*100)/100;
    if(m.homeScore>m.awayScore){h.wins++;a.losses++;}else{a.wins++;h.losses++;}
    h.form.push(m.homeScore>m.awayScore?'W':'L');
    a.form.push(m.awayScore>m.homeScore?'W':'L');
  });
  return Object.values(map).sort((a,b)=>{
    if(b.pts!==a.pts) return b.pts-a.pts;
    const diffA=a.gw-a.gl, diffB=b.gw-b.gl;
    if(diffB!==diffA) return diffB-diffA;
    return b.gw-a.gw;
  });
}
