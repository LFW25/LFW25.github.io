// public/js/caverunner.js
// Cave Runner (browser) — faithful AVR rules + sprites, smooth rendering + UI controls.

const canvas = document.getElementById("caverunner");
const ctx = canvas.getContext("2d");

const statusEl = document.getElementById("cr-status");

const btnPlay = document.getElementById("cr-play");
const btnPause = document.getElementById("cr-pause");
const btnReset = document.getElementById("cr-reset");
const btnSlow = document.getElementById("cr-slow");
const btnFS = document.getElementById("cr-fullscreen");

const btnJump = document.getElementById("cr-jump");
const btnCrouch = document.getElementById("cr-crouch");
const btnDouble = document.getElementById("cr-double");

// --- AVR sprites (exact from your headers) ---
const NUM_ROWS = 7;
const NUM_COLS = 5;

const stalagtite = [0x03, 0x03, 0x03, 0x03, 0x00];
const bat        = [0x00, 0x00, 0x00, 0x03, 0x00];
const rock       = [0x00, 0x00, 0x00, 0x00, 0x03];
const boulder    = [0x00, 0x00, 0x00, 0x03, 0x03];
const tunnel     = [0x03, 0x03, 0x00, 0x00, 0x03];

const OBSTACLES = [stalagtite, rock, bat, boulder, tunnel];

const runner_regular    = [0x00, 0x00, 0x00, 0x20, 0x20];
const runner_crouch     = [0x00, 0x00, 0x00, 0x00, 0x20];
const runner_jump       = [0x00, 0x00, 0x20, 0x20, 0x00];
const runner_doublejump = [0x00, 0x20, 0x20, 0x00, 0x00];

const RUNNER = [runner_regular, runner_crouch, runner_jump, runner_doublejump];

const RunnerState = { REGULAR: 0, CROUCH: 1, JUMP: 2, DOUBLEJUMP: 3 };

function collisionCheck(runnerStatus, obstacleId) {
  if (obstacleId === 0) {
    if (runnerStatus === RunnerState.CROUCH) return false;
  } else if (obstacleId === 1) {
    if (runnerStatus === RunnerState.JUMP || runnerStatus === RunnerState.DOUBLEJUMP) return false;
  } else if (obstacleId === 2) {
    if (runnerStatus === RunnerState.CROUCH || runnerStatus === RunnerState.DOUBLEJUMP) return false;
  } else if (obstacleId === 3) {
    if (runnerStatus === RunnerState.DOUBLEJUMP) return false;
  } else if (obstacleId === 4) {
    if (runnerStatus === RunnerState.JUMP) return false;
  }
  return true;
}

// --- Faithful timing-ish core ---
const ROW_MASK = (1 << NUM_ROWS) - 1;

// "pacer" (logic) tick rate — we use a tick accumulator to keep it stable.
const PACER_HZ = 100;

// Scaled constants based on your AVR values (125 @ 500Hz -> 25 @ 100Hz)
const MOVING_INIT = 25;
const MIN_MOVING = 3;

let slowMo = false;
let paused = true;     // start paused until user hits Play
let gameOver = false;

let counter = 1;
let score = 0;

let runnerStatus = RunnerState.REGULAR;
let timeout = false;
let timeoutCounter = 0;

let obstacleMovingRate = MOVING_INIT;
let obstacleRefresh = obstacleMovingRate * 6;
let timeoutTime = obstacleMovingRate * 4;                 // fixed from init (like your AVR)
let obstacleCheck = obstacleRefresh - 2 * obstacleMovingRate;

let toCopy = false;
let randomNumber = Math.floor(Math.random() * OBSTACLES.length);

// Track rendering: wider runway but still uses your 7-bit columns.
const TRACK_W = 56;
let track = new Array(TRACK_W).fill(0);
let trackObstacleId = new Array(TRACK_W).fill(-1);

// Runner “zone” position in the track
const PLAYER_X = 12;

// --- UI helpers ---
function setStatus() {
  const mode = slowMo ? "SLOW-MO" : "NORMAL";
  const state = gameOver ? "GAME OVER" : (paused ? "PAUSED" : "RUNNING");
  statusEl.textContent = `Score ${score} · moving_rate ${obstacleMovingRate} · ${mode} · ${state}`;
  btnSlow.setAttribute("aria-pressed", slowMo ? "true" : "false");
}

function resetGame() {
  slowMo = false;
  paused = true;
  gameOver = false;

  counter = 1;
  score = 0;

  runnerStatus = RunnerState.REGULAR;
  timeout = false;
  timeoutCounter = 0;

  obstacleMovingRate = MOVING_INIT;
  obstacleRefresh = obstacleMovingRate * 6;
  timeoutTime = obstacleMovingRate * 4;
  obstacleCheck = obstacleRefresh - 2 * obstacleMovingRate;

  toCopy = false;
  randomNumber = Math.floor(Math.random() * OBSTACLES.length);

  track = new Array(TRACK_W).fill(0);
  trackObstacleId = new Array(TRACK_W).fill(-1);

  spawnObstacle(); // start with one obstacle
  setStatus();
}

function spawnObstacle() {
  const sprite = OBSTACLES[randomNumber];
  for (let i = 0; i < NUM_COLS; i++) {
    const x = TRACK_W - NUM_COLS + i;
    track[x] = sprite[i] & ROW_MASK;
    trackObstacleId[x] = randomNumber;
  }
}

