// SCA Month + Team Upgrade bootstrap.
// Keeps the existing dashboard app intact. If its expected source structure
// changes in a later update, falls back to the original app with a clear notice.
const originalUrl=new URL('./app.js',import.meta.url);
const logicUrl=new URL('./logic.js',import.meta.url);
const approvalsUrl=new URL('./approvals.js',import.meta.url);
const monthUrl=new URL('./month-team.js',import.meta.url);

function replaceOnce(source,needle,replacement){
  const first=source.indexOf(needle);
  if(first<0||source.indexOf(needle,first+1)!==-1)throw new Error(`App upgrade could not find its unique marker: ${needle.slice(0,52)}`);
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}
function replaceSection(source,start,end,replacement){
  const a=source.indexOf(start);if(a<0)throw new Error(`Missing section: ${start}`);
  const b=source.indexOf(end,a+start.length);if(b<0)throw new Error(`Missing section end: ${end}`);
  return source.slice(0,a)+replacement+'\n'+source.slice(b);
}
function buildUpgrade(source){
  let s=source;
  s=replaceOnce(s,"from './logic.js'",`from '${logicUrl.href}'`);
  s=replaceOnce(s,"from './approvals.js'",`from '${approvalsUrl.href}'`);
  s=`import {monthStart,moveMonth,monthTitle,buildCatalog,tagEvents,buildMonthModel,availableTeams,filtered,drawMonth} from '${monthUrl.href}';\n`+s;
  s=replaceOnce(s,"'AD Command Center'","'Master Schedule'");
  s=replaceOnce(s,"let mode=isCoachView?'week':'overview';","let mode=isCoachView?'month':'overview';");
  s=replaceOnce(s,'let model={events:[],issues:[]};',`let model={events:[],issues:[]};
let monthFocus=monthStart(selected),monthModel={events:[],issues:[]};
let teamFilter='all',teamChoices=[],lastTeamOptions='';`);
  s=replaceSection(s,'function formatWeek(){','function currentIssues(){',`function formatWeek(){
  if(mode==='month')return monthTitle(monthFocus);
  return \`\${niceDate(monday,{month:'short',day:'numeric'})} – \${niceDate(dayOffset(monday,6),{month:'short',day:'numeric',year:'numeric'})}\`;
}
function visible(e){return filtered(e,filter,teamFilter);}
function syncTeamDropdown(){
  const control=$('teamFilter');if(!control)return;
  const choices=teamChoices.filter(t=>filter==='all'||t.traits.school===filter||(filter==='MS'&&t.traits.school==='EL'));
  if(teamFilter!=='all'&&!choices.some(t=>t.key===teamFilter))teamFilter='all';
  const signature=filter+'|'+choices.map(t=>t.key+':'+t.label).join(';');
  if(signature!==lastTeamOptions){
    control.replaceChildren(new Option('All teams','all'),...choices.map(t=>new Option(t.label,t.key)));
    lastTeamOptions=signature;
  }
  control.value=teamFilter;
}
`);
  s=replaceOnce(s,'model=processSchedules(fac,tran,monday);',`const catalog=buildCatalog(fac);
    model=processSchedules(fac,tran,monday);
    model.events=tagEvents(model.events,catalog);
    monthModel=buildMonthModel(fac,tran,monthFocus,catalog);
    teamChoices=availableTeams(catalog,monthFocus,monthModel.events);`);
  s=replaceSection(s,'function renderWeek(events,issues){','function jumpTo(modeName){',`function renderMonth(events,issues){
  drawMonth($('monthDetails'),{
    focus:monthFocus,selected,events,issues,
    onDay:date=>{selected=date;followToday=false;render();},
    onTimeline:date=>{selected=date;monday=mondayFor(new Date(date+'T12:00:00'));followToday=false;mode='timeline';load();}
  });
}`);
  // Today shortcuts must point to the new Month view, not the removed Week view.
  s=s.replaceAll("jumpTo('week')","jumpTo('month')");
  s=s.replaceAll('Use Week to browse other dates.','Use Month to browse other dates.');
  s=replaceOnce(s,'  const events=model.events.filter(visible),issues=currentIssues();',`  syncTeamDropdown();
  const candidateEvents=(mode==='month'?monthModel.events.filter(e=>e.date.slice(0,7)===monthFocus.slice(0,7)):model.events).filter(visible);
  const activeTeamPlaces=new Set(candidateEvents.filter(e=>!e.syntheticSafety).map(e=>e.date+'|'+e.location));
  const events=candidateEvents.filter(e=>!e.syntheticSafety||activeTeamPlaces.has(e.date+'|'+e.location));
  const issues=mode==='month'?monthModel.issues.filter(i=>i.date.slice(0,7)===monthFocus.slice(0,7)&&(filter==='all'||i.group===filter)):currentIssues();
  $('todayBtn').textContent=mode==='month'?'This month':'This week';
  $('prev').setAttribute('aria-label',mode==='month'?'Previous month':'Previous week');
  $('next').setAttribute('aria-label',mode==='month'?'Next month':'Next week');`);
  s=s.replaceAll("['overview','week','timeline','issues']","['overview','month','timeline','issues']");
  s=replaceOnce(s,"  if(mode==='week')renderWeek(events,issues);","  if(mode==='month')renderMonth(events,issues);");
  s=replaceOnce(s,"function setMode(next){mode=isCoachView&&!['week','timeline'].includes(next)?'week':next;render();}",`function setMode(next){
  const target=isCoachView&&!['month','timeline'].includes(next)?'month':next;
  const previous=mode;mode=target;
  if(target==='overview'&&previous==='month'){
    followToday=true;selected=todayIso();monday=mondayFor();monthFocus=monthStart(selected);load();return;
  }
  if(target==='timeline'&&previous==='month'){
    followToday=false;monday=mondayFor(new Date(selected+'T12:00:00'));load();return;
  }
  if(target==='month'&&previous!=='month'){
    monthFocus=monthStart(selected);load();return;
  }
  render();
}`);
  s=replaceSection(s,'function shift(n){','window.addEventListener(\'storage\'',`function shift(n){
  followToday=false;
  if(mode==='month'){
    monthFocus=moveMonth(monthFocus,n);selected=monthStart(monthFocus);
  }else{
    monday=dayOffset(monday,n*7);selected=monday;monthFocus=monthStart(selected);
  }
  load();
}
$('prev').onclick=()=>shift(-1);
$('next').onclick=()=>shift(1);
$('todayBtn').onclick=()=>{followToday=true;monday=mondayFor();selected=todayIso();monthFocus=monthStart(selected);load();};
$('refresh').onclick=()=>load();
$('teamFilter').onchange=e=>{teamFilter=e.target.value;render();};
`);
  s=replaceOnce(s,'if(followToday){monday=mondayFor();selected=todayIso();}',"if(followToday){monday=mondayFor();selected=todayIso();monthFocus=monthStart(selected);}");
  return s;
}

