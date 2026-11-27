import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {teamKey, matchGame} from '../dashboard/game-match.js';
import {addSchoolAddress, parseAZ} from '../scripts/game-locations.mjs';

// Fixture shaped like the AZPreps365 varsity schedule HTML.
// Individual contests use .event-contest. Multi-day tournaments are separate
// .event blocks with .event-name and a date range, and the current parser
// never reads those blocks.
const url = 'https://azpreps365.com/teams/basketball-boys/2338-scott-chr/227510-varsity';
const html = `<a>2026-2027</a>
<div class="event event-contest" data-contest-id="42">
  <div class="date">12 Nov</div>
  <div class="time">7:00 pm</div>
  <span class="opponent">San Tan Charter<em class="mascot">Roadrunners</em></span>
  <span class="location">Mountain Pointe High School</span>
</div>
<div class="event">
  <span class="event-details">
    <strong class="event-name">Epic Tourneys New Years Classic</strong>
    <div class="text-sm">Dec 29 – 30</div>
  </span>
  <span class="location">
    <span class="italic venue"><a href="https://aiaonline.org/calendar/tournaments/2509849">5 venues</a></span>
    <div class="event-hosted-by">Hosted by Arete Prep</div>
  </span>
</div>
<div class="event">
  <span class="event-details">
    <strong class="event-name">Ben Franklin Early Bird Classic</strong>
    <div class="text-sm">Dec 4 – 5</div>
  </span>
  <span class="location">
    <span class="venue">Benjamin Franklin High School</span>
    <span class="venue">Santos Soccer Complex</span>
    <div class="event-hosted-by">Hosted by Benjamin Franklin</div>
  </span>
</div>
<div class="event">
  <span class="event-details">
    <strong class="event-name">Payson Invitational</strong>
    <div class="text-sm">Sep 12</div>
  </span>
  <span class="location">
    <span class="venue">Payson High School<span class="event-hosted-by">Hosted by Payson</span></span>
  </span>
</div>
<div class="event">
  <span class="event-details">
    <strong class="event-name">PXU Coyote Classic</strong>
  </span>
  <span class="location">
    <span class="venue"><a href="https://aiaonline.org/calendar/tournaments/2536503">6 venues</a></span>
    <div class="event-hosted-by">Hosted by Central</div>
  </span>
</div>
<div class="event">
  <span class="event-details">
    <strong class="event-name">Holiday Shootout</strong>
    <div class="text-sm">Nov 30 – Dec 2</div>
  </span>
  <span class="location"><span class="venue">Desert Vista High School</span></span>
</div>`;

const $ = load(html);
const records = parseAZ($, url);
const key = teamKey('HS Boys Basketball Varsity');
const on = (date, opponent) => records.find(r => r.date === date && r.opponent === opponent);

test('AZPreps365 tournaments are included for each day, with a venue only when one is listed', () => {
  const contest = records.find(r => r.id === 'az-42');
  assert.equal(contest.opponent, 'San Tan Charter');
  assert.equal(contest.venue, 'Mountain Pointe High School');
  assert.equal(contest.address, '');
  assert.equal(contest.date, '2026-11-12');

  for (const date of ['2026-12-29', '2026-12-30']) {
    const row = on(date, 'Epic Tourneys New Years Classic');
    assert.ok(row, date);
    assert.equal(row.venue, '');
    assert.equal(row.address, '');
    assert.equal(row.start, null);
    assert.equal(row.teamKey, key);
    assert.equal(row.source, 'AZPreps365');
    assert.equal(row.sourceUrl, url);
    assert.equal(row.tournament, true);
    assert.doesNotMatch(row.venue, /Arete|venues/i);
  }
  assert.equal(on('2026-12-31', 'Epic Tourneys New Years Classic'), undefined);

  for (const date of ['2026-12-04', '2026-12-05']) {
    const row = on(date, 'Ben Franklin Early Bird Classic');
    assert.match(row.venue, /Benjamin Franklin High School/);
    assert.match(row.venue, /Santos Soccer Complex/);
    assert.doesNotMatch(row.venue, /Hosted by/i);
    assert.equal(row.address, '');
  }

  const payson = on('2026-09-12', 'Payson Invitational');
  assert.equal(payson.venue, 'Payson High School');
  assert.doesNotMatch(payson.venue, /Hosted by/i);

  assert.equal(records.some(r => r.opponent === 'PXU Coyote Classic'), false);

  for (const date of ['2026-11-30', '2026-12-01', '2026-12-02']) {
    assert.equal(on(date, 'Holiday Shootout').venue, 'Desert Vista High School');
  }
  const ids = records.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('a tournament venue is used only when the opponent is that tournament', () => {
  const payson = on('2026-09-12', 'Payson Invitational');
  const game = {type: 'game', team: 'HS-Varsity Boys Basketball', date: '2026-09-12', opponent: 'Payson Invitational', start: null};
  assert.equal(matchGame(game, records)?.venue, 'Payson High School');
  assert.equal(matchGame({...game, opponent: ''}, records), null);
  assert.equal(matchGame({...game, opponent: 'Copper Canyon'}, records), null);
  assert.equal(matchGame({...game, date: '2026-09-13'}, records), null);
  assert.equal(payson.address, '');
});

test('AIA address lookup is not used for a venue count or a host line', async () => {
  for (const venue of ['', '5 venues', '6 venues']) {
    const record = {source: 'AZPreps365', venue, address: ''};
    await addSchoolAddress(record, async () => {
      throw new Error(`lookup for ${JSON.stringify(venue)}`);
    });
    assert.equal(record.address, '');
  }
  const hosted = {source: 'AZPreps365', venue: 'Hosted by Arete Prep', address: ''};
  await addSchoolAddress(hosted, async () => {
    throw new Error('host schools are not venues');
  });
  assert.equal(hosted.address, '');
  const split = {source: 'AZPreps365', venue: 'Benjamin Franklin High School · Santos Soccer Complex', address: ''};
  await addSchoolAddress(split, async () => [{
    id: 1, name: 'Benjamin Franklin', full_name: 'Benjamin Franklin High School',
    address: {line1: '1645 W McDowell Rd', city: 'Phoenix', state: 'AZ', zip: '85007'},
  }]);
  assert.equal(split.address, '');
});
