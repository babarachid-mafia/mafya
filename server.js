const express = require('express');
const http = require('http');
const os = require('os');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;

app.use(express.static('public'));

let players = [];
let assignments = {};

function getLocalIPs() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) results.push(net.address);
    }
  }
  return results;
}

function publicPlayers() {
  return players.map(p => ({ id: p.id, name: p.name, role: assignments[p.id] || null }));
}

function broadcastState() {
  io.emit('state', { players: publicPlayers() });
  for (const p of players) {
    io.to(p.id).emit('myRole', assignments[p.id] || null);
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

io.on('connection', (socket) => {
  socket.on('join', (name) => {
    name = String(name || '').trim().slice(0, 20);
    if (!name) return;

    const existing = players.find(p => p.id === socket.id);
    if (existing) existing.name = name;
    else players.push({ id: socket.id, name });

    broadcastState();
  });

  socket.on('assignRoles', () => {
    const ids = shuffle(players.map(p => p.id));
    assignments = {};

    if (ids.length === 0) return;
    assignments[ids[0]] = 'مافيا';
    if (ids.length >= 2) assignments[ids[1]] = 'مواطن صالح';
    for (let i = 2; i < ids.length; i++) assignments[ids[i]] = 'مواطن صالح';

    broadcastState();
  });

  socket.on('clearRoles', () => {
    assignments = {};
    broadcastState();
  });

  socket.on('disconnect', () => {
    players = players.filter(p => p.id !== socket.id);
    delete assignments[socket.id];
    broadcastState();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('======================================');
  console.log('Mafia WiFi Test is running');
  console.log('Open this link from phones on same WiFi:');
  for (const ip of getLocalIPs()) console.log(`http://${ip}:${PORT}`);
  console.log('======================================');
});
