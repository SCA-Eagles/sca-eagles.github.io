// Builds public, read-only iCalendar subscriptions from the same normalized
// facilities and transportation data used by the SCA Master Schedule.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { processSchedules, mondayFor, dayOffset, isoFromCell, parseRanges, parseTime, clock, FACILITY_COLS } from '../dashboard/logic.js';
import { buildCatalog, tagEvents, resolveTeam } from '../dashboard/month-team.js';

const BASE = 'https://sca-eagles.github.io';
const TIME_ZONE = 'America/Phoenix';
const athleteSport = /\b(?:football|volleyball|soccer|baseball|softball|basketball|golf|swim(?:ming)?|tennis|track|wrestling|cheer|spiritline)\b|cross[\s-]*country/i;
const asText = x => String(x ?? '').replace(/\s+/g, ' ').trim();
const compact = x => asText(x).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const hash = x => createHash('sha256').update(String(x)).digest('hex').slice(0, 12);
const dateNum = d => d.replaceAll('-', '');
const timeNum = n => `${String(Math.floor(n / 60)).padStart(2, '0')}${String(n % 60).padStart(2, '0')}00`;
const localStamp = (day, minutes) => `${dateNum(day)}T${timeNum(minutes)}`;
const timeNote = n => n === null ? 'Time TBD' : clock(n);
const tomorrow = d => dayOffset(d, 1);

// Master Schedule columns determine subscription names; transportation-only
// teams (such as MS Golf) are additional subscriptions, never extra choices for
// JV/varsity/White/Gold when the Master column already groups them.
function calendarName(team) { return team.label; }
// Keep the URL stable when a coach tidies a column's display label.
function slugFor(team) { return `sca-team-${hash(team.key)}`; }

function escapeICS(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,').replace(/;/g, '\\;');
}
function lineFold(str) {
  // RFC 5545 requires folding at 75 OCTETS, not 75 JavaScript characters.
  const out = []; let line = '';
  for (const cp of str) {
    if (Buffer.byteLength(line + cp, 'utf8') > 75) {
      out.push(line); line = ' ' + cp;
    } else line += cp;
  }
  out.push(line);
  return out.join('\r\n');
}
const property = (key, value) => lineFold(`${key}:${value}`);

function parseFacilityGameParts(raw) {
  // A single master cell sometimes contains two separate fixtures, e.g.
  // "4pm JV vs ... 6pm Varsity vs ...". Split only at a new game time.
  const normal = asText(raw);
  const chunks = normal.split(/\s+(?=\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*(?:(?:JV|Varsity|Frosh)\s+)?(?:vs\.?|versus|@\s*|at\s))/i).filter(Boolean);
  return chunks.length ? chunks : [normal];
}
function gameOpponent(s) {
  const m=asText(s).match(/(?:\b(?:vs\.?|versus|at)\b|@)\s+(.+?)(?=\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|$)/i);
  return m ? asText(m[1]) : '';
}
function sideOf(s) {
  return /\b(?:at)\b|(?:^|\s)@\s*/i.test(s) ? 'Away' : /\bvs\.?\b|\bversus\b/i.test(s) ? 'Home' : '';
}
function subteamOf(s) {
  return /\bJV(?:\s*1)?\b/i.test(s) ? 'JV' : /\bVarsity\b/i.test(s) ? 'Varsity' :
    /\bFrosh\b/i.test(s) ? 'Frosh' : /\bWhite\b/i.test(s) ? 'White' :
    /\bGold\b/i.test(s) ? 'Gold' : /\bRed\b/i.test(s) ? 'Red' : '';
}
function isFixture(e) {
  return e.type === 'game' || /\b(?:vs\.?|versus)\b|(?:^|\s)@\s*|\d{1,2}(?::\d{2})?\s*(?:am|pm)\s+at\s+/i.test(asText(e.detail));
}
function programEvent(e, team, index) {
  const sourceText = asText(e.detail);
  if (!sourceText || /^(?:x|n\/a|none|-)$/i.test(sourceText)) return null;
  const isGame = isFixture(e);
  const rawOpponent = e.source === 'transportation' ? asText(e.opponent) : gameOpponent(sourceText);
  const opponent = rawOpponent.replace(/\s+(?:home|away)$/i, '');
  const side = e.source === 'transportation' ? (e.side === 'H' ? 'Home' : e.side === 'A' ? 'Away' : '') : sideOf(sourceText);
  const subteam = subteamOf(e.team) || (isGame ? subteamOf(sourceText) : '');
  const prefix = team.label + (isGame && subteam ? ` — ${subteam}` : '');
  let summary, detail;
  if (isGame) {
    summary = `${prefix} ${opponent ? (side === 'Away' ? '@' : 'vs') + ' ' + opponent : 'Game'}`;
    detail = [`${team.label} game`,subteam ? `${subteam} team` : '',side ? `${side} game` : '',
      opponent ? `Opponent: ${opponent}` : '', e.dismissal ? `Dismissal: ${e.dismissal}` : '',
      e.transport ? `Transportation: ${e.transport}` : '',e.time ? `Game time: ${e.time}` : '',
      e.facilityDetail && e.source==='transportation' ? `Master schedule: ${asText(e.facilityDetail)}` : ''].filter(Boolean).join('\n');
  } else {
    summary = `${team.label} — ${/^tbd$/i.test(sourceText) ? 'Schedule TBD' : 'Practice'}`;
    detail = `${team.label} practice${/^tbd$/i.test(sourceText) ? ' (details TBD)' : ''}\nMaster Schedule entry: ${sourceText}`;
  }
  const ranges = e.ranges || parseRanges(sourceText);
  const start = e.start ?? parseTime(sourceText);
  const end = !isGame && ranges.length ? ranges[0].end : null;
  const sourceName = e.source === 'transportation' ? 'transportation' : 'master';
  // Time changes preserve the same UID. Date movements recreate the event;
  // this is reliable for subscriptions but not a substitute for event IDs.
  const baseID = isGame ? `game|${team.key}|${e.date}|${subteam}|${opponent}|${side}` :
    `practice|${team.key}|${e.date}|${e.location || ''}|${index}`;
  const key = hash(baseID);
  return {key,uid:`${key}@sca-eagles.github.io`,date:e.date,start,end,isGame,
    title:summary,description:detail,location:asText(e.location),teamKey:team.key,
    group:team.traits.school,side,opponent,subteam,source:sourceName};
}
function allDates(fac,tran){
  const dates=[];
  for(const sheet of [...(fac.sheets||[]),...(tran.sheets||[])]) {
    if(!['Fall','Winter','Spring','Summer','2026-2027 Transportation'].includes(sheet.name)) continue;
    for(const row of sheet.rows||[]) {
      const d=isoFromCell(row[0]);if(d)dates.push(d);
    }
  }
  if(!dates.length)throw Error('No schedule dates found');
  dates.sort();return [dates[0],dates.at(-1)];
}

