import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously, signOut } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore, collection, doc, onSnapshot, setDoc, addDoc, deleteDoc, serverTimestamp, query, orderBy, limit, getDocs, getDocsFromServer, runTransaction } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const ADMIN_PASS='Phille123';
const ADMIN_SESSION='lunchkampen-demo-admin';
function isAdmin(){return sessionStorage.getItem(ADMIN_SESSION)==='1'}
const LUNCHBOX_ID = 'lunchbox-abstain';
const DAYS = ['Måndag','Tisdag','Onsdag','Torsdag','Fredag'];
const DEFAULT_PLACES = [
  {id:'start-pong',name:'PONG'},
  {id:'start-cok',name:'COK'},
  {id:'start-sushi',name:'SUSHI'},
  {id:'start-dedes',name:'DEDES'},
  {id:'start-hemkop',name:'HEMKÖP'},
  {id:'start-by-fiket',name:'BY-FIKET'},
  {id:'start-phils',name:'PHILS'},
  {id:'start-pong-maxi',name:'PONG MAXI'},
  {id:'start-proviant',name:'PROVIANT'},
  {id:'start-mormors',name:'MORMORS'},
  {id:'start-ponte',name:'Ponte'},
  {id:'start-piren',name:'Piren'}
];
const $ = id => document.getElementById(id);
let auth,db,user=null,weekId='',selectedWeekOffset=0,baseWeekId='',activeDay=0,votes=[],suggestions=[],unsubscribeVotes=()=>{},unsubscribePlaces=()=>{},unsubscribeChat=()=>{},unsubscribeReactions=()=>{},reactions=[],ready=false;
const LOGIN_KEY='lunchkampen-account-session';
let displayName='',accountId='',accounts=[],unsubscribeAccounts=()=>{};
const normalName=n=>n.trim().replace(/\s+/g,' ');
function loginDay(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function savedLogin(){try{const value=JSON.parse(localStorage.getItem(LOGIN_KEY)||'null');return value?.day===loginDay()?value:null}catch{return null}}
function applyName(name,id){displayName=name;accountId=id||'';$('voterName').value=name;$('awName').value=name;$('welcomeName').textContent=name}
function gateError(msg){$('entryError').textContent=msg}
$('logoutButton').addEventListener('click',()=>{
 localStorage.removeItem(LOGIN_KEY);
 sessionStorage.removeItem(ADMIN_SESSION);
 $('adminUnlock').hidden=true;
 $('adminPanel').hidden=true;
 $('adminToggle').textContent='🔒 Admin';
 $('loginPassword').value='';
 $('accountSearch').value='';
 $('accountOptions').hidden=true;
 openRegistration(false);
 showLogin();
});
function showLogin(){
 const saved=savedLogin(),found=saved&&accounts.find(x=>x.id===saved.id);
 if(found&&found.active!==false){applyName(found.name,found.id);$('nameGate').hidden=true;return}
 applyName('','');$('nameGate').hidden=false;
}
async function passwordHash(name,password,salt){
 const data=new TextEncoder().encode(salt+'|'+name.toLocaleLowerCase('sv-SE')+'|'+password);
 const bytes=await crypto.subtle.digest('SHA-256',data);
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
function updateAccountOptions(){
 const field=$('accountSearch'),term=field.value.trim().toLocaleLowerCase('sv-SE'),list=$('accountOptions');
 list.replaceChildren();
 const matching=accounts.filter(x=>x.active!==false&&x.name.toLocaleLowerCase('sv-SE').includes(term)).sort((x,y)=>x.name.localeCompare(y.name,'sv'));
 for(const member of matching){
  const option=document.createElement('button');option.type='button';option.className='account-option';option.textContent=member.name;option.setAttribute('role','option');
  option.addEventListener('mousedown',e=>e.preventDefault());
  option.addEventListener('click',()=>{field.value=member.name;list.hidden=true;$('loginPassword').focus()});
  list.append(option);
 }
 if(!matching.length){const empty=document.createElement('div');empty.className='account-option-empty';empty.textContent='Inga matchande användare';list.append(empty)}
 $('accountCount').textContent=matching.length+' användare';
}
function revealAccountOptions(){updateAccountOptions();$('accountOptions').hidden=false}
$('accountSearch').addEventListener('focus',revealAccountOptions);
$('accountSearch').addEventListener('click',revealAccountOptions);
$('accountSearch').addEventListener('input',revealAccountOptions);
$('accountSearch').addEventListener('keydown',e=>{if(e.key==='Escape')$('accountOptions').hidden=true;if(e.key==='ArrowDown'){e.preventDefault();$('accountOptions').querySelector('button')?.focus()}});
$('accountOptions').addEventListener('keydown',e=>{if(e.key==='Escape'){$('accountOptions').hidden=true;$('accountSearch').focus()}});
document.addEventListener('click',e=>{if(!e.target.closest('.account-picker'))$('accountOptions').hidden=true});
function watchAccounts(){
 unsubscribeAccounts();
 unsubscribeAccounts=onSnapshot(collection(db,'accounts'),snapshot=>{
  accounts=snapshot.docs.map(d=>({id:d.id,...d.data()}));
  updateAccountOptions();showLogin();renderAccountAdmin();
 },err=>gateError('Kunde inte läsa användare: '+err.message));
}
function openRegistration(open){$('registerArea').hidden=!open;$('loginArea').hidden=open;gateError('')}
$('showRegister').addEventListener('click',()=>openRegistration(true));
$('showLogin').addEventListener('click',()=>openRegistration(false));
$('accountSearch').addEventListener('input',updateAccountOptions);
$('nameGateForm').addEventListener('submit',async event=>{
 event.preventDefault();
 if(!user)return gateError('Ansluter till Firebase. Försök igen.');
 const found=accounts.find(x=>x.active!==false&&x.name.toLocaleLowerCase('sv-SE')===$('accountSearch').value.trim().toLocaleLowerCase('sv-SE'));
 if(!found)return gateError('Välj ett användarnamn i listan.');
 try{
  const hash=await passwordHash(found.name,$('loginPassword').value,found.salt);
  if(hash!==found.passwordHash)return gateError('Fel lösenord.');
  localStorage.setItem(LOGIN_KEY,JSON.stringify({id:found.id,day:loginDay()}));
  applyName(found.name,found.id);$('nameGate').hidden=true;gateError('');renderResults();renderAwAttendees();
 }catch(err){gateError('Inloggningen misslyckades: '+err.message)}
});
$('registerForm').addEventListener('submit',async event=>{
 event.preventDefault();
 if(!user)return gateError('Ansluter till Firebase. Försök igen.');
 const name=normalName($('registerName').value),password=$('registerPassword').value;
 if(name.length<2||name.length>35)return gateError('Användarnamnet ska ha 2–35 tecken.');
 if(password.length<6)return gateError('Lösenordet måste ha minst 6 tecken.');
 const id=encodeURIComponent(name.toLocaleLowerCase('sv-SE'));
 if(accounts.some(x=>x.id===id))return gateError('Användarnamnet är redan registrerat.');
 try{
  const salt=crypto.randomUUID(),hash=await passwordHash(name,password,salt);
  await setDoc(doc(db,'accounts',id),{name,salt,passwordHash:hash,active:true,createdAt:serverTimestamp()});
  localStorage.setItem(LOGIN_KEY,JSON.stringify({id,day:loginDay()}));
  applyName(name,id);$('nameGate').hidden=true;gateError('');renderResults();
 }catch(err){gateError('Registrering misslyckades: '+err.message)}
});
function renderAccountAdmin(){
 const list=$('adminUsersList');if(!list||!isAdmin())return;
 list.replaceChildren();
 for(const member of accounts.slice().sort((x,y)=>x.name.localeCompare(y.name,'sv'))){
  const row=document.createElement('div');row.className='admin-vote';
  const label=document.createElement('strong');label.textContent=member.name;
  const actions=document.createElement('div');actions.className='admin-user-actions';
  const change=document.createElement('button');change.type='button';change.textContent='Byt lösenord';
  change.addEventListener('click',async()=>{
   const pass=prompt('Nytt lösenord för '+member.name+' (minst 6 tecken):');
   if(pass===null)return;if(pass.length<6){alert('Minst 6 tecken krävs.');return}
   try{await setDoc(doc(db,'accounts',member.id),{passwordHash:await passwordHash(member.name,pass,member.salt)},{merge:true});alert('Lösenord uppdaterat för '+member.name)}
   catch(err){alert('Kunde inte ändra lösenord: '+err.message)}
  });
  const remove=document.createElement('button');remove.type='button';remove.textContent='Ta bort';remove.className='admin-delete';
  remove.addEventListener('click',async()=>{
   if(!confirm('Ta bort kontot '+member.name+'?'))return;
   try{await deleteDoc(doc(db,'accounts',member.id));alert('Användaren borttagen. Tidigare röster finns kvar.')}
   catch(err){alert('Kunde inte ta bort användaren: '+err.message)}
  });
  actions.append(change,remove);row.append(label,actions);list.append(row);
 }
}
showLogin();

function stockholmDate(){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const o=Object.fromEntries(p.map(x=>[x.type,x.value]));
  return new Date(Date.UTC(Number(o.year),Number(o.month)-1,Number(o.day)));
}
function isoWeek(d){
  const x=new Date(d);x.setUTCDate(x.getUTCDate()+4-(x.getUTCDay()||7));
  const year=x.getUTCFullYear(),start=new Date(Date.UTC(year,0,1));
  return {year,week:Math.ceil((((x-start)/86400000)+1)/7)};
}
function workingWeek(){
  const today=stockholmDate(),day=today.getUTCDay();
  // Lördag och söndag visar nästa vecka. Måndag-fredag aktuell vecka.
  if(day===6)today.setUTCDate(today.getUTCDate()+2);
  if(day===0)today.setUTCDate(today.getUTCDate()+1);
  const w=isoWeek(today),monday=new Date(today);
  monday.setUTCDate(today.getUTCDate()-(today.getUTCDay()-1));
  return {id:`${w.year}-W${String(w.week).padStart(2,'0')}`,week:w.week,year:w.year,monday,day:day>=1&&day<=5?day-1:0};
}
function selectedWeek(){
  const current=workingWeek();
  const monday=new Date(current.monday);
  monday.setUTCDate(monday.getUTCDate()+7*selectedWeekOffset);
  const week=isoWeek(monday);
  return {id:`${week.year}-W${String(week.week).padStart(2,'0')}`,year:week.year,week:week.week,monday,day:selectedWeekOffset===0?current.day:0};
}
function voteDeadline(){
  const current=selectedWeek();
  // Selected day belongs to the displayed workweek in Stockholm.
  const target=new Date(current.monday);target.setUTCDate(target.getUTCDate()+activeDay);
  const probe=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth(),target.getUTCDate(),activeDay===4?11:10,activeDay===4?25:55));
  const tz=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Stockholm',timeZoneName:'shortOffset'}).formatToParts(probe).find(x=>x.type==='timeZoneName')?.value||'GMT+1';
  const m=tz.match(/GMT([+-])([0-9]{1,2})(?::([0-9]{2}))?/);
  const offset=m?(m[1]==='+'?1:-1)*(Number(m[2])*60+Number(m[3]||0)):60;
  return new Date(probe.getTime()-offset*60000);
}
function closingTime(){return activeDay===4?'11:25':'10:55'}
const TEST_MODE = false; // Röstningen stängs automatiskt enligt dagens tid.
function votingOpen(){return TEST_MODE || Date.now()<voteDeadline().getTime()}
function updateCountdown(){
 const deadline=voteDeadline().getTime(),seconds=Math.max(0,Math.ceil((deadline-Date.now())/1000)),closed=seconds===0;
 const pad=n=>String(n).padStart(2,'0');
 const label=$('countdown'),title=$('countdownHeading');
 if(label&&title){
  title.textContent=closed?'Dagens kamp är avgjord!':'Röstningen stänger kl. '+closingTime();
  label.textContent=closed?($('winnerName').textContent||'Inväntar resultat'):seconds>359999?Math.ceil(seconds/86400)+' dagar kvar':pad(Math.floor(seconds/3600))+':'+pad(Math.floor(seconds%3600/60))+':'+pad(seconds%60);
  label.classList.toggle('closed',closed);
 }
 const hasVoted=!!accountId&&votes.some(v=>v.accountId===accountId||(!v.accountId&&v.createdBy===user?.uid));
 $('voteButton').disabled=!ready||closed||hasVoted;
 if(closed)$('voteButton').textContent='🏆 DAGENS KAMP ÄR AVGJORD!';
 const undo=$('undoButton');if(undo)undo.disabled=!ready||closed||!hasVoted;
 $('lunchboxButton').disabled=!ready||closed||hasVoted;
 if(closed && !awMode){
  const counts=new Map();for(const v of votes){if(v.restaurantId!==LUNCHBOX_ID)counts.set(v.restaurantId,(counts.get(v.restaurantId)||0)+1)}
  const max=Math.max(0,...counts.values()),leaders=places().filter(p=>max>0&&counts.get(p.id)===max);
  renderTieWheel(leaders);
 }else if($('tieDuel')){$('tieDuel').hidden=true;}
}
function dateLabel(d){return new Intl.DateTimeFormat('sv-SE',{timeZone:'UTC',day:'numeric',month:'short'}).format(d)}
function plural(n){return `${n} ${n===1?'röst':'röster'}`}
function showStatus(message,type=''){const el=$('connection');el.textContent=message;el.className='notice '+type;el.hidden=false}
function showFeedback(id,message,error=false){const el=$(id);el.textContent=message;el.className='feedback'+(error?' error':'')}
function places(){return [...DEFAULT_PLACES,...suggestions].sort((a,b)=>a.name.localeCompare(b.name,'sv'))}
function renderTabs(){
  $('dayTabs').replaceChildren();
  for(let i=0;i<5;i++){
    const button=document.createElement('button');button.type='button';button.className='tab'+(i===activeDay?' active':'');
    button.setAttribute('aria-pressed',String(i===activeDay));
    button.textContent=DAYS[i];button.addEventListener('click',()=>{if(awMode)closeAw(false);activeDay=i;showFeedback('voteFeedback','');watchVotes();watchChat();watchReactions();renderTabs();$('dayTabs').scrollIntoView({behavior:'smooth',block:'start'})});
    $('dayTabs').append(button);
  }
}
function renderPlaces(){
  const previous=$('restaurantSelect').value,sel=$('restaurantSelect');sel.replaceChildren();
  for(const r of places()){const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.name;sel.append(opt)}
  if(places().some(x=>x.id===previous))sel.value=previous;
  const own=$('ownSuggestions');own.replaceChildren();
  const mine=suggestions.filter(r=>r.createdBy===user?.uid);
  if(!mine.length){const p=document.createElement('p');p.className='small';p.textContent='Inga egna förslag ännu.';own.append(p)}
  for(const r of mine){const item=document.createElement('div');item.className='own-entry';const name=document.createElement('span');name.textContent=r.name;const btn=document.createElement('button');btn.className='delete';btn.textContent='Ta bort';btn.type='button';btn.addEventListener('click',async()=>{if(!confirm(`Ta bort ${r.name} ur listan? Historiska röster finns kvar.`))return;try{await deleteDoc(doc(db,'restaurants',r.id));showFeedback('suggestFeedback',`${r.name} borttagen.`)}catch(e){showFeedback('suggestFeedback','Kunde inte ta bort: '+e.message,true)}});item.append(name,btn);own.append(item)}
  renderResults();
}
let lastTieKey='', duelResult=null, unsubscribeDuel=()=>{}, duelGeneration=0, duelAnimating=false;

