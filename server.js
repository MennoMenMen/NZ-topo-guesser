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

// Initialize data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    guesses: [],
    leaderboards: {},
    answers: {},
    seedSettings: {}
  }, null, 2));
}

// Helper functions
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

// POST /guess - Save a guess
app.post("/guess", (req, res) => {
  const data = loadData();
  const { user, seed, round, lat, lng, distance } = req.body;
  if (!user || seed === undefined || round === undefined) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const timestamp = new Date().toISOString();
  const guess = { user, seed: String(seed), round, lat, lng, distance, timestamp };
  data.guesses.push(guess);

  // Calculate score
  const score = Math.max(0, Math.round(100 - 40 * (Math.log(distance + 1) - 5)));

  // Update leaderboard
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

// GET /guesses/:seed/:round - Get guesses for a specific round
app.get("/guesses/:seed/:round", (req, res) => {
  const { seed, round } = req.params;
  const data = loadData();
  const guesses = data.guesses.filter(g => g.seed === String(seed) && g.round === parseInt(round));
  res.json(guesses);
});

// GET /guesses?seed=123 - All guesses for seed
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

// GET /api/seeds/recent - Seeds sorted by player count
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
      topScore: data.leaderboards[seed] 
        ? Math.max(...Object.values(data.leaderboards[seed]).map(e => e.totalScore))
        : 0
    }))
    .sort((a, b) => b.playerCount - a.playerCount); // Sort by player count
  res.json(recent);
});

// POST /seed-settings - Save custom name and mode
app.post("/seed-settings", (req, res) => {
  const data = loadData();
  const { seed, name, beachMode, urbanMode } = req.body;
  if (!seed) return res.status(400).json({ error: "Seed required" });
  if (!data.seedSettings[seed]) {
    data.seedSettings[seed] = { name: name || `Seed ${seed}`, beachMode: !!beachMode, urbanMode: !!urbanMode };
  }
  saveData(data);
  res.json({ message: "Settings saved" });
});

// GET /seed-settings?seed=123
app.get("/seed-settings", (req, res) => {
  const { seed } = req.query;
  const data = loadData();
  res.json(data.seedSettings[seed] || { name: `Seed ${seed}`, beachMode: false, urbanMode: false });
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
