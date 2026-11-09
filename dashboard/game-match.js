// Exact team/date/opponent matching. Never derive a venue from home/away or opponent.
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
function opponentName(e){
 let s=e.opponent||e.detail?.match(/(?:\bvs\.?|\bat|@)\s+(.+)/i)?.[1]||'';
 s=s.split('·')[0].replace(/^(?:first round|second round|quarterfinals?|semifinals?|championship)\s*:\s*/i,'');
 s=s.replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/ig,'').trim();
 return normalize(s);
}
export function matchGame(e,records){
 if(e.type!=='game')return null;
 const key=teamKey(e.team);let list=records.filter(r=>r.teamKey===key&&r.date===e.date);
 const opponent=opponentName(e);
 if(opponent)list=list.filter(r=>normalize(r.opponent)===opponent);
 if(list.length>1&&Number.isFinite(e.start))list=list.filter(r=>r.start===e.start);
 return list.length===1?list[0]:null;
}
