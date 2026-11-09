import {matchGame} from './game-match.js';
let dataPromise;
function loadLocations(){
 if(!dataPromise)dataPromise=fetch('./game-locations.json?v='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Unavailable');return r.json();}).catch(()=>{dataPromise=null;return null;});
 return dataPromise;
}
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
function officialLink(url){try{const u=new URL(url);return u.protocol==='https:'&&['azpreps365.com','www.quickscores.com'].includes(u.hostname)?u.href:null;}catch{return null;}}
let dialog,content,heading,request=0;
function setup(){
 if(dialog)return;
 const style=node('style');style.textContent=`
 .game-clickable{cursor:pointer}.game-clickable:hover{outline:2px solid #a9bdd1;outline-offset:2px}.game-clickable:focus-visible{outline:3px solid #e2a338;outline-offset:3px}
 .game-open-hint{display:block;font-size:11px;font-weight:700;color:#345c82;margin-top:7px}
 .game-dialog{box-sizing:border-box;border:1px solid #cbd9e7;border-radius:18px;padding:24px;width:min(480px,calc(100% - 28px));max-height:85dvh;overflow:auto;color:#102e51;box-shadow:0 24px 80px #0004;font-family:inherit}
 .game-dialog::backdrop{background:#071b35a8}.game-dialog h2{margin:0 44px 14px 0;font-size:21px}.game-dialog p{line-height:1.5}.game-dialog dt{font-size:12px;font-weight:800;color:#5e7186;margin-top:18px}.game-dialog dd{margin:5px 0;font-size:16px}.game-dialog a{display:inline-block;color:#154c80;margin:8px 12px 0 0}.game-dialog .directions{background:#102e51;color:white;padding:12px 16px;border-radius:9px;text-decoration:none}.game-dialog .close-game{position:absolute;right:15px;top:13px;font:inherit;font-size:24px;width:40px;height:40px;border:0;border-radius:50%;background:#eef3f8;cursor:pointer}.game-source-note{font-size:12px;color:#5e7186}
 `;document.head.append(style);
 dialog=node('dialog');dialog.className='game-dialog';dialog.setAttribute('aria-labelledby','game-details-title');
 heading=node('h2');heading.id='game-details-title';const close=node('button','×');close.type='button';close.className='close-game';close.setAttribute('aria-label','Close game details');close.onclick=()=>dialog.close();
 content=node('div');content.setAttribute('aria-live','polite');dialog.append(heading,close,content);document.body.append(dialog);
 dialog.addEventListener('close',()=>{request++;});
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
}
export async function showGame(e){
 setup();const current=++request;heading.textContent=e.team;content.replaceChildren(node('p','Checking official game details…'));if(!dialog.open)dialog.showModal();
 const data=await loadLocations();if(current!==request||!dialog.open)return;
 content.replaceChildren(node('p',new Date(e.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})));
 const stale=data&&(!Number.isFinite(Date.parse(data.checkedAt))||Date.now()-Date.parse(data.checkedAt)>36*60*60*1000);
 const match=data&&!stale?matchGame(e,data.records||[]):null;
 const dl=node('dl');for(const [label,value]of [['Location',match?.venue||'Location not listed'],['Address',match?.address||'Address not listed']]){dl.append(node('dt',label),node('dd',value));}content.append(dl);
 if(match){
  if(match.opponent)content.prepend(node('p','vs '+match.opponent));
  if(match.address){const a=node('a','Get Directions');a.className='directions';a.href='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(match.address);a.target='_blank';a.rel='noopener noreferrer';content.append(a);}
  for(const [label,url]of [[`View on ${match.source}`,match.sourceUrl],['Address source',match.addressSourceUrl]]){const href=officialLink(url);if(href){const a=node('a',label);a.href=href;a.target='_blank';a.rel='noopener noreferrer';content.append(a);}}
 }else{
  content.append(node('p',!data||stale?'Official game details are temporarily unavailable.':'No unique official listing matched this game.'));
  const a=node('a',/\bHS\b/i.test(e.team)?'Check AZPreps365':'Check QuickScores');a.href=/\bHS\b/i.test(e.team)?'https://azpreps365.com/schools/scottsdalechristian':'https://www.quickscores.com/ccsl';a.target='_blank';a.rel='noopener noreferrer';content.append(a);
 }
 const note=node('p','Locations and addresses come only from AZPreps365 or QuickScores. Missing details are never inferred.');note.className='game-source-note';content.append(note);
}
export function enableGameDetails(element,event,{hint=true}={}){
 if(event.type!=='game')return;
 element.classList.add('game-clickable');element.tabIndex=0;element.setAttribute('role','button');element.setAttribute('aria-haspopup','dialog');element.setAttribute('aria-label',`Game details: ${event.team}, ${event.date}`);
 element.addEventListener('click',()=>showGame(event));element.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showGame(event);}});
 if(hint){const label=node('span','View game details →');label.className='game-open-hint';(element.querySelector('.body')||element).append(label);}
 setup();
}
