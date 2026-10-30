import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore, collection, doc, onSnapshot, setDoc, addDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const DAYS = ['Måndag','Tisdag','Onsdag','Torsdag','Fredag'];
const DEFAULT_PLACES = [
  {id:'start-sushi-yama',name:'Sushi Yama'},
  {id:'start-pizzeria-milano',name:'Pizzeria Milano'},
  {id:'start-thai-house',name:'Thai House'},
  {id:'start-burger-king',name:'Burger King'},
  {id:'start-indian-garden',name:'Indian Garden'}
];
const $ = id => document.getElementById(id);
let auth,db,user=null,weekId='',activeDay=0,votes=[],suggestions=[],unsubscribeVotes=()=>{},unsubscribePlaces=()=>{},ready=false;
const savedName = localStorage.getItem('lunch-name') || '';
$('voterName').value=savedName;

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
    button.textContent=DAYS[i];button.addEventListener('click',()=>{activeDay=i;showFeedback('voteFeedback','');watchVotes();renderTabs()});
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
function renderResults(){
  const ballot=places(),counts=new Map(ballot.map(r=>[r.id,0]));
  for(const v of votes)counts.set(v.restaurantId,(counts.get(v.restaurantId)||0)+1);
  const sorted=ballot.map(r=>({...r,count:counts.get(r.id)||0})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'sv'));
  const max=sorted[0]?.count||0;
  const leaders=sorted.filter(r=>r.count===max&&max>0);
  $('winnerName').textContent=leaders.length?leaders.map(r=>r.name).join(' / '):'Inga röster ännu';
  $('winnerVotes').textContent=plural(max);
  $('winnerNote').textContent=leaders.length>1?'Delad förstaplats!':max?'Flest röster just nu.':'Bli först med att välja lunchställe.';
  $('totalVotes').textContent=plural(votes.length);
  $('resultTitle').textContent='Ställningen – '+DAYS[activeDay];
  const list=$('resultList');list.replaceChildren();
  for(let i=0;i<sorted.length;i++){
    const r=sorted[i],row=document.createElement('div');row.className='result';
    const head=document.createElement('div');head.className='result-head';
    const name=document.createElement('span');name.className='result-name';name.textContent=`${i+1}. ${r.name}${r.count===max&&max>0?' 🏆':''}`;
    const count=document.createElement('span');count.className='result-count';count.textContent=plural(r.count);head.append(name,count);
    const track=document.createElement('div');track.className='track';const fill=document.createElement('div');fill.className='fill';fill.style.width=(max?r.count/max*100:0)+'%';track.append(fill);row.append(head,track);list.append(row)
  }
  if(!sorted.length){const p=document.createElement('p');p.className='empty';p.textContent='Inga restauranger tillagda.';list.append(p)}
  const nameKey=makeNameKey($('voterName').value.trim());
  const hasVoted=!!nameKey&&votes.some(v=>v.nameKey===nameKey);
  $('voteButton').disabled=!ready||hasVoted;
  $('voteButton').textContent=hasVoted?'✓ Du har redan röstat på '+DAYS[activeDay].toLowerCase():'LÄGG MIN RÖST →';
}
function makeNameKey(s){return encodeURIComponent(s.trim().replace(/\s+/g,' ').toLocaleLowerCase('sv-SE'))}
function watchVotes(){unsubscribeVotes();votes=[];renderResults();if(!user)return;
  const path=collection(db,'weeks',weekId,'days',String(activeDay),'votes');
  unsubscribeVotes=onSnapshot(path,s=>{votes=s.docs.map(d=>d.data());renderResults()},e=>showStatus('Kunde inte läsa röster: '+e.message,'error'));
}
function refreshWeek(){const w=workingWeek();if(w.id===weekId)return;
  weekId=w.id;activeDay=w.day;$('weekLabel').textContent=`Vecka ${w.week} · ${w.year}`;
  const friday=new Date(w.monday);friday.setUTCDate(friday.getUTCDate()+4);
  $('weekDates').textContent=`${dateLabel(w.monday)} – ${dateLabel(friday)}`;
  renderTabs();watchVotes();showFeedback('voteFeedback','');
}
$('voterName').addEventListener('input',renderResults);
$('voteForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!ready)return;
  const name=$('voterName').value.trim().replace(/\s+/g,' '),restaurantId=$('restaurantSelect').value;
  if(name.length<2||name.length>35)return showFeedback('voteFeedback','Ange ett namn med 2–35 tecken.',true);
  if(!places().some(r=>r.id===restaurantId))return showFeedback('voteFeedback','Välj en giltig restaurang.',true);
  refreshWeek();const nameKey=makeNameKey(name);
  $('voteButton').disabled=true;
  try{
    await setDoc(doc(db,'weeks',weekId,'days',String(activeDay),'votes',nameKey),{nameKey,restaurantId,createdBy:user.uid,createdAt:serverTimestamp()});
    localStorage.setItem('lunch-name',name);
    showFeedback('voteFeedback',`Tack ${name}! Din röst är sparad.`);
  }catch(err){showFeedback('voteFeedback',err.code==='permission-denied'?'Det namnet har redan röstat denna dag (eller så nekades rösten av säkerhetsreglerna).':'Kunde inte rösta: '+err.message,true)}
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
    onAuthStateChanged(auth,async u=>{
      if(!u){try{await signInAnonymously(auth)}catch(err){showStatus('Anonym inloggning misslyckades. Aktivera Anonymous i Firebase Authentication. '+err.message,'error')}return}
      user=u;ready=true;showStatus('● Ansluten – röster delas direkt med alla kollegor','ok');
      unsubscribePlaces();unsubscribePlaces=onSnapshot(collection(db,'restaurants'),s=>{suggestions=s.docs.map(d=>({id:d.id,...d.data()}));renderPlaces()},err=>showStatus('Kunde inte läsa restauranger: '+err.message,'error'));
      refreshWeek();renderPlaces();renderResults();
    });
    setInterval(refreshWeek,60000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshWeek()});
  }catch(err){showStatus('Fel vid anslutning: '+err.message,'error')}
}
refreshWeek();renderPlaces();main();
