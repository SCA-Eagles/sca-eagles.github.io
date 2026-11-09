import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {teamKey,matchGame} from '../dashboard/game-match.js';
import {parseAZ,parseQS} from '../scripts/game-locations.mjs';
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