function duelDocRef(week=weekId,day=activeDay){
 return doc(db,'weeks',week,'days',String(day),'duel','result');
}
function watchDuelResult(){
 unsubscribeDuel();duelResult=null;lastTieKey='';duelAnimating=false;
 const version=++duelGeneration,watchedWeek=weekId,watchedDay=activeDay;
 if(!user)return;
 unsubscribeDuel=onSnapshot(duelDocRef(watchedWeek,watchedDay),snapshot=>{
  if(version!==duelGeneration||watchedWeek!==weekId||watchedDay!==activeDay)return;
  duelResult=snapshot.exists()?snapshot.data():null;
  renderResults();
 },err=>{
  if(version!==duelGeneration)return;
  const out=$('tieOutcome');
  if(out)out.textContent='Kunde inte läsa duellresultatet: '+err.message;
 });
}
function renderTieWheel(leaders){
 const panel=$('tieDuel'),wheel=$('tieWheel'),button=$('tieSpin'),out=$('tieOutcome');
 if(!panel)return;
 // En dag med sparad vinnare förblir avgjord, även om röster raderas senare.
 const recorded=duelResult?.winnerId,ids=duelResult?.optionIds;
 const options=recorded&&Array.isArray(ids)&&ids.length===2
  ?ids.map(id=>places().find(p=>p.id===id)||{id,name:id})
  :leaders;
 if(awMode||votingOpen()||(!recorded&&options.length!==2)){
  panel.hidden=true;lastTieKey='';return;
 }
 panel.hidden=false;
 const key=weekId+'-'+activeDay+'-'+options.map(p=>p.id).sort().join('|');
 if(lastTieKey!==key){
  lastTieKey=key;
  wheel.style.transition='none';wheel.style.transform='rotate(0deg)';
  duelAnimating=false;
 }
 $('tieNameA').textContent=options[0].name;
 $('tieNameB').textContent=options[1].name;
 wheel.style.background='conic-gradient(#b7ef57 0deg 180deg,#cf4aac 180deg 360deg)';
 if(recorded){
  $('tieDuelHeading').textContent='🏆 LUNCHDUELLEN ÄR AVGJORD!';
  button.hidden=true;button.disabled=true;
  if(!duelAnimating)out.textContent='🏆 '+(options.find(p=>p.id===recorded)?.name||recorded)+' vann duellen! Resultatet gäller för alla.';
  return;
 }
 $('tieDuelHeading').textContent='⚔️ LUNCHDUELL – DET ÄR OAVGJORT!';
 button.hidden=false;button.disabled=duelAnimating||!ready;
 if(!duelAnimating)out.textContent='Två restauranger har lika många röster. Första snurret avgör vinnaren för alla.';
 button.onclick=async()=>{
  if(button.disabled||duelResult||votingOpen()||!user)return;
  button.disabled=true;
  const spinningWeek=weekId,spinningDay=activeDay,spinningKey=key;
  const available=options.map(p=>p.id).sort();
  const random=new Uint32Array(1);crypto.getRandomValues(random);
  const selected=available[random[0]%2];
  try{
   // Transaktion: bara den första samtidiga snurrningen får skapa resultatet.
   const winner=await runTransaction(db,async transaction=>{
    const ref=duelDocRef(spinningWeek,spinningDay);
    const snap=await transaction.get(ref);
    if(snap.exists())return snap.data().winnerId;
    transaction.set(ref,{winnerId:selected,optionIds:available,createdBy:user.uid,createdAt:serverTimestamp()});
    return selected;
   });
   if(spinningWeek!==weekId||spinningDay!==activeDay||spinningKey!==lastTieKey)return;
   duelAnimating=true;
   const choice=options.findIndex(p=>p.id===winner);
   const rotations=6*360+(choice===0?270:90);
   wheel.style.transition='none';wheel.style.transform='rotate(0deg)';
   // Force the initial wheel position to render before starting its rotation.
   void wheel.offsetWidth;
   wheel.style.transition='transform 3.8s cubic-bezier(.14,.75,.24,1)';
   wheel.style.transform='rotate('+rotations+'deg)';
   out.textContent='🎡 Duellen avgörs för alla...';
   setTimeout(()=>{
    if(spinningWeek!==weekId||spinningDay!==activeDay||spinningKey!==lastTieKey)return;
    duelAnimating=false;
    wheel.style.transition='none';wheel.style.transform='rotate('+(rotations%360)+'deg)';
    renderResults();
   },3900);
  }catch(err){
   duelAnimating=false;button.disabled=false;
   out.textContent='Kunde inte spara vinnaren: '+err.message+'. Kontrollera Firebase-reglerna.';
  }
 };
}
function renderResults(){
  const ballot=places(),counts=new Map(ballot.map(r=>[r.id,0]));
  for(const v of votes)counts.set(v.restaurantId,(counts.get(v.restaurantId)||0)+1);
  const sorted=ballot.map(r=>({...r,count:counts.get(r.id)||0})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'sv'));
  const max=sorted[0]?.count||0;
  const leaders=sorted.filter(r=>r.count===max&&max>0);
  renderTieWheel(leaders);
  const decidedWinner=duelResult?.winnerId&&places().find(p=>p.id===duelResult.winnerId);
  $('winnerName').textContent=decidedWinner?.name||(leaders.length?leaders.map(r=>r.name).join(' / '):'Inga röster ännu');
  $('winnerVotes').textContent=plural(max);
  $('winnerNote').textContent=decidedWinner?'🏆 Vann dagens utslagsduell!':leaders.length>1?'Delad förstaplats!':max?'Flest röster just nu.':'Bli först med att välja lunchställe.';
  const participants=votes.filter(v=>v.restaurantId!==LUNCHBOX_ID).map(v=>v.voterName||decodeURIComponent(v.nameKey||'')).filter(Boolean).sort((x,y)=>x.localeCompare(y,'sv'));
  const lunchboxPeople=votes.filter(v=>v.restaurantId===LUNCHBOX_ID).map(v=>v.voterName||decodeURIComponent(v.nameKey||'')).filter(Boolean).sort((x,y)=>x.localeCompare(y,'sv'));
  $('participantsTitle').textContent='Vilka ska med på '+DAYS[activeDay].toLowerCase()+'?';
  $('participantsCount').textContent=participants.length+' '+(participants.length===1?'person':'personer');
  const participantList=$('participantList');participantList.replaceChildren();
  if(!participants.length){const empty=document.createElement('p');empty.className='participants-empty';empty.textContent='Ingen har röstat den här dagen ännu.';participantList.append(empty)}
  else for(const person of participants){const tag=document.createElement('span');tag.className='participant-tag';tag.textContent=person;participantList.append(tag)}
  if(lunchboxPeople.length){const box=document.createElement('div');box.className='lunchbox-people';box.textContent='🥪 Matlåda (avstår): '+lunchboxPeople.join(', ');participantList.append(box)}
  $('totalVotes').textContent=plural(votes.length-lunchboxPeople.length);
  $('resultTitle').textContent='Ställningen – '+DAYS[activeDay];
  const list=$('resultList');list.replaceChildren();
  const visibleResults=sorted.filter(r=>r.count>0);
  for(let i=0;i<visibleResults.length;i++){
    const r=visibleResults[i],row=document.createElement('div');row.className='result';
    if(r.count===max&&max>0)row.classList.add('leader');row.dataset.restaurantId=r.id;
    const voters=votes.filter(v=>v.restaurantId===r.id).map(v=>v.voterName||decodeURIComponent(v.nameKey||'')).sort((a,b)=>a.localeCompare(b,'sv'));
    row.title=voters.length?'Röstat: '+voters.join(', '):'Inga röster ännu';row.tabIndex=0;row.setAttribute('aria-label',`${r.name}, ${plural(r.count)}. ${voters.length?'Röstat: '+voters.join(', '):'Inga röster ännu'}`);
    const head=document.createElement('div');head.className='result-head';
    const name=document.createElement('span');name.className='result-name';name.textContent=`${i+1}. ${r.name}${r.count===max&&max>0?' 🏆':''}`;
    const count=document.createElement('span');count.className='result-count';count.textContent=plural(r.count);head.append(name,count);
    const track=document.createElement('div');track.className='track';const fill=document.createElement('div');fill.className='fill';fill.style.width=(max?r.count/max*100:0)+'%';track.append(fill);row.append(head,track);if(voters.length){const names=document.createElement('div');names.className='voter-popover';names.textContent='Röstat: '+voters.join(', ');row.append(names)}
    const reactionWrap=document.createElement('div');reactionWrap.className='inline-reactions';
    const reactionCounts=document.createElement('div');reactionCounts.className='inline-reaction-counts';reactionWrap.append(reactionCounts);
    const reactionButtons=document.createElement('div');reactionButtons.className='inline-reaction-buttons';
    for(const emoji of reactionEmojis){const btn=document.createElement('button');btn.type='button';btn.dataset.emoji=emoji;btn.textContent=emoji;btn.title='Reagera med '+emoji;btn.setAttribute('aria-label','Reagera på '+r.name+' med '+emoji);reactionButtons.append(btn)}
    reactionWrap.append(reactionButtons);row.append(reactionWrap);list.append(row)
  }
  if(!visibleResults.length){const p=document.createElement('p');p.className='empty';p.textContent='Inga röster ännu.';list.append(p)}
  renderReactionCounts();
  renderAdminVotes();
  const hasVoted=!!accountId&&votes.some(v=>v.accountId===accountId||(!v.accountId&&v.createdBy===user?.uid));
  $('paidActions').hidden=!hasVoted||awMode;
  if(!hasVoted)$('swishInfo').hidden=true;
  $('voteButton').disabled=!ready||hasVoted;
  const myChoice=votes.find(v=>v.accountId===accountId||(!v.accountId&&v.createdBy===user?.uid));
  $('voteButton').textContent=hasVoted?(myChoice?.restaurantId===LUNCHBOX_ID?'✓ Du har valt matlåda':'✓ Du har redan röstat på '+DAYS[activeDay].toLowerCase()):'LÄGG MIN RÖST →';
  $('lunchboxButton').disabled=!ready||hasVoted||!votingOpen();
  $('lunchboxButton').textContent=myChoice?.restaurantId===LUNCHBOX_ID?'✓ Du har valt matlåda':'🥪 Jag har matlåda så jag avstår min röst';
  $('voterName').readOnly=true;
  $('voterName').title='Namnet väljs på startsidan';
  const myVote=votes.find(v=>v.accountId===accountId||(!v.accountId&&v.createdBy===user?.uid));
  $('undoButton').hidden=false; // Alltid synlig så användaren hittar funktionen.
  $('undoButton').disabled=!ready||!votingOpen()||!myVote;
  $('undoButton').textContent='↶ Ångra min röst';
  $('undoButton').title=myVote?'Ta bort din röst så att du kan välja igen':'Du behöver först ha en röst registrerad med ditt enhet för vald dag';
  updateCountdown();
}

