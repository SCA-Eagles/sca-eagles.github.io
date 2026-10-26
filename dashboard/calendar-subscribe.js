// SCA Athletics: live team calendar subscription links.
// A read-only .ics feed is regenerated each successful schedule refresh.
const qs=id=>document.getElementById(id);
const picker=qs('teamFilter');
const apple=qs('subscribeApple');
const copy=qs('subscribeCopy');
const title=qs('subscribeLabel');
const info=qs('subscribeHint');
let manifest=null;
let currentUrl='';

function selection(){
  if(!manifest)return null;
  const key=picker?.value||'all';
  const selected=key==='all' ? manifest.all : manifest.teams.find(t=>t.key===key);
  // Refreshes can briefly reset the team's selection. Make "All Athletics"
  // the explicit fallback only when the filter itself says "All teams".
  return selected||null;
}
function paint(){
  const item=selection();
  currentUrl=item?.url||'';
  const label=item ? item.label : 'Choose an available team';
  title.textContent=item && picker?.value==='all' ? 'All SCA Athletics' : label;
  if(item){
    apple.href='webcal:'+new URL(item.url).href.slice('https:'.length);
    apple.removeAttribute('aria-disabled');
    copy.disabled=false;
    info.textContent='Apple Calendar: tap Subscribe. Google Calendar: copy the link and add it using Other calendars → From URL on calendar.google.com.';
  }else{
    apple.removeAttribute('href');apple.setAttribute('aria-disabled','true');
    copy.disabled=true;
    info.textContent=manifest?'This team does not have a subscription feed yet.':'Loading subscription links…';
  }
}
async function writeClipboard(str){
  if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(str);
  const field=document.createElement('textarea');field.value=str;field.style.position='fixed';field.style.opacity='0';
  document.body.append(field);field.select();let ok=document.execCommand('copy');field.remove();
  if(!ok)throw Error('Clipboard unavailable');
}
if(picker&&apple&&copy&&title&&info){
  picker.addEventListener('change',paint);
  new MutationObserver(paint).observe(picker,{childList:true});
  document.querySelectorAll('#prev,#next,#todayBtn,#refresh,#filter').forEach(el=>el.addEventListener('click',()=>setTimeout(paint,150)));
  copy.addEventListener('click',async()=>{
    if(!currentUrl)return;
    try{await writeClipboard(currentUrl);info.textContent='Calendar link copied. In Google Calendar on a computer: Other calendars → + → From URL, then paste.';}
    catch{window.prompt('Copy this calendar link:',currentUrl);}
  });
  paint();
  try{
    const response=await fetch('./calendars/index.json?v='+Date.now(),{cache:'no-store'});
    if(!response.ok)throw Error('Calendar subscriptions have not been published yet');
    manifest=await response.json();paint();
  }catch(error){info.textContent='Subscriptions are temporarily unavailable. Check again after the next successful schedule refresh.';}
}