// The Master AD occasionally schedules the next season inside field/gym Notes.
// Parse only an explicitly named team followed by a time; free-form notes,
// facility maintenance, and ambiguous abbreviations never become calendar events.
function notePractices(fac,catalog) {
  const result=[];
  for(const sheet of fac.sheets||[]) {
    const cfg=FACILITY_COLS[sheet.name];if(!cfg)continue;
    for(const row of (sheet.rows||[]).slice(cfg.firstRow)) {
      const date=isoFromCell(row[0]);if(!date)continue;
      for(const [col,where] of [[cfg.fieldNotes,'Field'],[cfg.gymNotes,'Gym']]) {
        const raw=String(row[col]||'');if(!raw.trim())continue;
        let active=null;
        for(const line of raw.split(/\r?\n/).map(asText).filter(Boolean)) {
          const team=resolveTeam(line,catalog,{allowUnknown:false});
          if(team && !/^(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i.test(line))active=team;
          else if(athleteSport.test(line)||/\b(?:overseed|closed|maintenance|fall break|school closed|field trip)\b/i.test(line)){
            active=null;continue;
          }
          if(!active)continue;
          const ranges=parseRanges(line),start=ranges[0]?.start??parseTime(line);
          if(start===null&&!/\bTBD\b/i.test(line))continue;
          result.push({date,team:active.label,detail:line,type:'practice',location:where,
            source:'facilities',group:active.traits.school==='HS'?'HS':'MS',
            start,ranges,teamId:active.key,notePractice:true});
        }
      }
    }
  }
  return result;
}
export function collectEvents(fac,tran) {
  if(!fac?.ok||!tran?.ok)throw Error('Both successful schedule datasets are required');
  const catalog=buildCatalog(fac);
  const [from,to]=allDates(fac,tran);
  const events=[];
  for(let day=mondayFor(new Date(`${from}T12:00:00`)); day<=to; day=dayOffset(day,7)) {
    const parsed=processSchedules(fac,tran,day);
    events.push(...tagEvents(parsed.events,catalog));
  }
  // Use the original note cells, since the dashboard's summarized note text
  // intentionally collapses newlines and cannot safely identify each team.
  events.push(...notePractices(fac,catalog));
  const staged=[];
  const transportFor=(day,key)=>events.filter(x=>x.date===day&&x.teamId===key&&x.source==='transportation'&&x.type==='game');
  for(const event of events){
    if(!event.teamId||event.type==='note'||event.syntheticSafety||event.syntheticNote)continue;
    const team=catalog.all.find(t=>t.key===event.teamId) || resolveTeam(event.team,catalog);
    if(!team || !athleteSport.test(team.label))continue;
    if(isFixture(event) && event.source==='facilities') {
      // If transportation confirms the same fixture, keep the transportation
      // card (it has the JV/Varsity distinction and opponent). If the master
      // cell lists multiple games, retain master-only fixtures when missing
      // from transportation.
      const parts=parseFacilityGameParts(event.detail);
      for(const text of parts) {
        const opponents=transportFor(event.date,team.key);
        const name=gameOpponent(text).toLowerCase();
        const start=parseTime(text);
        const same=opponents.some(x=>{
          const op=asText(x.opponent).toLowerCase();
          return Boolean(name&&op&&(name.includes(op)||op.includes(name))) ||
            Boolean(start!==null && x.start===start && (!name || !op));
        });
        if(same)continue;
        const version={...event,type:'game',detail:text,start:start,ranges:parseRanges(text)};
        staged.push({event:version,team});
      }
    } else {
      staged.push({event,team});
    }
  }
  // Stable sorting and practice ordinal prevents several practices on the
  // same day from collapsing into one UID.
  staged.sort((a,b)=>a.event.date.localeCompare(b.event.date)||a.team.key.localeCompare(b.team.key)||
    (a.event.start??9999)-(b.event.start??9999)||a.event.detail.localeCompare(b.event.detail));
  const sequence=new Map(),mapped=[];
  for(const {event,team} of staged){
    const indexKey=`${event.date}|${team.key}|${event.source}|${event.location}`;
    const idx=sequence.get(indexKey)||0;sequence.set(indexKey,idx+1);
    const record=programEvent(event,team,idx);
    if(record)mapped.push(record);
  }
  const unique=new Map();
  // Prioritize the transportation version if a duplicate game survives.
  for(const e of mapped){
    const existing=unique.get(e.key);
    if(!existing||existing.source!=='transportation')unique.set(e.key,e);
  }
  const teams=new Map(catalog.all.map(t=>[t.key,t]));
  for(const e of mapped){if(!teams.has(e.teamKey)) {
    const t=resolveTeam(staged.find(x=>x.team.key===e.teamKey)?.event.team||'',catalog);
    if(t)teams.set(t.key,t);
  }}
  return {events:[...unique.values()],teams:[...teams.values()].sort((a,b)=>a.label.localeCompare(b.label))};
}

function calendarICS(name,items,fetchedAt) {
  const updated=new Date(fetchedAt);
  const stamp=updated.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/g,'');
  const rows=[
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Scottsdale Christian Academy//Athletics Schedule//EN',
    'CALSCALE:GREGORIAN','METHOD:PUBLISH',property('X-WR-CALNAME',escapeICS(name)),
    property('X-WR-TIMEZONE',TIME_ZONE),
    'BEGIN:VTIMEZONE',`TZID:${TIME_ZONE}`,'BEGIN:STANDARD',
    'DTSTART:19700101T000000','TZOFFSETFROM:-0700','TZOFFSETTO:-0700','TZNAME:MST',
    'END:STANDARD','END:VTIMEZONE'
  ];
  for(const e of items.sort((a,b)=>a.date.localeCompare(b.date)||(a.start??9999)-(b.start??9999))) {
    rows.push('BEGIN:VEVENT',property('UID',e.uid),property('DTSTAMP',stamp),
      property('LAST-MODIFIED',stamp),property('SUMMARY',escapeICS(e.title)),
      property('DESCRIPTION',escapeICS(e.description)),property('URL',BASE),
      'SEQUENCE:0');
    if(e.start===null) {
      rows.push('DTSTART;VALUE=DATE:'+dateNum(e.date),'DTEND;VALUE=DATE:'+dateNum(tomorrow(e.date)),
        'STATUS:TENTATIVE');
    }else{
      rows.push(`DTSTART;TZID=${TIME_ZONE}:${localStamp(e.date,e.start)}`);
      if(e.end!==null)rows.push(`DTEND;TZID=${TIME_ZONE}:${localStamp(e.date,e.end)}`);
    }
    if(e.location)rows.push(property('LOCATION',escapeICS(e.location)));
    rows.push('END:VEVENT');
  }
  rows.push('END:VCALENDAR');
  return rows.join('\r\n')+'\r\n';
}
export async function generateCalendars(fac,tran,siteDir,fetchedAt) {
  const {events,teams}=collectEvents(fac,tran);
  const folder=path.join(siteDir,'calendars');await fs.mkdir(folder,{recursive:true});
  const all=events.filter(x=>x.isGame||x.title.includes('Practice')||x.title.includes('TBD'));
  await fs.writeFile(path.join(folder,'all.ics'),calendarICS('SCA All Athletics',all,fetchedAt));
  const manifest={fetchedAt,all:{label:'All Athletics',url:`${BASE}/calendars/all.ics`},teams:[]};
  for(const t of teams){
    const slug=slugFor(t);
    const items=events.filter(e=>e.teamKey===t.key);
    await fs.writeFile(path.join(folder,`${slug}.ics`),calendarICS(`SCA ${calendarName(t)}`,items,fetchedAt));
    manifest.teams.push({key:t.key,label:t.label,slug,url:`${BASE}/calendars/${slug}.ics`,eventCount:items.length});
  }
  await fs.writeFile(path.join(folder,'index.json'),JSON.stringify(manifest,null,2));
  console.log(`Published ${manifest.teams.length} team calendar subscriptions and ${all.length} athletics events`);
  return manifest;
}