function renderAdminVotes(){
 const panel=$('adminPanel'),list=$('adminVoteList');
 panel.hidden=!isAdmin();
 if(!isAdmin())return;
 $('adminDayLabel').textContent=DAYS[activeDay]+' · '+$('weekLabel').textContent;
 list.replaceChildren();
 if(!votes.length){list.textContent='Inga röster för denna dag.';return}
 for(const vote of votes.slice().sort((x,y)=>(x.voterName||'').localeCompare(y.voterName||'','sv'))){
  const item=document.createElement('div');item.className='admin-vote';
  const name=document.createElement('span');
  name.textContent=(vote.voterName||'Okänd')+' — '+(vote.restaurantId===LUNCHBOX_ID?'Matlåda':places().find(p=>p.id===vote.restaurantId)?.name||vote.restaurantId);
  const button=document.createElement('button');button.type='button';button.className='admin-delete';button.textContent='Ta bort röst';
  button.addEventListener('click',async()=>{
   if(!isAdmin()||!confirm('Ta bort rösten från '+(vote.voterName||'Okänd')+'?'))return;
   button.disabled=true;
   try{await deleteDoc(doc(db,'weeks',weekId,'days',String(activeDay),'votes',vote.id));showFeedback('adminFeedback','Rösten borttagen.')}
   catch(err){showFeedback('adminFeedback','Kunde inte ta bort rösten: '+err.message,true);button.disabled=false}
  });
  item.append(name,button);list.append(item);
 }
}
$('adminToggle').addEventListener('click',()=>{
 if(isAdmin()){sessionStorage.removeItem(ADMIN_SESSION);$('adminPanel').hidden=true;$('adminToggle').textContent='🔒 Admin';return}
 $('adminUnlock').hidden=false;$('adminPassword').value='';$('adminPassword').focus();
});
$('adminLoginForm').addEventListener('submit',event=>{
 event.preventDefault();
 if($('adminPassword').value!==ADMIN_PASS){$('adminLoginFeedback').textContent='Fel lösenord.';return}
 sessionStorage.setItem(ADMIN_SESSION,'1');$('adminUnlock').hidden=true;$('adminToggle').textContent='🔓 Avsluta admin';
 renderAdminVotes();renderAccountAdmin();$('adminPanel').scrollIntoView({behavior:'smooth'});
});
$('adminCancel').addEventListener('click',()=>{$('adminUnlock').hidden=true});