// commitment input: only accept moves when timeout == false
function tryMove(state) {
  if (paused || gameOver) return;
  if (!timeout) {
    runnerStatus = state;
    timeout = true;
  }
}

// --- Inputs (keyboard + on-screen buttons) ---
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyP") { paused = !paused; setStatus(); return; }
  if (e.code === "KeyS") { slowMo = !slowMo; setStatus(); return; }
  if (e.code === "KeyR") { resetGame(); return; }

  if (e.code === "ArrowUp")   tryMove(RunnerState.JUMP);
  if (e.code === "ArrowDown") tryMove(RunnerState.CROUCH);
  if (e.code === "Space")     tryMove(RunnerState.DOUBLEJUMP);
});

// touch controls
btnJump?.addEventListener("click", () => tryMove(RunnerState.JUMP));
btnCrouch?.addEventListener("click", () => tryMove(RunnerState.CROUCH));
btnDouble?.addEventListener("click", () => tryMove(RunnerState.DOUBLEJUMP));

// top buttons
btnPlay?.addEventListener("click", () => { paused = false; setStatus(); });
btnPause?.addEventListener("click", () => { paused = true; setStatus(); });
btnReset?.addEventListener("click", () => resetGame());
btnSlow?.addEventListener("click", () => { slowMo = !slowMo; setStatus(); });

btnFS?.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) {
      await canvas.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    // ignore (browser policy / iframe restrictions etc.)
  }
});

// --- Game tick (logic) ---
function tick() {
  if (paused || gameOver) return;

  // score: +1 per second in tick-time (faithful; slow-mo slows score too)
  if (counter % PACER_HZ === 0) score = (score + 1) & 0xff;

  // timeout logic
  if (timeout) {
    if (timeoutCounter >= timeoutTime) {
      timeout = false;
      timeoutCounter = 0;
      runnerStatus = RunnerState.REGULAR;
    } else {
      timeoutCounter++;
    }
  }

  // move track left at moving_rate
  if (counter % obstacleMovingRate === 0) {
    for (let x = 0; x < TRACK_W - 1; x++) {
      track[x] = track[x + 1];
      trackObstacleId[x] = trackObstacleId[x + 1];
    }
    track[TRACK_W - 1] = 0;
    trackObstacleId[TRACK_W - 1] = -1;
  }

  // new obstacle + ramp (every refresh)
  if (counter % obstacleRefresh === 0) {
    randomNumber = Math.floor(Math.random() * OBSTACLES.length);
    spawnObstacle();
    obstacleMovingRate = Math.max(MIN_MOVING, obstacleMovingRate - 1);
  }

  // collision check (same scheduling behaviour as AVR)
  if (counter % obstacleCheck === 0) {
    const idAtPlayer = trackObstacleId[PLAYER_X] >= 0 ? trackObstacleId[PLAYER_X] : randomNumber;
    if (collisionCheck(runnerStatus, idAtPlayer)) {
      gameOver = true;
      paused = true;
    } else {
      obstacleCheck = counter + obstacleRefresh;
    }
  }

  counter++;
  setStatus();
}

// --- Render ---
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cellW = canvas.width / TRACK_W;
  const cellH = canvas.height / NUM_ROWS;

  // subtle grid
  ctx.globalAlpha = 0.5;
  for (let x = 0; x < TRACK_W; x++) {
    for (let r = 0; r < NUM_ROWS; r++) {
      const px = x * cellW;
      const py = (NUM_ROWS - 1 - r) * cellH;
      ctx.strokeRect(px, py, cellW, cellH);
    }
  }
  ctx.globalAlpha = 1.0;

  // draw obstacles
  for (let x = 0; x < TRACK_W; x++) {
    const mask = track[x];
    if (!mask) continue;

    for (let r = 0; r < NUM_ROWS; r++) {
      if ((mask >> r) & 1) {
        const px = x * cellW;
        const py = (NUM_ROWS - 1 - r) * cellH;
        ctx.fillRect(px + 1, py + 1, cellW - 2, cellH - 2);
      }
    }
  }

  // draw runner overlay (OR into 5 columns at PLAYER_X)
  const runnerCols = RUNNER[runnerStatus];
  for (let i = 0; i < NUM_COLS; i++) {
    const x = PLAYER_X + i;
    if (x < 0 || x >= TRACK_W) continue;
    const mask = runnerCols[i] & ROW_MASK;

    for (let r = 0; r < NUM_ROWS; r++) {
      if ((mask >> r) & 1) {
        const px = x * cellW;
        const py = (NUM_ROWS - 1 - r) * cellH;
        ctx.fillRect(px + 1, py + 1, cellW - 2, cellH - 2);
      }
    }
  }
}

// --- Main loop with tick accumulator ---
resetGame(); // starts paused; shows "Ready"

let last = performance.now();
let acc = 0;

function loop(now) {
  const dt = now - last;
  last = now;

  const hz = slowMo ? (PACER_HZ / 2) : PACER_HZ;
  const logicMs = 1000 / hz;

  acc += dt;
  while (acc >= logicMs) {
    tick();
    acc -= logicMs;
  }

  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);