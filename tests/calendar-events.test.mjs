import test from 'node:test';
import assert from 'node:assert/strict';
import {processSchedules, normalizeAwayMarkers} from '../dashboard/logic.js';
import {laneFor} from '../dashboard/lanes.js';
import {buildCatalog, tagEvents, filtered} from '../dashboard/month-team.js';
import {collectEvents} from '../scripts/calendars.mjs';

// Winter-style master sheet: section headers, team names, then the notes header.
const MON = 'Monday, January 11, 2027';
const TUE = 'Tuesday, January 12, 2027';
const monday = '2027-01-11';

function sources(facilityRows = [], transportationRows = []) {
  const fac = {ok: true, sheets: [{name: 'Winter', rows: [
    ['', 'Field Schedule', '', '', 'Baseball Field Schedule', '', 'Gym Schedule', ''],
    ['Date', 'MS Football', 'MS Soccer', 'HS Girls Flag Football', 'MS Baseball', '', 'HS Girls Varsity Basketball', ''],
    ['', '', '', '', '', 'Field Notes', '', 'Gym Notes'],
    ...facilityRows,
  ]}]};
  const tran = {ok: true, sheets: [{name: '2026-2027 Transportation', rows: [
    ['Date', 'Team', 'Dismissal', 'Time', 'Opponent', 'Home/Away', 'Venue', 'Transportation'],
    ...transportationRows,
  ]}]};
  return {fac, tran};
}
// Facility row helper: [date, MS Football, MS Soccer, HS Girls Flag, MS Baseball, Field Notes, HS GV Basketball, Gym Notes]
const row = (date, cells = {}) => [date, cells.football || '', cells.soccer || '', cells.flag || '',
  cells.baseball || '', cells.fieldNotes || '', cells.basketball || '', cells.gymNotes || ''];
const calendar = (facilityRows, transportationRows) => {
  const {fac, tran} = sources(facilityRows, transportationRows);
  return collectEvents(fac, tran).events;
};
const dashboard = (facilityRows, transportationRows) => {
  const {fac, tran} = sources(facilityRows, transportationRows);
  return tagEvents(processSchedules(fac, tran, monday).events, buildCatalog(fac));
};

test('X dismissal and vehicle values are not printed in calendar games', () => {
  const events = calendar([row(MON)], [
    [MON, 'HS-Varsity Girls Basketball', 'X', '5:30pm', 'Home Opponent', 'H', 'SCA', 'x'],
    [TUE, 'HS-Varsity Girls Basketball', '2:15pm', '5:30pm', 'Away Opponent', 'A', 'Away Gym', 'Bus 2'],
  ]);
  const home = events.find(e => e.date === '2027-01-11');
  const away = events.find(e => e.date === '2027-01-12');
  assert.doesNotMatch(home.description, /Dismissal|Transportation/);
  assert.match(away.description, /Dismissal: 2:15pm/);
  assert.match(away.description, /Transportation: Bus 2/);
});

test('timed practices with a facility area keep both start and end times', () => {
  const events = calendar([row(MON, {football: '3:00PM-4:45PM (Outfield)', soccer: '4-5pm. Infield.', baseball: '3:00PM-4:15PM (Cages)'})]);
  const pick = title => events.find(e => e.title.includes(title));
  assert.deepEqual([pick('MS Football').title, pick('MS Football').start, pick('MS Football').end],
    ['MS Football — Practice (Outfield)', 15 * 60, 16 * 60 + 45]);
  assert.deepEqual([pick('MS Soccer').title, pick('MS Soccer').start, pick('MS Soccer').end],
    ['MS Soccer — Practice (Infield)', 16 * 60, 17 * 60]);
  assert.equal(pick('MS Baseball').title, 'MS Baseball — Practice (Cages)');
});

test('a morning range in the team column is a morning practice, not an all-day entry', () => {
  const [event] = calendar([row(MON, {football: 'Football 6-9am'})]);
  assert.deepEqual([event.title, event.start, event.end], ['MS Football — Practice', 6 * 60, 9 * 60]);
});

test('spaced ranges and "to" ranges are practices with an end time', () => {
  const events = calendar([row(MON, {football: '3 - 5pm', soccer: '3pm to 5pm'})]);
  for (const e of events) assert.deepEqual([e.title.endsWith('Practice'), e.start, e.end], [true, 15 * 60, 17 * 60]);
});

