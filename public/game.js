// === REGION DATA ===
const REGIONS = [
  {latMin: -36.372506, latMax: -34.112845, lngMin: 171.967895, lngMax: 174.950684},
  {latMin: -37.756495, latMax: -35.955081, lngMin: 174.076171, lngMax: 176.350341},
  {latMin: -40.157354, latMax: -37.700960, lngMin: 174.526612, lngMax: 177.328126},
  {latMin: -39.896229, latMax: -38.744969, lngMin: 173.661987, lngMax: 174.716675},
  {latMin: -39.295443, latMax: -37.448614, lngMin: 176.888672, lngMax: 178.608032},
  {latMin: -40.605280, latMax: -39.901176, lngMin: 174.841919, lngMax: 177.033691},
  {latMin: -41.586984, latMax: -40.589517, lngMin: 174.469482, lngMax: 176.458008},
  {latMin: -44.382139, latMax: -43.663472, lngMin: 183.008057, lngMax: 184.040772},
  {latMin: -43.288476, latMax: -40.440093, lngMin: 172.041504, lngMax: 173.067627},
  {latMin: -41.734703, latMax: -40.618724, lngMin: 172.940185, lngMax: 174.478271},
  {latMin: -43.143539, latMax: -41.766034, lngMin: 172.749023, lngMax: 174.111328},
  {latMin: -43.991914, latMax: -43.372382, lngMin: 168.363281, lngMax: 173.186279},
  {latMin: -43.434230, latMax: -40.778469, lngMin: 169.653077, lngMax: 172.234864},
  {latMin: -47.307792, latMax: -46.528100, lngMin: 166.819702, lngMax: 168.608277},
  {latMin: -46.241388, latMax: -43.932577, lngMin: 166.346191, lngMax: 169.283935},
  {latMin: -46.679334, latMax: -46.236597, lngMin: 167.673340, lngMax: 170.002441},
  {latMin: -46.250672, latMax: -43.824558, lngMin: 167.985352, lngMax: 172.335938},
  {latMin: -44.363558, latMax: -44.213195, lngMin: 183.635788, lngMax: 184.015503}
];

function wrapLongitude(lon) {
  return ((lon + 180) % 360 + 360) % 360 - 180;
}

const goodSounds = ['good1'];
const badSounds = ['bad1'];

function playRandomSound(soundList) {
  const id = soundList[Math.floor(Math.random() * soundList.length)];
  const audio = document.getElementById(id);
  if (audio) audio.play().catch(e => console.warn("Playback blocked:", e));
}

function seededRandom(s) {
  s.value = (s.value * 9301 + 49297) % 233280;
  return s.value / 233280;
}

function randomInRange(s, min, max) {
  return min + seededRandom(s) * (max - min);
}

function haversine(aLat, aLng, bLat, bLng) {
  const toRad = x => x * Math.PI / 180, R = 6371;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat/2)**2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}

function getRandomNZLocation(s) {
  const region = REGIONS[Math.floor(seededRandom(s) * REGIONS.length)];
  return {
    lat: randomInRange(s, region.latMin, region.latMax),
    lng: randomInRange(s, region.lngMin, region.lngMax)
  };
}

async function tileHasLand(lat, lng, zoom) {
  const x = longitudeToTileX(lng, zoom), y = latitudeToTileY(lat, zoom);
  const url = `https://basemaps.linz.govt.nz/v1/tiles/topo-raster/WebMercatorQuad/${zoom}/${x}/${y}.webp?api=c01k1w81j8nbj00y7gy7x4b17j6`;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i+1], data[i+2]];
      if (r < 200 && g < 200 && b < 200) return true;
    }
  } catch { return false; }
  return false;
}

async function tileHasEnoughWater(lat, lng, zoom) {
  const x = longitudeToTileX(lng, zoom), y = latitudeToTileY(lat, zoom);
  const url = `https://basemaps.linz.govt.nz/v1/tiles/topo-raster/WebMercatorQuad/${zoom}/${x}/${y}.webp?api=c01k1w81j8nbj00y7gy7x4b17j6`;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    let water = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i+1], data[i+2]];
      if (b > 240 && b < 250 && r > 200 && r < 220 && g > 225 && g < 238) water++;
    }
    return (water / (bmp.width * bmp.height)) >= 0.1;
  } catch { return false; }
}

