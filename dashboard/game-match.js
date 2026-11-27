// Match official games. Never derive a venue from home/away or opponent.
export const tidy=x=>String(x??'').replace(/\s+/g,' ').trim();
export const normalize=x=>tidy(x).toLowerCase().replace(/[^a-z0-9]/g,'');
export function teamKey(raw){
 const s=tidy(raw).toLowerCase().replace(/-/g,' ');
 const school=/\bms\b|middle/.test(s)?'MS':/5\s*\/\s*6|5th|6th/.test(s)?'EL':/\bhs\b|high school/.test(s)?'HS':'';
 const sport=/flag/.test(s)?'flag':/cross\s*country/.test(s)?'crosscountry':/beach/.test(s)?'beach':s.match(/volleyball|basketball|football|soccer|baseball|softball|swim|golf|tennis|track/)?.[0]||'';
 let gender=/girls?/.test(s)?'G':/boys?/.test(s)?'B':'';
 if(!gender&&['volleyball','softball','flag'].includes(sport))gender='G';
 if(!gender&&['baseball','football'].includes(sport))gender='B';
 const level=/\bjv\s*2\b/.test(s)?'JV2':/\bjv\s*1?\b/.test(s)?'JV':/frosh|frso/.test(s)?'FROSH':/varsity/.test(s)||school==='HS'?'VARSITY':'';
 const color=s.match(/\b(red|blue|white|gold)\b/)?.[0]||'';
 return [school,sport,gender,level,color].join('|');
}
function schoolName(value){
 const key=normalize(value);
 return key==='benfranklin'?'benjaminfranklin':key;
}
function opponentName(e){
 let s=e.opponent||e.detail?.match(/(?:\bvs\.?|\bat|@)\s+(.+)/i)?.[1]||'';
 s=s.split('·')[0].replace(/^(?:first round|second round|(?:state\s+)?(?:quarterfinals?|semifinals?|finals?|championship))\s*:\s*/i,'');
 s=s.replace(/^[^:]*\b(?:classic|invitational|tournament)\b[^:]*:\s*vs\.?\s+/i,'');
 s=s.replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/ig,'').trim();
 return schoolName(s);
}
const withoutColor=key=>key.slice(0,key.lastIndexOf('|')+1);

export function matchGame(e,records,scheduleEvents=[]){
 if(e.type!=='game')return null;
 const key=teamKey(e.team),opponent=opponentName(e);
 const sameMatchup=records.filter(r=>{
  if(r.date!==e.date)return false;
  // A tournament listing is only that named event. It must not fill in a venue
  // for a different game, or for a game with no opponent.
  if(r.tournament)return Boolean(opponent)&&schoolName(r.opponent)===opponent;
  return opponent?schoolName(r.opponent)===opponent:r.source!=='AIA bracket';
 });
 let exact=sameMatchup.filter(r=>r.teamKey===key);
 if(exact.length){
  if(exact.length>1&&Number.isFinite(e.start))exact=exact.filter(r=>r.start===e.start);
  return exact.length===1?exact[0]:null;
 }

 // Use an uncolored listing only if it identifies one game in both schedules,
 // even when the dashboard is filtered to a single team.
 const baseKey=withoutColor(key);
 if(baseKey===key||!opponent||!Number.isFinite(e.start)||!scheduleEvents.includes(e))return null;
 const candidates=sameMatchup.filter(r=>r.start===e.start&&r.teamKey?.startsWith(baseKey));
 if(candidates.length!==1)return null;
 const [match]=candidates;
 if(match.teamKey!==baseKey||!['QuickScores','AZPreps365'].includes(match.source))return null;
 const competingGame=scheduleEvents.some(other=>other!==e&&other.type==='game'&&other.date===e.date&&
  (!Number.isFinite(other.start)||other.start===e.start)&&withoutColor(teamKey(other.team))===baseKey&&
  opponentName(other)===opponent);
 return competingGame?null:match;
}
