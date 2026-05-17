const $ = (id) => document.getElementById(id);

let app, db;
let roomCode = localStorage.getItem("mafia_room") || "";
let playerId = localStorage.getItem("mafia_player_id") || crypto.randomUUID();
let playerName = localStorage.getItem("mafia_player_name") || "";
let isHost = localStorage.getItem("mafia_is_host") === "true";
let roomRef = null;
let currentPlayers = {};
let currentMeta = {};
let myPrivate = {};
let myVote = null;
let myNightActions = {};

localStorage.setItem("mafia_player_id", playerId);

const rolesAr = { mafia: "مافيا", detective: "محقق", doctor: "طبيب", citizen: "مواطن صالح" };
const phasesAr = { lobby: "انتظار اللاعبين", roles: "تم توزيع الأدوار", night: "مرحلة الليل", day: "مرحلة النهار", vote: "مرحلة التصويت", gameover: "نهاية اللعبة" };

function firebaseReady() {
  return typeof firebaseConfig !== "undefined" && firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("PASTE_") && firebaseConfig.databaseURL && !firebaseConfig.databaseURL.includes("PASTE_");
}
function initFirebase() {
  if (!firebaseReady()) { $("setupBox").classList.remove("hidden"); return false; }
  if (!app) { app = firebase.initializeApp(firebaseConfig); db = firebase.database(); }
  $("setupBox").classList.add("hidden"); return true;
}
function randomRoomCode(){ return Math.floor(1000 + Math.random() * 9000).toString(); }
function cleanRoomCode(v){ return (v || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 12); }
function saveSession(){ localStorage.setItem("mafia_room", roomCode); localStorage.setItem("mafia_player_name", playerName); localStorage.setItem("mafia_is_host", String(isHost)); }
function showGame(){ $("entryBox").classList.add("hidden"); $("gameBox").classList.remove("hidden"); $("roomCodeText").textContent = roomCode; $("hostPanel").classList.toggle("hidden", !isHost); }
function showEntry(){ $("entryBox").classList.remove("hidden"); $("gameBox").classList.add("hidden"); $("roomInput").value = roomCode || ""; $("nameInput").value = playerName || ""; }

async function joinRoom(hostMode=false){
  if(!initFirebase()) return;
  const typedName = $("nameInput").value.trim();
  const typedRoom = cleanRoomCode($("roomInput").value);
  if(!typedName) return alert("كتب اسم اللاعب أولاً");
  playerName = typedName;
  roomCode = hostMode ? (typedRoom || randomRoomCode()) : typedRoom;
  if(!roomCode) return alert("كتب كود الغرفة أو دير إنشاء غرفة");
  isHost = hostMode; saveSession(); showGame();
  roomRef = db.ref(`rooms/${roomCode}`);
  if(hostMode){ await roomRef.child("meta").update({ createdAt: Date.now(), hostId: playerId, phase: "lobby", message: "الغرفة واجدة. دخلوا اللاعبين ثم وزعوا الأدوار." }); }
  await roomRef.child(`players/${playerId}`).update({ name: playerName, joinedAt: Date.now(), online: true, host: isHost });
  roomRef.child(`players/${playerId}/online`).onDisconnect().set(false);
  listenRoom();
}

function listenRoom(){
  roomRef.child("players").on("value", snap => { currentPlayers = snap.val() || {}; renderAll(); });
  roomRef.child("meta").on("value", snap => { currentMeta = snap.val() || {}; renderAll(); });
  roomRef.child(`private/${playerId}`).on("value", snap => { myPrivate = snap.val() || {}; renderAll(); });
  roomRef.child("votes").on("value", snap => { const day = (currentMeta.day || 0).toString(); myVote = snap.child(`${day}/${playerId}`).val(); renderAll(); });
  roomRef.child("actions").on("value", snap => { const day = (currentMeta.day || 0).toString(); myNightActions = snap.child(day).val() || {}; renderAll(); });
}

function renderAll(){
  renderPlayers(currentPlayers);
  renderMyRole(currentPlayers[playerId] && currentPlayers[playerId].role);
  renderStatus();
  renderActionPanel();
}

