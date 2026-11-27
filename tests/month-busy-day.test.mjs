import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCatalog, buildMonthModel, drawMonth, filtered} from '../dashboard/month-team.js';
import {processSchedules} from '../dashboard/logic.js';

class Element {
  constructor() {
    this.children = [];
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.attrs = {};
    this.classList = {add() {}, toggle() {}};
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name]; }
  addEventListener() {}
  querySelector() { return null; }
}
const descendants = element => [element, ...element.children.flatMap(child => child?.children ? descendants(child) : [])];
const byClass = (root, name) => descendants(root).filter(e => String(e.className).split(/\s+/).includes(name));

function withDocument(run) {
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  globalThis.document = {createElement: () => new Element(), head: new Element(), body: new Element()};
  globalThis.fetch = async () => ({ok: false});
  try { return run(); }
  finally {
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  }
}

const MON = 'Monday, January 11, 2027';
function busyFacilities() {
  const teams = ['MS Football', 'MS Soccer', 'HS Girls Flag Football', 'HS Boys Soccer', 'HS Girls Soccer', 'MS Softball'];
  return {ok: true, sheets: [{name: 'Winter', rows: [
    ['', 'Field Schedule', '', '', '', '', ''],
    ['Date', ...teams],
    ['', ...teams.map(() => ''), 'Field Notes', 'Gym Notes'],
    [MON, '3-4pm', '3:15-4:45', '4pm', '9:00AM', '5:30pm', '3:00PM-4:00PM'],
  ]}]};
}
function transportation() {
  return {ok: true, sheets: [{name: '2026-2027 Transportation', rows: [['Date']]}]};
}

test('a busy month day uses compact rows and +N more without dropping events', () => {
  withDocument(() => {
    const fac = busyFacilities();
    const tran = transportation();
    const catalog = buildCatalog(fac);
    const all = buildMonthModel(fac, tran, '2027-01-01', catalog).events;
    const day = all.filter(e => e.date === '2027-01-11' && filtered(e, 'all', 'all'));
    assert.equal(day.length, 6);
    const container = new Element();
    drawMonth(container, {
      focus: '2027-01-01', selected: '2027-01-11', events: day, scheduleEvents: all, onDay() {}, onTimeline() {},
    });
    const cards = byClass(container, 'event');
    assert.equal(cards.length, 6);
    const shown = cards.filter(card => !card.hidden);
    const hidden = cards.filter(card => card.hidden);
    assert.equal(shown.length, 3);
    assert.equal(hidden.length, 3);
    const more = byClass(container, 'month-more')[0];
    assert.equal(more.textContent, '+3 more');
    assert.equal(more.getAttribute('aria-expanded'), 'false');
    more.onclick();
    assert.equal(cards.filter(card => card.hidden).length, 0);
    assert.equal(more.textContent, 'Show less');
    assert.equal(more.getAttribute('aria-expanded'), 'true');
    more.onclick();
    assert.equal(cards.filter(card => card.hidden).length, 3);
    // The lane count still reports every event, including the collapsed ones.
    const count = byClass(container, 'lane-count').map(e => e.textContent).join(' ');
    assert.match(count, /6 items/);
  });
});

test('month times use one format, and the team filter still shows that team', () => {
  withDocument(() => {
    const container = new Element();
    const selected = '2027-01-11';
    drawMonth(container, {
      focus: '2027-01-01', selected, events: [
        {date: selected, team: 'HS Boys Basketball', type: 'game', source: 'transportation', time: '9:00AM', start: null, detail: 'vs Opponent · Away · Gym', location: 'Away Gym', side: 'A'},
        {date: selected, team: 'MS Soccer', type: 'practice', source: 'facilities', detail: '3-5pm', location: 'Field', start: 15 * 60, ranges: [{start: 15 * 60, end: 17 * 60}]},
        {date: selected, team: 'MS Football', type: 'game', source: 'transportation', time: '5:30 PM', start: null, detail: 'vs Rival · Away · Gym', location: 'Away Gym', side: 'A'},
      ], scheduleEvents: [], onDay() {}, onTimeline() {},
    });
    const lines = byClass(container, 'when').map(node => node.textContent || node.children.map(child => child.textContent).join(''));
    assert.deepEqual(lines.sort(), ['3–5pm', '5:30pm', '9am']);
    assert.equal(byClass(container, 'month-more').length, 0);
  });

  withDocument(() => {
    const fac = busyFacilities();
    const tran = transportation();
    const catalog = buildCatalog(fac);
    const all = buildMonthModel(fac, tran, '2027-01-01', catalog).events;
    const team = catalog.all.find(t => t.label === 'MS Soccer');
    const events = all.filter(e => filtered(e, 'all', team.key));
    const container = new Element();
    drawMonth(container, {
      focus: '2027-01-01', selected: '2027-01-11', events, scheduleEvents: all, onDay() {}, onTimeline() {},
    });
    const cards = byClass(container, 'event');
    assert.equal(cards.length, 1);
    assert.equal(cards[0].hidden, false);
    assert.equal(byClass(container, 'month-more').length, 0);
    assert.match(byClass(container, 'name')[0].textContent, /MS Soccer/);
    const when = byClass(container, 'when')[0];
    const timeText = when.children.length ? when.children.map(child => child.textContent).join(' ') : when.textContent;
    assert.match(timeText, /3:15–4:45pm/);
  });
});

test('Today and Timeline still receive every event on a busy day', () => {
  const fac = busyFacilities();
  const tran = transportation();
  const events = processSchedules(fac, tran, '2027-01-11').events;
  assert.equal(events.length, 6);
  assert.equal(new Set(events.map(e => e.team)).size, 6);
});