function myVoteDocId(){return accountId||user?.uid||''}
function makeNameKey(s){return encodeURIComponent(s.trim().replace(/\s+/g,' ').toLocaleLowerCase('sv-SE'))}
function watchVotes(){unsubscribeVotes();watchDuelResult();votes=[];renderResults();if(!user)return;
  const path=collection(db,'weeks',weekId,'days',String(activeDay),'votes');
  unsubscribeVotes=onSnapshot(path,s=>{votes=s.docs.map(d=>({id:d.id,...d.data()}));renderResults();maybeCelebrate()},e=>showStatus('Kunde inte läsa röster: '+e.message,'error'));
}
function watchChat(){
  unsubscribeChat();const list=$('chatMessages');list.replaceChildren();
  if(!user){list.textContent='Ange ditt namn på startsidan för att läsa och skriva i chatten.';return}
  const messages=query(collection(db,'weeks',weekId,'days',String(activeDay),'chat'),orderBy('createdAt','desc'),limit(60));
  unsubscribeChat=onSnapshot(messages,s=>{
    list.replaceChildren();
    const items=s.docs.map(d=>d.data()).reverse();
    if(!items.length){const p=document.createElement('p');p.className='small';p.textContent='Inga meddelanden ännu. Starta snacket!';list.append(p)}
    for(const item of items){
      const el=document.createElement('div');el.className='chat-message';
      const name=document.createElement('strong');name.textContent=item.senderName||'Kollega';
      const msg=document.createElement('p');msg.textContent=item.text||'';
      el.append(name,msg);list.append(el)
    }
    list.scrollTop=list.scrollHeight;
  },e=>{list.textContent='Kunde inte läsa chatten: '+e.message});
}
$('chatForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!user)return showFeedback('chatFeedback','Ange ditt namn på startsidan först.',true);
  const input=$('chatInput'),value=input.value.trim();
  if(!value||value.length>300)return;
  $('chatSend').disabled=true;
  try{
    await addDoc(collection(db,'weeks',weekId,'days',String(activeDay),'chat'),{
      senderName:(displayName||'Kollega').slice(0,60),
      text:value,createdBy:user.uid,createdAt:serverTimestamp()
    });
    input.value='';showFeedback('chatFeedback','');
  }catch(err){showFeedback('chatFeedback','Kunde inte skicka: '+err.message,true)}
  finally{$('chatSend').disabled=false}
});
function refreshWeek(){
  const base=workingWeek();
  if(baseWeekId!==base.id){baseWeekId=base.id;selectedWeekOffset=0;}
  const w=selectedWeek();
  const selector=$('weekSelect');
  const nextMonday=new Date(base.monday);nextMonday.setUTCDate(nextMonday.getUTCDate()+7);
  const next=isoWeek(nextMonday);
  selector.options[0].textContent=`Denna vecka (v.${base.week})`;
  selector.options[1].textContent=`Nästa vecka (v.${next.week})`;
  selector.value=String(selectedWeekOffset);
  if(w.id===weekId)return;
  weekId=w.id;activeDay=w.day;
  $('weekLabel').textContent=`Vecka ${w.week} · ${w.year}`;
  const friday=new Date(w.monday);friday.setUTCDate(friday.getUTCDate()+4);
  $('weekDates').textContent=`${dateLabel(w.monday)} – ${dateLabel(friday)}`;
  renderTabs();watchVotes();watchChat();watchReactions();refreshLeague();watchAwCounts();if(awMode){$('awWeekLabel').textContent=$('weekLabel').textContent;watchAwDay();}showFeedback('voteFeedback','');updateCountdown();
}
$('weekSelect').addEventListener('change',event=>{
  selectedWeekOffset=Number(event.target.value)===1?1:0;
  refreshWeek();
});
$('voterName').addEventListener('input',renderResults);
$('voteForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!ready||!user)return;
  if(!votingOpen())return showFeedback('voteFeedback','Röstningen för denna dag stängde kl. '+closingTime()+'.',true);
  const name=displayName,restaurantId=$('restaurantSelect').value;
  if(name.length<2||name.length>35)return showFeedback('voteFeedback','Ange ett namn med 2–35 tecken.',true);
  if(!places().some(r=>r.id===restaurantId))return showFeedback('voteFeedback','Välj en giltig restaurang.',true);
  refreshWeek();const nameKey=makeNameKey(name);
  $('voteButton').disabled=true;
  try{
    if(votes.some(v=>v.accountId===accountId||(!v.accountId&&v.createdBy===user.uid)))return showFeedback('voteFeedback','Du har redan röstat på den här enheten den här dagen.',true);
    await setDoc(doc(db,'weeks',weekId,'days',String(activeDay),'votes',myVoteDocId()),{nameKey,restaurantId,voterName:name,accountId,createdBy:user.uid,createdAt:serverTimestamp()});
    
    
    showFeedback('voteFeedback',`Tack ${name}! Din röst är sparad.`);
  }catch(err){showFeedback('voteFeedback',err.code==='permission-denied'?'Det namnet har redan röstat denna dag (eller så nekades rösten av säkerhetsreglerna).':'Kunde inte rösta: '+err.message,true)}
  renderResults();
});
$('lunchboxButton').addEventListener('click',async()=>{
  if(!ready||!user||!votingOpen())return;
  const name=displayName;
  if(name.length<2||name.length>35)return showFeedback('voteFeedback','Ange ett namn med 2–35 tecken.',true);
  if(votes.some(v=>v.accountId===accountId||(!v.accountId&&v.createdBy===user.uid)))return showFeedback('voteFeedback','Du har redan gjort ett val för denna dag. Ångra det först.',true);
  const btn=$('lunchboxButton');btn.disabled=true;
  try{
    await setDoc(doc(db,'weeks',weekId,'days',String(activeDay),'votes',myVoteDocId()),{
      nameKey:makeNameKey(name),restaurantId:LUNCHBOX_ID,voterName:name,accountId,createdBy:user.uid,createdAt:serverTimestamp()
    });
    
    
    showFeedback('voteFeedback','🥪 Du har valt matlåda och avstår från restaurangröstningen. Du kan ångra valet.');
  }catch(err){showFeedback('voteFeedback','Kunde inte spara matlåda: '+err.message,true)}
  finally{renderResults()}
});
$('undoButton').addEventListener('click',async()=>{
  const nameKey=makeNameKey($('voterName').value.trim());
  const myVote=votes.find(v=>v.accountId===accountId||(!v.accountId&&v.createdBy===user?.uid));
  if(!myVote)return showFeedback('voteFeedback','Ingen röst är registrerad på den här enheten för den valda dagen.',true);
  if(!votingOpen())return showFeedback('voteFeedback','Röstningen är stängd. Rösten kan inte ändras efter kl. '+closingTime()+'.',true);
  $('undoButton').disabled=true;
  try{
    await deleteDoc(doc(db,'weeks',weekId,'days',String(activeDay),'votes',myVoteDocId()));
    showFeedback('voteFeedback','Din röst är ångrad. Du kan rösta igen.');
  }catch(err){showFeedback('voteFeedback','Kunde inte ångra rösten. Firebase-reglerna måste uppdateras: '+err.message,true)}
  renderResults();
});
$('suggestForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!ready)return;
  const name=$('restaurantName').value.trim().replace(/\s+/g,' ');
  if(name.length<2||name.length>60)return showFeedback('suggestFeedback','Ange ett namn med 2–60 tecken.',true);
  if(places().some(r=>r.name.toLocaleLowerCase('sv-SE')===name.toLocaleLowerCase('sv-SE')))return showFeedback('suggestFeedback','Det stället finns redan i listan.',true);
  $('addButton').disabled=true;
  try{await addDoc(collection(db,'restaurants'),{name,createdBy:user.uid,createdAt:serverTimestamp()});$('restaurantName').value='';showFeedback('suggestFeedback',`${name} har lagts till för alla!`)}
  catch(err){showFeedback('suggestFeedback','Kunde inte lägga till: '+err.message,true)}finally{$('addButton').disabled=false}
});
async function main(){
  if(firebaseConfig.apiKey.startsWith('ERSATT_')){showStatus('För att koppla ihop alla kollegor: fyll i Firebase-inställningarna i firebase-config.js. Se STARTA-HAR.md.','error');$('voteButton').disabled=true;$('addButton').disabled=true;refreshWeek();renderPlaces();return}
  try{
    const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
    // Firebase Anonymous används osynligt för att skilja enheter åt.
    onAuthStateChanged(auth,u=>{
      if(u&&!u.isAnonymous){signOut(auth).catch(err=>showStatus('Kunde inte byta från tidigare inloggning: '+err.message,'error'));return;}
      unsubscribeVotes();unsubscribePlaces();unsubscribeChat();unsubscribeReactions();unsubscribeDuel();duelResult=null;duelGeneration++;awCountUnsubs.forEach(fn=>fn());awCountUnsubs=[];awCountGeneration++;awUnsubAttendees();awUnsubChat();votes=[];suggestions=[];user=u;ready=!!u;

      $('welcomeName').textContent=displayName;
      showLogin();
      $('adminToggle').textContent=isAdmin()?'🔓 Avsluta admin':'🔒 Admin';
      if(u){watchAccounts();
        showStatus('● Ansluten – röster delas med kollegorna','ok');
        unsubscribePlaces=onSnapshot(collection(db,'restaurants'),s=>{suggestions=s.docs.map(d=>({id:d.id,...d.data()}));renderPlaces()},err=>showStatus('Kunde inte läsa restauranger: '+err.message,'error'));
        watchVotes();watchChat();watchReactions();refreshLeague();watchAwCounts();if(awMode)watchAwDay();
      } else {showStatus('Ansluter till röstningen ...');signInAnonymously(auth).catch(err=>showStatus('Anslutning misslyckades. Kontrollera att Anonymous är aktiverat i Firebase: '+err.message,'error'));}
      if(!u){unsubscribeAccounts();accounts=[];updateAccountOptions();showLogin()}
      renderPlaces();renderResults();renderAwTabs();if(!u){awAttendees=[];renderAwAttendees();}
    });
    setInterval(refreshWeek,60000);
    setInterval(refreshLeague,300000);
    setInterval(fetchAwCounts,20000);
    setInterval(updateCountdown,1000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){showLogin();refreshWeek();fetchAwCounts()}});
  }catch(err){showStatus('Fel vid anslutning: '+err.message,'error')}
}