function renderPlayers(players){
  const list = $("playersList"); list.innerHTML = "";
  const entries = Object.entries(players).sort((a,b)=>(a[1].joinedAt||0)-(b[1].joinedAt||0));
  if(!entries.length){ list.innerHTML = `<p class="hint">ما كاين حتى لاعب دابا.</p>`; return; }
  for(const [id,p] of entries){
    const div = document.createElement("div");
    div.className = "player" + (p.alive === false ? " dead" : "");
    const status = p.online ? "🟢" : "⚫";
    const crown = p.host ? " 👑" : "";
    const alive = p.alive === false ? "مقصي" : (p.role ? "حي" : "ينتظر");
    div.innerHTML = `<strong>${status} ${escapeHtml(p.name || "بدون اسم")}${crown}</strong><span class="tag">${alive}</span>`;
    list.appendChild(div);
  }
}
function renderMyRole(role){
  const me = currentPlayers[playerId] || {};
  if(!role){ $("myRoleText").textContent = "لم يتم توزيع الأدوار بعد"; $("myRoleHelp").textContent = "انتظر المدير يضغط على زر توزيع الأدوار."; return; }
  $("myRoleText").textContent = rolesAr[role] || role;
  if(me.alive === false){ $("myRoleHelp").textContent = "تم إقصاؤك. لا تصوت ولا تشارك في قرارات اللعبة."; return; }
  if(role === "mafia") $("myRoleHelp").textContent = "أنت من المافيا. في الليل اختر الضحية، وفي النهار حاول تخبي هويتك.";
  else if(role === "detective") $("myRoleHelp").textContent = myPrivate.detectiveResult || "أنت المحقق. في الليل اختر لاعباً لتعرف هل هو مافيا أم لا.";
  else if(role === "doctor") $("myRoleHelp").textContent = "أنت الطبيب. في الليل اختر لاعباً لحمايته من المافيا.";
  else $("myRoleHelp").textContent = "أنت مواطن صالح. ناقش وصوّت باش تخرجو المافيا.";
}
function renderStatus(){
  const phase = currentMeta.phase || "lobby";
  $("phaseText").textContent = phasesAr[phase] || phase;
  $("gameMessage").textContent = currentMeta.message || "";
}

function aliveEntries(){ return Object.entries(currentPlayers).filter(([id,p]) => p.alive !== false && p.role); }
function me(){ return currentPlayers[playerId] || {}; }

function renderActionPanel(){
  const panel = $("actionPanel"), opts = $("actionOptions"), title = $("actionTitle"), help = $("actionHelp");
  opts.innerHTML = ""; panel.classList.add("hidden");
  const m = me(); if(!m.role || m.alive === false) return;
  const phase = currentMeta.phase || "lobby"; const day = (currentMeta.day || 0).toString();

  if(phase === "night"){
    if(m.role === "mafia"){
      title.textContent = "اختيار المافيا"; help.textContent = "اختر الضحية. الأدوار لن تظهر لباقي اللاعبين."; panel.classList.remove("hidden");
      const selected = myNightActions.mafiaTargets && myNightActions.mafiaTargets[playerId];
      const candidates = aliveEntries().filter(([id,p]) => p.role !== "mafia");
      renderChoiceButtons(candidates, selected, async (targetId)=>{ await roomRef.child(`actions/${day}/mafiaTargets/${playerId}`).set(targetId); });
    } else if(m.role === "doctor"){
      title.textContent = "اختيار الطبيب"; help.textContent = "اختر لاعباً لحمايته هذه الليلة."; panel.classList.remove("hidden");
      const selected = myNightActions.doctorSave;
      renderChoiceButtons(aliveEntries(), selected, async (targetId)=>{ await roomRef.child(`actions/${day}/doctorSave`).set(targetId); });
    } else if(m.role === "detective"){
      title.textContent = "اختيار المحقق"; help.textContent = "اختر لاعباً للتحقق منه. النتيجة تظهر لك بعد حل الليل."; panel.classList.remove("hidden");
      const selected = myNightActions.detectiveCheck;
      const candidates = aliveEntries().filter(([id]) => id !== playerId);
      renderChoiceButtons(candidates, selected, async (targetId)=>{ await roomRef.child(`actions/${day}/detectiveCheck`).set(targetId); });
    } else {
      title.textContent = "مرحلة الليل"; help.textContent = "لا تملك إجراء في الليل. انتظر النهار."; panel.classList.remove("hidden");
    }
  } else if(phase === "vote"){
    title.textContent = "التصويت"; help.textContent = "اختر لاعباً للتصويت عليه. لا يمكنك التصويت على نفسك."; panel.classList.remove("hidden");
    const candidates = aliveEntries().filter(([id]) => id !== playerId);
    renderChoiceButtons(candidates, myVote, async (targetId)=>{ await roomRef.child(`votes/${day}/${playerId}`).set(targetId); });
  }
}
function renderChoiceButtons(candidates, selected, onClick){
  const opts = $("actionOptions");
  if(!candidates.length){ opts.innerHTML = `<p class="hint">لا يوجد اختيار متاح.</p>`; return; }
  for(const [id,p] of candidates){
    const btn = document.createElement("button");
    btn.className = "optionBtn" + (selected === id ? " selected" : "");
    btn.textContent = (selected === id ? "✅ " : "") + (p.name || "بدون اسم");
    btn.onclick = () => onClick(id);
    opts.appendChild(btn);
  }
}