async function tileHasEnoughUrban(lat, lng, zoom) {
  const x = longitudeToTileX(lng, zoom), y = latitudeToTileY(lat, zoom);
  const url = `https://basemaps.linz.govt.nz/v1/tiles/topo-raster/WebMercatorQuad/${zoom}/${x}/${y}.webp?api=c01k1w81j8nbj00y7gy7x4b17j6`;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    let urban = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i+1], data[i+2]];
      if (r > 180 && r < 190 && g > 180 && g < 190 && b > 175 && b < 187) urban++;
    }
    return (urban / (bmp.width * bmp.height)) >= 0.01;
  } catch { return false; }
}

async function getValidLocation(s, beachMode, urbanMode, zoom) {
  for (let i = 0; i < 500; i++) {
    const loc = getRandomNZLocation(s);
    if (beachMode) {
      if (await tileHasLand(loc.lat, loc.lng, zoom) && await tileHasEnoughWater(loc.lat, loc.lng, zoom)) return loc;
    } else if (urbanMode) {
      if (await tileHasEnoughUrban(loc.lat, loc.lng, zoom)) return loc;
    } else {
      if (await tileHasLand(loc.lat, loc.lng, zoom)) return loc;
    }
  }
  return { lat: -41.3, lng: 174.8 };
}

function longitudeToTileX(lon, zoom) {
  const wrapped = wrapLongitude(lon);
  return Math.floor((wrapped + 180) / 360 * Math.pow(2, zoom));
}

function latitudeToTileY(lat, zoom) {
  const rad = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(rad) + 1/Math.cos(rad)) / Math.PI) / 2 * Math.pow(2, zoom));
}

// === GAME STATE ===
let seedObj = { value: 12345 };
let answerLat = 0, answerLng = 0, guessLat = null, guessLng = null;
let hasGuessed = false, timerInt = null, roundsPlayed = 0, totalRounds = 0, scoreTotal = 0;
let map, guessMarker;
let currentUser = null;

function updateUI() {
  document.getElementById('roundInfo').textContent = `Round ${roundsPlayed} of ${totalRounds}`;
  document.getElementById('totalScore').textContent = `Total Score: ${scoreTotal}`;
}

async function startGame() {
  clearInterval(timerInt);
  hasGuessed = false;
  guessLat = guessLng = null;
  document.getElementById('submitBtn').disabled = true;
  document.getElementById('result').textContent = '';
  if (roundsPlayed === 0) {
    totalRounds = parseInt(document.getElementById('totalRounds').value) || 1;
    scoreTotal = 0;
    const sv = parseInt(document.getElementById('seed').value);
    seedObj.value = isNaN(sv) ? 12345 : sv;
  }
  roundsPlayed++;
  updateUI();
  document.getElementById('mapFrame').style.pointerEvents = 'none';
  const zoom = +document.getElementById('zoom').value;
  const beachMode = document.getElementById('beachMode').checked;
  const urbanMode = document.getElementById('urbanMode').checked;
  const timerValue = document.getElementById('timerMode').value;
  const timerLen = timerValue === 'none' ? null : parseInt(timerValue);
  const loc = await getValidLocation(seedObj, beachMode, urbanMode, zoom);
  answerLat = loc.lat;
  answerLng = loc.lng;
  document.getElementById('mapFrame').src = `https://www.topomap.co.nz/NZTopoMap?v=2&ll=${answerLat},${answerLng}&z=${zoom}`;
  if (guessMarker) map.removeLayer(guessMarker);
  map.setView([-41.3, 174.8], 5);

  if (timerLen !== null) {
    let t = timerLen;
    document.getElementById('result').textContent = `Timer: ${t}s remaining…`;
    timerInt = setInterval(() => {
      t--;
      if (t > 0) {
        document.getElementById('result').textContent = `Timer: ${t}s remaining…`;
      } else {
        clearInterval(timerInt);
        if (!hasGuessed && guessLat !== null) submitGuess();
      }
    }, 1000);
  }
}

