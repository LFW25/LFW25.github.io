// Faithful Cave Runner 5x7 (browser)
// Smooth render of a 5×7 matrix, but logic mirrors the AVR structure.

const canvas = document.getElementById("caverunner");
const ctx = canvas.getContext("2d");

// --- geometry ---
const NUM_ROWS = 7;
const NUM_COLS = 5;
const ROW_MASK = (1 << NUM_ROWS) - 1;

// upscale for visibility (canvas can be any size; we fit cells)
function cellSize() {
  const csx = canvas.width / NUM_ROWS;
  const csy = canvas.height / NUM_COLS;
  return Math.floor(Math.min(csx, csy));
}

// --- sprites (exact from your headers) ---
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

// --- runner states ---
const RunnerState = { REGULAR: 0, CROUCH: 1, JUMP: 2, DOUBLEJUMP: 3 };

// collision rules exactly from collision.c (returns true = collision)
function collisionCheck(runnerStatus, obstacleId) {
  if (obstacleId === 0) { if (runnerStatus === RunnerState.CROUCH) return false; }
  else if (obstacleId === 1) { if (runnerStatus === RunnerState.JUMP || runnerStatus === RunnerState.DOUBLEJUMP) return false; }
  else if (obstacleId === 2) { if (runnerStatus === RunnerState.CROUCH || runnerStatus === RunnerState.DOUBLEJUMP) return false; }
  else if (obstacleId === 3) { if (runnerStatus === RunnerState.DOUBLEJUMP) return false; }
  else if (obstacleId === 4) { if (runnerStatus === RunnerState.JUMP) return false; }
  return true;
}

// --- timing model (scaled) ---
const PACER_AVR = 500;
// pick a browser logic tick rate that’s stable
const PACER_GUI = 100;
const SCALE = PACER_GUI / PACER_AVR;

// AVR: 125 @500Hz => 0.25s per shift. Scaled: 25 @100Hz.
const MOVING_INIT = Math.max(1, Math.round(125 * SCALE));
const MIN_MOVING = 3;

// --- game state (mirrors your C variables) ---
let counter = 1;
let score = 0;

let currentColumn = 0;               // still maintained for faithfulness (not used for rendering)
let runnerStatus = RunnerState.REGULAR;

let toCopy = false;
let randomNumber = 0;
let objToDisplay = new Array(NUM_COLS).fill(0);  // obstacle bitmap columns

let timeout = false;
let timeoutCounter = 0;

let obstacleMovingRate = MOVING_INIT;
let obstacleRefresh = obstacleMovingRate * 6;
let timeoutTime = obstacleMovingRate * 4;        // fixed-from-init like your C
let obstacleCheck = obstacleRefresh - 2 * obstacleMovingRate;

let paused = true;
let gameOver = false;
let slowMo = false;

// --- helpers ---
function randObstacle() {
  return Math.floor(Math.random() * OBSTACLES.length);
}

function resetGame() {
  counter = 1;
  score = 0;

  currentColumn = 0;
  runnerStatus = RunnerState.REGULAR;

  toCopy = false;
  randomNumber = randObstacle();
  objToDisplay = new Array(NUM_COLS).fill(0);

  timeout = false;
  timeoutCounter = 0;

  obstacleMovingRate = MOVING_INIT;
  obstacleRefresh = obstacleMovingRate * 6;
  timeoutTime = obstacleMovingRate * 4;
  obstacleCheck = obstacleRefresh - 2 * obstacleMovingRate;

  paused = true;
  gameOver = false;
  slowMo = false;
}

resetGame();

// --- input (faithful “commitment”: ignore while timeout) ---
function tryMove(state) {
  if (paused || gameOver) return;
  if (!timeout) {
    runnerStatus = state;
    timeout = true;
  }
}

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyP") { paused = !paused; return; }
  if (e.code === "KeyS") { slowMo = !slowMo; return; }
  if (e.code === "KeyR") { resetGame(); return; }

  if (e.code === "ArrowUp") tryMove(RunnerState.JUMP);
  if (e.code === "ArrowDown") tryMove(RunnerState.CROUCH);
  if (e.code === "Space") tryMove(RunnerState.DOUBLEJUMP);

  // “Play” on first input
  if (paused && !gameOver && (e.code === "ArrowUp" || e.code === "ArrowDown" || e.code === "Space")) {
    paused = false;
  }
});