async function assignRoles(){
  const snap = await roomRef.child("players").get(); const players = snap.val() || {};
  const ids = Object.keys(players).filter(id => players[id].online !== false);
  if(ids.length < 4) return alert("الأفضل على الأقل 4 لاعبين. لعبة المافيا الحقيقية كتكون أحسن من 6 لاعبين وفوق.");
  shuffle(ids);
  let mafiaCount = ids.length >= 11 ? 3 : (ids.length >= 8 ? 2 : 1);
  const roles = [];
  for(let i=0;i<mafiaCount;i++) roles.push("mafia");
  roles.push("detective"); roles.push("doctor");
  while(roles.length < ids.length) roles.push("citizen");
  shuffle(roles);
  const updates = { "meta/phase":"roles", "meta/day":0, "meta/message":"تم توزيع الأدوار. كل لاعب يشوف دوره فقط. المدير يضغط بداية الليل.", actions:null, votes:null, private:null };
  ids.forEach((id,i)=>{ updates[`players/${id}/role`] = roles[i]; updates[`players/${id}/alive`] = true; });
  await roomRef.update(updates);
}
async function startNight(){
  const nextDay = (currentMeta.day || 0) + 1;
  await roomRef.update({ "meta/phase":"night", "meta/day":nextDay, "meta/message":"ليل. المافيا تختار ضحية، الطبيب يحمي، والمحقق يتحقق." });
}
async function resolveNight(){
  const day = (currentMeta.day || 0).toString();
  const actionsSnap = await roomRef.child(`actions/${day}`).get(); const actions = actionsSnap.val() || {};
  const playersSnap = await roomRef.child("players").get(); const players = playersSnap.val() || {};
  const alive = Object.entries(players).filter(([id,p]) => p.alive !== false && p.role);
  const mafiaTargets = actions.mafiaTargets || {};
  const targetId = mostFrequent(Object.values(mafiaTargets));
  const saveId = actions.doctorSave || null;
  const detectiveId = alive.find(([id,p]) => p.role === "detective")?.[0];
  const checkId = actions.detectiveCheck || null;
  const updates = { "meta/phase":"day" };
  let msg = "طلع النهار. ";
  if(targetId && targetId !== saveId){ updates[`players/${targetId}/alive`] = false; msg += `تم إقصاء ${players[targetId]?.name || "لاعب"} في الليل.`; }
  else if(targetId && targetId === saveId){ msg += "الطبيب نجح في الحماية، لم يمت أي لاعب."; }
  else { msg += "المافيا لم تختَر ضحية."; }
  if(detectiveId && checkId && players[checkId]){
    const result = players[checkId].role === "mafia" ? "مافيا" : "ليس مافيا";
    updates[`private/${detectiveId}/detectiveResult`] = `نتيجة التحقيق: ${players[checkId].name} هو ${result}.`;
  }
  const winner = getWinnerAfterUpdates(players, updates);
  if(winner){ updates["meta/phase"] = "gameover"; msg += " " + winner; }
  updates["meta/message"] = msg;
  await roomRef.update(updates);
}
async function startVote(){
  await roomRef.update({ "meta/phase":"vote", "meta/message":"مرحلة التصويت. كل لاعب حي يصوت ضد لاعب واحد." });
}
async function resolveVote(){
  const day = (currentMeta.day || 0).toString();
  const votesSnap = await roomRef.child(`votes/${day}`).get(); const votes = votesSnap.val() || {};
  const playersSnap = await roomRef.child("players").get(); const players = playersSnap.val() || {};
  const aliveIds = Object.keys(players).filter(id => players[id].alive !== false && players[id].role);
  const validVotes = Object.entries(votes).filter(([voter,target]) => aliveIds.includes(voter) && aliveIds.includes(target)).map(([v,t]) => t);
  const result = topVote(validVotes);
  const updates = {};
  let msg;
  if(result.tie || !result.id){ msg = "وقع تعادل أو لم يصوت عدد كافٍ. لا يتم إقصاء أي لاعب."; }
  else { updates[`players/${result.id}/alive`] = false; msg = `نتيجة التصويت: تم إقصاء ${players[result.id]?.name || "لاعب"}.`; }
  const winner = getWinnerAfterUpdates(players, updates);
  updates["meta/phase"] = winner ? "gameover" : "day";
  updates["meta/message"] = winner ? (msg + " " + winner) : (msg + " ناقشوا ثم ابدأوا ليلة جديدة.");
  await roomRef.update(updates);
}
async function resetGame(){
  if(!confirm("واش بغيتي تعاود اللعبة من الأول؟")) return;
  const snap = await roomRef.child("players").get(); const players = snap.val() || {}; const updates = { actions:null, votes:null, private:null, "meta/phase":"lobby", "meta/day":0, "meta/message":"تمت إعادة اللعبة. وزعوا الأدوار من جديد." };
  Object.keys(players).forEach(id => { updates[`players/${id}/role`] = null; updates[`players/${id}/alive`] = null; });
  await roomRef.update(updates);
}
async function clearRoom(){ if(!confirm("واش بغيتي تحذف الغرفة؟")) return; await roomRef.remove(); leaveLocal(); }
function leaveLocal(){ if(roomRef) roomRef.off(); localStorage.removeItem("mafia_room"); localStorage.removeItem("mafia_is_host"); roomCode=""; isHost=false; showEntry(); }