function submitGuess() {
  if (hasGuessed || guessLat == null) return;
  hasGuessed = true;
  clearInterval(timerInt);
  document.getElementById('mapFrame').style.pointerEvents = 'auto';
  const dist = haversine(answerLat, answerLng, guessLat, guessLng);
  const score = Math.max(0, Math.round(100 - 40 * (Math.log(dist + 1) - 5)));
  scoreTotal += score;
  document.getElementById('result').textContent = `You were ${dist.toFixed(2)} km away → Score: ${score}/300`;
  sendGuessToServer(guessLat, guessLng, dist);
  updateUI();
  setTimeout(loadOtherGuesses, 500);
  L.circleMarker([answerLat, answerLng], {
    radius: 10,
    fillColor: 'green',
    color: 'black',
    weight: 2,
    fillOpacity: 0.8
  }).addTo(map).bindPopup('📍 Actual Location').openPopup();
  document.getElementById('startBtn').disabled = (roundsPlayed >= totalRounds);
  if (roundsPlayed >= totalRounds) {
    document.getElementById('replayBtn').disabled = false;
    setTimeout(showLeaderboard, 1000);
  }
  if (dist < 100) playRandomSound(goodSounds);
  else if (dist > 700) playRandomSound(badSounds);
}

function initMap() {
  map = L.map('leafletMap', { center: [-41.3, 174.8], zoom: 5 });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OSM</a> contributors'
  }).addTo(map);
  map.on('click', e => {
    if (hasGuessed) return;
    guessLat = e.latlng.lat;
    guessLng = e.latlng.lng;
    if (guessMarker) map.removeLayer(guessMarker);
    guessMarker = L.marker([guessLat, guessLng]).addTo(map);
    document.getElementById('submitBtn').disabled = false;
    document.getElementById('result').textContent = `Guess: ${guessLat.toFixed(4)}, ${guessLng.toFixed(4)} – click Submit.`;
  });
  document.getElementById('startBtn').onclick = () => {
    if (!currentUser) {
      alert("Please log in with Google or click 'Play as Guest'.");
      return;
    }
    document.getElementById('startBtn').disabled = true;
    startGame();
  };
  document.getElementById('submitBtn').onclick = submitGuess;
  document.getElementById('replayBtn').onclick = () => {
    roundsPlayed = 0;
    startGame();
  };
  updateUI();
}

window.onload = () => {
  initMap();

  const savedGuest = localStorage.getItem("topoguesser_guest");
  if (savedGuest) {
    currentUser = savedGuest;
    document.getElementById('userInfo').innerHTML = `🎮 Guest: <b>${savedGuest}</b>`;
    document.getElementById('startBtn').disabled = false;
  } else {
    setupGoogleLogin();
  }

  document.getElementById("guestModeBtn").onclick = () => {
    const name = prompt("Enter your username:", "Player") || "Guest";
    currentUser = name;
    localStorage.setItem("topoguesser_guest", name);
    document.getElementById('userInfo').innerHTML = `🎮 Guest: <b>${name}</b>`;
    document.getElementById('startBtn').disabled = false;
    document.getElementById('googleBtn').style.display = 'none';
  };

  document.getElementById("showAllGuessesBtn").onclick = () => {
    const seed = parseInt(document.getElementById("seed").value);
    loadAllGuesses(seed);
  };

  document.getElementById("analyzeSeedBtn").onclick = () => {
    const seed = parseInt(document.getElementById('seed').value);
    showSeedAnalysis(seed);
  };

  document.getElementById("hideRecentBtn").onclick = () => {
    const panel = document.getElementById("recentSeedsPanel");
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    document.getElementById("hideRecentBtn").textContent = isHidden ? "Show Panel" : "Hide Panel";
  };

  document.getElementById("closeAnalysisBtn").onclick = () => {
    document.getElementById("analysisPanel").style.display = 'none';
  };

  loadRecentSeeds();
  setInterval(loadRecentSeeds, 30000);
};

function setupGoogleLogin() {
  google.accounts.id.initialize({
    client_id: "135826388765-svojries0i42qbn8te7uu6fkqq3ptpln.apps.googleusercontent.com",
    callback: handleCredentialResponse,
    ux_mode: "popup"
  });
  google.accounts.id.renderButton(document.getElementById("googleBtn"), {
    theme: 'outline',
    size: 'large',
    text: 'signin_with'
  });
}

async function handleCredentialResponse(response) {
  const res = await fetch('/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: response.credential })
  }).then(r => r.json());
  if (res.user) {
    currentUser = res.user.name;
    document.getElementById('userInfo').innerHTML = `👤 Logged in as <b>${res.user.name}</b>`;
    document.getElementById('startBtn').disabled = false;
  }
}

