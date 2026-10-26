import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';
import makeFetchCookie from 'fetch-cookie';
import { CookieJar } from 'tough-cookie';
import { generateCalendars } from './calendars.mjs';

// SharePoint links are stored as GitHub Actions repository secrets, not in code.
const sources = {
  facilities: {label: 'Field & Gym Schedule', url: process.env.SCA_FACILITIES_URL},
  transportation: {label: 'Transportation Schedule', url: process.env.SCA_TRANSPORTATION_URL}
};
const siteDir = path.resolve('_site');
const dataDir = path.resolve('data');
const sports = /\b(?:football|volleyball|soccer|baseball|softball|basketball|golf|swim(?:ming)?|tennis|track|wrestling|spiritline|cheer)\b|cross[\s-]*country/i;
const headers = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
  accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/ms-excel,application/octet-stream,text/html;q=0.9,*/*;q=0.8',
  'cache-control': 'no-cache'
};
function downloadableUrl(url){const u=new URL(url);u.searchParams.set('download','1');return u.toString();}
async function fetchWorkbook(url){
  if(!url)throw new Error('Missing workbook source secret');
  const cookieFetch=makeFetchCookie(fetch,new CookieJar());
  const landing=await cookieFetch(url,{headers:{...headers,accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'},redirect:'follow'});
  const response=await cookieFetch(downloadableUrl(url),{headers:{...headers,referer:landing.url||url},redirect:'follow'});
  if(!response.ok)throw new Error(`Workbook download failed with HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length<4||bytes[0]!==0x50||bytes[1]!==0x4b)throw new Error('Workbook link did not return an XLSX file');
  return bytes;
}
function workbookToData(bytes){
  const wb=XLSX.read(bytes,{type:'buffer',cellDates:true});
  let sheets=wb.SheetNames.map(name=>({name,rows:XLSX.utils.sheet_to_json(wb.Sheets[name],{
    header:1,defval:'',raw:false,dateNF:'m/d/yyyy h:mm AM/PM'
  })}));
  return sheets;
}
function athleticsOnly(sheets){
  const t=sheets.find(s=>s.name==='2026-2027 Transportation');
  if(!t)throw new Error('Current-year 2026-2027 Transportation tab is missing');
  const [head,...rows]=t.rows;
  return [{name:t.name,rows:[head,...rows.filter(row=>sports.test(String(row[1]||'')))]}];
}
const fetchedAt=new Date().toISOString();
await fs.rm(siteDir,{recursive:true,force:true});
await fs.mkdir(siteDir,{recursive:true});
await fs.mkdir(dataDir,{recursive:true});
const statuses=[];
for(const [key,source] of Object.entries(sources)){
  try{
    const bytes=await fetchWorkbook(source.url);
    const allSheets=workbookToData(bytes);
    const sheets=key==='transportation'?athleticsOnly(allSheets):allSheets;
    const payload={ok:true,source:key,label:source.label,fetchedAt,sheetNames:sheets.map(s=>s.name),sheets};
    const data=JSON.stringify(payload,null,2);
    await fs.writeFile(path.join(siteDir,`${key}.json`),data);
    await fs.writeFile(path.join(dataDir,`${key}.json`),data);
    statuses.push({key,label:source.label,ok:true,fetchedAt,sheetNames:payload.sheetNames});
    console.log(`${key}: ${sheets.length} sheet(s) ready`);
  }catch(err){
    const message=err?.message||'Workbook refresh failed';
    const safeMessage=message.replace(/https?:\/\/\S+/g,'[source link hidden]');
    statuses.push({key,label:source.label,ok:false,fetchedAt,error:safeMessage});
    console.error(`${key}: ${safeMessage}`);
    // Site loads this status but will not publish any personal source link.
    await fs.writeFile(path.join(siteDir,`${key}.json`),JSON.stringify({ok:false,source:key,fetchedAt,error:safeMessage}));
  }
}
await fs.writeFile(path.join(siteDir,'status.json'),JSON.stringify({fetchedAt,schedules:statuses},null,2));
await fs.writeFile(path.join(dataDir,'status.json'),JSON.stringify({fetchedAt,schedules:statuses},null,2));
await fs.writeFile(path.join(siteDir,'.nojekyll'),'');
if(statuses.some(s=>!s.ok))throw new Error('One or more athletic workbooks could not be refreshed');
const fac=JSON.parse(await fs.readFile(path.join(dataDir,'facilities.json'),'utf8'));
const tran=JSON.parse(await fs.readFile(path.join(dataDir,'transportation.json'),'utf8'));
await generateCalendars(fac,tran,siteDir,fetchedAt);
