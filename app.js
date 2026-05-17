const $ = (id) => document.getElementById(id);

let app, db;
let roomCode = localStorage.getItem("mafia_room") || "";
let playerId = localStorage.getItem("mafia_player_id") || crypto.randomUUID();
let playerName = localStorage.getItem("mafia_player_name") || "";
let isHost = localStorage.getItem("mafia_is_host") === "true";
let roomRef = null;

localStorage.setItem("mafia_player_id", playerId);

const rolesAr = {
  mafia: "مافيا",
  detective: "محقق",
  doctor: "طبيب",
  citizen: "مواطن صالح"
};

function firebaseReady() {
  return firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("PASTE_") && firebaseConfig.databaseURL && !firebaseConfig.databaseURL.includes("PASTE_");
}

function initFirebase() {
  if (!firebaseReady()) {
    $("setupBox").classList.remove("hidden");
    return false;
  }
  app = firebase.initializeApp(firebaseConfig);
  db = firebase.database();
  $("setupBox").classList.add("hidden");
  return true;
}

function randomRoomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function cleanRoomCode(value) {
  return (value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 12);
}

function saveSession() {
  localStorage.setItem("mafia_room", roomCode);
  localStorage.setItem("mafia_player_name", playerName);
  localStorage.setItem("mafia_is_host", String(isHost));
}

function showGame() {
  $("entryBox").classList.add("hidden");
  $("gameBox").classList.remove("hidden");
  $("roomCodeText").textContent = roomCode;
  $("hostPanel").classList.toggle("hidden", !isHost);
}

function showEntry() {
  $("entryBox").classList.remove("hidden");
  $("gameBox").classList.add("hidden");
  $("roomInput").value = roomCode || "";
  $("nameInput").value = playerName || "";
}

async function joinRoom(hostMode = false) {
  if (!initFirebase()) return;

  const typedName = $("nameInput").value.trim();
  const typedRoom = cleanRoomCode($("roomInput").value);

  playerName = typedName;
  if (!playerName) return alert("كتب اسم اللاعب أولاً");

  roomCode = hostMode ? (typedRoom || randomRoomCode()) : typedRoom;
  if (!roomCode) return alert("كتب كود الغرفة أو دير إنشاء غرفة");

  isHost = hostMode;
  saveSession();
  showGame();

  roomRef = db.ref(`rooms/${roomCode}`);
  if (hostMode) {
    await roomRef.child("meta").update({ createdAt: Date.now(), hostId: playerId });
  }

  await roomRef.child(`players/${playerId}`).update({
    name: playerName,
    joinedAt: Date.now(),
    online: true,
    host: isHost
  });

  roomRef.child(`players/${playerId}/online`).onDisconnect().set(false);
  listenRoom();
}

function listenRoom() {
  roomRef.child("players").on("value", (snap) => {
    const players = snap.val() || {};
    renderPlayers(players);
    const me = players[playerId];
    renderMyRole(me && me.role);
  });
}

function renderPlayers(players) {
  const list = $("playersList");
  list.innerHTML = "";
  const entries = Object.entries(players).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));

  if (!entries.length) {
    list.innerHTML = `<p class="hint">ما كاين حتى لاعب دابا.</p>`;
    return;
  }

  for (const [id, p] of entries) {
    const div = document.createElement("div");
    div.className = "player";
    const status = p.online ? "🟢" : "⚫";
    const crown = p.host ? " 👑" : "";
    const role = isHost && p.role ? `<span class="role">${rolesAr[p.role] || p.role}</span>` : `<span class="hint">${p.online ? "متصل" : "غير متصل"}</span>`;
    div.innerHTML = `<strong>${status} ${escapeHtml(p.name || "بدون اسم")}${crown}</strong>${role}`;
    list.appendChild(div);
  }
}

function renderMyRole(role) {
  if (!role) {
    $("myRoleText").textContent = "لم يتم توزيع الأدوار بعد";
    $("myRoleHelp").textContent = "انتظر المدير يضغط على زر توزيع الأدوار.";
    return;
  }
  $("myRoleText").textContent = rolesAr[role] || role;
  if (role === "mafia") $("myRoleHelp").textContent = "أنت من المافيا. حاول تخبي هويتك.";
  else if (role === "detective") $("myRoleHelp").textContent = "أنت المحقق. في النسخة القادمة ستتحقق من اللاعبين ليلاً.";
  else if (role === "doctor") $("myRoleHelp").textContent = "أنت الطبيب. في النسخة القادمة ستحمي لاعباً كل ليلة.";
  else $("myRoleHelp").textContent = "أنت مواطن صالح. حاول تكتشف المافيا.";
}

async function assignRoles() {
  const snap = await roomRef.child("players").get();
  const players = snap.val() || {};
  const ids = Object.keys(players).filter((id) => players[id].online !== false);

  if (ids.length < 2) return alert("خاص على الأقل جوج لاعبين للتجربة");

  shuffle(ids);
  const roles = [];
  roles.push("mafia");
  if (ids.length >= 4) roles.push("detective");
  if (ids.length >= 5) roles.push("doctor");
  while (roles.length < ids.length) roles.push("citizen");
  shuffle(roles);

  const updates = {};
  ids.forEach((id, index) => updates[`players/${id}/role`] = roles[index]);
  await roomRef.update(updates);
}

async function resetRoles() {
  const snap = await roomRef.child("players").get();
  const players = snap.val() || {};
  const updates = {};
  Object.keys(players).forEach((id) => updates[`players/${id}/role`] = null);
  await roomRef.update(updates);
}

async function clearRoom() {
  if (!confirm("واش بغيتي تحذف الغرفة؟")) return;
  await roomRef.remove();
  leaveLocal();
}

function leaveLocal() {
  if (roomRef) roomRef.off();
  localStorage.removeItem("mafia_room");
  localStorage.removeItem("mafia_is_host");
  roomCode = "";
  isHost = false;
  showEntry();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));
}

$("createRoomBtn").addEventListener("click", () => joinRoom(true));
$("joinRoomBtn").addEventListener("click", () => joinRoom(false));
$("assignRolesBtn").addEventListener("click", assignRoles);
$("resetRolesBtn").addEventListener("click", resetRoles);
$("clearRoomBtn").addEventListener("click", clearRoom);
$("leaveBtn").addEventListener("click", leaveLocal);

showEntry();
if (playerName) $("nameInput").value = playerName;
if (roomCode) $("roomInput").value = roomCode;
initFirebase();
