import fs from 'node:fs/promises';
import path from 'node:path';
import {load} from 'cheerio';
import {tidy,normalize,teamKey} from '../dashboard/game-match.js';
import {parseTime} from '../dashboard/logic.js';
const AZ='https://azpreps365.com', QS='https://www.quickscores.com', AIA='https://aiaonline.org';
const schoolURL=AZ+'/schools/scottsdalechristian';
const listURL=QS+'/Orgs/Schedules.php?OrgDir=ccsl';
const locationURL=QS+'/Orgs/LocationsList.php?OrgDir=ccsl';
const sports={football:'Boys Football','football-flag':'Girls Flag Football','volleyball-girls':'Girls Volleyball','volleyball-boys':'Boys Volleyball','basketball-boys':'Boys Basketball','basketball-girls':'Girls Basketball','soccer-winter-boys':'Boys Soccer','soccer-winter-girls':'Girls Soccer',baseball:'Boys Baseball',softball:'Girls Softball','tennis-boys':'Boys Tennis','tennis-girls':'Girls Tennis','crosscountry-boys':'Boys Cross Country','crosscountry-girls':'Girls Cross Country','swimming-boys':'Boys Swim','swimming-girls':'Girls Swim','golf-spring':'Golf','track-boys':'Boys Track','track-girls':'Girls Track', 'beach-girls':'Girls Beach Volleyball'};
const months={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
function monthNumber(token){
 const title=token?token.slice(0,1).toUpperCase()+token.slice(1).toLowerCase():'';
 return months[title]||0;
}
function isoDay(year,month,day){
 const y=Number(year),m=Number(month),d=Number(day);
 const dt=new Date(y,m-1,d,12);
 if(dt.getFullYear()!==y||dt.getMonth()!==m-1||dt.getDate()!==d)return '';
 return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function nextDay(iso){
 const [y,m,d]=iso.split('-').map(Number);
 const dt=new Date(y,m-1,d+1,12);
 return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
// "Dec 29 – 30", "Nov 30 – Dec 2", or "Sep 12". A span longer than two weeks
// is not a readable tournament range, so it is left out rather than truncated.
function tournamentDates(text,season){
 const clean=tidy(text);
 const m=clean.match(/^([A-Za-z]{3})\s+(\d{1,2})(?:\s*[–—-]\s*(?:([A-Za-z]{3})\s+)?(\d{1,2}))?$/);
 if(!m)return [];
 const startMonth=monthNumber(m[1]),endMonth=m[3]?monthNumber(m[3]):startMonth;
 if(!startMonth||!endMonth)return [];
 const yearFor=month=>Number(month>=7?season[1]:season[2]);
 const start=isoDay(yearFor(startMonth),startMonth,m[2]);
 const end=isoDay(yearFor(endMonth),endMonth,m[4]||m[2]);
 if(!start||!end||end<start)return [];
 const days=[];
 for(let day=start;day<=end;day=nextDay(day)){
  days.push(day);
  if(days.length>14)return [];
 }
 return days;
}
function listedVenues($,event){
 const names=[];
 event.find('.venue').each((_,el)=>{
  const copy=$(el).clone();
  copy.find('.event-hosted-by').remove();
  const name=tidy(copy.text());
  if(name&&!/^\d+\s+venues?$/i.test(name))names.push(name);
 });
 return [...new Set(names)].join(' · ');
}
const cache=new Map();
const finalURL=new WeakMap();
async function page(url){
 const u=new URL(url);if(!['azpreps365.com','www.quickscores.com'].includes(u.hostname))throw Error('Unapproved location source');
 if(!cache.has(url))cache.set(url,(async()=>{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Source HTTP '+r.status);const $=load(await r.text());finalURL.set($,r.url);return $;})());return cache.get(url);
}
async function pool(items,fn){let i=0;await Promise.all(Array.from({length:3},async()=>{while(i<items.length)await fn(items[i++]);}));}
export function parseAZ($,url){
 const sport=new URL(url).pathname.split('/')[2];const level=url.match(/\/(\d+)-(varsity|jv-2|jv|frso)(?:$|\?)/)?.[2];
 const season=$('a').filter((i,e)=>/^20\d\d-20\d\d$/.test(tidy($(e).text()))).first().text().trim().match(/(20\d\d)-(20\d\d)/);
 if(!season||!sports[sport]||!level)return [];
 const key=teamKey('HS '+sports[sport]+' '+({varsity:'Varsity',jv:'JV','jv-2':'JV2',frso:'Frosh'}[level]));const rows=[];
 $('.event-contest').each((i,el)=>{
  const e=$(el),parts=tidy(e.find('.date').text()).match(/(\d{1,2})\s+([A-Za-z]{3})/);if(!parts||!months[parts[2]])return;
  const month=months[parts[2]],year=month>=7?season[1]:season[2];
  const op=e.find('.opponent').clone();op.find('.mascot,figure').remove();
  rows.push({id:'az-'+e.attr('data-contest-id'),teamKey:key,date:`${year}-${String(month).padStart(2,'0')}-${parts[1].padStart(2,'0')}`,start:parseTime(e.find('.time').text()),opponent:tidy(op.text()),venue:tidy(e.find('.location').text()),address:'',source:'AZPreps365',sourceUrl:url});
 });
 // Multi-day tournaments are sibling .event blocks, not .event-contest rows.
 // "5 venues" and "Hosted by" are not a single official venue.
 $('.event').each((_,el)=>{
  const e=$(el);
  if(e.hasClass('event-contest')||e.find('.event-contest').length)return;
  const name=tidy(e.find('.event-name').first().text());
  const days=tournamentDates(e.find('.event-details .text-sm').first().text(),season);
  if(!name||!days.length)return;
  const venue=listedVenues($,e);
  const href=e.find('a[href*="/calendar/tournaments/"]').attr('href')||'';
  const officialId=href.match(/tournaments\/(\d+)/)?.[1];
  const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const idBase=officialId?`az-tournament-${officialId}`:`az-tournament-${slug}`;
  for(const date of days)rows.push({id:`${idBase}-${date}`,teamKey:key,date,start:parseTime(e.find('.time').text()),opponent:name,venue,address:'',source:'AZPreps365',sourceUrl:url,tournament:true});
 });
 return rows;
}
export function parseBracket($,url,sport){
 const rows=[];
 $('#bracket li[data-contest-id]').each((_,el)=>{
  const game=$(el);
  const teams=game.find('.participant[data-team-id] .team').map((_,team)=>tidy($(team).text())).get();
  const own=teams.findIndex(team=>/^Scottsdale Christian(?: Academy)?$/i.test(team));
  if(teams.length!==2||own<0)return;
  const stamp=game.find('time[datetime]').attr('datetime')?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  const venue=tidy(game.find('.details .location').text());
  if(!stamp||!venue||/^(?:@\s*)?(?:high(?:er)? seed|tbd|tba)$/i.test(venue))return;
  rows.push({id:'az-'+game.attr('data-contest-id'),teamKey:teamKey('HS '+sports[sport]+' Varsity'),date:stamp[1],
   start:Number(stamp[2])*60+Number(stamp[3]),opponent:teams[1-own],venue,address:'',source:'AIA bracket',sourceUrl:url});
 });
 return rows;
}
export function qsTeam(label,own){
 let team='';
 if(/Tackle Football/i.test(label))team='MS Football';
 else if(/Volleyball.*5\/6/i.test(label))team='5/6 Girls Volleyball';
 else if(/Volleyball.*- A/i.test(label))team='MS '+(/Boys/i.test(label)?'Boys':'Girls')+' Varsity Volleyball';
 else if(/Volleyball.*- B/i.test(label))team='MS Girls JV Volleyball';
 else if(/Baseball.*- A/i.test(label))team='MS Varsity Baseball';
 else if(/Baseball.*- B/i.test(label))team='MS JV Baseball';
 else if(/Softball/i.test(label))team='MS Softball';
 else if(/Flag Football.*5\/6/i.test(label))team='5th Grade Flag Football';
 else if(/Girls Flag Football/i.test(label))team='MS Flag Football';
 else if(/Soccer/i.test(label))team='MS Soccer';
 else if(/Cross.Country/i.test(label))team='MS Cross Country';
 const color=own.match(/\b(red|blue|white|gold)\b/i)?.[1]||'';
 return team?teamKey(team+' '+color):'';
}
export function parseQS($,url,label){
 const rows=[];
 $('li.event').each((i,el)=>{
  const e=$(el),teams=e.find('.team-name').map((i,t)=>
   tidy($(t).text()).replace(/^\[(?:Big|Small) School\]\s*/i,'')).get();
  const own=teams.find(t=>/^Scottsdale Christian(?: Academy)?(?:\s+(?:Red|Blue|White|Gold))?$/i.test(t));if(!own||teams.length!==2)return;
  const stamp=e.find('time[datetime]').attr('datetime')||'';if(!/^\d{4}-\d{2}-\d{2}T/.test(stamp))return;
  const key=qsTeam(label,own);if(!key)return;
  const loc=e.find('.e-local').clone();loc.find('svg').remove();const href=loc.find('a[href*="LocationDetails.php"]').attr('href');
  const tm=stamp.slice(11).match(/^(\d{2}):(\d{2})/);
  rows.push({id:'qs-'+e.attr('id'),teamKey:key,date:stamp.slice(0,10),start:tm?+tm[1]*60+(+tm[2]):null,opponent:teams.find(t=>t!==own),venue:tidy(loc.text()),address:'',source:'QuickScores',sourceUrl:url,venueUrl:href?new URL(href,QS).href:''});
 });return rows;
}
// Search results can be fuzzy. Only an exact, unique school name can supply an address.
const expandSchoolName=venue=>tidy(venue).replace(/\bH\.?S\.?$/i,'High School');
async function searchSchools(name){
 const url=new URL('/schools/search.json',AIA);
 url.searchParams.set('q',name);
 const response=await fetch(url,{signal:AbortSignal.timeout(20000),redirect:'error'});
 if(!response.ok)throw Error('Source HTTP '+response.status);
 const schools=await response.json();
 if(!Array.isArray(schools))throw Error('Unexpected AIA school search response');
 return schools;
}
export async function addSchoolAddress(record,lookup){
 if(record.address||!['AZPreps365','AIA bracket'].includes(record.source))return;
 const name=expandSchoolName(record.venue);
 // A venue count or a host line is not a school address. Do not look either up.
 if(!name||/^\d+\s+venues?$/i.test(name)||/^hosted by\b/i.test(name))return;
 const key=normalize(name);
 const matches=(await lookup(name)).filter(school=>
  [school.name,school.full_name].some(label=>label&&normalize(expandSchoolName(label))===key));
 if(matches.length!==1)return;
 const {id,address}=matches[0];
 if(!Number.isSafeInteger(id)||!address)return;
 const [street,city,state,zip]=[address.line1,address.city,address.state,address.zip].map(tidy);
 if(!/^\d+\s+.+/.test(street)||!city||state!=='AZ'||!/^\d{5}(?:-\d{4})?$/.test(zip))return;
 record.address=`${street}, ${city}, ${state} ${zip}`;
 record.addressSourceUrl=`${AIA}/schools/${id}`;
}

export async function generateGameLocations(siteDir){
 const records=[],errors=[];
 // Fetch a fresh set each run: failed sources must never publish old venue guesses.
 const attempt=async(label,fn)=>{try{await fn();}catch(e){errors.push(label+': '+e.message);}};
 await attempt('AZPreps365',async()=>{
  const $=await page(schoolURL),roots=new Map();
  $('a[href^="/teams/"]').each((i,e)=>{const h=$(e).attr('href');const m=h.match(/^\/teams\/([^/]+)\/\d+-(?:scott-chr|scottsdale-christian)\//);if(m&&sports[m[1]]&&!roots.has(m[1]))roots.set(m[1],new URL(h,AZ).href);});
  if(!roots.size)throw Error('No school schedules found');
  await pool([...roots.values()],async root=>attempt(root,async()=>{
   const $=await page(root),urls=new Set([root]);const prefix=new URL(root).pathname.split('/').slice(0,4).join('/')+'/';
   $('a[href]').each((i,e)=>{const h=$(e).attr('href');if(h.startsWith(prefix)&&/\/\d+-(?:varsity|jv|jv-2|frso)$/.test(h))urls.add(AZ+h);});
   for(const url of urls)await attempt(url,async()=>{
    const schedule=await page(url);
    records.push(...parseAZ(schedule,url));
    if(!url.endsWith('-varsity'))return;
    const sport=new URL(url).pathname.split('/')[2];
    const standings=schedule('a[href^="/standings/"]').map((_,a)=>schedule(a).attr('href').split('#')[0]).get()
     .find(h=>h.startsWith('/standings/'+sport+'/')&&/\/[1-6]a$/.test(h));
    if(!standings)return;
    const bracketURL=AZ+standings.replace('/standings/','/brackets/');
    await attempt(bracketURL,async()=>{
     const bracket=await page(bracketURL);
     records.push(...parseBracket(bracket,finalURL.get(bracket),sport));
    });
   });
  }));
 });
 await attempt('QuickScores',async()=>{
  const $=await page(listURL),leagues=new Map();
  $('a[href*="ResultsDisplay.php"][href*="LeagueID="]').each((i,e)=>{const u=new URL($(e).attr('href'),QS);leagues.set(u.searchParams.get('LeagueID'),{url:u.href,label:tidy($(e).text())});});
  if(!leagues.size)throw Error('No league schedules found');
  await pool([...leagues.values()],async({url,label})=>attempt(url,async()=>records.push(...parseQS(await page(url),url,label))));
 });
 // Prefer a QuickScores venue address, then check the AIA member-school directory.
 const venues=new Map();
 await attempt('QuickScores venue directory',async()=>{const $=await page(locationURL);$('a[href*="LocationDetails.php"]').each((i,e)=>venues.set(normalize($(e).text()),new URL($(e).attr('href'),QS).href));});
 const schoolSearches=new Map();
 const lookupSchool=name=>{
  const key=normalize(name);
  if(!schoolSearches.has(key))schoolSearches.set(key,searchSchools(name));
  return schoolSearches.get(key);
 };
 await pool(records,async r=>{
  const url=r.source==='AIA bracket'?'':r.venueUrl||venues.get(normalize(r.venue));
  if(url)await attempt(url,async()=>{const $=await page(url);const address=$('#main-content > p.notranslate').clone();address.find('br').replaceWith(', ');r.address=tidy(address.text());if(r.address)r.addressSourceUrl=url;});
  await attempt('AIA school address for '+r.venue,()=>addSchoolAddress(r,lookupSchool));
 });
 const unique=[...new Map(records.map(r=>[r.id+'|'+r.teamKey,r])).values()];
 const payload={checkedAt:new Date().toISOString(),records:unique,errors:[...new Set(errors)]};
 await fs.mkdir(siteDir,{recursive:true});await fs.writeFile(path.join(siteDir,'game-locations.json'),JSON.stringify(payload,null,2));
 console.log(`Official locations: ${unique.length} games, ${unique.filter(r=>r.address).length} with addresses; ${payload.errors.length} source errors`);
 return payload;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve('scripts/game-locations.mjs'))await generateGameLocations(process.argv[2]||'_site');