test('two time slots in one cell become two calendar events and the first keeps its UID', () => {
  const single = calendar([row(MON, {football: '3:00PM-4:00PM (White)'})]);
  const double = calendar([row(MON, {football: '3:00PM-4:00PM (White) 4:00PM-5:00PM (Gold)'})]);
  assert.deepEqual(double.map(e => [e.title, e.start, e.end]), [
    ['MS Football — Practice (White)', 15 * 60, 16 * 60],
    ['MS Football — Practice (Gold)', 16 * 60, 17 * 60],
  ]);
  assert.equal(double[0].uid, single[0].uid);
  assert.notEqual(double[0].uid, double[1].uid);
});

test('other timed activities keep their Excel wording; placeholders stay all-day', () => {
  const events = calendar([row(MON, {football: 'Try-Outs 3-5PM', soccer: '3-5pm If Necessary', flag: 'Tournament'})]);
  const pick = team => events.find(e => e.title.startsWith(team));
  assert.deepEqual([pick('MS Football').title, pick('MS Football').start, pick('MS Football').end],
    ['MS Football — Try-Outs 3-5PM', 15 * 60, 17 * 60]);
  assert.deepEqual([pick('MS Soccer').start, pick('MS Soccer').end], [null, null]);
  assert.deepEqual([pick('HS Girls Flag Football').title, pick('HS Girls Flag Football').start], ['HS Girls Flag Football — Tournament', null]);
});

test('a single start time never gets an invented end time', () => {
  const events = calendar([row(MON, {football: '4pm', soccer: '4pm vs Fixture Academy'})]);
  for (const e of events) assert.deepEqual([e.start, e.end], [16 * 60, null]);
  assert.equal(events.find(e => e.isGame).title, 'MS Soccer vs Fixture Academy');
});

test('away markers written as "At." or "Word@" are away games, never on-campus reservations', () => {
  assert.equal(normalizeAwayMarkers('5:00pm@Heritage'), '5:00pm @Heritage');
  assert.equal(normalizeAwayMarkers('6:00pm Varsity@ Arcadia'), '6:00pm Varsity @ Arcadia');
  assert.equal(normalizeAwayMarkers('At. Northland Prep 5:30pm'), 'At Northland Prep 5:30pm');
  assert.equal(normalizeAwayMarkers('At.Rancho Solano 5:30pm'), 'At Rancho Solano 5:30pm');
  assert.equal(normalizeAwayMarkers('Email coach@sca.org'), 'Email coach@sca.org');
  const events = dashboard([row(MON, {basketball: 'At. Northland Prep 5:30pm', flag: '6:00pm Varsity@ Arcadia', soccer: '5:00pm@Heritage'})]);
  assert.equal(events.length, 3);
  for (const e of events) assert.deepEqual([e.type, laneFor(e)], ['game', 'away'], e.detail);
});

test('an "At." away game merges with its transportation record instead of appearing twice', () => {
  const transport = [[MON, 'HS-Varsity Girls Basketball', '2:30pm', '5:30pm', 'Northland Prep', 'A', 'Northland Prep', 'Bus']];
  const events = dashboard([row(MON, {basketball: 'At. Northland Prep 5:30pm'})], transport);
  assert.deepEqual(events.map(e => [e.source, laneFor(e)]), [['transportation', 'away']]);
  const cal = calendar([row(MON, {basketball: 'At. Northland Prep 5:30pm'})], transport);
  assert.deepEqual(cal.map(e => e.title), ['HS Girls Varsity Basketball — Varsity @ Northland Prep']);
});

test('host-site notes stay on the field schedule but are not assigned to an SCA team', () => {
  const note = 'Host Site for MS Flag\n4pm: Game 1\n5:15pm: Game 2';
  const events = dashboard([row(MON, {fieldNotes: note})]);
  const notes = events.filter(e => e.type === 'note');
  assert.equal(notes.length, 1);
  assert.equal(laneFor(notes[0]), 'field');
  assert.equal(filtered(notes[0], 'all', 'all'), true);
  assert.equal(events.filter(e => e.syntheticNote).length, 0);
  assert.deepEqual(calendar([row(MON, {fieldNotes: note})]), []);
});

test('a team practice scheduled in facility notes still reaches the team view and calendar', () => {
  const note = 'MS Baseball\n3–5pm';
  const events = dashboard([row(MON, {fieldNotes: note})]);
  const derived = events.filter(e => e.syntheticNote);
  assert.deepEqual(derived.map(e => [e.team, e.type, e.start, e.ranges[0].end]), [['MS Baseball', 'practice', 15 * 60, 17 * 60]]);
  const cal = calendar([row(MON, {fieldNotes: note})]);
  assert.deepEqual(cal.map(e => [e.title, e.start, e.end]), [['MS Baseball — Practice', 15 * 60, 17 * 60]]);
});
