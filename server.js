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

let db = { users: [], buses: [] };
if (fs.existsSync(DB_FILE)) {
  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

const defaultUsers = [
  { id: 'admin-1', username: 'admin', password: 'admin123', role: 'admin', name: 'المدير' },
  { id: 'driver-1', username: 'driver1', password: '123', role: 'driver', name: 'سائق 1', busName: 'حافلة 1' },
  { id: 'driver-2', username: 'driver2', password: '123', role: 'driver', name: 'سائق 2', busName: 'حافلة 2' },
  { id: 'driver-3', username: 'driver3', password: '123', role: 'driver', name: 'سائق 3', busName: 'حافلة 3' },
  { id: 'driver-4', username: 'driver4', password: '123', role: 'driver', name: 'سائق 4', busName: 'حافلة 4' },
  { id: 'driver-5', username: 'driver5', password: '123', role: 'driver', name: 'سائق 5', busName: 'حافلة 5' },
  { id: 'driver-6', username: 'driver6', password: '123', role: 'driver', name: 'سائق 6', busName: 'حافلة 6' },
  { id: 'driver-7', username: 'driver7', password: '123', role: 'driver', name: 'سائق 7', busName: 'حافلة 7' },
  { id: 'driver-8', username: 'driver8', password: '123', role: 'driver', name: 'سائق 8', busName: 'حافلة 8' },
  { id: 'driver-9', username: 'driver9', password: '123', role: 'driver', name: 'سائق 9', busName: 'حافلة 9' },
  { id: 'driver-10', username: 'driver10', password: '123', role: 'driver', name: 'سائق 10', busName: 'حافلة 10' },
  { id: 'driver-11', username: 'driver11', password: '123', role: 'driver', name: 'سائق 11', busName: 'حافلة 11' },
  { id: 'driver-12', username: 'driver12', password: '123', role: 'driver', name: 'سائق 12', busName: 'حافلة 12' },
  { id: 'driver-13', username: 'driver13', password: '123', role: 'driver', name: 'سائق 13', busName: 'حافلة 13' },
  { id: 'driver-14', username: 'driver14', password: '123', role: 'driver', name: 'سائق 14', busName: 'حافلة 14' },
  { id: 'driver-15', username: 'driver15', password: '123', role: 'driver', name: 'سائق 15', busName: 'حافلة 15' },
  { id: 'driver-16', username: 'driver16', password: '123', role: 'driver', name: 'سائق 16', busName: 'حافلة 16' },
  { id: 'driver-17', username: 'driver17', password: '123', role: 'driver', name: 'سائق 17', busName: 'حافلة 17' },
  { id: 'driver-18', username: 'driver18', password: '123', role: 'driver', name: 'سائق 18', busName: 'حافلة 18' },
  { id: 'driver-19', username: 'driver19', password: '123', role: 'driver', name: 'سائق 19', busName: 'حافلة 19' },
  { id: 'driver-20', username: 'driver20', password: '123', role: 'driver', name: 'سائق 20', busName: 'حافلة 20' }
];

let needsSave = false;
for (const du of defaultUsers) {
  if (!db.users.find(u => u.username === du.username)) {
    db.users.push({
      id: du.id,
      username: du.username,
      password: bcrypt.hashSync(du.password, 10),
      role: du.role,
      name: du.name,
      busName: du.busName || '',
      createdAt: Date.now()
    });
    needsSave = true;
  }
}
if (needsSave) saveDB();

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

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

app.get('/api/users', authMiddleware, adminOnly, (req, res) => {
  const users = db.users.map(u => ({ id: u.id, username: u.username, role: u.role, name: u.name, busName: u.busName, phone: u.phone, createdAt: u.createdAt }));
  res.json(users);
});

app.delete('/api/users/:id', authMiddleware, adminOnly, (req, res) => {
  db.users = db.users.filter(u => u.id !== req.params.id);
  saveDB();
  res.json({ ok: true });
});

const activeDrivers = new Map();
const dashboardClients = new Set();
const OFFLINE_TIMEOUT = 30000;

function broadcast(data) {
  const msg = JSON.stringify(data);
  dashboardClients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

function isDriverOnline(driver) {
  if (!driver.data || !driver.data.timestamp) return false;
  return (Date.now() - driver.data.timestamp) < OFFLINE_TIMEOUT;
}

function markOfflineIfExpired() {
  activeDrivers.forEach((driver, id) => {
    if (!isDriverOnline(driver) && driver._online) {
      driver._online = false;
      broadcast({ type: 'driverOffline', driverId: id });
    }
  });
}

setInterval(markOfflineIfExpired, 5000);

app.post('/api/track', (req, res) => {
  try {
    const { token, lat, lng, speed, heading, speedLimit } = req.body;
    if (!token) return res.status(400).json({ error: 'No token' });

    const user = jwt.verify(token, JWT_SECRET);
    if (user.role !== 'driver') return res.status(403).json({ error: 'Not a driver' });

    const existing = activeDrivers.get(user.id) || {};
    const data = { lat, lng, speed: speed || 0, heading: heading || 0, timestamp: Date.now() };

    activeDrivers.set(user.id, {
      ...existing,
      name: user.name,
      busName: user.busName || existing.busName || '',
      data,
      _online: true
    });

    broadcast({
      type: 'driverUpdate',
      driverId: user.id,
      name: user.name,
      busName: user.busName || existing.busName || '',
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
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);

        if (msg.type === 'auth') {
          try {
            const user = jwt.verify(msg.token, JWT_SECRET);
            if (user.role !== 'driver') return ws.send(JSON.stringify({ type: 'error', msg: 'Not a driver' }));

            ws.userId = user.id;
            ws.userName = user.name;

            const existing = activeDrivers.get(user.id) || {};
            activeDrivers.set(user.id, {
              ...existing,
              ws,
              name: user.name,
              busName: user.busName || existing.busName || '',
              _online: true
            });

            ws.send(JSON.stringify({ type: 'authOk' }));
            console.log(`Driver connected: ${user.name}`);
          } catch (e) {
            ws.send(JSON.stringify({ type: 'error', msg: 'Invalid token' }));
          }
        }

        if (msg.type === 'location' && ws.userId) {
          const driver = activeDrivers.get(ws.userId);
          if (driver) {
            const data = { lat: msg.lat, lng: msg.lng, speed: msg.speed || 0, heading: msg.heading || 0, timestamp: Date.now() };
            driver.data = data;
            driver._online = true;

            broadcast({
              type: 'driverUpdate',
              driverId: ws.userId,
              name: ws.userName,
              busName: driver.busName || '',
              ...data,
              online: true
            });

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
        const driver = activeDrivers.get(ws.userId);
        if (driver) {
          driver.ws = null;
          if (!isDriverOnline(driver)) {
            driver._online = false;
            broadcast({ type: 'driverOffline', driverId: ws.userId });
          }
        }
        console.log(`Driver WS closed: ${ws.userId} (HTTP tracking may continue)`);
      }
    });

  } else if (url === '/admin') {
    dashboardClients.add(ws);

    const drivers = [];
    activeDrivers.forEach((driver, id) => {
      if (driver.data) {
        drivers.push({
          driverId: id,
          name: driver.name,
          busName: driver.busName || '',
          ...driver.data,
          online: isDriverOnline(driver)
        });
      }
    });
    ws.send(JSON.stringify({ type: 'init', drivers }));

    ws.on('close', () => dashboardClients.delete(ws));
  }
});

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
