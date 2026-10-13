import {duels,inviteUrl} from './duels.js';
import {matchAnswer,totalScore} from './engine.js';
export function createMultiplayerUI(ui){
 const {app,esc,toast,modal,closeModal,NAMES}=ui;let selected=null,busy=false,poll=null;
 const field=(id,label,value='')=>`<label class="duel-field" for="${id}">${label}<input id="${id}" class="answer-input" value="${esc(value)}" maxlength="24" autocomplete="nickname" placeholder="Je voornaam of nickname"></label>`;
 const stop=()=>{clearInterval(poll);poll=null;};
 function page(html){ui.setView('duel');closeModal();app.innerHTML=`<div class="duel-page">${html}</div>`;window.scrollTo({top:0,behavior:'instant'});}
 function refreshLoop(id){stop();poll=setInterval(async()=>{if(document.hidden||busy||ui.getView()!=='duel'||selected?.id!==id)return;try{const data=await duels.state(id);if(data.revision!==selected.revision){selected=data;summary(data);}}catch{}},10000);}
 function summary(data){
  selected=data;const mine=data.who,other=mine===1?0:1,me=data.players[mine],opponent=data.players[other];
  const result=data.status==='finished'?(data.winner==='tie'?'Gelijkspel.':data.winner===mine?'Je hebt gewonnen.':`${esc(data.players[data.winner].name)} heeft gewonnen.`):mine<0?'Je bent uitgenodigd.':data.turn===mine?'Jij bent aan de beurt.':opponent?`${esc(opponent.name)} is aan de beurt.`:'Nodig je tegenstander uit.';
  const columns=data.players.map((p,i)=>`<div class="duel-player"><span>${esc(p?.name||'Nog geen tegenstander')}${i===mine?' · jij':''}</span><strong>${p?.score||0}<small> / 480</small></strong><span>${p?.completed||0} van 4 rondes klaar</span></div>`).join('');
  const table=`<div class="duel-table-wrap"><table class="duel-table"><thead><tr><th>Ronde</th>${data.players.map(p=>`<th>${esc(p?.name||'Tegenstander')}</th>`).join('')}</tr></thead><tbody>${Object.values(NAMES).map((label,i)=>`<tr><td>${label}</td>${data.players.map(p=>`<td>${p?.rounds[i]??'—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const share=mine>=0&&!data.players[1]?`<div class="invite-box"><label for="invite-link">Uitnodigingslink</label><input id="invite-link" readonly value="${esc(inviteUrl(data.id))}"><button class="secondary" data-multi="copy">Kopieer link</button><p>Je tegenstander opent de link op de eigen telefoon. Je kunt jouw eerste ronde alvast spelen.</p></div>`:'';
  const action=mine<0?`<div class="join-form">${field('join-name','Jouw naam',duels.name())}<button class="primary wide" data-multi="join">Doe mee aan dit duel</button></div>`:data.status==='finished'?'<button class="primary wide" data-multi="rematch">Nog een duel over deze week</button>':data.turn===mine?`<button class="primary wide" data-multi="play">${data.game.status==='active'?'Verder spelen':'Speel ronde '+(data.game.round+1)}</button>`:'<p class="subtle">Je hoeft niet tegelijk online te zijn. Je kunt later via Mijn duels verder.</p>';
  const pending=duels.pending()?.duel===data.id?'<div class="home-note">Een spelactie wacht nog op verbinding. <button class="secondary" data-multi="retry">Opnieuw opslaan</button></div>':'';
  page(`<h1>Duel · ${data.week?'week '+data.week:'mix van zes weken'}</h1><p class="lead">${result}</p><div class="duel-scoreboard">${columns}</div>${table}${share}${pending}${action}<div class="duel-links">${data.lastReview?'<button class="help-button" data-multi="review">Mijn laatste ronde bekijken</button>':''}<button class="help-button" data-multi="refresh">Vernieuw uitslag</button><button class="help-button" data-multi="hub">Mijn duels</button><button class="help-button" data-action="home">Naar start</button></div><p class="fineprint">Zelfde vragen · zelfde tijd · 120 punten per ronde. Een duel blijft 14 dagen beschikbaar.</p>`);
  history.replaceState(null,'',inviteUrl(data.id));if(mine>=0&&data.status!=='finished')refreshLoop(data.id);else stop();
 }
 async function open(id){stop();page('<p class="subtle" role="status">Duel ophalen…</p>');try{summary(await duels.state(id));}catch(e){page(`<h1>Duel ophalen</h1><p>${esc(e.message)}</p><button class="primary" data-multi="hub">Mijn duels</button>`);}}
 function hubMarkup(records){return `<h1>Mijn duels</h1><p class="lead">Speel om de beurt tegen een medestudent. Je voortgang en de gezamenlijke uitslag worden opgeslagen.</p><div class="duel-list">${records.length?records.map(x=>`<button class="duel-list-row" data-multi="open" data-id="${x.id}"><span><strong>${esc(x.players.filter(Boolean).map(p=>p.name).join(' & ')||'Duel')}</strong><small>${x.week?'Week '+x.week:'Mix'} · ${x.status==='finished'?'Afgerond':x.turn===x.who?'Jij bent aan de beurt':x.status==='inviting'?'Wacht op tegenstander':'Wacht op tegenstander'}</small></span><b>${x.players.filter(Boolean).map(p=>p.score).join(' – ')}</b></button>`).join(''):'<div class="home-note">Je hebt nog geen duels. Kies een week en daag iemand uit.</div>'}</div><div class="join-by-link"><label class="duel-field" for="duel-link">Heb je een uitnodiging?<input id="duel-link" class="answer-input" placeholder="Plak de uitnodigingslink" autocomplete="off"></label><button class="secondary" data-multi="find">Open uitnodiging</button></div><button class="primary" data-action="home">Kies een week</button><p class="fineprint">Je spelerssleutel blijft in deze browser. Open je duel op hetzelfde apparaat om verder te spelen.</p>`;}
 async function hub(){stop();selected=null;page(hubMarkup(duels.list()));history.replaceState(null,'',location.pathname);const records=duels.list().slice(0,10);await Promise.allSettled(records.map(r=>duels.state(r.id)));if(ui.getView()==='duel'&&!selected)app.innerHTML=`<div class="duel-page">${hubMarkup(duels.list())}</div>`;}
 function create(){stop();modal('Daag iemand uit',`<p>${ui.getPrefs().week?'Week '+ui.getPrefs().week:'Mix van alle weken'} · vier rondes tegen de klok. Je deelt straks een uitnodigingslink.</p>${field('duel-name','Jouw naam',duels.name())}`,'<button class="primary" data-multi="create-confirm">Maak uitnodiging</button><button class="secondary" data-action="close">Annuleer</button>');document.querySelector('#duel-name')?.focus();}
 async function submit(action,retry=false){
  if(busy)return;busy=true;const previous=ui.getGame(),before=totalScore(previous);app.setAttribute('aria-busy','true');app.querySelectorAll('button,input').forEach(el=>el.disabled=true);
  try{const data=retry?await duels.retry():await duels.action(previous.duelId,previous.duelRevision,previous.round,action);selected=data;
   if(data.action?.kind==='replayed'){if(data.lastReview&&data.lastReview.round===previous.round){ui.setGame(data.lastReview);ui.render();}else summary(data);return;}
   const next=data.action?.completed?data.action.viewGame:data.game;ui.setGame(next);ui.save();ui.render();
   if(data.action?.kind==='correct'){ui.correct();const delta=totalScore(next)-before;toast(delta?'+'+delta+' punten · gevonden!':'Goed gevonden!');}
   if(data.action?.kind==='duplicate'){toast('Dit antwoord had je al.');}
   if(data.action?.kind==='wrong'){ui.wrong();toast('Nog niet de juiste keuze.',true);}
  }catch(e){if(e.data?.game){selected=e.data;ui.setGame(e.data.game);ui.render();toast(e.message,true);}else{ui.render();modal('Opslaan lukt nu niet',`<p>${esc(e.message)}</p>`,`${duels.pending()?'<button class="primary" data-multi="retry">Opnieuw proberen</button>':''}<button class="secondary" data-action="close">Terug</button>`);}}
  finally{busy=false;app.removeAttribute('aria-busy');}
 }
 async function multi(button){const action=button.dataset.multi;try{
  if(action==='hub')return hub();if(action==='open')return open(button.dataset.id);if(action==='create')return create();
  if(action==='create-confirm'){if(busy)return;busy=true;button.disabled=true;try{summary(await duels.create(document.querySelector('#duel-name').value.trim(),ui.getPrefs().week,ui.version));}finally{busy=false;if(button.isConnected)button.disabled=false;}return;}
  if(action==='join'){if(busy)return;busy=true;button.disabled=true;try{summary(await duels.join(selected.id,document.querySelector('#join-name').value.trim()));}finally{busy=false;if(button.isConnected)button.disabled=false;}return;}
  if(action==='find'){const value=document.querySelector('#duel-link').value.trim();let id=/^[a-f0-9]{24}$/.test(value)?value:new URL(value,location.href).searchParams.get('duel');if(!/^[a-f0-9]{24}$/.test(id||''))throw Error('Plak een geldige uitnodigingslink.');return open(id);}
  if(action==='refresh')return open(selected.id);
  if(action==='copy'){const input=document.querySelector('#invite-link');try{await navigator.clipboard.writeText(input.value);toast('Uitnodigingslink gekopieerd.');}catch{input.select();toast('Selecteer en kopieer de link.');}return;}
  if(action==='play'){stop();const data=await duels.state(selected.id);selected=data;if(data.turn!==data.who)return summary(data);ui.initAudio();ui.setGame(data.game);ui.render();return;}
  if(action==='review'){stop();ui.setGame(selected.lastReview);ui.render();return;}
  if(action==='rematch'){ui.getPrefs().week=selected.week;create();return;}
  if(action==='retry')return submit(null,true);
 }catch(e){toast(e.message,true);}}
 function route(button){if(button.dataset.multi){void multi(button);return true;}const g=ui.getGame();if(!g?.duelId||ui.getView()!=='game')return false;if(busy)return true;
  const r=g.rounds[g.round];let action=null;
  if(button.dataset.choice)action={type:'sprint',text:button.dataset.choice};
  if(button.dataset.card)action={type:'card',card:button.dataset.card};
  if(button.dataset.group)action={type:'group',group:button.dataset.group};
  if(button.dataset.left){r.left=button.dataset.left;ui.render();return true;}
  if(button.dataset.right){if(!r.left){toast('Kies eerst een begrip.');return true;}action={type:'connect',left:r.left,right:button.dataset.right};}
  if(button.dataset.action==='start'){ui.initAudio().then(()=>ui.startSound());action={type:'start'};}
  if(button.dataset.action==='sprint-next')action={type:'sprint-next'};
  if(button.dataset.action==='skip')action={type:'sprint',text:''};
  if(button.dataset.action==='confirm-end')action={type:'end'};
  if(['next','again'].includes(button.dataset.action)){void open(g.duelId);return true;}
  if(action){void submit(action);return true;}return false;
 }
 function input(value,allowPrefix,allowTypos){const g=ui.getGame(),r=g.rounds[g.round];if(busy)return {kind:'pending'};const q=r.type==='door'?r.question:r.questions[r.index],answers=r.type==='door'?q.answers:[{id:q.id,aliases:q.aliases}];const result=matchAnswer(value,answers,r.found||[],allowPrefix,allowTypos);if(result.kind==='correct')void submit({type:r.type,text:value});else if(result.kind==='duplicate'){toast('Dit antwoord had je al.');document.querySelector('#answer-input').value='';}return result;}
 return {route,input,open,hub,stop,initialize(){const id=new URL(location.href).searchParams.get('duel');if(/^[a-f0-9]{24}$/.test(id||''))void open(id);},resume(){const g=ui.getGame();void open(g.duelId);}};
}
