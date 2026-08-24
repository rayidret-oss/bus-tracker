const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 4567;
const JWT_SECRET = 'bus-tracker-najed-2024';
const DB_FILE = path.join(__dirname, 'db.json');

// --- Database ---
let db = { users: [], buses: [] };
if (fs.existsSync(DB_FILE)) {
  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
} else {
  // Create default admin
  const adminHash = bcrypt.hashSync('admin123', 10);
  db.users.push({
    id: 'admin-1',
    username: 'admin',
    password: adminHash,
    role: 'admin',
    name: 'المدير',
    createdAt: Date.now()
  });
  saveDB();
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// --- Auth Routes ---
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور خاطئة' });
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, name: user.name } });
});

app.post('/api/auth/register', authMiddleware, adminOnly, (req, res) => {
  const { username, password, name, role, busName, phone } = req.body;
  if (db.users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
  }
  const id = 'user-' + Date.now();
  const hash = bcrypt.hashSync(password, 10);
  db.users.push({ id, username, password: hash, role: role || 'driver', name, busName: busName || '', phone: phone || '', createdAt: Date.now() });
  saveDB();
  res.json({ ok: true, user: { id, username, role: role || 'driver', name } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ id: user.id, username: user.username, role: user.role, name: user.name, busName: user.busName });
});

// --- User Management (Admin) ---
app.get('/api/users', authMiddleware, adminOnly, (req, res) => {
  const users = db.users.map(u => ({ id: u.id, username: u.username, role: u.role, name: u.name, busName: u.busName, phone: u.phone, createdAt: u.createdAt }));
  res.json(users);
});

app.delete('/api/users/:id', authMiddleware, adminOnly, (req, res) => {
  db.users = db.users.filter(u => u.id !== req.params.id);
  saveDB();
  res.json({ ok: true });
});

// --- Bus Tracking ---
const activeDrivers = new Map(); // driverId -> { ws, busData }
const dashboardClients = new Set();

function broadcast(data) {
  const msg = JSON.stringify(data);
  dashboardClients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

// --- HTTP POST location (from background service) ---
app.post('/api/track', (req, res) => {
  try {
    const { token, lat, lng, speed, heading, speedLimit } = req.body;
    if (!token) return res.status(400).json({ error: 'No token' });

    const user = jwt.verify(token, JWT_SECRET);
    if (user.role !== 'driver') return res.status(403).json({ error: 'Not a driver' });

    const data = { lat, lng, speed: speed || 0, heading: heading || 0, timestamp: Date.now() };
    activeDrivers.set(user.id, { ...activeDrivers.get(user.id), name: user.name, data });

    broadcast({
      type: 'driverUpdate',
      driverId: user.id,
      name: user.name,
      ...data,
      online: true
    });

    if (speed > (speedLimit || 80)) {
      broadcast({
        type: 'speedAlert',
        driverId: user.id,
        name: user.name,
        speed,
        limit: speedLimit || 80
      });
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

wss.on('connection', (ws, req) => {
  const url = req.url;

  if (url === '/track') {
    // Driver tracking connection
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);

        if (msg.type === 'auth') {
          try {
            const user = jwt.verify(msg.token, JWT_SECRET);
            if (user.role !== 'driver') return ws.send(JSON.stringify({ type: 'error', msg: 'Not a driver' }));

            ws.userId = user.id;
            ws.userName = user.name;
            activeDrivers.set(user.id, { ws, name: user.name });
            ws.send(JSON.stringify({ type: 'authOk' }));
            console.log(`Driver connected: ${user.name}`);
          } catch (e) {
            ws.send(JSON.stringify({ type: 'error', msg: 'Invalid token' }));
          }
        }

        if (msg.type === 'location' && ws.userId) {
          const driver = activeDrivers.get(ws.userId);
          if (driver) {
            driver.data = { lat: msg.lat, lng: msg.lng, speed: msg.speed || 0, heading: msg.heading || 0, timestamp: Date.now() };

            broadcast({
              type: 'driverUpdate',
              driverId: ws.userId,
              name: ws.userName,
              ...driver.data,
              online: true
            });

            // Speed alert
            if (msg.speed > (msg.speedLimit || 80)) {
              broadcast({
                type: 'speedAlert',
                driverId: ws.userId,
                name: ws.userName,
                speed: msg.speed,
                limit: msg.speedLimit || 80
              });
            }
          }
        }
      } catch (e) {}
    });

    ws.on('close', () => {
      if (ws.userId) {
        activeDrivers.delete(ws.userId);
        broadcast({ type: 'driverOffline', driverId: ws.userId });
        console.log(`Driver disconnected: ${ws.userId}`);
      }
    });

  } else if (url === '/admin') {
    dashboardClients.add(ws);

    // Send current state
    const drivers = [];
    activeDrivers.forEach((driver, id) => {
      if (driver.data) {
        drivers.push({ driverId: id, name: driver.name, ...driver.data, online: true });
      }
    });
    ws.send(JSON.stringify({ type: 'init', drivers }));

    ws.on('close', () => dashboardClients.delete(ws));
  }
});

// --- Start ---
server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  Bus Tracker Pro - by Najed Al-Eizari`);
  console.log(`========================================`);
  console.log(`  Dashboard:  http://localhost:${PORT}/admin.html`);
  console.log(`  Driver App: http://localhost:${PORT}/driver/`);
  console.log(`  Login:      http://localhost:${PORT}/login.html`);
  console.log(`  Admin User: admin / admin123`);
  console.log(`========================================\n`);
});