async function boot(){
  try{
    const res=await fetch(`${originalUrl.href}?v=${Date.now()}`,{cache:'no-store'});
    if(!res.ok)throw new Error(`Unable to retrieve app.js (${res.status})`);
    const original=await res.text();
    const patched=buildUpgrade(original);
    const url=URL.createObjectURL(new Blob([patched],{type:'text/javascript'}));
    try{await import(url);}finally{URL.revokeObjectURL(url);}
  }catch(error){
    console.error('SCA Month/Team upgrade:',error);
    const notice=document.getElementById('notice');
    if(notice){notice.hidden=false;notice.textContent='The Month/Team upgrade could not initialize. Existing schedules will load in the standard view. '+error.message;}
    // Keep original dashboard working if GitHub's app layout changes.
    const tab=document.getElementById('monthTab');if(tab){tab.id='weekTab';tab.textContent='Week';}
    const view=document.getElementById('monthView');if(view){view.id='weekView';view.setAttribute('aria-label','Weekly calendar');view.replaceChildren();
      const days=document.createElement('div');days.id='days';days.className='days';
      const details=document.createElement('div');details.id='dayDetails';details.className='day-details';view.append(days,details);
    }
    if(document.getElementById('teamFilter'))document.getElementById('teamFilter').closest('label').hidden=true;
    await import(originalUrl.href);
    const subtitle=document.querySelector('.brand-subtitle');
    if(subtitle&&!document.body.classList.contains('coach-view'))subtitle.textContent='Master Schedule';
  }
}
boot();
