import test from 'node:test';
import assert from 'node:assert/strict';
import {processSchedules} from '../dashboard/logic.js';
import {laneFor} from '../dashboard/lanes.js';
import {matchGame} from '../dashboard/game-match.js';

const monday = '2026-03-02';
const sheetDate = 'Monday, March 2, 2026';

function schedules(facilityRows = [], transportationRows = []) {
  const facilities = {ok: true, sheets: [{name: 'Spring', rows: [
    ['', 'Field Schedule', '', '', '', 'Baseball Field Schedule'],
    ['Date', 'MS Softball', 'MS Boys Soccer', 'HS Varsity Flag Football',
      'HS JV Baseball', 'MS Varsity Baseball', 'MS JV Baseball'],
    ['', '', '', '', '', '', '', 'Field Notes', 'Gym Notes'],
    ...facilityRows,
  ]}]};
  const transportation = {ok: true, sheets: [{name: '2026-2027 Transportation', rows: [
    ['Date', 'Team', 'Dismissal', 'Time', 'Opponent', 'Side', 'Venue'],
    ...transportationRows,
  ]}]};
  return processSchedules(facilities, transportation, monday).events;
}

test('facility headers put both baseball columns in the Baseball Field lane', () => {
  const events = schedules([[sheetDate, '', '', '', '', '4–5 pm', '4–5 pm']]);
  assert.deepEqual(events.map(event => [event.team, event.type, event.fieldArea, laneFor(event)]), [
    ['MS Varsity Baseball', 'practice', 'baseball', 'baseball'],
    ['MS JV Baseball', 'practice', 'baseball', 'baseball'],
  ]);
});

test('the main field header keeps softball, soccer, flag football and a baseball practice on turf', () => {
  const events = schedules([[sheetDate, '3–4 pm', '4–5 pm', '5–6 pm', '6–7 pm']]);
  assert.deepEqual(events.map(event => [event.team, event.type, event.fieldArea, laneFor(event)]), [
    ['MS Softball', 'practice', 'main', 'field'],
    ['MS Boys Soccer', 'practice', 'main', 'field'],
    ['HS Varsity Flag Football', 'practice', 'main', 'field'],
    ['HS JV Baseball', 'practice', 'main', 'field'],
  ]);
});

test('transportation-only home baseball uses its own lane while home softball uses turf', () => {
  const events = schedules([], [
    [sheetDate, 'MS Varsity Baseball', '', '4 pm', 'Fixture Opponent', 'H', 'SCA'],
    [sheetDate, 'MS Softball', '', '5 pm', 'Fixture Opponent', 'H', 'SCA'],
  ]);
  assert.deepEqual(events.map(event => [event.team, event.type, event.fieldArea, laneFor(event)]), [
    ['MS Varsity Baseball', 'game', undefined, 'baseball'],
    ['MS Softball', 'game', undefined, 'field'],
  ]);
  for (const event of events) assert.equal(matchGame(event, []), null);
});

test('baseball games listed away or at an off-campus site use the Away lane', () => {
  const events = schedules([[sheetDate, '', '', '', '', '3 pm @ Fixture Park']], [
    [sheetDate, 'MS JV Baseball', '', '4 pm', 'Fixture Opponent', 'A', ''],
    [sheetDate, 'HS JV Baseball', '', '5 pm', 'Fixture Opponent', 'H', 'Fixture Park'],
  ]);
  assert.deepEqual(events.map(event => [event.team, event.type, laneFor(event)]), [
    ['MS Varsity Baseball', 'game', 'away'],
    ['MS JV Baseball', 'game', 'away'],
    ['HS JV Baseball', 'game', 'away'],
  ]);
});

test('a merged home baseball game keeps the explicit facility assignment', () => {
  const events = schedules([[sheetDate, '', '', '', '4 pm vs Fixture Opponent']], [
    [sheetDate, 'HS JV Baseball', '', '4 pm', 'Fixture Opponent', 'H', 'SCA'],
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].source, 'transportation');
  assert.equal(events[0].fieldArea, 'main');
  assert.equal(laneFor(events[0]), 'field');
});
