import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore, collection, doc, onSnapshot, setDoc, addDoc, deleteDoc, serverTimestamp, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

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
let auth,db,user=null,weekId='',activeDay=0,votes=[],suggestions=[],unsubscribeVotes=()=>{},unsubscribePlaces=()=>{},unsubscribeChat=()=>{},ready=false;
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
function voteDeadline(){
  const current=workingWeek();
  // Selected day belongs to the displayed workweek in Stockholm.
  const target=new Date(current.monday);target.setUTCDate(target.getUTCDate()+activeDay);
  const probe=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth(),target.getUTCDate(),11,activeDay===4?30:5));
  const tz=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Stockholm',timeZoneName:'shortOffset'}).formatToParts(probe).find(x=>x.type==='timeZoneName')?.value||'GMT+1';
  const m=tz.match(/GMT([+-])([0-9]{1,2})(?::([0-9]{2}))?/);
  const offset=m?(m[1]==='+'?1:-1)*(Number(m[2])*60+Number(m[3]||0)):60;
  return new Date(probe.getTime()-offset*60000);
}
function closingTime(){return activeDay===4?'11:30':'11:05'}
const TEST_MODE = true; // Pausar tidsgränsen medan vi testar.
function votingOpen(){return TEST_MODE || Date.now()<voteDeadline().getTime()}
function updateCountdown(){
  const deadline=voteDeadline().getTime(),seconds=Math.max(0,Math.ceil((deadline-Date.now())/1000));
  const pad=n=>String(n).padStart(2,'0');
  const label=$('countdown');if(!label){return;}
  const title=$('countdownHeading');
  if(seconds===0){label.textContent='Röstningen är stängd';title.textContent='Röstningen stängde kl. '+closingTime();}
  else{const hours=Math.floor(seconds/3600),mins=Math.floor(seconds%3600/60),secs=seconds%60;
    label.textContent=hours>99?Math.floor(hours/24)+' dagar kvar':pad(hours)+':'+pad(mins)+':'+pad(secs);
    title.textContent='Röstningen stänger kl. '+closingTime();}
  label.classList.toggle('closed',seconds===0);
  $('voteButton').disabled=!ready||!votingOpen()||votes.some(v=>v.createdBy===user?.uid);
  if(!votingOpen())$('voteButton').textContent='RÖSTNINGEN ÄR STÄNGD';
  const undo=$('undoButton');if(undo&&!undo.hidden)undo.disabled=!ready||!votingOpen();
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
    button.textContent=DAYS[i];button.addEventListener('click',()=>{activeDay=i;showFeedback('voteFeedback','');watchVotes();watchChat();renderTabs()});
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
  const participants=votes.map(v=>v.voterName||decodeURIComponent(v.nameKey||'')).filter(Boolean).sort((x,y)=>x.localeCompare(y,'sv'));
  $('participantsTitle').textContent='Vilka ska med på '+DAYS[activeDay].toLowerCase()+'?';
  $('participantsCount').textContent=participants.length+' '+(participants.length===1?'person':'personer');
  const participantList=$('participantList');participantList.replaceChildren();
  if(!participants.length){const empty=document.createElement('p');empty.className='participants-empty';empty.textContent='Ingen har röstat den här dagen ännu.';participantList.append(empty)}
  else for(const person of participants){const tag=document.createElement('span');tag.className='participant-tag';tag.textContent=person;participantList.append(tag)}
  $('totalVotes').textContent=plural(votes.length);
  $('resultTitle').textContent='Ställningen – '+DAYS[activeDay];
  const list=$('resultList');list.replaceChildren();
  for(let i=0;i<sorted.length;i++){
    const r=sorted[i],row=document.createElement('div');row.className='result';
    const voters=votes.filter(v=>v.restaurantId===r.id).map(v=>v.voterName||decodeURIComponent(v.nameKey||'')).sort((a,b)=>a.localeCompare(b,'sv'));
    row.title=voters.length?'Röstat: '+voters.join(', '):'Inga röster ännu';row.tabIndex=0;row.setAttribute('aria-label',`${r.name}, ${plural(r.count)}. ${voters.length?'Röstat: '+voters.join(', '):'Inga röster ännu'}`);
    const head=document.createElement('div');head.className='result-head';
    const name=document.createElement('span');name.className='result-name';name.textContent=`${i+1}. ${r.name}${r.count===max&&max>0?' 🏆':''}`;
    const count=document.createElement('span');count.className='result-count';count.textContent=plural(r.count);head.append(name,count);
    const track=document.createElement('div');track.className='track';const fill=document.createElement('div');fill.className='fill';fill.style.width=(max?r.count/max*100:0)+'%';track.append(fill);row.append(head,track);if(voters.length){const names=document.createElement('div');names.className='voter-popover';names.textContent='Röstat: '+voters.join(', ');row.append(names)}list.append(row)
  }
  if(!sorted.length){const p=document.createElement('p');p.className='empty';p.textContent='Inga restauranger tillagda.';list.append(p)}
  const hasVoted=!!user&&votes.some(v=>v.createdBy===user.uid);
  $('voteButton').disabled=!ready||hasVoted;
  $('voteButton').textContent=hasVoted?'✓ Du har redan röstat på '+DAYS[activeDay].toLowerCase():'LÄGG MIN RÖST →';
  $('voterName').readOnly=hasVoted;
  $('voterName').title=hasVoted?'Du har redan röstat med detta Google-konto. Ångra rösten först om du vill ändra.':'';
  const myVote=votes.find(v=>v.createdBy===user?.uid);
  $('undoButton').hidden=false; // Alltid synlig så användaren hittar funktionen.
  $('undoButton').disabled=!ready||!votingOpen()||!myVote;
  $('undoButton').textContent='↶ Ångra min röst';
  $('undoButton').title=myVote?'Ta bort din röst så att du kan välja igen':'Du behöver först ha en röst registrerad med ditt Google-konto för vald dag';
  updateCountdown();
}
function myVoteDocId(){return user?.uid||''}
function makeNameKey(s){return encodeURIComponent(s.trim().replace(/\s+/g,' ').toLocaleLowerCase('sv-SE'))}
function watchVotes(){unsubscribeVotes();votes=[];renderResults();if(!user)return;
  const path=collection(db,'weeks',weekId,'days',String(activeDay),'votes');
  unsubscribeVotes=onSnapshot(path,s=>{votes=s.docs.map(d=>d.data());renderResults()},e=>showStatus('Kunde inte läsa röster: '+e.message,'error'));
}
function watchChat(){
  unsubscribeChat();const list=$('chatMessages');list.replaceChildren();
  if(!user){list.textContent='Logga in med Google för att läsa och skriva i chatten.';return}
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
  e.preventDefault();if(!user)return showFeedback('chatFeedback','Logga in med Google först.',true);
  const input=$('chatInput'),value=input.value.trim();
  if(!value||value.length>300)return;
  $('chatSend').disabled=true;
  try{
    await addDoc(collection(db,'weeks',weekId,'days',String(activeDay),'chat'),{
      senderName:(user.displayName||user.email||'Kollega').slice(0,60),
      text:value,createdBy:user.uid,createdAt:serverTimestamp()
    });
    input.value='';showFeedback('chatFeedback','');
  }catch(err){showFeedback('chatFeedback','Kunde inte skicka: '+err.message,true)}
  finally{$('chatSend').disabled=false}
});
function refreshWeek(){const w=workingWeek();if(w.id===weekId)return;
  weekId=w.id;activeDay=w.day;$('weekLabel').textContent=`Vecka ${w.week} · ${w.year}`;
  const friday=new Date(w.monday);friday.setUTCDate(friday.getUTCDate()+4);
  $('weekDates').textContent=`${dateLabel(w.monday)} – ${dateLabel(friday)}`;
  renderTabs();watchVotes();watchChat();showFeedback('voteFeedback','');updateCountdown();
}
$('voterName').addEventListener('input',renderResults);
$('voteForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!ready||!user)return;
  if(!votingOpen())return showFeedback('voteFeedback','Röstningen för denna dag stängde kl. '+closingTime()+'.',true);
  const name=$('voterName').value.trim().replace(/\s+/g,' '),restaurantId=$('restaurantSelect').value;
  if(name.length<2||name.length>35)return showFeedback('voteFeedback','Ange ett namn med 2–35 tecken.',true);
  if(!places().some(r=>r.id===restaurantId))return showFeedback('voteFeedback','Välj en giltig restaurang.',true);
  refreshWeek();const nameKey=makeNameKey(name);
  $('voteButton').disabled=true;
  try{
    if(votes.some(v=>v.createdBy===user.uid))return showFeedback('voteFeedback','Du har redan röstat med ditt Google-konto den här dagen.',true);
    await setDoc(doc(db,'weeks',weekId,'days',String(activeDay),'votes',myVoteDocId()),{nameKey,restaurantId,voterName:name,createdBy:user.uid,createdAt:serverTimestamp()});
    localStorage.setItem('lunch-name-'+user.uid,name);
    localStorage.setItem('lunch-name',name);
    showFeedback('voteFeedback',`Tack ${name}! Din röst är sparad.`);
  }catch(err){showFeedback('voteFeedback',err.code==='permission-denied'?'Det namnet har redan röstat denna dag (eller så nekades rösten av säkerhetsreglerna).':'Kunde inte rösta: '+err.message,true)}
  renderResults();
});
$('undoButton').addEventListener('click',async()=>{
  const nameKey=makeNameKey($('voterName').value.trim());
  const myVote=votes.find(v=>v.createdBy===user?.uid);
  if(!myVote)return showFeedback('voteFeedback','Ingen röst är registrerad för detta Google-konto på den valda dagen. Äldre röster från anonym inloggning kan inte ångras med Google-kontot.',true);
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
    $('googleLogin').addEventListener('click',async()=>{
      try{await signInWithPopup(auth,new GoogleAuthProvider())}
      catch(err){showStatus('Google-inloggning misslyckades: '+err.message,'error')}
    });
    $('googleLogout').addEventListener('click',async()=>{await signOut(auth)});
    onAuthStateChanged(auth,u=>{
      unsubscribeVotes();unsubscribePlaces();unsubscribeChat();votes=[];suggestions=[];user=u;ready=!!u;
      $('googleLogin').hidden=!!u;$('googleLogout').hidden=!u;
      $('accountLabel').textContent=u?'Inloggad: '+(u.displayName||u.email||'Google-konto'):'Logga in med Google för att rösta';
      if(u){$('voterName').value=localStorage.getItem('lunch-name-'+u.uid)||localStorage.getItem('lunch-name')||u.displayName||'';
        showStatus('● Inloggad med Google – röster delas med kollegorna','ok');
        unsubscribePlaces=onSnapshot(collection(db,'restaurants'),s=>{suggestions=s.docs.map(d=>({id:d.id,...d.data()}));renderPlaces()},err=>showStatus('Kunde inte läsa restauranger: '+err.message,'error'));
        watchVotes();watchChat();
      } else showStatus('Logga in med Google för att se resultat och rösta.');
      renderPlaces();renderResults();
    });
    setInterval(refreshWeek,60000);
    setInterval(updateCountdown,1000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshWeek()});
  }catch(err){showStatus('Fel vid anslutning: '+err.message,'error')}
}
refreshWeek();renderPlaces();updateCountdown();main();
