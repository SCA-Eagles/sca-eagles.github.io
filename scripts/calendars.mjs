// Builds public, read-only iCalendar subscriptions from the same normalized
// facilities and transportation data used by the SCA Master Schedule.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { processSchedules, mondayFor, dayOffset, isoFromCell, parseRanges, parseTime, clock, FACILITY_COLS } from '../dashboard/logic.js';
import { buildCatalog, tagEvents, resolveTeam, isHostSiteNote } from '../dashboard/month-team.js';

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
// In the Transportation workbook, X means "no dismissal / no vehicle needed".
// It is accounted for, so it is not printed as a dismissal time or vehicle.
const supplied = v => Boolean(asText(v)) && !/^x$/i.test(asText(v));

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
  // The dashboard may classify 'Tournament' or 'Playoff Game' as a game,
  // but a subscribed calendar must keep that wording as an all-day entry
  // until an actual opponent is supplied using vs, at or @.
  if (e.source === 'transportation') return e.type === 'game';
  return /\bvs\.?(?=\s|$)|\bversus\b|(?:^|\s)@\s*\S|(?:^|\s)at\s+\S/i.test(asText(e.detail));
}
// A practice is a cell whose wording is only a clock time or time range,
// optionally with a facility area such as "(Outfield)" or "(Cages)" or the
// team's own name ("Football 6-9am" in the MS Football column).
// Game entries with vs/at/@ are identified separately by isFixture().
function isTimeOnly(raw) {
  return /^\d{1,2}(?::\d{2})?\s*(?:am|pm)$/i.test(asText(raw));
}
// Wording such as TBD, Playoffs, Tournament or "If Necessary" is unresolved:
// it stays an all-day tentative entry even when a time is written beside it.
const PLACEHOLDER = /\b(?:TBD|TBA|If\s+Nec+es+ary|Playoffs?|Tournam[a-z]*|Tentative)\b/i;
const RANGE_TEXT = /\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:-|–|—|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)*/gi;
const AREA = /^(?:outfield|infield|cages?|bullpen|turf|field|gym)$/i;
function withoutTimes(text) {
  return asText(String(text).replace(RANGE_TEXT, ' ').replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, ' '))
    .replace(/^[\s,;:.·&–—-]+|[\s,;:.·&–—-]+$/g, '')
    .replace(/^(?:and)\s+|\s+(?:and)$/i, '');
}
// "Practice", "Practice (Outfield)", or null when the wording describes
// something else (Try-Outs, Camp, Pictures), which keeps its Excel wording.
function practiceTitle(rest, team) {
  if (!rest) return 'Practice';
  if (/^\([^()]+\)$/.test(rest)) return `Practice ${rest}`;
  if (AREA.test(rest)) return `Practice (${rest})`;
  const label = new Set(team.label.toLowerCase().match(/[a-z0-9/]+/g) || []);
  const words = rest.toLowerCase().match(/[a-z0-9/]+/g) || [];
  return words.length && words.every(w => label.has(w)) ? 'Practice' : null;
}
// "3:00PM-4:00PM (White) 4:00PM-5:00PM (Gold)" is two separate time slots.
// Split only when every piece has exactly one valid range.
function rangePieces(text) {
  const starts = [...text.matchAll(RANGE_TEXT)].map(m => m.index);
  if (starts.length < 2) return [text];
  const pieces = starts.map((at, i) => text.slice(i ? at : 0, starts[i + 1] ?? text.length));
  return pieces.every(p => parseRanges(p).length === 1) ? pieces.map(asText) : [text];
}
function programEvent(e, team, index) {
  const sourceText = asText(e.detail);
  if (!sourceText || /^(?:x|n\/a|none|-)$/i.test(sourceText)) return [];
  const isGame = isFixture(e);
  const rawOpponent = e.source === 'transportation' ? asText(e.opponent) : gameOpponent(sourceText);
  const opponent = rawOpponent.replace(/\s+(?:home|away)$/i, '');
  const side = e.source === 'transportation' ? (e.side === 'H' ? 'Home' : e.side === 'A' ? 'Away' : '') : sideOf(sourceText);
  const subteam = subteamOf(e.team) || (isGame ? subteamOf(sourceText) : '');
  const prefix = team.label + (isGame && subteam ? ` — ${subteam}` : '');
  const sourceName = e.source === 'transportation' ? 'transportation' : 'master';
  const record = (part, title, description, start, end) => {
    // Time changes preserve the same UID. Date movements recreate the event;
    // this is reliable for subscriptions but not a substitute for event IDs.
    // A second time slot in the same cell gets its own UID; the first keeps
    // the UID it has always had.
    const baseID = isGame ? `game|${team.key}|${e.date}|${subteam}|${opponent}|${side}` :
      `practice|${team.key}|${e.date}|${e.location || ''}|${index}` + (part ? `|slot${part}` : '');
    const key = hash(baseID);
    return {key,uid:`${key}@sca-eagles.github.io`,date:e.date,start,end,isGame,
      title,description,location:asText(e.location),teamKey:team.key,
      group:team.traits.school,side,opponent,subteam,source:sourceName};
  };
  if (isGame) {
    const summary = `${prefix} ${opponent ? (side === 'Away' ? '@' : 'vs') + ' ' + opponent : 'Game'}`;
    const detail = [`${team.label} game`,subteam ? `${subteam} team` : '',side ? `${side} game` : '',
      opponent ? `Opponent: ${opponent}` : '', supplied(e.dismissal) ? `Dismissal: ${e.dismissal}` : '',
      supplied(e.transport) ? `Transportation: ${e.transport}` : '',e.time ? `Game time: ${e.time}` : '',
      e.facilityDetail && e.source==='transportation' ? `Master schedule: ${asText(e.facilityDetail)}` : ''].filter(Boolean).join('\n');
    return [record(0, summary, detail, e.start ?? parseTime(sourceText), null)];
  }
  const ranges = e.ranges || parseRanges(sourceText);
  if (ranges.length && !PLACEHOLDER.test(sourceText)) {
    // An explicitly written range gives both a start and an end time.
    return rangePieces(sourceText).map((piece, part) => {
      const range = parseRanges(piece)[0] || ranges[0];
      const label = practiceTitle(withoutTimes(piece), team);
      return label
        ? record(part, `${team.label} — ${label}`, `${team.label} practice\nMaster Schedule entry: ${sourceText}`, range.start, range.end)
        : record(part, `${team.label} — ${piece}`, `Master Schedule entry: ${sourceText}`, range.start, range.end);
    });
  }
  if (isTimeOnly(sourceText)) {
    // A single time is a known start, not a known end.
    return [record(0, `${team.label} — Practice`, `${team.label} practice\nMaster Schedule entry: ${sourceText}`,
      e.start ?? parseTime(sourceText), null)];
  }
  // Preserve the Excel wording exactly; without an opponent or a stated range
  // this is not a game or a practice. Publish it as an all-day calendar event.
  return [record(0, `${team.label} — ${sourceText}`, `Master Schedule entry: ${sourceText}`, null, null)];
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
          // Host-site games belong to the field schedule, not to an SCA team.
          if(isHostSiteNote(line)){active=null;continue;}
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
    mapped.push(...programEvent(event,team,idx));
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
  // All Athletics includes named all-day items (e.g. Playoff), too.
  const all=events;
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