// --- logic tick (faithful order) ---
function scoreIncrement() {
  // if (counter % pacer_rate == 0) score++
  if (counter % PACER_GUI === 0) score = (score + 1) & 0xff;
}

function copyObjectIfNeeded() {
  if (!toCopy) {
    const src = OBSTACLES[randomNumber];
    objToDisplay = src.map((b) => b & ROW_MASK);
    toCopy = true;
  }
}

function moveObjectLeft() {
  // if (counter % obstacle_moving_rate == 0) obstacle[i] <<= 1
  if (counter % obstacleMovingRate === 0) {
    objToDisplay = objToDisplay.map((b) => ((b << 1) & ROW_MASK));
  }
}

function timeoutLogic() {
  if (!timeout) return;
  if (timeoutCounter >= timeoutTime) {
    timeout = false;
    timeoutCounter = 0;
    runnerStatus = RunnerState.REGULAR;
  } else {
    timeoutCounter++;
  }
}

function maybeNewObstacleAndRamp() {
  if (counter % obstacleRefresh === 0) {
    randomNumber = randObstacle();
    toCopy = false;
    obstacleMovingRate = Math.max(MIN_MOVING, obstacleMovingRate - 1);
  }
}

function maybeCollisionCheck() {
  if (counter % obstacleCheck === 0) {
    if (collisionCheck(runnerStatus, randomNumber)) {
      gameOver = true;
      paused = true;
    } else {
      obstacleCheck = counter + obstacleRefresh;
    }
  }
}

function columnIncrement() {
  currentColumn++;
  if (currentColumn >= NUM_COLS) currentColumn = 0;
}

function logicTick() {
  if (paused || gameOver) return;

  scoreIncrement();
  copyObjectIfNeeded();
  moveObjectLeft();
  maybeNewObstacleAndRamp();
  timeoutLogic();
  maybeCollisionCheck();
  columnIncrement();

  counter++;
}

// --- rendering: full-frame, no scanning flicker ---
function frameColumns() {
  const r = RUNNER[runnerStatus];
  const out = new Array(NUM_COLS);
  for (let c = 0; c < NUM_COLS; c++) {
    out[c] = (objToDisplay[c] | r[c]) & ROW_MASK;
  }
  return out;
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cs = cellSize();
  const ox = Math.floor((canvas.width - NUM_ROWS * cs) / 2);
  const oy = Math.floor((canvas.height - NUM_COLS * cs) / 2);

  const frame = frameColumns();

  // grid + LEDs
  for (let col = 0; col < NUM_COLS; col++) {
    const mask = frame[col];
    for (let bit = 0; bit < NUM_ROWS; bit++) {
      const x0 = ox + bit * cs;
      const y0 = oy + col * cs;
      const on = (mask >> bit) & 1;

      ctx.strokeRect(x0, y0, cs, cs);
      if (on) ctx.fillRect(x0 + 2, y0 + 2, cs - 4, cs - 4);
    }
  }

  // HUD
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText(
    `Score: ${score}  rate:${obstacleMovingRate}  ${slowMo ? "SLOW" : "NORM"}  ${paused ? "PAUSED" : "RUN"}  ${gameOver ? "GAME OVER" : ""}`,
    10,
    18
  );
  ctx.fillText("↑ jump  ↓ crouch  Space double-jump  P pause  S slow  R reset", 10, 38);
  if (paused && !gameOver) ctx.fillText("Press any move key to start", 10, 58);
}

// --- main loop with tick accumulator ---
let last = performance.now();
let acc = 0;

function loop(now) {
  const dt = now - last;
  last = now;

  const hz = slowMo ? (PACER_GUI / 2) : PACER_GUI;
  const logicMs = 1000 / hz;

  acc += dt;
  while (acc >= logicMs) {
    logicTick();
    acc -= logicMs;
  }

  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
