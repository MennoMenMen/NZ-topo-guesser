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
    answers: {}
  }, null, 2));
}

// Helper functions for data management
function loadData() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    // Ensure answers object exists for backward compatibility
    if (!data.answers) {
      data.answers = {};
    }
    return data;
  } catch (e) {
    console.error("Error loading data:", e);
    return { guesses: [], leaderboards: {}, answers: {} };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// API Endpoints

// Save a player's guess
app.post("/guess", (req, res) => {
  const data = loadData();
  const { user, seed, round, lat, lng, distance } = req.body;
  
  if (!user || seed === undefined) {
    return res.status(400).json({ error: "Missing user or seed" });
  }

  const timestamp = new Date().toISOString();
  const guess = { user, seed: String(seed), round, lat, lng, distance, timestamp };

  // Add to guesses
  data.guesses.push(guess);

  // Calculate score for this round
  const roundScore = Math.max(0, Math.round(100 - 40 * (Math.log(distance + 1) - 5)));

  // Update leaderboard - ACCUMULATE scores instead of replacing
  if (!data.leaderboards[seed]) {
    data.leaderboards[seed] = {};
  }

  if (!data.leaderboards[seed][user]) {
    data.leaderboards[seed][user] = {
      totalScore: 0,
      roundScores: {},
      rounds: 0,
      bestDistance: Infinity,
      timestamp
    };
  }

  // Add this round's score
  data.leaderboards[seed][user].roundScores[round] = {
    score: roundScore,
    lat,
    lng,
    distance,
    timestamp
  };
  
  // Update totals
  data.leaderboards[seed][user].totalScore += roundScore;
  data.leaderboards[seed][user].rounds = Math.max(data.leaderboards[seed][user].rounds, round);
  data.leaderboards[seed][user].bestDistance = Math.min(data.leaderboards[seed][user].bestDistance, distance);
  data.leaderboards[seed][user].timestamp = timestamp;

  saveData(data);
  res.json({ message: "Guess saved", score: roundScore });
});

// Save the correct answer for a round
app.post("/answer", (req, res) => {
  const data = loadData();
  const { seed, round, lat, lng } = req.body;
  
  if (seed === undefined || round === undefined || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!data.answers[seed]) {
    data.answers[seed] = {};
  }

  data.answers[seed][round] = {
    lat,
    lng,
    timestamp: new Date().toISOString()
  };

  saveData(data);
  res.json({ message: "Answer saved" });
});

// Get all guesses for a specific seed
app.get("/guesses", (req, res) => {
  const { seed } = req.query;
  if (!seed) return res.status(400).json({ error: "Seed required" });
  
  const data = loadData();
  res.json(data.guesses.filter(g => g.seed === String(seed)));
});

// Get guesses for a specific seed and round
app.get("/guesses/:seed/:round", (req, res) => {
  const { seed, round } = req.params;
  const data = loadData();
  
  const roundGuesses = data.guesses.filter(g => 
    g.seed === String(seed) && g.round === parseInt(round)
  );
  
  res.json(roundGuesses);
});

// Get leaderboard for a specific seed
app.get("/leaderboard", (req, res) => {
  const { seed } = req.query;
  if (!seed) return res.status(400).json({ error: "Seed required" });

  const data = loadData();
  const leaderboard = Object.entries(data.leaderboards[seed] || {})
    .map(([user, entry]) => ({
      user,
      totalScore: entry.totalScore,
      rounds: entry.rounds,
      averageScore: entry.rounds > 0 ? Math.round(entry.totalScore / entry.rounds) : 0,
      bestDistance: entry.bestDistance === Infinity ? null : entry.bestDistance,
      timestamp: entry.timestamp
    }))
    .sort((a, b) => b.totalScore - a.totalScore);

  res.json(leaderboard);
});

// Get detailed analysis for a specific seed
app.get("/seed-analysis/:seed", (req, res) => {
  const { seed } = req.params;
  const data = loadData();
  
  // Group guesses by round
  const roundData = {};
  const answers = data.answers[seed] || {};
  
  data.guesses
    .filter(g => g.seed === String(seed))
    .forEach(guess => {
      if (!roundData[guess.round]) {
        roundData[guess.round] = [];
      }
      roundData[guess.round].push({
        user: guess.user,
        lat: guess.lat,
        lng: guess.lng,
        distance: guess.distance,
        timestamp: guess.timestamp,
        score: Math.max(0, Math.round(100 - 40 * (Math.log(guess.distance + 1) - 5)))
      });
    });

  // Sort each round's guesses by score (best first)
  Object.keys(roundData).forEach(round => {
    roundData[round].sort((a, b) => b.score - a.score);
  });

  res.json({ roundData, answers });
});

// Get recent seeds with player counts and top scores
app.get("/api/seeds/recent", (req, res) => {
  const data = loadData();
  
  // Get unique seeds with their most recent play time
  const seedMap = {};
  data.guesses.forEach(guess => {
    if (!seedMap[guess.seed] || guess.timestamp > seedMap[guess.seed].timestamp) {
      seedMap[guess.seed] = {
        timestamp: guess.timestamp,
        playerCount: new Set() // Using Set to count unique players
      };
    }
    seedMap[guess.seed].playerCount.add(guess.user);
  });

  // Convert to array and sort by most recent
  const recentSeeds = Object.entries(seedMap)
    .map(([seed, info]) => ({
      seed,
      timestamp: info.timestamp,
      playerCount: info.playerCount.size,
      topScore: data.leaderboards[seed] 
        ? Math.max(...Object.values(data.leaderboards[seed]).map(e => e.totalScore || 0))
        : 0,
      totalRounds: data.answers[seed] ? Object.keys(data.answers[seed]).length : 0
    }))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 15);

  res.json(recentSeeds);
});

// Google authentication
app.post("/auth/google", async (req, res) => {
  const { token } = req.body;
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    res.json({ 
      user: { 
        name: payload.name,
        email: payload.email,
        picture: payload.picture 
      } 
    });
  } catch (error) {
    console.error("Google auth error:", error);
    res.status(401).json({ error: "Invalid token" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`🎮 Open http://localhost:${PORT} in your browser`);
});
