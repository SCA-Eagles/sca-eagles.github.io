import fs from 'node:fs/promises';
import path from 'node:path';
import {load} from 'cheerio';
import {tidy,normalize,teamKey} from '../dashboard/game-match.js';
import {parseTime} from '../dashboard/logic.js';
const AZ='https://azpreps365.com', QS='https://www.quickscores.com';
const schoolURL=AZ+'/schools/scottsdalechristian';
const listURL=QS+'/Orgs/Schedules.php?OrgDir=ccsl';
const locationURL=QS+'/Orgs/LocationsList.php?OrgDir=ccsl';
const sports={football:'Boys Football','football-flag':'Girls Flag Football','volleyball-girls':'Girls Volleyball','volleyball-boys':'Boys Volleyball','basketball-boys':'Boys Basketball','basketball-girls':'Girls Basketball','soccer-winter-boys':'Boys Soccer','soccer-winter-girls':'Girls Soccer',baseball:'Boys Baseball',softball:'Girls Softball','tennis-boys':'Boys Tennis','tennis-girls':'Girls Tennis','crosscountry-boys':'Boys Cross Country','crosscountry-girls':'Girls Cross Country','swimming-boys':'Boys Swim','swimming-girls':'Girls Swim','golf-spring':'Golf','track-boys':'Boys Track','track-girls':'Girls Track', 'beach-girls':'Girls Beach Volleyball'};
const months={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
const cache=new Map();
async function page(url){
 const u=new URL(url);if(!['azpreps365.com','www.quickscores.com'].includes(u.hostname))throw Error('Unapproved location source');
 if(!cache.has(url))cache.set(url,(async()=>{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Source HTTP '+r.status);return load(await r.text());})());return cache.get(url);
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
 });return rows;
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
  const e=$(el),teams=e.find('.team-name').map((i,t)=>tidy($(t).text())).get();
  const own=teams.find(t=>/^Scottsdale Christian(?: Academy)?(?:\s+(?:Red|Blue|White|Gold))?$/i.test(t));if(!own||teams.length!==2)return;
  const stamp=e.find('time[datetime]').attr('datetime')||'';if(!/^\d{4}-\d{2}-\d{2}T/.test(stamp))return;
  const key=qsTeam(label,own);if(!key)return;
  const loc=e.find('.e-local').clone();loc.find('svg').remove();const href=loc.find('a[href*="LocationDetails.php"]').attr('href');
  const tm=stamp.slice(11).match(/^(\d{2}):(\d{2})/);
  rows.push({id:'qs-'+e.attr('id'),teamKey:key,date:stamp.slice(0,10),start:tm?+tm[1]*60+(+tm[2]):null,opponent:teams.find(t=>t!==own),venue:tidy(loc.text()),address:'',source:'QuickScores',sourceUrl:url,venueUrl:href?new URL(href,QS).href:''});
 });return rows;
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
   for(const url of urls)await attempt(url,async()=>records.push(...parseAZ(await page(url),url)));
  }));
 });
 await attempt('QuickScores',async()=>{
  const $=await page(listURL),leagues=new Map();
  $('a[href*="ResultsDisplay.php"][href*="LeagueID="]').each((i,e)=>{const u=new URL($(e).attr('href'),QS);leagues.set(u.searchParams.get('LeagueID'),{url:u.href,label:tidy($(e).text())});});
  if(!leagues.size)throw Error('No league schedules found');
  await pool([...leagues.values()],async({url,label})=>attempt(url,async()=>records.push(...parseQS(await page(url),url,label))));
 });
 // Exact venue-name match to QuickScores' official address directory; no school-address fallback.
 const venues=new Map();
 await attempt('QuickScores venue directory',async()=>{const $=await page(locationURL);$('a[href*="LocationDetails.php"]').each((i,e)=>venues.set(normalize($(e).text()),new URL($(e).attr('href'),QS).href));});
 await pool(records,async r=>{
  const url=r.venueUrl||venues.get(normalize(r.venue));if(!url)return;
  await attempt(url,async()=>{const $=await page(url);const address=$('#main-content > p.notranslate').clone();address.find('br').replaceWith(', ');r.address=tidy(address.text());if(r.address)r.addressSourceUrl=url;});
 });
 const unique=[...new Map(records.map(r=>[r.id+'|'+r.teamKey,r])).values()];
 const payload={checkedAt:new Date().toISOString(),records:unique,errors:[...new Set(errors)]};
 await fs.mkdir(siteDir,{recursive:true});await fs.writeFile(path.join(siteDir,'game-locations.json'),JSON.stringify(payload,null,2));
 console.log(`Official locations: ${unique.length} games, ${unique.filter(r=>r.address).length} with addresses; ${payload.errors.length} source errors`);
 return payload;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve('scripts/game-locations.mjs'))await generateGameLocations(process.argv[2]||'_site');
