import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCatalog, buildMonthModel, drawMonth, filtered} from '../dashboard/month-team.js';
import {processSchedules} from '../dashboard/logic.js';
import {collectEvents} from '../scripts/calendars.mjs';

// Follow-up to the Month practice-range fix (#10): more cell formats, master-sheet
// games with a stated range, and checks that other card types are unchanged.
class Element {
  constructor() { this.children = []; this.className = ''; this.textContent = ''; this.classList = {add() {}}; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  addEventListener() {}
  querySelector() { return null; }
}
const descendants = element => [element, ...element.children.flatMap(descendants)];
const byClass = (root, name) => descendants(root).filter(e => String(e.className).split(/\s+/).includes(name));
const text = element => descendants(element).map(e => e.textContent).filter(Boolean).join(' ');
// Each time slot is its own line inside the card's "when" element.
const lines = when => when.children.length ? when.children.map(c => c.textContent) : [when.textContent];

const MON = 'Monday, January 11, 2027';
function sources(cells = {}, transportationRows = []) {
  const fac = {ok: true, sheets: [{name: 'Winter', rows: [
    ['', 'Field Schedule', '', '', 'Baseball Field Schedule', '', 'Gym Schedule', ''],
    ['Date', 'MS Football', 'MS Soccer', 'HS Girls Flag Football', 'MS Baseball', '', 'HS Girls Varsity Basketball', ''],
    ['', '', '', '', '', 'Field Notes', '', 'Gym Notes'],
    [MON, cells.football || '', cells.soccer || '', cells.flag || '', cells.baseball || '', cells.fieldNotes || '', cells.basketball || '', ''],
  ]}]};
  const tran = {ok: true, sheets: [{name: '2026-2027 Transportation', rows: [
    ['Date', 'Team', 'Dismissal', 'Time', 'Opponent', 'Home/Away', 'Venue', 'Transportation'],
    ...transportationRows,
  ]}]};
  return {fac, tran};
}
function monthCards(cells, {transportationRows = [], team = 'all'} = {}) {
  const originalDocument = globalThis.document;
  globalThis.document = {createElement: () => new Element(), head: new Element(), body: new Element()};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ok: false});
  try {
    const {fac, tran} = sources(cells, transportationRows);
    const catalog = buildCatalog(fac);
    const all = buildMonthModel(fac, tran, '2027-01-01', catalog).events;
    const teamId = team === 'all' ? 'all' : catalog.all.find(t => t.label === team).key;
    const events = all.filter(e => filtered(e, 'all', teamId));
    const container = new Element();
    drawMonth(container, {focus: '2027-01-01', selected: '2027-01-11', events, scheduleEvents: all, onDay() {}, onTimeline() {}});
    return byClass(container, 'event').map(card => ({
      team: text(byClass(card, 'name')[0]),
      description: byClass(card, 'description')[0] ? text(byClass(card, 'description')[0]) : '',
      when: lines(byClass(card, 'when')[0]),
    }));
  } finally {
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  }
}
const card = (cards, team) => cards.find(c => c.team === team);

test('Month shows both times for en dash, hyphen, pm-only and AM/PM ranges', () => {
  const cards = monthCards({football: '3:15–4:45', soccer: '3:15-4:45', flag: '3-5pm', baseball: '3:00PM-4:45PM (Outfield)'});
  assert.deepEqual(card(cards, 'MS Football').when, ['3:15–4:45pm']);
  assert.deepEqual(card(cards, 'MS Soccer').when, ['3:15–4:45pm']);
  assert.deepEqual(card(cards, 'HS Girls Flag Football').when, ['3–5pm']);
  assert.deepEqual(card(cards, 'MS Baseball').when, ['3–4:45pm']);
  assert.equal(card(cards, 'MS Baseball').description, 'Outfield');
});

test('Month keeps start-only practices and shows ranges that cross noon', () => {
  const cards = monthCards({football: '3:30pm', baseball: '11am-1pm', soccer: '7-8am, 3-4:30pm'});
  assert.deepEqual(card(cards, 'MS Football').when, ['3:30pm']);
  assert.deepEqual(card(cards, 'MS Baseball').when, ['11am–1pm']);
  assert.deepEqual(card(cards, 'MS Soccer').when, ['7–8am', '3–4:30pm']);
});

test('Month shows the full range for a master-sheet game, matching Today', () => {
  const cards = monthCards({soccer: 'vs Desert Christian 4-6pm', football: 'vs Phoenix Christian 4pm'});
  assert.deepEqual(card(cards, 'MS Soccer').when, ['4–6pm']);
  assert.equal(card(cards, 'MS Soccer').description, 'vs Desert Christian');
  // A game with only a start time still shows just that time.
  assert.deepEqual(card(cards, 'MS Football').when, ['4pm']);
});

test('Month leaves transportation games and facility notes unchanged', () => {
  const cards = monthCards({fieldNotes: 'Field closed 6-8pm for lining'}, {transportationRows: [
    [MON, 'HS-Varsity Girls Basketball', '2:15pm', '5:30pm', 'Away Opponent', 'A', 'Away Gym', 'Bus 2'],
    [MON, 'HS-Varsity Girls Basketball', '', '', 'TBD Opponent', 'H', 'SCA', ''],
  ]});
  const games = cards.filter(c => /Basketball/.test(c.team));
  assert.deepEqual(games.map(c => c.when).sort(), [['5:30pm'], ['TBD']]);
  // Notes keep their existing start-time display; this change does not touch notes.
  assert.deepEqual(card(cards, 'Field notes').when, ['8pm']);
});

test('Month shows the range when a team filter is active', () => {
  const cards = monthCards({soccer: '3:15–4:45', football: '3-5pm'}, {team: 'MS Soccer'});
  assert.deepEqual(cards.map(c => [c.team, c.when]), [['MS Soccer', ['3:15–4:45pm']]]);
});

test('Today/Timeline data and calendar feeds carry both times for the same cells', () => {
  const {fac, tran} = sources({football: '3:15–4:45', soccer: '3:15-4:45', flag: '3-5pm', baseball: '3:00PM-4:45PM (Outfield)'});
  const practices = processSchedules(fac, tran, '2027-01-11').events.filter(e => e.type === 'practice');
  assert.equal(practices.length, 4);
  for (const e of practices) assert.ok(e.ranges.length === 1 && e.ranges[0].end > e.ranges[0].start, e.team);
  const feed = collectEvents(fac, tran).events.filter(e => !e.isGame);
  assert.deepEqual(feed.map(e => [e.start, e.end]).sort(), [[900, 1005], [900, 1020], [915, 1005], [915, 1005]]);
});
