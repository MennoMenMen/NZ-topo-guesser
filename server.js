// server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { OAuth2Client } = require("google-auth-library");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Google Client ID
const GOOGLE_CLIENT_ID = "135826388765-svojries0i42qbn8te7uu6fkqq3ptpln.apps.googleusercontent.com";
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Persistent storage
const DATA_FILE = path.join(__dirname, "gameData.json");

// Initialize data file
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    guesses: [],
    leaderboards: {},
    answers: {},
    seedSettings: {}
  }, null, 2));
}

// Load/save helpers
function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE));
  } catch (e) {
    console.error("Error loading data:", e);
    return { guesses: [], leaderboards: {}, answers: {}, seedSettings: {} };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// POST /guess - Save guess
app.post("/guess", (req, res) => {
  const data = loadData();
  const { user, seed, round, lat, lng, distance } = req.body;
  if (!user || seed === undefined || round === undefined) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const timestamp = new Date().toISOString();
  const guess = { user, seed: String(seed), round, lat, lng, distance, timestamp };
  data.guesses.push(guess);

  const score = Math.max(0, Math.round(100 - 40 * (Math.log(distance + 1) - 5)));

  if (!data.leaderboards[seed]) data.leaderboards[seed] = {};
  if (!data.leaderboards[seed][user]) {
    data.leaderboards[seed][user] = { totalScore: 0, rounds: 0, bestDistance: Infinity, timestamp };
  }
  data.leaderboards[seed][user].totalScore += score;
  data.leaderboards[seed][user].rounds++;
  data.leaderboards[seed][user].bestDistance = Math.min(data.leaderboards[seed][user].bestDistance, distance);
  data.leaderboards[seed][user].timestamp = timestamp;

  saveData(data);
  res.json({ message: "Guess saved", score });
});

// POST /answer - Save correct location
app.post("/answer", (req, res) => {
  const data = loadData();
  const { seed, round, lat, lng } = req.body;
  if (!seed || round === undefined) return res.status(400).json({ error: "Missing seed or round" });
  if (!data.answers[seed]) data.answers[seed] = {};
  data.answers[seed][round] = { lat, lng, timestamp: new Date().toISOString() };
  saveData(data);
  res.json({ message: "Answer saved" });
});

// GET /guesses/:seed/:round
app.get("/guesses/:seed/:round", (req, res) => {
  const { seed, round } = req.params;
  const data = loadData();
  res.json(data.guesses.filter(g => g.seed === String(seed) && g.round === parseInt(round)));
});

// GET /guesses?seed=123
app.get("/guesses", (req, res) => {
  const { seed } = req.query;
  if (!seed) return res.status(400).json({ error: "Seed required" });
  const data = loadData();
  res.json(data.guesses.filter(g => g.seed === String(seed)));
});

// GET /leaderboard?seed=123
app.get("/leaderboard", (req, res) => {
  const { seed } = req.query;
  if (!seed) return res.status(400).json({ error: "Seed required" });
  const data = loadData();
  const leaderboard = Object.entries(data.leaderboards[seed] || {})
    .map(([user, entry]) => ({
      user,
      totalScore: entry.totalScore,
      rounds: entry.rounds,
      averageScore: Math.round(entry.totalScore / entry.rounds),
      bestDistance: entry.bestDistance === Infinity ? null : entry.bestDistance,
      timestamp: entry.timestamp
    }))
    .sort((a, b) => b.totalScore - a.totalScore);
  res.json(leaderboard);
});

// GET /seed-settings?seed=123
app.get("/seed-settings", (req, res) => {
  const { seed } = req.query;
  const data = loadData();
  res.json(data.seedSettings[seed] || { name: `Seed ${seed}`, description: "", beachMode: false, urbanMode: false });
});

// POST /seed-settings - Save seed name, description, mode
app.post("/seed-settings", (req, res) => {
  const data = loadData();
  const { seed, name, description, beachMode, urbanMode } = req.body;
  if (!seed) return res.status(400).json({ error: "Seed required" });
  if (!data.seedSettings[seed]) {
    data.seedSettings[seed] = {
      name: name || `Seed ${seed}`,
      description: description || "",
      beachMode: !!beachMode,
      urbanMode: !!urbanMode,
      timestamp: new Date().toISOString()
    };
  }
  saveData(data);
  res.json({ message: "Settings saved" });
});

// GET /api/seeds/recent - Sorted by player count
app.get("/api/seeds/recent", (req, res) => {
  const data = loadData();
  const seedMap = {};
  data.guesses.forEach(g => {
    if (!seedMap[g.seed]) seedMap[g.seed] = { timestamp: g.timestamp, playerCount: new Set() };
    seedMap[g.seed].playerCount.add(g.user);
    seedMap[g.seed].timestamp = g.timestamp;
  });
  const recent = Object.entries(seedMap)
    .map(([seed, info]) => ({
      seed,
      playerCount: info.playerCount.size,
      timestamp: info.timestamp,
      totalRounds: data.answers[seed] ? Object.keys(data.answers[seed]).length : 0,
      topScore: data.leaderboards[seed] ? Math.max(...Object.values(data.leaderboards[seed]).map(e => e.totalScore)) : 0
    }))
    .sort((a, b) => b.playerCount - a.playerCount);
  res.json(recent);
});

// GET /seed-analysis/:seed
app.get("/seed-analysis/:seed", (req, res) => {
  const { seed } = req.params;
  const data = loadData();
  const roundData = {};
  const answers = data.answers[seed] || {};

  data.guesses
    .filter(g => g.seed === String(seed))
    .forEach(guess => {
      if (!roundData[guess.round]) roundData[guess.round] = [];
      roundData[guess.round].push({
        user: guess.user,
        lat: guess.lat,
        lng: guess.lng,
        distance: guess.distance,
        timestamp: guess.timestamp,
        score: Math.max(0, Math.round(100 - 40 * (Math.log(guess.distance + 1) - 5)))
      });
    });

  res.json({ roundData, answers, settings: data.seedSettings[seed] });
});

// POST /auth/google
app.post("/auth/google", async (req, res) => {
  const { token } = req.body;
  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    res.json({ user: { name: payload.name } });
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`🎮 Open http://localhost:${PORT} in your browser`);
});
