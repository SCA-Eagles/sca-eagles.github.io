import {clock, tournamentContextLabel} from './logic.js?v=20261127-named-tournament';

// Display-only text cleanup. Never changes event data, team keys, filters or
// calendar feeds; it only decides how names, details and badges read on screen.
const KEEP_UPPER = new Set(['HS','MS','JV','SCA','CCSL','AIA','PE','II','III','JH','MPR','D22']);
const TIME_RANGE = /\b\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?\s*(?:-|–|—|to)\s*\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?/gi;
const SINGLE_TIME = /\b\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?\b/gi;

function titleWord(word) {
  if (!/[A-Z]{2,}/.test(word) || /[a-z]/.test(word)) return word; // only touch ALL-CAPS words
  const bare = word.replace(/[^A-Za-z0-9]/g, '');
  if (KEEP_UPPER.has(bare.toUpperCase()) || /\d/.test(bare)) return word;
  return word.charAt(0) + word.slice(1).toLowerCase();
}

export function displayTeam(name) {
  return String(name || '')
    .replace(/^(HS|MS)\s*-\s*/i, (_, lvl) => lvl.toUpperCase() + ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .split(' ')
    .map(titleWord)
    .join(' ');
}

export function displayTimeRange({start, end}) {
  const first = clock(start).replace(':00', '');
  const last = clock(end).replace(':00', '');
  return `${first.slice(-2) === last.slice(-2) ? first.slice(0, -2) : first}–${last}`;
}

function tidyText(text) {
  return String(text || '').replace(/Neccessary/g, 'Necessary').replace(/\s{2,}/g, ' ').trim();
}

// Transportation games arrive as "vs Opponent · Home|Away · Venue".
function gameParts(e) {
  const parts = String(e.detail || '').split(' · ').map(s => s.trim()).filter(Boolean);
  let first = parts[0] || '';
  let label = '';
  const m = first.match(/^vs\.?\s*(Scrimmages?|Semifinals?|Quarterfinals?|Finals?|State Finals?|Playoffs?|Tournament)\s*:\s*(.+)$/i);
  if (m) { label = m[1]; first = `vs ${m[2]}`; }
  const side = parts.find(p => /^(home|away|neutral)$/i.test(p)) || '';
  return { opponent: tidyText(first), label, side };
}

export function displayDetail(e) {
  if (e.source === 'transportation' && e.type === 'game') {
    const { opponent, label } = gameParts(e);
    const base = label ? `${label} ${opponent}` : opponent;
    const context = tournamentContextLabel(e.facilityDetail);
    return context && base ? `${base} · ${context}` : base;
  }
  const raw = tidyText(e.detail);
  if (e.type === 'note') return raw;
  // Practices and events: drop the time (already shown) and keep anything else, e.g. "(Cages)".
  const rest = raw.replace(TIME_RANGE, ' ').replace(SINGLE_TIME, ' ')
    .replace(/[()]/g, ' ').replace(/^[\s,;:·–—-]+|[\s,;:·–—-]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  return rest;
}

// Badge shown on a card. Practices are the default, so they carry none.
export function badgeFor(e, lane) {
  if (e.syntheticNote) return 'From facility notes';
  if (e.type === 'note') return 'Facility note';
  if (e.type === 'practice') return '';
  if (e.type === 'game') {
    const { label, side } = e.source === 'transportation' ? gameParts(e) : { label: '', side: '' };
    if (/scrimmage/i.test(label)) return 'Scrimmage';
    const away = lane === 'away' || /^away$/i.test(side);
    return away ? 'Away game' : 'Home game';
  }
  return e.type ? e.type[0].toUpperCase() + e.type.slice(1) : '';
}

// Spreadsheet pointers like "See Winter Sports Tab" mean nothing to the public.
export function isHiddenNote(e) {
  return e.type === 'note' && /^see\b.*\btabs?\.?$/i.test(String(e.detail || '').trim());
}
