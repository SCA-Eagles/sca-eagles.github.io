import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCatalog, buildMonthModel, drawMonth, filtered} from '../dashboard/month-team.js';

class Element {
  children = [];
  textContent = '';

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }

  setAttribute() {}
}

function descendants(element) {
  return [element, ...element.children.flatMap(descendants)];
}

test('team Month view shows every practice range and preserves start-only times', t => {
  const originalDocument = globalThis.document;
  globalThis.document = {createElement: () => new Element()};
  t.after(() => { globalThis.document = originalDocument; });

  const facilities = {ok: true, sheets: [{name: 'Spring', rows: [
    ['', 'Field Schedule'],
    ['Date', 'HS Girls Soccer', '', 'HS Boys Basketball'],
    ['', '', 'Field Notes', '', 'Gym Notes'],
    ['Monday, March 2, 2026', '3-4:30pm', '', '5-6pm'],
    ['Tuesday, March 3, 2026', '11am-12:30pm, 3-4pm'],
    ['Wednesday, March 4, 2026', '3pm'],
  ]}]};
  const transportation = {ok: true, sheets: [{name: '2026-2027 Transportation', rows: [['Date']]}]};
  const catalog = buildCatalog(facilities);
  const focus = '2026-03-01';
  const {events} = buildMonthModel(facilities, transportation, focus, catalog);
  const team = events.find(event => event.team === 'HS Girls Soccer');
  assert.ok(team?.teamId);
  const teamEvents = events.filter(event => filtered(event, 'HS', team.teamId));

  for (const [selected, expected] of [
    ['2026-03-02', ['3–4:30pm']],
    ['2026-03-03', ['11am–12:30pm', '3–4pm']],
    ['2026-03-04', ['3pm']],
  ]) {
    const container = new Element();
    drawMonth(container, {focus, selected, events: teamEvents, scheduleEvents: events});
    const times = descendants(container).filter(element => element.className === 'when');
    assert.equal(times.length, 1);
    const [time] = times;
    assert.deepEqual(descendants(time).map(element => element.textContent).filter(Boolean), expected);
  }
});