let leagueLoading=false,rouletteTimer=null,lastCelebrationKey='';
const reactionEmojis=['🔥','😍','🤮','💸'];
$('rouletteSpin').addEventListener('click',()=>{
 const all=places();if(!all.length)return;
 if(rouletteTimer)clearInterval(rouletteTimer);
 let ticks=0;$('rouletteSpin').disabled=true;
 rouletteTimer=setInterval(()=>{
   const item=all[Math.floor(Math.random()*all.length)];
   $('rouletteResult').textContent='🎰 '+item.name;
   if(++ticks>=19){clearInterval(rouletteTimer);rouletteTimer=null;$('rouletteSpin').disabled=false;$('rouletteResult').textContent='🎉 Lunchroulette valde '+item.name+'!'}
 },90);
});
function renderReactionCounts(){
  for(const row of $('resultList').querySelectorAll('.result[data-restaurant-id]')){
    const id=row.dataset.restaurantId;
    const counts=row.querySelector('.inline-reaction-counts');
    counts.replaceChildren();
    for(const emoji of reactionEmojis){
      const count=reactions.filter(r=>r.restaurantId===id&&r.emoji===emoji).length;
      if(count){const label=document.createElement('span');label.textContent=emoji+' '+count;counts.append(label)}
    }
    for(const button of row.querySelectorAll('.inline-reaction-buttons button')){
      button.disabled=!ready;
      button.classList.toggle('selected',reactions.some(r=>r.restaurantId===id&&r.emoji===button.dataset.emoji&&r.createdBy===user?.uid));
    }
  }
}
function watchReactions(){
  unsubscribeReactions();reactions=[];renderReactionCounts();if(!user)return;
  unsubscribeReactions=onSnapshot(collection(db,'weeks',weekId,'days',String(activeDay),'reactions'),snapshot=>{
    reactions=snapshot.docs.map(d=>d.data());renderReactionCounts();
  },err=>showStatus('Kunde inte läsa reaktioner: '+err.message,'error'));
}
$('resultList').addEventListener('click',async event=>{
 const button=event.target.closest('.inline-reaction-buttons button[data-emoji]');
 if(!button||!user||button.disabled)return;
 const row=button.closest('.result'),restaurantId=row?.dataset.restaurantId,emoji=button.dataset.emoji;
 if(!restaurantId)return;
 const mine=reactions.find(r=>r.createdBy===user.uid&&r.restaurantId===restaurantId);
 const ref=doc(db,'weeks',weekId,'days',String(activeDay),'reactions',user.uid+'_'+restaurantId);
 button.disabled=true;
 try{
   if(mine?.emoji===emoji)await deleteDoc(ref);
   else await setDoc(ref,{createdBy:user.uid,restaurantId,emoji});
 }catch(err){showStatus('Kunde inte spara reaktion: '+err.message,'error')}
 finally{button.disabled=false;renderReactionCounts()}
});
async function refreshLeague(){
 if(leagueLoading||!user)return;
 leagueLoading=true;
 const current=selectedWeek(),days=[];
 for(let w=0;w<4;w++){
  const monday=new Date(current.monday);monday.setUTCDate(monday.getUTCDate()-7*w);
  const iw=isoWeek(monday),id=iw.year+'-W'+String(iw.week).padStart(2,'0');
  for(let day=0;day<5;day++)days.push({id,day,date:new Date(monday.getTime()+day*86400000).getTime()});
 }
 try{
  const snapshots=await Promise.all(days.map(x=>getDocs(collection(db,'weeks',x.id,'days',String(x.day),'votes'))));
  if(!user)return;
  const scores=new Map(),myDates=new Set();
  snapshots.forEach((snap,i)=>snap.forEach(d=>{
   const v=d.data();if(v.restaurantId===LUNCHBOX_ID)return;
   if(!v.createdAt?.toMillis||v.createdAt.toMillis()<Date.parse('2026-11-02T21:29:00Z'))return;
   const key=v.createdBy||v.nameKey;if(!key)return;
   const display=v.voterName||decodeURIComponent(v.nameKey||'Okänd');
   const current=scores.get(key)||{name:display,score:0};
   current.score++;current.name=display;scores.set(key,current);
   if(v.createdBy===user.uid)myDates.add(days[i].date);
  }));
  const ranked=[...scores.values()].sort((x,y)=>y.score-x.score||x.name.localeCompare(y.name,'sv')).slice(0,10);
  const list=$('leagueList');list.replaceChildren();
  if(!ranked.length)list.textContent='Inga röster ännu.';
  for(let i=0;i<ranked.length;i++){const line=document.createElement('div');line.className='league-entry';line.textContent=(i+1)+'. '+ranked[i].name+' — '+ranked[i].score+' poäng';list.append(line)}
  const dates=days.map(x=>x.date).sort((x,y)=>y-x);
  let streak=0,started=false;
  for(const date of dates){if(myDates.has(date)){streak++;started=true}else if(started)break}
  $('streakStatus').textContent=(streak>=10?'👑':streak>=5?'🥇':streak>=3?'🔥':'🍽️')+' '+streak+' dagar i följd (senaste fyra veckorna)';
 }catch(err){$('leagueList').textContent='Kunde inte läsa lunchligan: '+err.message}
 finally{leagueLoading=false}
}
function maybeCelebrate(){
 const today=stockholmDate(),iso=selectedWeek();
 const selectedDate=new Date(iso.monday);selectedDate.setUTCDate(selectedDate.getUTCDate()+activeDay);
 const counts=new Map();
 votes.filter(v=>v.restaurantId!==LUNCHBOX_ID).forEach(v=>counts.set(v.restaurantId,(counts.get(v.restaurantId)||0)+1));
 const max=Math.max(0,...counts.values());if(!max)return;
 const key=weekId+'-'+activeDay+'-'+max;
 // Firandet visas när man själv väljer en avslutad dag, aldrig automatiskt vid varje omröstning.
 if(selectedDate>=today||key===lastCelebrationKey)return;
 lastCelebrationKey=key;
 const leaders=places().filter(p=>counts.get(p.id)===max).map(p=>p.name);
 $('celebrationWinner').textContent=leaders.join(' / ')+' – '+max+' röster';
 $('winnerCelebration').hidden=false;
}
$('celebrationClose').addEventListener('click',()=>{$('winnerCelebration').hidden=true});


