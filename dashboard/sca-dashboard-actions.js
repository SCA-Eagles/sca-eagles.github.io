/* SCA Athletics homepage: operational action cards + facility icons.
 * Uses the existing calendar subscriptions, team filter, Month tab,
 * and Reload button. No new APIs, credentials, or external dependencies.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);

  const icon = (name, size = 24) => {
    const common = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"`;
    const shapes = {
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h3M8 18h3M15 14h2"/>',
      team: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16.5 5.3a3 3 0 0 1 0 5.4M19 20v-2a5 5 0 0 0-2.3-4.2"/>',
      reload: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.3 9a7 7 0 0 1 12.4-1.6L20 12M4 12l1.3 4.6A7 7 0 0 0 17.7 15"/>',
      field: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14M3 9h4v6H3M21 9h-4v6h4M8 12h8"/>',
      gym: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M6 6c4 2 4 10 0 12M18 6c-4 2-4 10 0 12"/>',
      away: '<rect x="5" y="3" width="14" height="17" rx="3"/><path d="M5 14h14M8 20v2M16 20v2M8 7h8M8 17h.01M16 17h.01"/>',
      chevron: '<path d="m9 18 6-6-6-6"/>'
    };
    return `<svg ${common}>${shapes[name] || ''}</svg>`;
  };

  function addStyles() {
    if ($('sca-action-styles')) return;
    const style = document.createElement('style');
    style.id = 'sca-action-styles';
    style.textContent = `
      .sca-actions{order:7;margin:25px 0 0;min-width:0}
      .sca-actions-header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 13px}
      .sca-actions-header h2{margin:0;color:#102c50;font-size:18px;letter-spacing:-.025em}
      .sca-actions-header span{color:#718199;font-size:12px}
      .sca-actions-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
      .sca-action{font:inherit;cursor:pointer;display:flex;text-align:left;align-items:center;gap:13px;
        width:100%;min-height:112px;border:1px solid #d5e0ec;border-radius:15px;padding:18px;
        background:#fff;color:#173655;box-shadow:0 5px 16px #102c5010;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease}
      .sca-action:hover{transform:translateY(-2px);border-color:#9eb7cf;box-shadow:0 9px 25px #102c501a}
      .sca-action:focus-visible{outline:3px solid #e2a338;outline-offset:3px}
      .sca-action-icon{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;
        flex-shrink:0;background:#e7eff8;color:#10365e}
      .sca-action:nth-child(2) .sca-action-icon{background:#ffe8ed;color:#ae0d2b}
      .sca-action:nth-child(3) .sca-action-icon{background:#f9efdb;color:#996414}
      .sca-action-info{display:grid;gap:4px;min-width:0;flex:1}
      .sca-action-title{font-size:14px;font-weight:900;letter-spacing:-.015em;line-height:1.3;color:#112e4c}
      .sca-action-help{font-size:11px;color:#687b90;line-height:1.45;font-weight:500}
      .sca-action-chevron{color:#8395a9;flex-shrink:0}
      .sca-inline-panel{margin-top:12px;background:#fff;border:1px solid #d5e1ed;border-radius:14px;padding:15px;
        box-shadow:0 3px 12px #132b4509}
      .sca-inline-label{display:block;color:#102c50;font-size:13px;font-weight:850;margin-bottom:9px}
      .sca-team-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      .sca-team-row select{font:inherit;background:#fff;border:1px solid #c8d7e5;color:#102c50;
        border-radius:9px;padding:11px;max-width:100%;flex:1;min-width:150px}
      .sca-team-row button{font:inherit;background:#102e51;color:#fff;border:0;border-radius:9px;
        padding:12px 17px;font-size:12px;font-weight:850}
      .sca-action-feedback{font-size:12px;color:#526b83;margin:10px 0 0;min-height:1em}
      #calendarSubscribe.sca-calendar-expanded{margin:13px 0 4px !important;order:8}
      #overviewView .lane-icon{display:grid;place-items:center;color:#fff;background:#ffffff29!important}
      #overviewView .lane-icon svg{width:21px;height:21px;display:block;stroke-width:1.9}
      @media(max-width:820px){.sca-actions-grid{gap:9px}.sca-action{padding:13px;gap:9px;min-height:100px}.sca-action-icon{width:37px;height:37px}.sca-action-title{font-size:12px}.sca-action-chevron{display:none}}
      @media(max-width:620px){.sca-actions{margin-top:20px}.sca-actions-header h2{font-size:17px}
        .sca-actions-grid{grid-template-columns:1fr;gap:9px}
        .sca-action{min-height:73px;padding:12px 14px;gap:13px}
        .sca-action-icon{width:41px;height:41px}
        .sca-action-title{font-size:14px}.sca-action-help{font-size:11px}.sca-action-chevron{display:block}}
    `;
    document.head.appendChild(style);
  }

  function addFacilityIcons() {
    const overview = $('overviewDetails');
    if (!overview) return;
    const types = [['field','field'],['gym','gym'],['away','away']];
    for (const [cssClass, symbol] of types) {
      overview.querySelectorAll(`.lane-${cssClass} .lane-icon:not([data-sca-svg])`).forEach(el => {
        el.innerHTML = icon(symbol, 21); // Static, bundled SVG; no schedule text is interpreted as HTML.
        el.setAttribute('data-sca-svg', symbol);
      });
    }
  }

  function addActions() {
    if ($('scaActionDeck')) return;
    const main = document.querySelector('main');
    const calendarPanel = $('calendarSubscribe');
    if (!main || !calendarPanel || !$('overviewView')) return;
    calendarPanel.hidden = true;
    const deck = document.createElement('section');
    deck.id = 'scaActionDeck';
    deck.className = 'sca-actions';
    deck.setAttribute('aria-label', 'Schedule quick actions');
    deck.innerHTML = `
      <div class="sca-actions-header"><h2>Quick Actions</h2><span>Get where you need to go</span></div>
      <div class="sca-actions-grid">
        <button class="sca-action" id="scaCalendarAction" type="button" aria-controls="calendarSubscribe" aria-expanded="false">
          <span class="sca-action-icon">${icon('calendar')}</span>
          <span class="sca-action-info"><span class="sca-action-title">Calendar Subscription</span>
            <span class="sca-action-help">Follow SCA or a specific team in Apple or Google Calendar</span></span>
          <span class="sca-action-chevron">${icon('chevron',16)}</span>
        </button>
        <button class="sca-action" id="scaTeamAction" type="button" aria-controls="scaTeamPanel" aria-expanded="false">
          <span class="sca-action-icon">${icon('team')}</span>
          <span class="sca-action-info"><span class="sca-action-title">Team Schedules</span>
            <span class="sca-action-help">Pick a team and see its monthly schedule</span></span>
          <span class="sca-action-chevron">${icon('chevron',16)}</span>
        </button>
        <button class="sca-action" id="scaReloadAction" type="button">
          <span class="sca-action-icon">${icon('reload')}</span>
          <span class="sca-action-info"><span class="sca-action-title">Reload Schedule</span>
            <span class="sca-action-help">Check the latest published schedule and updates</span></span>
          <span class="sca-action-chevron">${icon('chevron',16)}</span>
        </button>
      </div>
      <div class="sca-inline-panel" id="scaTeamPanel" hidden>
        <label class="sca-inline-label" for="scaQuickTeam">Choose a team to view</label>
        <div class="sca-team-row"><select id="scaQuickTeam" aria-label="Team schedule"></select>
        <button id="scaOpenTeam" type="button">View team month</button></div>
      </div>
      <p class="sca-action-feedback" id="scaActionFeedback" role="status" aria-live="polite"></p>`;
    main.appendChild(deck);
    const calendarAction = $('scaCalendarAction');
    const teamAction = $('scaTeamAction');
    const teamPanel = $('scaTeamPanel');
    const quickTeam = $('scaQuickTeam');
    const feedback = $('scaActionFeedback');

    calendarAction.addEventListener('click', () => {
      const opening = calendarPanel.hidden;
      calendarPanel.hidden = !opening;
      calendarPanel.classList.toggle('sca-calendar-expanded',opening);
      calendarAction.setAttribute('aria-expanded', String(opening));
      feedback.textContent = '';
      if (opening) calendarPanel.scrollIntoView({behavior:'smooth',block:'nearest'});
    });

    function syncTeamChoices() {
      const original = $('teamFilter');
      if (!original) return;
      const current = quickTeam.value || original.value || 'all';
      quickTeam.replaceChildren(...Array.from(original.options, o => o.cloneNode(true)));
      quickTeam.value = Array.from(quickTeam.options).some(o => o.value===current) ? current : 'all';
    }
    teamAction.addEventListener('click', () => {
      const opening = teamPanel.hidden;
      teamPanel.hidden = !opening;
      teamAction.setAttribute('aria-expanded', String(opening));
      feedback.textContent = '';
      if (opening) {
        const school = $('filter');
        if (school && school.value !== 'all') {
          school.value='all';
          school.dispatchEvent(new Event('change', {bubbles:true}));
        }
        syncTeamChoices();
        teamPanel.scrollIntoView({behavior:'smooth',block:'nearest'});
        quickTeam.focus({preventScroll:true});
      }
    });
    $('scaOpenTeam').addEventListener('click', () => {
      const team = $('teamFilter');
      if (!team) { feedback.textContent = 'Team options are unavailable right now.'; return; }
      const chosen = quickTeam.value || 'all';
      if (!Array.from(team.options).some(o => o.value === chosen)) {
        feedback.textContent = 'This team is not listed in the current schedules.';
        return;
      }
      team.value = chosen;
      team.dispatchEvent(new Event('change',{bubbles:true}));
      $('monthTab')?.click();
      teamPanel.hidden=true;
      teamAction.setAttribute('aria-expanded','false');
      feedback.textContent = chosen === 'all' ? 'Showing the full monthly schedule.' : 'Showing your selected team in Month view.';
      window.setTimeout(() => $('monthView')?.scrollIntoView({behavior:'smooth',block:'start'}),200);
    });
    $('scaReloadAction').addEventListener('click', () => {
      const reload = $('refresh');
      if (!reload || reload.disabled) {
        feedback.textContent='A schedule reload is already underway.';
        return;
      }
      feedback.textContent='Checking the latest data published to the dashboard…';
      reload.click();
      window.setTimeout(() => {
        const status = $('freshness')?.textContent || '';
        feedback.textContent = `${status}. Source spreadsheets are normally fetched automatically every 30 minutes.`;
      },1800);
    });
  }

  function init() {
    addStyles();
    addActions();
    addFacilityIcons();
    const overview = $('overviewDetails');
    if (overview) new MutationObserver(addFacilityIcons).observe(overview,{childList:true,subtree:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
