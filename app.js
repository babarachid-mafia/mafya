/* Mafia Online V5 - Firebase Realtime Database */
(function(){
  const $ = (id)=>document.getElementById(id);
  const els = {
    configWarning:$('configWarning'), joinCard:$('joinCard'), gameCard:$('gameCard'), rulesBtn:$('rulesBtn'), rulesBox:$('rulesBox'),
    roomInput:$('roomInput'), nameInput:$('nameInput'), createBtn:$('createBtn'), joinBtn:$('joinBtn'), roomCodeLabel:$('roomCodeLabel'), phaseLabel:$('phaseLabel'), leaveBtn:$('leaveBtn'),
    roleBox:$('roleBox'), myStatus:$('myStatus'), personalNotice:$('personalNotice'), playersList:$('playersList'), actionCard:$('actionCard'), actionTitle:$('actionTitle'), actionHint:$('actionHint'), targetsList:$('targetsList'),
    mafiaInfoCard:$('mafiaInfoCard'), mafiaMembers:$('mafiaMembers'), mafiaKillInfo:$('mafiaKillInfo'), mafiaMuteInfo:$('mafiaMuteInfo'), statsBox:$('statsBox'), eliminatedList:$('eliminatedList'), hostCard:$('hostCard'),
    assignBtn:$('assignBtn'), nightBtn:$('nightBtn'), resolveNightBtn:$('resolveNightBtn'), dayVoteBtn:$('dayVoteBtn'), resolveVoteBtn:$('resolveVoteBtn'), resetVotesBtn:$('resetVotesBtn'), deleteRoomBtn:$('deleteRoomBtn'), logBox:$('logBox')
  };

  let db=null, roomRef=null, unsub=null, currentRoom=null, playerId=localStorage.getItem('mafia_player_id') || makeId();
  localStorage.setItem('mafia_player_id', playerId);
  let isHost=false, latest=null;

  const PHASES = {
    lobby:'الانتظار', night:'الليل', dayVote:'التصويت النهاري', result:'النتيجة', end:'نهاية اللعبة'
  };
  const ROLE_LABEL = {
    mafia:'مافيا', silencer:'مافيا التسكيت', doctor:'طبيب', detective:'محقق', citizen:'مواطن صالح'
  };
  const isMafiaRole = r => r==='mafia' || r==='silencer';

  function makeId(){ return 'p_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4); }
  function roomCode(){ return String(Math.floor(1000+Math.random()*9000)); }
  function cleanName(s){ return (s||'').trim().slice(0,20) || 'لاعب'; }
  function now(){ return Date.now(); }

  try{
    if(typeof firebaseConfig==='undefined' || !firebaseConfig.apiKey || !firebaseConfig.databaseURL){
      els.configWarning.classList.remove('hidden');
    }else{
      firebase.initializeApp(firebaseConfig);
      db = firebase.database();
    }
  }catch(e){ console.error(e); els.configWarning.classList.remove('hidden'); }

  els.rulesBtn.onclick = ()=> els.rulesBox.classList.toggle('hidden');
  els.createBtn.onclick = createRoom;
  els.joinBtn.onclick = joinRoom;
  els.leaveBtn.onclick = leaveRoom;
  els.assignBtn.onclick = assignRoles;
  els.nightBtn.onclick = startNight;
  els.resolveNightBtn.onclick = resolveNight;
  els.dayVoteBtn.onclick = startDayVote;
  els.resolveVoteBtn.onclick = resolveDayVote;
  els.resetVotesBtn.onclick = resetVotes;
  els.deleteRoomBtn.onclick = deleteRoom;

  async function createRoom(){
    if(!db) return alert('Firebase غير موجد. صلح firebase-config.js');
    const code = els.roomInput.value.trim() || roomCode();
    const name = cleanName(els.nameInput.value);
    const ref = db.ref('rooms/'+code);
    const snap = await ref.get();
    if(snap.exists()){
      alert('هاد الغرفة موجودة بالفعل. ضغط على دخول باش تلتحق بها، ماشي إنشاء غرفة جديدة.');
      return;
    }
    isHost = true;
    currentRoom = code;
    await ref.set({
      createdAt: now(), hostId: playerId,
      state:{phase:'lobby', message:'تم إنشاء الغرفة. انتظروا دخول اللاعبين.'},
      players:{[playerId]:{name, alive:true, muted:false, role:'', eliminatedRole:'', joinedAt:now(), online:true}},
      votes:{day:{}, mafiaKill:{}, mafiaMute:{}, doctorProtect:{}, detectiveCheck:{}}
    });
    enterRoom(code);
  }

  async function joinRoom(){
    if(!db) return alert('Firebase غير موجد. صلح firebase-config.js');
    const code = els.roomInput.value.trim();
    if(!code) return alert('كتب كود الغرفة');
    const snap = await db.ref('rooms/'+code).get();
    if(!snap.exists()) return alert('هاد الغرفة غير موجودة');
    const name = cleanName(els.nameInput.value);
    currentRoom = code;
    const data=snap.val();
    isHost = data.hostId === playerId;
    await db.ref(`rooms/${code}/players/${playerId}`).update({name, alive:true, muted:false, eliminatedRole:'', joinedAt:now(), online:true});
    enterRoom(code);
  }

  function enterRoom(code){
    els.joinCard.classList.add('hidden');
    els.gameCard.classList.remove('hidden');
    els.roomCodeLabel.textContent = code;
    roomRef = db.ref('rooms/'+code);
    if(unsub) roomRef.off('value', unsub);
    unsub = roomRef.on('value', snap=>{
      latest = snap.val();
      if(!latest){ leaveRoom(true); return; }
      isHost = latest.hostId === playerId;
      render();
    });
  }

  async function leaveRoom(silent){
    if(roomRef){ await roomRef.child('players/'+playerId+'/online').set(false).catch(()=>{}); if(unsub) roomRef.off('value',unsub); }
    currentRoom=null; latest=null; roomRef=null; unsub=null; isHost=false;
    els.gameCard.classList.add('hidden'); els.joinCard.classList.remove('hidden');
    if(!silent) alert('خرجت من الغرفة');
  }

  function playersArray(){
    const ps = latest?.players || {};
    return Object.entries(ps).map(([id,p])=>({id,...p})).sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0));
  }
  function alivePlayers(){ return playersArray().filter(p=>p.alive!==false); }
  function myPlayer(){ return latest?.players?.[playerId] || null; }

  function render(){
    const state = latest.state || {phase:'lobby'};
    const me = myPlayer();
    els.phaseLabel.textContent = PHASES[state.phase] || state.phase || 'الانتظار';
    els.hostCard.classList.toggle('hidden', !isHost);

    const myRole = me?.role ? ROLE_LABEL[me.role] || me.role : 'لم يتم توزيع الأدوار بعد';
    els.roleBox.textContent = myRole;
    els.myStatus.textContent = buildMyStatus(me);

    renderStats();
    renderPlayers();
    renderEliminated();
    renderPersonalNotice();
    renderActions();
    renderMafiaInfo();
    renderLog();
  }

  function buildMyStatus(me){
    if(!me) return '';
    if(me.alive===false) return `أنت مقصى من اللعبة. الدور الذي كان عندك: ${ROLE_LABEL[me.eliminatedRole || me.role] || me.eliminatedRole || me.role || 'غير معروف'}.`;
    const parts=[];
    if(me.muted) parts.push('أنت مسكّت هذا النهار: ممنوع عليك الكلام والدفاع.');
    else parts.push('أنت داخل اللعبة.');
    if(isMafiaRole(me.role)){
      const others = playersArray().filter(p=>p.id!==playerId && isMafiaRole(p.role)).map(p=>p.name);
      if(others.length) parts.push('المافيا الآخرون معك: ' + others.join('، ') + '.');
      else parts.push('أنت المافيا الوحيد حالياً.');
    }
    return parts.join(' ');
  }

  function renderStats(){
    const ps=playersArray();
    const alive=ps.filter(p=>p.alive!==false);
    const mafia=alive.filter(p=>isMafiaRole(p.role)).length;
    const citizens=alive.filter(p=>p.role && !isMafiaRole(p.role)).length;
    const unknown=alive.filter(p=>!p.role).length;
    els.statsBox.innerHTML = `
      <div class="stat"><span>المافيا المتبقون</span><b>${mafia}</b></div>
      <div class="stat"><span>المواطنون والفريق الصالح</span><b>${citizens}</b></div>
      <div class="stat"><span>الأحياء</span><b>${alive.length}</b></div>
      <div class="stat"><span>المقصيون</span><b>${ps.length-alive.length}</b></div>
      ${unknown ? `<div class="stat"><span>بدون أدوار بعد</span><b>${unknown}</b></div>` : ''}
    `;
  }

  function renderEliminated(){
    const eliminated = playersArray().filter(p=>p.alive===false);
    if(!eliminated.length){ els.eliminatedList.innerHTML = '<p class="hint">ما كاين حتى لاعب مقصى دابا.</p>'; return; }
    els.eliminatedList.innerHTML = eliminated.map(p=>{
      const role = ROLE_LABEL[p.eliminatedRole || p.role] || p.eliminatedRole || p.role || 'غير معروف';
      return `<div class="eliminatedItem"><span>${escapeHtml(p.name || 'لاعب')}</span><b>${role}</b></div>`;
    }).join('');
  }

  function renderPlayers(){
    const ps = playersArray();
    const dayVotes = latest.votes?.day || {};
    const counts = countVotes(dayVotes);
    els.playersList.innerHTML = '';
    ps.forEach(p=>{
      const row = document.createElement('div');
      row.className = 'player' + (p.alive===false?' dead':'') + (p.muted?' mutedPlayer':'');
      const name = document.createElement('div');
      const mine = p.id===playerId ? ' 👑' : '';
      const online = p.online ? '<span class="green">●</span>' : '<span>●</span>';
      const eliminatedRole = p.alive===false ? ` <span class="gold smallRole">(${ROLE_LABEL[p.eliminatedRole || p.role] || p.eliminatedRole || p.role || 'غير معروف'})</span>` : '';
      name.innerHTML = `${online} <b>${escapeHtml(p.name||'لاعب')}</b>${mine} ${p.muted?'<span class="gold">🔇</span>':''}${eliminatedRole}`;
      const meta = document.createElement('div');
      const v = counts[p.id] || 0;
      meta.innerHTML = `<span class="pill voteCount">${v}</span>`;
      row.appendChild(name); row.appendChild(meta);
      els.playersList.appendChild(row);
    });
  }

  function renderPersonalNotice(){
    const me = myPlayer();
    const state = latest.state || {};
    const notices=[];
    if(state.phase==='dayVote'){
      const voters = namesVotingFor(playerId, latest.votes?.day || {});
      if(voters.length) notices.push(`${voters.join('، ')} صوت${voters.length>1?'وا':' عليك'} في التصويت.`);
    }
    if(me?.muted) notices.push('تم إسكاتك: لا تتكلم ولا تدافع على نفسك هذا النهار.');
    if(latest.detectiveResults?.[playerId]) notices.push(latest.detectiveResults[playerId]);
    if(notices.length){ els.personalNotice.textContent = notices.join(' | '); els.personalNotice.classList.remove('hidden'); }
    else els.personalNotice.classList.add('hidden');
  }

  function renderActions(){
    const me = myPlayer(); const phase = latest.state?.phase || 'lobby';
    els.actionCard.classList.add('hidden'); els.targetsList.innerHTML='';
    if(!me || me.alive===false) return;
    let mode=null, title='', hint='', candidates=[];
    if(phase==='dayVote'){
      mode='day'; title='التصويت النهاري'; hint='صوّت على اللاعب المشكوك فيه. يمكنك تغيير صوتك قبل حل التصويت.'; candidates=alivePlayers().filter(p=>p.id!==playerId);
    }else if(phase==='night' && isMafiaRole(me.role)){
      mode='mafiaKill'; title='تصويت المافيا على القتل'; hint='اختاروا الضحية. التصويت يظهر فقط لأعضاء المافيا. يمكن تغيير التصويت.'; candidates=alivePlayers().filter(p=>p.id!==playerId);
    }else if(phase==='night' && me.role==='doctor'){
      mode='doctorProtect'; title='اختيار الطبيب'; hint='اختر لاعباً لحمايته هذه الليلة.'; candidates=alivePlayers();
    }else if(phase==='night' && me.role==='detective'){
      mode='detectiveCheck'; title='اختيار المحقق'; hint='اختر لاعباً للتحقق منه.'; candidates=alivePlayers().filter(p=>p.id!==playerId);
    }
    if(!mode) return;
    els.actionCard.classList.remove('hidden'); els.actionTitle.textContent=title; els.actionHint.textContent=hint;
    const currentVote = latest.votes?.[mode]?.[playerId] || null;
    const counts = (mode==='day' || mode==='mafiaKill' || mode==='mafiaMute') ? countVotes(latest.votes?.[mode] || {}) : {};
    candidates.forEach(p=> addTargetButton(p, mode, currentVote, counts[p.id] || 0));

    // Mafia silencer action appears with kill action
    if(phase==='night' && me.role==='silencer'){
      const title2=document.createElement('h3'); title2.textContent='اختيار التسكيت'; els.targetsList.appendChild(title2);
      const cur = latest.votes?.mafiaMute?.[playerId] || null;
      const muteCounts = countVotes(latest.votes?.mafiaMute || {});
      alivePlayers().filter(p=>p.id!==playerId).forEach(p=> addTargetButton(p, 'mafiaMute', cur, muteCounts[p.id] || 0));
    }
  }

  function addTargetButton(p, mode, currentVote, count){
    const div=document.createElement('div'); div.className='target'+(currentVote===p.id?' selected':'')+(p.alive===false?' dead':'');
    const roleHint = (mode==='mafiaKill' || mode==='mafiaMute') && isMafiaRole(myPlayer()?.role) && isMafiaRole(p.role) ? ' <span class="red">مافيا</span>' : '';
    div.innerHTML = `<span>${escapeHtml(p.name||'لاعب')}${roleHint}${p.muted?' 🔇':''}</span><span class="pill">${count}</span>`;
    div.onclick = ()=> vote(mode, p.id);
    els.targetsList.appendChild(div);
  }

  async function vote(mode, targetId){
    if(!roomRef) return;
    await roomRef.child(`votes/${mode}/${playerId}`).set(targetId);
  }

  function renderMafiaInfo(){
    const me=myPlayer();
    if(!me || !isMafiaRole(me.role)){ els.mafiaInfoCard.classList.add('hidden'); return; }
    els.mafiaInfoCard.classList.remove('hidden');
    const ps = playersArray(); const mafia = ps.filter(p=>isMafiaRole(p.role));
    els.mafiaMembers.innerHTML = mafia.map(p=>`<div class="infoLine"><span>${escapeHtml(p.name)} ${p.role==='silencer'?'🔇':'🕴️'} ${p.alive===false?'(مقصى)':''}</span><span>${ROLE_LABEL[p.role]}</span></div>`).join('');
    els.mafiaKillInfo.innerHTML = renderVoteInfo(latest.votes?.mafiaKill || {}, mafia);
    els.mafiaMuteInfo.innerHTML = renderVoteInfo(latest.votes?.mafiaMute || {}, mafia.filter(p=>p.role==='silencer')) || '<p class="hint">ما كاين حتى اختيار تسكيت دابا.</p>';
  }

  function renderVoteInfo(votes, voters){
    if(!voters.length) return '';
    const ps=playersArray(); const byId=Object.fromEntries(ps.map(p=>[p.id,p]));
    return voters.map(v=>{
      const t = votes[v.id];
      const targetName = t && byId[t] ? byId[t].name : 'لم يصوت بعد';
      return `<div class="infoLine"><span>${escapeHtml(v.name)}</span><span>${escapeHtml(targetName)}</span></div>`;
    }).join('') + renderCounts(votes);
  }

  function renderCounts(votes){
    const counts=countVotes(votes); const ps=playersArray();
    const lines=Object.entries(counts).map(([id,c])=>`<div class="infoLine"><span>${escapeHtml(ps.find(p=>p.id===id)?.name || 'لاعب')}</span><span class="pill voteCount">${c}</span></div>`).join('');
    return lines ? `<h3>النتيجة المؤقتة</h3>${lines}` : '';
  }

  function renderLog(){
    const logs = latest.logs || {};
    const arr = Object.values(logs).sort((a,b)=>(b.t||0)-(a.t||0)).slice(0,20);
    els.logBox.innerHTML = arr.map(l=>`<div class="logItem">${escapeHtml(l.text||'')}</div>`).join('') || '<p class="hint">لا توجد أحداث بعد.</p>';
  }

  async function assignRoles(){
    const ps = playersArray().filter(p=>p.online!==false);
    if(ps.length < 4) return alert('خاص على الأقل 4 لاعبين للتجربة. الأفضل 6 أو أكثر.');
    const shuffled = shuffle(ps);
    let mafiaCount = Math.max(1, Math.floor(ps.length / 5));
    const updates={};
    shuffled.forEach(p=> updates[`players/${p.id}/role`]='citizen');
    shuffled.forEach(p=> updates[`players/${p.id}/alive`]=true);
    shuffled.forEach(p=> updates[`players/${p.id}/muted`]=false);
    shuffled.forEach(p=> updates[`players/${p.id}/eliminatedRole`]='');
    for(let i=0;i<mafiaCount;i++) updates[`players/${shuffled[i].id}/role`] = (mafiaCount>=3 && i===0) ? 'silencer' : 'mafia';
    let idx=mafiaCount;
    if(shuffled[idx]) updates[`players/${shuffled[idx++].id}/role`]='doctor';
    if(shuffled[idx]) updates[`players/${shuffled[idx++].id}/role`]='detective';
    updates['state']={phase:'lobby', message:'تم توزيع الأدوار. كل لاعب يشوف دوره فقط.'};
    updates['votes']={day:{}, mafiaKill:{}, mafiaMute:{}, doctorProtect:{}, detectiveCheck:{}};
    updates['detectiveResults']=null;
    await roomRef.update(updates); await addLog('تم توزيع الأدوار السرية.');
  }

  async function startNight(){
    await roomRef.update({
      'state':{phase:'night', message:'بدأ الليل. المافيا والطبيب والمحقق يختارون.'},
      'votes/day':{}, 'votes/mafiaKill':{}, 'votes/mafiaMute':{}, 'votes/doctorProtect':{}, 'votes/detectiveCheck':{},
      'detectiveResults':null
    });
    await addLog('بدأ الليل.');
  }

  async function resolveNight(){
    const ps=playersArray(); const byId=Object.fromEntries(ps.map(p=>[p.id,p]));
    const killVotes = latest.votes?.mafiaKill || {}; const protectVotes = latest.votes?.doctorProtect || {}; const checkVotes = latest.votes?.detectiveCheck || {}; const muteVotes = latest.votes?.mafiaMute || {};
    const killTarget = winnerFromVotes(killVotes);
    const protectedIds = new Set(Object.values(protectVotes));
    const updates={'state/phase':'result'}; let msg=[];
    // clear previous mute
    ps.forEach(p=> updates[`players/${p.id}/muted`]=false);
    const muteTarget = winnerFromVotes(muteVotes);
    if(muteTarget && byId[muteTarget]){ updates[`players/${muteTarget}/muted`]=true; msg.push(`${byId[muteTarget].name} تم إسكاتُه هذا النهار.`); }
    if(killTarget && byId[killTarget]){
      if(protectedIds.has(killTarget)) msg.push('الطبيب نجح في حماية الضحية. لا أحد مات هذه الليلة.');
      else { updates[`players/${killTarget}/alive`]=false; updates[`players/${killTarget}/eliminatedRole`]=byId[killTarget].role || ''; msg.push(`${byId[killTarget].name} تم إقصاؤه في الليل. الدور: ${ROLE_LABEL[byId[killTarget].role] || byId[killTarget].role || 'غير معروف'}.`); }
    }else msg.push('لم يتم اختيار ضحية واضحة من طرف المافيا.');

    const detResults={};
    Object.entries(checkVotes).forEach(([detId,targetId])=>{
      if(byId[detId] && byId[targetId]){
        const res = isMafiaRole(byId[targetId].role) ? 'من المافيا' : 'ليس من المافيا';
        detResults[detId] = `نتيجة التحقيق: ${byId[targetId].name} ${res}.`;
      }
    });
    if(Object.keys(detResults).length) updates['detectiveResults']=detResults;
    updates['state/message']=msg.join(' ');
    await roomRef.update(updates);
    await addLog(msg.join(' '));
    await checkWin();
  }

  async function startDayVote(){
    await roomRef.update({'state':{phase:'dayVote', message:'بدأ التصويت النهاري. كل لاعب حي يصوت ويمكنه تغيير صوته.'}, 'votes/day':{}});
    await addLog('بدأ التصويت النهاري.');
  }

  async function resolveDayVote(){
    const ps=playersArray(); const byId=Object.fromEntries(ps.map(p=>[p.id,p]));
    const target = winnerFromVotes(latest.votes?.day || {});
    if(target && byId[target]){
      await roomRef.update({[`players/${target}/alive`]:false, [`players/${target}/eliminatedRole`]:byId[target].role || '', 'state':{phase:'result', message:`تم إقصاء ${byId[target].name} بالتصويت. الدور: ${ROLE_LABEL[byId[target].role] || byId[target].role || 'غير معروف'}.`}, 'votes/day':{}});
      await addLog(`تم إقصاء ${byId[target].name} بالتصويت. الدور: ${ROLE_LABEL[byId[target].role] || byId[target].role || 'غير معروف'}.`);
    }else{
      await roomRef.update({'state':{phase:'result', message:'لم تكن هناك نتيجة واضحة في التصويت. لا أحد أقصي.'}, 'votes/day':{}});
      await addLog('تعادل أو لا يوجد تصويت كافٍ. لا أحد أقصي.');
    }
    await checkWin();
  }

  async function resetVotes(){ await roomRef.child('votes').set({day:{}, mafiaKill:{}, mafiaMute:{}, doctorProtect:{}, detectiveCheck:{}}); await addLog('تم مسح جميع التصويتات.'); }
  async function deleteRoom(){ if(confirm('واش متأكد بغيتي تحذف الغرفة؟')) await roomRef.remove(); }

  async function checkWin(){
    const alive=playersArray().filter(p=>p.alive!==false);
    const mafia=alive.filter(p=>isMafiaRole(p.role)).length;
    const others=alive.length-mafia;
    if(mafia===0){ await roomRef.update({'state':{phase:'end', message:'فاز المواطنون! خرجت جميع المافيا.'}}); await addLog('فاز المواطنون!'); }
    else if(mafia>=others){ await roomRef.update({'state':{phase:'end', message:'فازت المافيا! أصبح عددها مساوياً أو أكثر من الباقي.'}}); await addLog('فازت المافيا!'); }
  }

  function countVotes(votes){ const c={}; Object.values(votes||{}).forEach(t=>{ if(t) c[t]=(c[t]||0)+1; }); return c; }
  function winnerFromVotes(votes){
    const counts=countVotes(votes); const entries=Object.entries(counts); if(!entries.length) return null;
    entries.sort((a,b)=>b[1]-a[1]);
    if(entries.length>1 && entries[0][1]===entries[1][1]) return null; // tie
    return entries[0][0];
  }
  function namesVotingFor(targetId, votes){ const ps=playersArray(); const byId=Object.fromEntries(ps.map(p=>[p.id,p])); return Object.entries(votes||{}).filter(([,t])=>t===targetId).map(([v])=>byId[v]?.name).filter(Boolean); }
  function shuffle(a){ const arr=[...a]; for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }
  function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
  async function addLog(text){ if(!roomRef) return; await roomRef.child('logs').push({text,t:now()}); }
})();
