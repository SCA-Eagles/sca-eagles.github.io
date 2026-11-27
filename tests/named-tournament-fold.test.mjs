import test from 'node:test';
import assert from 'node:assert/strict';
import {processSchedules} from '../dashboard/logic.js';
import {buildCatalog, tagEvents} from '../dashboard/month-team.js';
import {displayDetail} from '../dashboard/display.js';
import {laneFor} from '../dashboard/lanes.js';
import {collectEvents} from '../scripts/calendars.mjs';

// HS Girls Varsity Basketball, Friday Nov 27, 2026.
// The facilities cell names the tournament and has no time or opponent.
// Transportation has Ben Franklin at 3:00pm and Dischii'bikoh at 6:00pm,
// both away at ALA Gilbert HS. Today the cell is a third, untimed gym event.
const FRI = 'Friday, November 27, 2026';
const WEEK = '2026-11-23';
const EARLY_UID = '33fb61b933ba@sca-eagles.github.io';
const LATE_UID = '28305f91e653@sca-eagles.github.io';

function sources(cell, transportRows) {
  const fac = {ok: true, sheets: [{name: 'Winter', rows: [
    ['', 'Field Schedule', '', '', 'Baseball Field Schedule', '', 'Gym Schedule', ''],
    ['Date', 'MS Football', 'MS Soccer', 'HS Girls Flag Football', 'MS Baseball', '', 'HS Girls Varsity Basketball', ''],
    ['', '', '', '', '', 'Field Notes', '', 'Gym Notes'],
    [FRI, '3-4pm', '', '', '', '', cell, ''],
  ]}]};
  const tran = {ok: true, sheets: [{name: '2026-2027 Transportation', rows: [
    ['Date', 'Team', 'Dismissal', 'Time', 'Opponent', 'Home/Away', 'Venue', 'Transportation'],
    ...transportRows,
  ]}]};
  return {fac, tran};
}
const early = [FRI, 'HS-Varsity Girls Basketball', 'x', '3:00PM', 'Black Friday Basketball Classic: vs. Ben Franklin', 'A', 'ALA Gilbert HS', 'x'];
const late = [FRI, 'HS-Varsity Girls Basketball', 'x', '6:00PM', "Black Friday Basketball Classic: vs. Dischii'bikoh", 'A', 'ALA Gilbert HS', 'x'];
const oneGame = [FRI, 'HS-Varsity Girls Basketball', 'x', '3:00PM', 'Ben Franklin', 'A', 'ALA Gilbert HS', 'x'];

function dashboard(cell, rows) {
  const {fac, tran} = sources(cell, rows);
  return tagEvents(processSchedules(fac, tran, WEEK).events, buildCatalog(fac));
}
function calendar(cell, rows) {
  const {fac, tran} = sources(cell, rows);
  return collectEvents(fac, tran).events;
}
const girls = events => events.filter(e => /Basketball/i.test(e.team || e.title));

test('a named tournament folds into one transportation game and keeps its UID', () => {
  for (const cell of ['Black Friday Classic Tournament', 'At Black Friday Classic Tournament']) {
    const events = dashboard(cell, [oneGame]);
    const games = girls(events);
    assert.equal(games.length, 1, cell);
    assert.equal(games[0].source, 'transportation');
    assert.equal(games[0].opponent, 'Ben Franklin');
    assert.equal(games[0].start, 15 * 60);
    assert.equal(laneFor(games[0]), 'away');
    assert.match(displayDetail(games[0]), /Ben Franklin/);
    assert.match(displayDetail(games[0]), /· Black Friday Classic$/);
  }
  const alone = calendar('', [oneGame]);
  const merged = calendar('Black Friday Classic Tournament', [oneGame]);
  const game = girls(merged)[0];
  assert.equal(girls(merged).length, 1);
  assert.equal(game.uid, girls(alone)[0].uid);
  assert.match(game.description, /Black Friday Classic Tournament/);
  assert.doesNotMatch(game.description, /Dismissal/);
});

test('a named tournament folds into every transportation game that day and keeps both UIDs', () => {
  const rows = [early, late];
  const events = dashboard('Black Friday Classic Tournament', rows);
  const games = girls(events);
  assert.equal(games.length, 2);
  assert.deepEqual(games.map(e => [e.source, e.opponent, e.start, laneFor(e)]), [
    ['transportation', 'Black Friday Basketball Classic: vs. Ben Franklin', 15 * 60, 'away'],
    ['transportation', "Black Friday Basketball Classic: vs. Dischii'bikoh", 18 * 60, 'away'],
  ]);
  for (const game of games) assert.match(displayDetail(game), /· Black Friday Classic$/);
  const feed = girls(calendar('Black Friday Classic Tournament', rows));
  assert.deepEqual(feed.map(e => e.uid), [EARLY_UID, LATE_UID]);
  assert.deepEqual(feed.map(e => e.uid), girls(calendar('', rows)).map(e => e.uid));
  assert.equal(events.some(e => e.team === 'MS Football' && e.type === 'practice'), true);
});

test('Desert Classic Tourney and Holiday Invitational fold the same way', () => {
  const tourney = dashboard('Desert Classic Tourney', [oneGame]);
  assert.equal(girls(tourney).length, 1);
  assert.match(displayDetail(girls(tourney)[0]), /· Desert Classic$/);
  const invite = dashboard('Holiday Invitational', [oneGame]);
  assert.equal(girls(invite).length, 1);
  assert.match(displayDetail(girls(invite)[0]), /· Holiday Invitational$/);
  assert.equal(girls(invite)[0].source, 'transportation');
});

test('a named tournament with no transportation game stays unchanged', () => {
  const events = dashboard('Black Friday Classic Tournament', []);
  const games = girls(events);
  assert.equal(games.length, 1);
  assert.equal(games[0].source, 'facilities');
  assert.equal(games[0].detail, 'Black Friday Classic Tournament');
  assert.equal(laneFor(games[0]), 'gym');
  const feed = calendar('Black Friday Classic Tournament', []);
  const entry = feed.find(e => e.title.includes('Black Friday Classic Tournament'));
  assert.equal(entry.start, null);
  assert.equal(girls(feed).length, 1);
});

test('a tournament cell with a time stays separate from the transportation games', () => {
  const events = dashboard('9:00am Black Friday Classic Tournament', [early, late]);
  const games = girls(events);
  assert.equal(games.length, 3);
  assert.equal(games.filter(e => e.source === 'facilities').length, 1);
  assert.match(games.find(e => e.source === 'facilities').detail, /9:00am Black Friday Classic Tournament/);
  assert.equal(girls(calendar('9:00am Black Friday Classic Tournament', [early, late])).length, 3);
});

test('a tournament cell that also names an opponent stays separate', () => {
  const events = dashboard('Black Friday Classic Tournament vs Gilbert', [early, late]);
  const games = girls(events);
  assert.equal(games.length, 3);
  assert.ok(games.some(e => e.source === 'facilities' && /vs Gilbert/.test(e.detail)));
  assert.equal(games.filter(e => e.source === 'transportation').length, 2);
  for (const game of games.filter(e => e.source === 'transportation')) {
    assert.doesNotMatch(displayDetail(game), /Black Friday Classic/);
  }
});
