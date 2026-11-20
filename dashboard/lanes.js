// Preserve the existing lane classification, including the source's inferred
// home-game sport lane. Off-campus events never reserve an on-campus facility.
const ON_CAMPUS=/^(?:sca|scottsdale christian(?: academy)?|home)(?:\b|$)/i;
const INDOOR_SPORTS=/volleyball|basketball|wrestling|cheer|gymnastics/i;
function isAwayDescription(detail){return /(?:^|[\s\n])(?:at\s+[a-z]|@\s*[a-z])/i.test(detail||'')&&!/(?:^|[\s\n])(?:at\s+sca|@\s*sca)\b/i.test(detail||'');}
export function laneFor(e){
  if(e.side==='A')return 'away';
  if(e.source==='facilities'){
    if(e.type!=='note'&&isAwayDescription(e.detail))return 'away';
    if(e.location==='Gym')return 'gym';
    return fieldLane(e);
  }
  if(e.source==='transportation'){
    if(e.location&&!ON_CAMPUS.test(e.location))return 'away';
    if(e.facilityLocation==='Gym')return 'gym';
    if(e.facilityLocation==='Field')return fieldLane(e);
    return INDOOR_SPORTS.test(e.team)?'gym':fieldLane(e);
  }
  return e.location==='Gym'?'gym':fieldLane(e);
}
// Baseball uses its own field even when its column is under the main field header.
export function fieldLane(e){
  return e.fieldArea==='baseball'||/baseball/i.test(e.team||'')?'baseball':'field';
}