function mostFrequent(arr){
  const counts = {}; arr.filter(Boolean).forEach(x=>counts[x]=(counts[x]||0)+1);
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;
}
function topVote(arr){
  const counts = {}; arr.forEach(x=>counts[x]=(counts[x]||0)+1);
  const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  if(!entries.length) return {id:null,tie:false};
  if(entries[1] && entries[1][1] === entries[0][1]) return {id:null,tie:true};
  return {id:entries[0][0],tie:false};
}
function getWinnerAfterUpdates(players, updates){
  const copy = JSON.parse(JSON.stringify(players));
  for(const [path,val] of Object.entries(updates)){
    const m = path.match(/^players\/([^/]+)\/alive$/); if(m) copy[m[1]].alive = val;
  }
  const alive = Object.values(copy).filter(p => p.alive !== false && p.role);
  const mafia = alive.filter(p => p.role === "mafia").length;
  const others = alive.length - mafia;
  if(mafia === 0) return "🎉 المواطنون فازوا!";
  if(mafia >= others) return "🟥 المافيا فازت!";
  return null;
}
function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } }
function escapeHtml(text){ return String(text).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c])); }
function openRules(){ $("rulesModal").classList.remove("hidden"); }
function closeRules(){ $("rulesModal").classList.add("hidden"); }

$("createRoomBtn").addEventListener("click",()=>joinRoom(true));
$("joinRoomBtn").addEventListener("click",()=>joinRoom(false));
$("assignRolesBtn").addEventListener("click",assignRoles);
$("startNightBtn").addEventListener("click",startNight);
$("resolveNightBtn").addEventListener("click",resolveNight);
$("startVoteBtn").addEventListener("click",startVote);
$("resolveVoteBtn").addEventListener("click",resolveVote);
$("resetGameBtn").addEventListener("click",resetGame);
$("clearRoomBtn").addEventListener("click",clearRoom);
$("leaveBtn").addEventListener("click",leaveLocal);
$("rulesBtn").addEventListener("click",openRules);
$("rulesBtn2").addEventListener("click",openRules);
$("closeRulesBtn").addEventListener("click",closeRules);
$("rulesModal").addEventListener("click",e=>{ if(e.target.id === "rulesModal") closeRules(); });

showEntry(); if(playerName) $("nameInput").value = playerName; if(roomCode) $("roomInput").value = roomCode; initFirebase();