let awDay=4,awMode=false,awAttendees=[],awCounts=[0,0,0,0,0],awCountUnsubs=[],awUnsubAttendees=()=>{},awUnsubChat=()=>{},awCountWeek='',awCountGeneration=0;
function awAttendeeRef(){return doc(db,'weeks',weekId,'days',String(awDay),'awAttendees',user.uid)}
function renderAwTabs(){
 const nav=$('awTabs');nav.replaceChildren();
 DAYS.forEach((day,i)=>{
  const btn=document.createElement('button');btn.type='button';btn.className='aw-tab'+(awMode&&awDay===i?' active':'');
  const label=document.createElement('strong');label.textContent=day+' AW';
  const sub=document.createElement('span');sub.textContent=awCounts[i]+' '+(awCounts[i]===1?'anmäld':'anmälda');
  btn.append(label,sub);btn.addEventListener('click',()=>openAw(i));nav.append(btn);
 });
}
function renderAwAttendees(){
 const list=$('awAttendeeList');list.replaceChildren();
 const people=awAttendees.slice().sort((x,y)=>(x.name||'').localeCompare(y.name||'','sv'));
 if(!people.length){list.textContent='Ingen har anmält sig ännu. Bli först!';}
 for(const person of people){const el=document.createElement('span');el.className='aw-person';el.textContent='🥳 '+(person.name||'Kollega');list.append(el)}
 $('awCount').textContent=people.length+' '+(people.length===1?'anmäld':'anmälda');
 const own=people.find(p=>p.createdBy===user?.uid);
 $('awJoin').disabled=!ready||!!own;
 $('awJoin').textContent=own?'✓ Du är anmäld':'🥳 Jag är på!';
 $('awLeave').hidden=!own;
 $('awName').readOnly=true;
 if(own)$('awName').value=own.name;
}
async function fetchAwCounts(){
 if(!user||!weekId)return;
 const currentWeek=weekId,version=awCountGeneration;
 try{
  const results=await Promise.all(DAYS.map((_,day)=>getDocsFromServer(collection(db,'weeks',currentWeek,'days',String(day),'awAttendees'))));
  if(version!==awCountGeneration||currentWeek!==weekId||!user)return;
  awCounts=results.map(result=>result.size);
  renderAwTabs();
 }catch(err){console.warn('AW counters could not refresh from server',err)}
}
function watchAwCounts(){
 awCountUnsubs.forEach(unsub=>unsub());awCountUnsubs=[];
 awCountWeek=weekId;const currentWeek=weekId,version=++awCountGeneration;
 if(!user){awCounts=[0,0,0,0,0];renderAwTabs();return}
 // Live listeners start immediately, before anyone opens an AW-day.
 for(let day=0;day<5;day++){
  const unsubscribe=onSnapshot(collection(db,'weeks',currentWeek,'days',String(day),'awAttendees'),snap=>{
   if(version!==awCountGeneration||currentWeek!==weekId)return;
   awCounts[day]=snap.size;renderAwTabs();
  },err=>showStatus('Kunde inte uppdatera AW-antal: '+err.message,'error'));
  awCountUnsubs.push(unsubscribe);
 }
 // Fetch server data on page load as well as through realtime listeners.
 fetchAwCounts();
}
function watchAwDay(){
 awUnsubAttendees();awUnsubChat();awAttendees=[];renderAwAttendees();
 const list=$('awChatMessages');list.replaceChildren();
 if(!user){list.textContent='Ange ditt namn på startsidan för att se AW-anmälningar och chatta.';return}
 awUnsubAttendees=onSnapshot(collection(db,'weeks',weekId,'days',String(awDay),'awAttendees'),snap=>{
  awAttendees=snap.docs.map(d=>d.data());awCounts[awDay]=snap.size;renderAwAttendees();renderAwTabs();
 },err=>showFeedback('awFeedback','Kunde inte läsa anmälningar: '+err.message,true));
 const messages=query(collection(db,'weeks',weekId,'days',String(awDay),'awChat'),orderBy('createdAt','desc'),limit(60));
 awUnsubChat=onSnapshot(messages,snap=>{
  list.replaceChildren();const items=snap.docs.map(d=>d.data()).reverse();
  if(!items.length)list.textContent='Inga meddelanden ännu. Starta AW-snacket!';
  for(const msg of items){const el=document.createElement('div');el.className='aw-message';const by=document.createElement('strong');by.textContent=msg.senderName||'Kollega';const text=document.createElement('p');text.textContent=msg.text||'';el.append(by,text);list.append(el)}
  list.scrollTop=list.scrollHeight;
 },err=>{list.textContent='Kunde inte läsa AW-chatten: '+err.message});
}
function openAw(day){
 awDay=day;awMode=true;document.body.classList.add('aw-mode');$('awPage').hidden=false;
 $('awTitle').textContent=DAYS[day]+' AW 🎉';$('awWeekLabel').textContent=$('weekLabel').textContent;
 $('awName').value=displayName;
 renderAwTabs();watchAwDay();$('awPage').scrollIntoView({behavior:'smooth',block:'start'});
}
function closeAw(scrollBack=true){
 awMode=false;document.body.classList.remove('aw-mode');$('awPage').hidden=true;
 awUnsubAttendees();awUnsubChat();renderAwTabs();if(scrollBack)$('awTabs').scrollIntoView({behavior:'smooth'});
}
$('awBack').addEventListener('click',closeAw);
$('awJoin').addEventListener('click',async()=>{
 if(!user)return showFeedback('awFeedback','Ange ditt namn på startsidan först.',true);
 const name=$('awName').value.trim().replace(/\s+/g,' ');
 if(name.length<2||name.length>35)return showFeedback('awFeedback','Skriv ett namn med 2–35 tecken.',true);
 if(awAttendees.some(p=>p.createdBy===user.uid))return;
 $('awJoin').disabled=true;
 try{
  await setDoc(awAttendeeRef(),{name,createdBy:user.uid,createdAt:serverTimestamp()});
  showFeedback('awFeedback','🥳 Du är anmäld till '+DAYS[awDay]+' AW!');
 }catch(err){showFeedback('awFeedback','Kunde inte anmäla: '+err.message,true)}
 finally{renderAwAttendees()}
});
$('awLeave').addEventListener('click',async()=>{
 if(!user)return;
 $('awLeave').disabled=true;
 try{await deleteDoc(awAttendeeRef());showFeedback('awFeedback','Din AW-anmälan har tagits bort.')}
 catch(err){showFeedback('awFeedback','Kunde inte avanmälas: '+err.message,true)}
 finally{$('awLeave').disabled=false}
});
$('awChatForm').addEventListener('submit',async event=>{
 event.preventDefault();if(!user)return showFeedback('awChatFeedback','Ange ditt namn på startsidan först.',true);
 const input=$('awChatInput'),message=input.value.trim();if(!message||message.length>300)return;
 $('awChatSend').disabled=true;
 try{
  await addDoc(collection(db,'weeks',weekId,'days',String(awDay),'awChat'),{senderName:(displayName||'Kollega').slice(0,60),text:message,createdBy:user.uid,createdAt:serverTimestamp()});
  input.value='';showFeedback('awChatFeedback','');
 }catch(err){showFeedback('awChatFeedback','Kunde inte skicka: '+err.message,true)}
 finally{$('awChatSend').disabled=false}
});

refreshWeek();renderPlaces();updateCountdown();main();

function showSwishOption(action){
 const boost=action==='boost',amount=boost?10:99;
 $('swishHeading').textContent=boost?'🚀 Boosta din röst':'🛑 Veto för dagen';
 $('swishAmount').textContent=amount+' kr';
 $('swishMessage').textContent='Meddelande: LUNCHKAMPEN '+(boost?'BOOST':'VETO')+' '+DAYS[activeDay]+' '+$('weekLabel').textContent+' – '+displayName;
 $('swishInfo').hidden=false;
 $('swishInfo').scrollIntoView({behavior:'smooth',block:'nearest'});
}
$('boostAction').addEventListener('click',()=>showSwishOption('boost'));
$('vetoAction').addEventListener('click',()=>showSwishOption('veto'));
$('copySwish').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText('0734282337');$('copySwish').textContent='✓ Kopierat!'}
 catch{window.prompt('Kopiera Swish-numret:','0734282337')}
});
