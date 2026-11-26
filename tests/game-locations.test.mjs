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

test('QuickScores division prefixes preserve the December 4 flag football venue match', () => {
 const schedule='https://www.quickscores.com/Orgs/ResultsDisplay.php?OrgDir=ccsl&LeagueID=1766702';
 const $=load(`<li class="event" id="7"><time datetime="2026-12-04T16:00"></time>
  <span class="team-name">[Big School] Scottsdale Christian</span>
  <span class="team-name">[Big School] Gilbert Christian Agritopia</span>
  <span class="e-local"><a href="/Orgs/LocationDetails.php?OrgDir=ccsl&LocationID=434647">Scottsdale Christian Academy</a></span>
 </li>`);
 const records=parseQS($,schedule,'Girls Flag Football- A');
 const game={type:'game',team:'MS Girls Flag Football',date:'2026-12-04',opponent:'Gilbert Christian Agritopia',start:960};
 const match=matchGame(game,records);
 assert.equal(match?.venue,'Scottsdale Christian Academy');
 assert.equal(match.venueUrl,'https://www.quickscores.com/Orgs/LocationDetails.php?OrgDir=ccsl&LocationID=434647');
});

const school=(id,name,line1,zip)=>({
 id,name,full_name:name+' High School',address:{line1,city:'Phoenix',state:'AZ',zip},
});

test('AIA directory supplies addresses for exact regular-season and bracket venues', async () => {
 for (const [source,venue,match] of [
  ['AIA bracket','Mountain Pointe HS',school(106,'Mountain Pointe','4201 E. Knox Road','85044')],
  ['AZPreps365','Alhambra High School',school(156,'Alhambra','3839 W. Camelback Rd.','85019')],
  ['AZPreps365','North HS',school(89,'North','1101 E. Thomas Road','85014')],
 ]) {
  const game={source,venue,address:''};
  await addSchoolAddress(game,async name=>{
   assert.equal(name,match.full_name);
   return [school(999,'Fuzzy Match','100 E. Main St.','85044'),match];
  });
  assert.equal(game.venue,venue);
  assert.equal(game.address,`${match.address.line1}, Phoenix, AZ ${match.address.zip}`);
  assert.equal(game.addressSourceUrl,'https://aiaonline.org/schools/'+match.id);
 }
});

test('AIA lookup preserves official addresses and rejects unmatched or ambiguous schools', async () => {
 const existing={source:'AZPreps365',venue:'Alhambra HS',address:'Existing address'};
 await addSchoolAddress(existing,async ()=>assert.fail('Unexpected directory lookup'));
 assert.equal(existing.address,'Existing address');
 const alhambra=school(156,'Alhambra','3839 W. Camelback Rd.','85019');
 for (const [venue,results] of [
  ['High Seed',[alhambra]],
  ['Alhambra HS Annex',[alhambra]],
  ['Alhambra HS',[alhambra,{...alhambra,id:1000}]],
  ['Alhambra HS',[{...alhambra,address:{...alhambra.address,state:'CA'}}]],
 ]) {
  const game={source:'AIA bracket',venue,address:'',opponent:'Alhambra HS'};
  await addSchoolAddress(game,async ()=>results);
  assert.equal(game.address,'');
  assert.equal(game.addressSourceUrl,undefined);
 }
});

test('a named tournament with an explicit opponent matches its official venue', () => {
 const game={type:'game',team:'HS-Varsity Boys Basketball',date:'2026-11-25',
  start:1110,opponent:'Phx Coyote Classic: vs Camelback'};
 const listing={teamKey:teamKey(game.team),date:game.date,start:game.start,
  opponent:'Camelback',venue:'Alhambra High School',address:'3839 W. Camelback Rd., Phoenix, AZ 85019'};
 assert.equal(matchGame(game,[listing])?.address,listing.address);
 assert.equal(matchGame({...game,opponent:'Phx Coyote Classic: vs Another School'},[listing]),null);
 assert.equal(matchGame({...game,opponent:'If Necessary: vs Camelback'},[listing]),null);
});

test('official games without a team color can match a unique date, opponent and start time', () => {
 for(const [team,officialTeam,source] of [
  ['MS JV Blue Baseball','MS JV Baseball','QuickScores'],
  ['5/6 Gold Girls Volleyball','5/6 Girls Volleyball','QuickScores'],
  ['HS Girls JV Red Basketball','HS Girls JV Basketball','AZPreps365'],
 ]){
  const game={type:'game',team,date:'2026-12-01',opponent:'Example School',start:930};
  const listing={teamKey:teamKey(officialTeam),date:game.date,opponent:game.opponent,start:game.start,
   source,venue:'Official Venue',address:'123 Example Rd., Phoenix, AZ 85032'};
  assert.equal(matchGame(game,[listing],[game]),listing);
 }
});

test('an omitted color never overrides explicit colors or ambiguous matchups', () => {
 const blue={type:'game',team:'MS JV Blue Baseball',date:'2026-12-01',opponent:'Example School',start:930};
 const red={...blue,team:'MS JV Red Baseball'};
 const uncolored={teamKey:teamKey('MS JV Baseball'),date:blue.date,opponent:blue.opponent,start:blue.start,
  source:'QuickScores',venue:'Official Venue'};
 const explicitBlue={...uncolored,teamKey:teamKey(blue.team)};
 const explicitRed={...uncolored,teamKey:teamKey(red.team)};
 assert.equal(matchGame(blue,[uncolored,explicitBlue],[blue,red]),explicitBlue);
 assert.equal(matchGame(blue,[explicitRed],[blue]),null);
 assert.equal(matchGame(blue,[uncolored,explicitRed],[blue]),null);
 assert.equal(matchGame(blue,[{...uncolored,source:'AIA bracket'}],[blue]),null);
 assert.equal(matchGame(blue,[uncolored,{...uncolored,venue:'Another Venue'}],[blue]),null);
 assert.equal(matchGame(blue,[uncolored],[blue,red]),null);
 assert.equal(matchGame(blue,[uncolored],[blue,{...red,start:null}]),null);
 assert.equal(matchGame(blue,[uncolored],[blue,{...red,start:990}]),uncolored);
 assert.equal(matchGame(blue,[uncolored]),null);
 for(const overrides of [{start:null},{start:990},{opponent:''},{opponent:'Different School'},
  {date:'2026-12-02'},{team:'MS Varsity Blue Baseball'},{type:'practice'}]){
  const game={...blue,...overrides};
  assert.equal(matchGame(game,[uncolored],[game]),null);
 }
});