function sendGuessToServer(lat, lng, distance) {
  if (!currentUser) return;
  const seed = parseInt(document.getElementById("seed").value);
  fetch("/guesses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: currentUser, seed, round: roundsPlayed, lat, lng, distance })
  });
}

function loadOtherGuesses() {
  const seed = parseInt(document.getElementById("seed").value);
  const round = roundsPlayed;
  fetch(`/guesses/${seed}/${round}`).then(r => r.json()).then(data => {
    data.forEach(g => {
      if (g.user !== currentUser) {
        const score = Math.max(0, Math.round(100 - 40 * (Math.log(g.distance + 1) - 5)));
        const color = getUserColor(g.user);
        L.circleMarker([g.lat, g.lng], {
          radius: 6,
          fillColor: color,
          color: "white",
          weight: 1,
          fillOpacity: 0.7
        }).addTo(map).bindPopup(`
          <b style="color:${color}">${g.user}</b><br/>
          ${g.distance.toFixed(2)} km away<br/>
        `);
      }
    });
  });
}


    function loadAllGuesses(seed) {
      fetch(`/guesses?seed=${seed}`).then(r => r.json()).then(data => {
        map.eachLayer(l => {
          if (l instanceof L.CircleMarker || l instanceof L.Marker) {
            map.removeLayer(l);
          }
        });
        data.forEach(g => {
          const color = getUserColor(g.user);
          L.circleMarker([g.lat, g.lng], {
            radius: 6,
            fillColor: color,
            color: "white",
            weight: 1,
            fillOpacity: 0.7
          }).addTo(map).bindPopup(`
            <b style="color:${color}">${g.user}</b><br/>
            Round ${g.round}<br/>
            ${g.distance.toFixed(2)} km away
          `);
        });
      });
    }

    function showLeaderboard() {
      const seed = parseInt(document.getElementById("seed").value);
      fetch(`/leaderboard?seed=${seed}`).then(r => r.json()).then(data => {
        const list = data.map(d => {
          const color = getUserColor(d.user);
          return `<li><strong style="color:${color}">${d.user}</strong>: ${d.totalScore} pts (${d.rounds} rounds)</li>`;
        }).join("");
        document.getElementById("result").innerHTML += `
          <br/><strong>🏆 Leaderboard:</strong>
          <ol>${list}</ol>
        `;
      });
    }

    function showSeedAnalysis(seed) {
      fetch(`/seed-analysis/${seed}`).then(r => r.json()).then(data => {
        const content = document.getElementById('analysisContent');
        let html = `<strong>Seed ${seed}</strong><hr>`;
        Object.keys(data.roundData || {}).sort().forEach(round => {
          const guesses = data.roundData[round];
          const answer = data.answers?.[round];
          html += `<div class="round-analysis"><strong>Round ${round}</strong>`;
          if (answer) {
            html += ` 📍 Ans: ${answer.lat.toFixed(4)}, ${answer.lng.toFixed(4)}`;
          }
          html += `<br>`;
          guesses.forEach((g, i) => {
            const score = Math.max(0, Math.round(100 - 40 * (Math.log(g.distance + 1) - 5)));
            const color = getUserColor(g.user);
            html += `${i+1}. <b style="color:${color}">${g.user}</b>: ${score} pts (${g.distance.toFixed(2)}km)<br>`;
          });
          html += "<hr>";
        });
        content.innerHTML = html;
        document.getElementById('analysisPanel').style.display = 'block';
      });
    }

    function loadRecentSeeds() {
      fetch('/api/seeds/recent').then(r => r.json()).then(seeds => {
        const container = document.getElementById('recentSeedsList');
        container.innerHTML = '';
        seeds.forEach(s => {
          const div = document.createElement('div');
          div.className = 'seed-item';
          div.innerHTML = `<strong>Seed ${s.seed}</strong><br/><small>${s.playerCount} players • ${s.totalRounds} rounds</small>`;
          div.onclick = () => {
            document.getElementById('seed').value = s.seed;
            loadOtherGuesses();
            map.setView([-41.3, 174.8], 5);
          };
          container.appendChild(div);
        });
      });
    }

    // Generate consistent color for any user
    function getUserColor(user) {
      let hash = 0;
      for (let i = 0; i < user.length; i++) {
        hash = user.charCodeAt(i) + ((hash << 5) - hash);
      }
      const hue = hash % 360;
      return `hsl(${hue}, 70%, 50%)`;
    }