import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {teamKey,matchGame} from '../dashboard/game-match.js';
import {addSchoolAddress,parseAZ,parseBracket,parseQS} from '../scripts/game-locations.mjs';
const event={type:'game',team:'HS-Varsity Volleyball',date:'2026-11-12',opponent:'Semifinal: San Tan Charter',start:1140,location:'Wrong spreadsheet location'};
const record={teamKey:teamKey(event.team),date:event.date,opponent:'San Tan Charter',start:1140,venue:'Mountain Pointe High School',address:''};
test('neutral venue uses official listing and never the home or spreadsheet venue',()=>{assert.equal(matchGame(event,[record]).venue,'Mountain Pointe High School');assert.equal(matchGame(event,[record]).address,'');});
test('unknown opponent, wrong team, wrong date, practices and ambiguous matches stay unlinked',()=>{
 for(const e of [{...event,opponent:'Another School'},{...event,team:'HS JV Volleyball'},{...event,date:'2026-11-13'},{...event,type:'practice'},{...event,opponent:'If Necessary: Championship'}])assert.equal(matchGame(e,[record]),null);
 assert.equal(matchGame(event,[record,{...record,venue:'Other gym'}]),null);
 assert.equal(matchGame(event,[]),null);
});
test('doubleheaders require unique time and team levels/colors stay distinct',()=>{
 assert.equal(matchGame(event,[record,{...record,start:900,venue:'Morning venue'}]).venue,record.venue);
 assert.notEqual(teamKey('MS JV Red Baseball'),teamKey('MS JV Blue Baseball'));
 assert.notEqual(teamKey('HS Girls Soccer'),teamKey('HS Boys Soccer'));
});
test('AZ parser preserves explicit neutral venue, school year, and blank address',()=>{
 const $=load(`<a>2026-2027</a><div class="event-contest" data-contest-id="42"><div class="date">12 Nov</div><div class="time">7:00 pm</div><span class="opponent">San Tan Charter<em class="mascot">Roadrunners</em></span><span class="location">Mountain Pointe High School</span></div>`);
 const [r]=parseAZ($,'https://azpreps365.com/teams/volleyball-girls/2330-scott-chr/227502-varsity');assert.equal(r.date,event.date);assert.equal(r.opponent,'San Tan Charter');assert.equal(r.venue,record.venue);assert.equal(r.address,'');
});
test('QuickScores parser uses the game venue even when it differs from either team',()=>{
 const $=load(`<li class="event" id="7"><time datetime="2026-09-11T17:30"></time><span class="team-name">Fountain Hills</span><span class="team-name">Scottsdale Christian Academy</span><span class="e-local"><a href="/Orgs/LocationDetails.php?OrgDir=ccsl&LocationID=434884">VCHS</a></span></li>`);
 const [r]=parseQS($,'https://www.quickscores.com/Orgs/ResultsDisplay.php?OrgDir=ccsl&LeagueID=1736276','Boys Tackle Football- 11 man');assert.equal(r.venue,'VCHS');assert.equal(r.teamKey,teamKey('MS Football'));assert.equal(r.address,'');assert.equal(r.date,'2026-09-11');
});

test('AIA final matches a school alias and ignores unconfirmed bracket venues',()=>{
 const url='https://azpreps365.com/brackets/football-flag/3a/test-final';
 const $=load(`<div id="bracket"><ul><li data-contest-id="42">
 <div class="details"><time datetime="2026-11-21T11:00:00-07:00"></time><span class="location">Corona del Sol HS</span></div>
 <div class="participant" data-team-id="1"><span class="team">Benjamin Franklin</span></div>
 <div class="participant" data-team-id="2"><span class="team">Scottsdale Christian</span></div></li></ul></div>`);
 const event={type:'game',team:'HS Varsity Flag Football',date:'2026-11-21',opponent:'State Final: Ben Franklin'};
 const records=parseBracket($,url,'football-flag');
 const match=matchGame(event,records);
 assert.equal(match.venue,'Corona del Sol HS');
 assert.equal(match.sourceUrl,url);
 assert.equal(match.address,'');
 assert.equal(matchGame({...event,opponent:''},records),null);
 $('.location').text('High Seed');
 assert.deepEqual(parseBracket($,url,'football-flag'),[]);
});

test('AIA school profiles supply addresses for the explicit regular-season and bracket venues', async () => {
 for (const [source, venue, school, id, street, zip] of [
  ['AIA bracket', 'Mountain Pointe HS', 'Mountain Pointe High School', '106', '4201 E. Knox Road', '85044'],
  ['AZPreps365', 'Alhambra High School', 'Alhambra High School', '156', '3839 W. Camelback Rd.', '85019'],
 ]) {
  const game={source,venue,address:''};
  await addSchoolAddress(game,async url=>{
   assert.equal(url,'https://aiaonline.org/schools/'+id);
   return load(`<address><div>${school}</div>${street}<br>Phoenix, AZ ${zip}</address>`);
  });
  assert.equal(game.venue,venue);
  assert.equal(game.address,`${street}, Phoenix, AZ ${zip}`);
  assert.equal(game.addressSourceUrl,'https://aiaonline.org/schools/'+id);
 }
});

test('school lookup preserves an existing address and skips unknown or unconfirmed venues', async () => {
 for (const game of [
  {source:'AZPreps365',venue:'Alhambra HS',address:'Existing address'},
  {source:'AIA bracket',venue:'High Seed',address:'',opponent:'Alhambra HS'},
  {source:'AZPreps365',venue:'Alhambra HS Annex',address:''},
 ]) {
  const original={...game};
  await addSchoolAddress(game,async ()=>assert.fail('Unexpected profile fetch'));
  assert.deepEqual(game,original);
 }
 const game={source:'AIA bracket',venue:'Mountain Pointe HS',address:''};
 await addSchoolAddress(game,async ()=>load('<address><div>Different School</div>100 E. Main St.<br>Phoenix, AZ 85044</address>'));
 assert.equal(game.address,'');
});
