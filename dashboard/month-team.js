// SCA Master Schedule: month calendar and season-aware team categories.
// The Master AD facility column headers are the authoritative filter taxonomy.
// Transportation supplies individual game details without adding JV/color choices
// when an existing master column already represents the program.
import {mondayFor, dayOffset, niceDate, parseRanges, parseTime, clock, processSchedules} from './logic.js';

const sports=/flag\s*football|cross\s*country|volleyball|basketball|football|baseball|softball|soccer|golf|swim(?:ming)?|wrestling|tennis|track/i;
const tidy=x=>String(x??'').replace(/\s+/g,' ').trim();
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const local=day=>new Date(`${day}T12:00:00`);
export const monthStart=day=>`${day.slice(0,7)}-01`;
export function moveMonth(day,diff){const d=local(monthStart(day));d.setMonth(d.getMonth()+diff);return iso(d);}
export const monthTitle=day=>niceDate(monthStart(day),{month:'long',year:'numeric'});
const schoolText=x=>/\b(?:MS|MIDDLE SCHOOL)\b/i.test(x)?'MS':/5\s*\/\s*6|5TH|6TH/i.test(x)?'EL':/\b(?:HS|HIGH SCHOOL)\b/i.test(x)?'HS':null;
const sportText=x=>{const s=tidy(x).toLowerCase();return /\bflag\b/.test(s)?'flag football':s.match(sports)?.[0].replace(/\s+/g,' ')||'';};
function traits(raw){
  const s=tidy(raw).replace(/\bJV\s*1\b/i,'JV').replace(/\b5\s*\/\s*6TH\b/i,'5/6');
  const sport=sportText(s);
  const school=schoolText(s)||(/\b(?:JV|VARSITY|FROSH|BOYS SOCCER|GIRLS SOCCER|GIRLS FLAG FOOTBALL)\b/i.test(s)?'HS':null);
  const level=/\bJV\b/i.test(s)?'JV':/\bVARSITY\b/i.test(s)?'VARSITY':/\bFROSH\b/i.test(s)?'FROSH':'';
  const gender=/\bGIRLS?\b/i.test(s)?'G':/\bBOYS?\b/i.test(s)?'B':'';
  const color=/\bWHITE\s*\/\s*GOLD\b/i.test(s)?'WHITE/GOLD':s.match(/\b(?:RED|BLUE|WHITE|GOLD)\b/i)?.[0].toUpperCase()||'';
  return {sport,school,level,gender,color};
}
const keyOf=t=>[t.school||'?',t.sport,t.level||'-',t.gender||'-',t.color||'-'].join('|');
const friendly=s=>tidy(s).toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()).replace(/\b(Hs|Ms|Jv)\b/g,x=>x.toUpperCase()).replace(/\b5\/6th\b/i,'5/6th').replace(/\bJv1\b/i,'JV');
function nameFor(raw,t){const s=tidy(raw).replace(/\bJV\s*1\b/ig,'JV');return (/\b(?:HS|MS|5\/6|5TH|6TH)\b/i.test(s)?'':(t.school==='HS'?'HS ':t.school==='MS'?'MS ':''))+friendly(s);}
function isTeamHeader(text){const x=tidy(text);return sports.test(x)&&!/(?:FIELD NOTES|GYM NOTES|SCHEDULE|SCORE|FIELD SCHEDULE)/i.test(x);}
function validSheetDates(sheet){
  const ds=(sheet.rows||[]).map(row=>String(row[0]||'')).filter(s=>/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),/i.test(s))
    .map(s=>new Date(s)).filter(d=>!Number.isNaN(d.getTime())).map(iso).sort();
  return ds.length?{from:ds[0],to:ds[ds.length-1]}:null;
}
export function buildCatalog(facilities){
  const all=[],seasons=[];
  for(const s of facilities.sheets||[]){
    if(!['Fall','Winter','Spring'].includes(s.name))continue;
    const dates=validSheetDates(s);if(!dates)continue;
    const head=s.rows[s.name==='Spring'?0:1]||[];
    const teams=[];
    for(const raw of head){
      if(!isTeamHeader(raw))continue;
      const t=traits(raw);if(!t.sport)continue;
      const entry={key:keyOf(t),label:nameFor(raw,t),traits:t,season:s.name};
      if(!teams.some(e=>e.key===entry.key))teams.push(entry);
      if(!all.some(e=>e.key===entry.key))all.push(entry);
    }
    seasons.push({name:s.name,...dates,teams});
  }
  return {all,seasons};
}
function masterCandidate(q,c){
  if(!q.sport||q.sport!==c.sport)return false;
  if(q.school&&c.school&&q.school!==c.school)return false;
  if(q.gender&&c.gender&&q.gender!==c.gender)return false;
  if(q.color&&c.color&&q.color!==c.color){
    if(!(c.color==='WHITE/GOLD'&&(q.color==='WHITE'||q.color==='GOLD')))return false;
  }
  return true;
}
export function resolveTeam(raw,catalog,{allowUnknown=true}={}){
  const q=traits(/^(?:MS\s+)?Girls\s+Flag$/i.test(tidy(raw))?tidy(raw)+' Football':raw);if(!q.sport)return null;
  const matches=catalog.all.filter(e=>masterCandidate(q,e.traits));
  // Exact category keys always win. For example, Winter MS Flag Football
  // must not be confused with Spring MS Girls Flag Football.
  const exactKey=matches.filter(e=>e.key===keyOf(q));
  if(exactKey.length===1)return exactKey[0];
  let chosen=null;
  if(q.level){
    const exact=matches.filter(e=>e.traits.level===q.level);
    if(exact.length===1)chosen=exact[0];
    else if(!exact.length){
      const program=matches.filter(e=>!e.traits.level);
      if(program.length===1)chosen=program[0];
      else if(matches.length===1)chosen=matches[0];
    }
  }else{
    const program=matches.filter(e=>!e.traits.level);
    if(program.length===1)chosen=program[0];
    else if(matches.length===1)chosen=matches[0];
  }
  if(chosen)return chosen;
  // Omitted level or color can refer to several teams. Do not guess.
  if(matches.length>1||!allowUnknown)return null;
  return {key:keyOf(q),label:nameFor(raw,q),traits:q,season:'Transportation'};
}
function noteSegments(note,catalog){
  const lines=String(note.detail||'').split(/\r?\n/).map(tidy).filter(Boolean);
  const items=[];let active=null;
  const flush=()=>{if(active){
    const chunk=active.parts.join('\n'),ranges=parseRanges(chunk);
    items.push({...note,team:active.team.label,detail:chunk,type:ranges.length?'practice':'event',
      start:ranges[0]?.start??parseTime(chunk),ranges,
      group:active.team.traits.school==='HS'?'HS':'MS',teamId:active.team.key,syntheticNote:true});
    active=null;
  }};
  for(const line of lines){
    const team=resolveTeam(line,catalog,{allowUnknown:false});
    const heading=Boolean(team&&!/^\d/.test(line)&&!/\b(?:at|vs\.?|against)\s+\w/i.test(line));
    if(heading){flush();active={team,parts:[line]};continue;}
    if(sports.test(line)||/\b(?:MS Girls Flag|GBB|BB|MS Cheer)\b/i.test(line)){flush();continue;}
    if(/\b(?:overseeding|field closed|gym closed|weather cancellation|maintenance)\b/i.test(line)){
      flush();items.push({...note,team:'Facility restriction',detail:line,type:'note',
        group:'Other',start:null,teamId:null,syntheticSafety:true});continue;
    }
    if(active)active.parts.push(line);
  }
  flush();return items;
}
export function tagEvents(events,catalog){
  const tagged=[],derived=[];
  for(const e of events){
    const team=e.type==='note'?null:resolveTeam(e.team,catalog);
    const group=team?.traits.school==='HS'?'HS':team?.traits.school==='MS'||team?.traits.school==='EL'?'MS':e.group;
    tagged.push({...e,group,teamId:team?.key||null});
    if(e.type==='note')derived.push(...noteSegments(e,catalog));
  }
  return [...tagged,...derived];
}
export function buildMonthModel(fac,tran,first,catalog){
  const d=local(monthStart(first)),last=new Date(d.getFullYear(),d.getMonth()+1,0,12);
  const firstMonday=mondayFor(d),lastIso=iso(last),events=[],issues=[];
  for(let monday=firstMonday;monday<=lastIso;monday=dayOffset(monday,7)){
    const w=processSchedules(fac,tran,monday);events.push(...w.events);issues.push(...w.issues);
  }
  return {events:tagEvents(events,catalog),issues};
}
export function availableTeams(catalog,month,events){
  const first=monthStart(month),last=iso(new Date(local(first).getFullYear(),local(first).getMonth()+1,0,12));
  const active=catalog.seasons.filter(s=>s.from<=last&&s.to>=first);
  const map=new Map();for(const s of active)for(const t of s.teams)map.set(t.key,t);
  // Include neighboring-season teams explicitly present in notes, and
  // truly transportation-only sports such as middle-school golf.
  for(const e of events){
    if(e.date<first||e.date>last||!e.teamId)continue;
    if(e.syntheticNote||e.source==='transportation'){
      const master=catalog.all.find(t=>t.key===e.teamId);
      const team=master||(e.source==='transportation'?resolveTeam(e.team,catalog):null);
      if(team)map.set(team.key,team);
    }
  }
  return [...map.values()].sort((a,b)=>a.label.localeCompare(b.label));
}
export function filtered(e,level,teamId){
  // All Teams mode shows original combined notes; team mode shows only the
  // extracted notes matching the selected master team and nearby restrictions.
  if(teamId==='all'&&(e.syntheticNote||e.syntheticSafety))return false;
  if(teamId!=='all'&&e.syntheticSafety)return true;
  if(teamId!=='all'&&(!e.teamId||e.teamId!==teamId))return false;
  return level==='all'||e.group===level||(level==='MS'&&e.group==='ELEMENTARY');
}
export function drawMonth(container,{focus,selected,events,issues,onDay,onTimeline}){
  container.replaceChildren();const first=local(monthStart(focus)),count=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
  const dow=(first.getDay()+6)%7;
  const create=(tag,klass,text)=>{const e=document.createElement(tag);if(klass)e.className=klass;if(text!==undefined)e.textContent=String(text);return e;};
  const intro=create('div','month-intro');intro.append(create('h2','',monthTitle(focus)),create('p','','Select a date to view Field, Gym and Away events.'));
  container.append(intro);
  const grid=create('div','month-grid');
  for(const label of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])grid.append(create('div','month-weekday',label));
  const total=Math.ceil((dow+count)/7)*7;
  for(let cell=0;cell<total;cell++){
    const dateNum=cell-dow+1;
    if(dateNum<1||dateNum>count){grid.append(create('div','month-blank'));continue;}
    const date=`${focus.slice(0,7)}-${String(dateNum).padStart(2,'0')}`,dayEvents=events.filter(e=>e.date===date);
    const button=create('button',`month-day ${date===selected?'is-selected':''} ${date===iso(new Date())?'is-today':''}`);
    button.type='button';button.setAttribute('aria-label',`${niceDate(date,{weekday:'long',month:'long',day:'numeric'})}, ${dayEvents.length} activities`);
    button.setAttribute('aria-pressed',String(date===selected));button.append(create('span','month-date',dateNum));
    if(dayEvents.length){
      button.append(create('span','month-count',`${dayEvents.length} ${dayEvents.length===1?'item':'items'}`));
      const dots=create('span','month-dots');for(const type of ['game','practice','other']){
        if(dayEvents.some(e=>(e.type==='game'?'game':e.type==='practice'?'practice':'other')===type))dots.append(create('i',`month-dot ${type}`));
      }button.append(dots);
    }
    if(issues.some(x=>x.date===date))button.classList.add('has-review');
    button.onclick=()=>onDay(date);grid.append(button);
  }
  container.append(grid);
  const picked=selected.slice(0,7)===focus.slice(0,7)?selected:monthStart(focus),daily=events.filter(e=>e.date===picked);
  const head=create('div','month-selected-header');head.append(create('h2','',niceDate(picked,{weekday:'long',month:'long',day:'numeric'})),create('span','month-count-summary',`${daily.length} calendar ${daily.length===1?'item':'items'}`));
  container.append(head);
  if(!daily.length){container.append(create('div','empty','No activities listed for the selected date and filters.'));return;}
  const lanes=[['field','Field & Outdoor'],['gym','Gym & Indoor'],['away','Away Games & Transportation']],gridDetails=create('div','facility-grid');
  for(const [key,label] of lanes){
    const entries=daily.filter(e=>{
      if(e.side==='A')return key==='away';
      if(e.source==='facilities'&&e.type!=='note'&&/\s@\s*|\b(?:away|at\s+\w+)/i.test(e.detail)&&e.type==='game')return key==='away';
      if(e.source==='transportation'&&e.location&&!/^(?:SCA|Scottsdale Christian(?: Academy)?|Home)\b/i.test(e.location))return key==='away';
      const lane=e.location==='Gym'||(e.source==='transportation'&&/volleyball|basketball/i.test(e.team))?'gym':'field';return key===lane;
    }).sort((a,b)=>(a.start??9999)-(b.start??9999));
    const lane=create('section',`facility-lane lane-${key}`),bar=create('div','lane-title'),title=create('div','lane-label');
    title.append(create('h3','',label));bar.append(title,create('span','lane-count',`${entries.length} ${entries.length===1?'item':'items'}`));lane.append(bar);
    const items=create('div','lane-items');
    for(const e of entries){
      const card=create('article',`event ${e.type}`),body=create('div','body');card.append(create('span','marker'));
      body.append(create('div','name',e.team),create('div','description',e.detail||'No details'));
      const meta=create('div','meta');meta.append(create('span','tag',e.syntheticNote?'From facility notes':e.type==='note'?'Facility note':e.type[0].toUpperCase()+e.type.slice(1)));
      if(e.source==='transportation'){
        if(key==='away'&&e.location)meta.append(create('span','tag',e.location));
        if(e.dismissal&&!/^x$/i.test(e.dismissal))meta.append(create('span','tag',`Dismissal: ${e.dismissal}`));
        if(e.transport&&!/^x$/i.test(e.transport))meta.append(create('span','tag',`Vehicle: ${e.transport}`));
      }
      body.append(meta);card.append(body,create('div','when',e.source==='transportation'?(e.time||clock(e.start)):(e.start==null?'TBD':clock(e.start))));items.append(card);
    }
    if(!entries.length)items.append(create('div','lane-empty','Nothing scheduled'));
    lane.append(items);gridDetails.append(lane);
  }
  container.append(gridDetails);
  const footer=create('div','month-action'),go=create('button','subtle-button','View selected day in Timeline →');go.onclick=()=>onTimeline(picked);footer.append(go);container.append(footer);
}

// The original dashboard app sets this subtitle asynchronously. Observe only
// this one label so it always reads Master Schedule in AD mode (coach mode
// retains its existing 'Coach schedules' label).
const headerSubtitle=typeof document==='undefined'?null:document.querySelector('.brand-subtitle');
if(headerSubtitle){
  const setTitle=()=>{
    if(!document.body.classList.contains('coach-view')&&headerSubtitle.textContent!=='Master Schedule')headerSubtitle.textContent='Master Schedule';
  };
  new MutationObserver(setTitle).observe(headerSubtitle,{childList:true,characterData:true,subtree:true});
  setTitle();
}
