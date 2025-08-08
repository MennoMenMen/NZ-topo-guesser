import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { supabase } from './supabaseClient.js';

const app = express();
app.use(express.json());

// POST a guess (insert)
app.post('/guesses', async (req, res) => {
  const { user, seed, round, lat, lng, distance } = req.body;
  const { data, error } = await supabase
    .from('guesses')
    .insert([{ user, seed, round, lat, lng, distance }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, data });
});

// POST an answer (insert)
app.post('/answers', async (req, res) => {
  const { seed, round, lat, lng } = req.body;
  const { data, error } = await supabase
    .from('answers')
    .insert([{ seed, round, lat, lng }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, data });
});

// GET guesses for a specific seed and round
app.get('/guesses/:seed/:round', async (req, res) => {
  const { seed, round } = req.params;
  const { data, error } = await supabase
    .from('guesses')
    .select('*')
    .eq('seed', Number(seed))
    .eq('round', Number(round));
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET all guesses for a specific seed (query param)
app.get('/guesses', async (req, res) => {
  const seed = Number(req.query.seed);
  if (!seed) return res.status(400).json({ error: 'Seed query param is required' });

  const { data, error } = await supabase
    .from('guesses')
    .select('*')
    .eq('seed', seed);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET leaderboard by seed (query param)
app.get('/leaderboard', async (req, res) => {
  const seed = Number(req.query.seed);
  if (!seed) return res.status(400).json({ error: 'Seed query param is required' });

  const { data, error } = await supabase
    .from('leaderboards')
    .select('*')
    .eq('seed', seed)
    .order('totalScore', { ascending: false }); // higher score better

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Serve static frontend files
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

app.get('/seed-analysis/:seed', async (req, res) => {
  const seed = Number(req.params.seed);
  if (!seed) return res.status(400).json({ error: 'Invalid seed' });

  // Fetch guesses grouped by round
  const { data: guesses, error: guessError } = await supabase
    .from('guesses')
    .select('*')
    .eq('seed', seed);

  // Fetch answers
  const { data: answers, error: answerError } = await supabase
    .from('answers')
    .select('*')
    .eq('seed', seed);

  if (guessError || answerError) {
    return res.status(500).json({ error: guessError?.message || answerError?.message });
  }

  // Group guesses by round
  const roundData = {};
  guesses.forEach(g => {
    if (!roundData[g.round]) roundData[g.round] = [];
    roundData[g.round].push(g);
  });

  // Map answers by round
  const answersMap = {};
  answers.forEach(a => {
    answersMap[a.round] = a;
  });

  res.json({ roundData, answers: answersMap });
});

app.get('/api/seeds/recent', async (req, res) => {
  // Example: return last 10 distinct seeds with counts and rounds

  // You may want to write SQL or supabase query that gets distinct seeds,
  // counts distinct users, and total rounds played for each seed.

  // Here's a simplified example:
  const { data, error } = await supabase
    .from('guesses')
    .select('seed, user, round', { count: 'exact' });

  if (error) return res.status(500).json({ error: error.message });

  // Aggregate data by seed
  const seedsMap = {};
  data.forEach(({ seed, user, round }) => {
    if (!seedsMap[seed]) {
      seedsMap[seed] = { seed, playerSet: new Set(), roundsSet: new Set() };
    }
    seedsMap[seed].playerSet.add(user);
    seedsMap[seed].roundsSet.add(round);
  });

  const recentSeeds = Object.values(seedsMap).map(s => ({
    seed: s.seed,
    playerCount: s.playerSet.size,
    totalRounds: s.roundsSet.size
  })).sort((a,b) => b.seed - a.seed).slice(0,10);

  res.json(recentSeeds);
});