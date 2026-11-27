import test from 'node:test';
import assert from 'node:assert/strict';
import {processSchedules} from '../dashboard/logic.js';
import {buildCatalog, buildMonthModel, filtered, tagEvents} from '../dashboard/month-team.js';
import {displayDetail} from '../dashboard/display.js';
import {laneFor} from '../dashboard/lanes.js';
import {collectEvents} from '../scripts/calendars.mjs';

// HS Boys Varsity Basketball, Saturday Nov 28, 2026.
// The facilities cell is only a tournament note. Transportation already has
// Copper Canyon at 9:00 AM. These must become one event.
const SAT = 'Saturday, November 28, 2026';
const WEEK = '2026-11-23';
// Locked from the transportation row alone, before any tournament merge.
const COPPER_UID = '48c3fbf764e3@sca-eagles.github.io';
const FOOTBALL_UID = 'ebc0a5fa81e7@sca-eagles.github.io';

function sources(cell, transportRows) {
  const fac = {ok: true, sheets: [{name: 'Winter', rows: [
    ['', 'Field Schedule', '', '', 'Baseball Field Schedule', '', 'Gym Schedule', ''],
    ['Date', 'MS Football', 'MS Soccer', 'HS Girls Flag Football', 'MS Baseball', '', 'HS Boys Varsity Basketball', ''],
    ['', '', '', '', '', 'Field Notes', '', 'Gym Notes'],
    [SAT, '3-4pm', '', '', '', '', cell, ''],
  ]}]};
  const tran = {ok: true, sheets: [{name: '2026-2027 Transportation', rows: [
    ['Date', 'Team', 'Dismissal', 'Time', 'Opponent', 'Home/Away', 'Venue', 'Transportation'],
    ...transportRows,
  ]}]};
  return {fac, tran};
}
const copper = [SAT, 'HS-Varsity Boys Basketball', 'x', '9:00AM', 'Copper Canyon', 'A', 'South Mountain HS', 'Van K'];

function dashboard(cell, rows = [copper]) {
  const {fac, tran} = sources(cell, rows);
  return tagEvents(processSchedules(fac, tran, WEEK).events, buildCatalog(fac));
}
function calendar(cell, rows = [copper]) {
  const {fac, tran} = sources(cell, rows);
  return collectEvents(fac, tran).events;
}

test('a tournament-only cell and the same-day transportation game are one event', () => {
  for (const cell of ['At Tournament', 'Tournament', 'At the Tournament']) {
    const events = dashboard(cell);
    const games = events.filter(e => /Basketball/i.test(e.team));
    assert.equal(games.length, 1, cell);
    assert.equal(games[0].source, 'transportation');
    assert.equal(games[0].opponent, 'Copper Canyon');
    assert.equal(games[0].start, 9 * 60);
    assert.equal(games[0].side, 'A');
    assert.equal(laneFor(games[0]), 'away');
    assert.match(games[0].facilityDetail, /Tournament/i);
    assert.match(displayDetail(games[0]), /Copper Canyon/);
    assert.match(displayDetail(games[0]), /Tournament/);
    assert.equal(events.some(e => e.team === 'MS Football' && e.type === 'practice'), true);
  }
});

test('the merged calendar event keeps the transportation game UID', () => {
  const alone = calendar('');
  const merged = calendar('At Tournament');
  const game = merged.find(e => e.title.includes('Copper Canyon'));
  assert.equal(game.uid, COPPER_UID);
  assert.equal(game.uid, alone.find(e => e.title.includes('Copper Canyon')).uid);
  assert.equal(merged.filter(e => /Basketball/i.test(e.title)).length, 1);
  assert.match(game.description, /Copper Canyon/);
  assert.match(game.description, /At Tournament/);
  assert.match(game.description, /Transportation: Van K/);
  assert.doesNotMatch(game.description, /Dismissal/);
  // A different team's practice UID is unchanged by the merge.
  assert.equal(merged.find(e => e.title.startsWith('MS Football')).uid, FOOTBALL_UID);
  assert.equal(alone.find(e => e.title.startsWith('MS Football')).uid, FOOTBALL_UID);
});

test('the merged game is the only basketball event on the month and team filter', () => {
  const {fac, tran} = sources('At Tournament', [copper]);
  const catalog = buildCatalog(fac);
  const month = buildMonthModel(fac, tran, '2026-11-01', catalog).events;
  const team = catalog.all.find(t => t.label === 'HS Boys Varsity Basketball');
  const visible = month.filter(e => e.date === '2026-11-28' && filtered(e, 'HS', team.key));
  assert.deepEqual(visible.map(e => [e.source, e.opponent]), [['transportation', 'Copper Canyon']]);
});

test('a tournament note with no transportation game is left unchanged', () => {
  const events = dashboard('At Tournament', []);
  const games = events.filter(e => /Basketball/i.test(e.team));
  assert.equal(games.length, 1);
  assert.equal(games[0].source, 'facilities');
  assert.equal(games[0].detail, 'At Tournament');
  const cal = calendar('Tournament', []);
  assert.equal(cal.find(e => /Tournament/.test(e.title)).start, null);
});

test('a cell with a time or opponent is not folded into a different game', () => {
  const separate = dashboard('3pm vs Other School');
  const basketball = separate.filter(e => /Basketball/i.test(e.team));
  assert.equal(basketball.length, 2);
  assert.ok(basketball.some(e => e.opponent === 'Copper Canyon' && e.source === 'transportation'));
  assert.ok(basketball.some(e => e.source === 'facilities' && /Other School/.test(e.detail)));

  const timed = dashboard('3pm Tournament');
  assert.equal(timed.filter(e => /Basketball/i.test(e.team)).length, 2);

  const playoffs = dashboard('Playoffs');
  assert.equal(playoffs.filter(e => /Basketball/i.test(e.team)).length, 2);
});

test('a tournament note folds into every transportation game for that team', () => {
  const rows = [
    copper,
    [SAT, 'HS-Varsity Boys Basketball', 'x', '11:00AM', 'Another School', 'A', 'Another Gym', 'Van D'],
  ];
  const events = dashboard('At Tournament', rows);
  const basketball = events.filter(e => /Basketball/i.test(e.team));
  assert.equal(basketball.length, 2);
  assert.ok(basketball.every(e => e.source === 'transportation'));
  for (const game of basketball) assert.match(displayDetail(game), /· Tournament$/);
  const alone = calendar('', rows).filter(e => /Basketball/.test(e.title)).map(e => e.uid).sort();
  const merged = calendar('At Tournament', rows).filter(e => /Basketball/.test(e.title)).map(e => e.uid).sort();
  assert.deepEqual(merged, alone);
});

test('a varsity tournament note does not absorb the JV game', () => {
  const rows = [
    copper,
    [SAT, 'HS-JV Boys Basketball', 'x', '1:00PM', 'JV Opponent', 'A', 'JV Gym', 'Bus'],
  ];
  const events = dashboard('At Tournament', rows);
  const titles = events.filter(e => /Basketball/i.test(e.team)).map(e => e.opponent || e.detail).sort();
  assert.deepEqual(titles, ['Copper Canyon', 'JV Opponent']);
});
