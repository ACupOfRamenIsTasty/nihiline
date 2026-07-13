// Per-device audio calibration.
//
// Different devices output sound with different amounts of latency (Bluetooth
// headphones alone can add 100-300ms). Because the note visuals are driven by
// CSS animations that start the instant the chart begins, while the actual
// sound reaches the player's ears some milliseconds later, players on
// high-latency hardware hear the beat *after* the note visually lands. They
// then press late and get punished with LATE / MISS judgements even when they
// are perfectly on the music.
//
// The fix is a single calibration offset (in milliseconds) that the player
// tunes once per device. It is applied to BOTH the note animation start delay
// and the judgement's "perfect" moment (see app.js), so the visuals and the
// scoring window shift together to line up with when the audio is actually
// heard. Because it describes the hardware, not the account, it is stored in
// localStorage rather than a database.

var STORAGE_KEY = 'nihiline.audioOffsetMs';
var MIN_OFFSET = -300; // ms
var MAX_OFFSET = 300; // ms
var METRONOME_BPM = 120; // 120 BPM -> a steady beat every 0.5s
var WARMUP_TAPS = 2; // discard the first couple of taps while the player settles
var MIN_TAPS_TO_APPLY = 4; // require a few good taps before enabling "Apply"

var clamp = function (value) {
  return Math.max(MIN_OFFSET, Math.min(MAX_OFFSET, value));
};

var loadOffset = function () {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return 0;
    }
    var parsed = parseInt(raw, 10);
    return isNaN(parsed) ? 0 : clamp(parsed);
  } catch (error) {
    return 0;
  }
};

// The live, in-memory offset. Read fresh by the game whenever a chart starts.
var audioOffsetMs = loadOffset();

var persistOffset = function () {
  try {
    localStorage.setItem(STORAGE_KEY, String(audioOffsetMs));
  } catch (error) {
    // Ignore storage failures (private mode, etc.) — the offset still applies
    // for the current session via the in-memory value.
  }
};

// Public getters used by the game logic.
export var getAudioOffsetMs = function () {
  return audioOffsetMs;
};

export var getAudioOffsetSeconds = function () {
  return audioOffsetMs / 1000;
};

var setOffset = function (value) {
  audioOffsetMs = clamp(Math.round(value));
  persistOffset();
};

// ---------------------------------------------------------------------------
// Metronome tap test
//
// A steady click plays every beat (via the Web Audio API for sample-accurate
// timing) alongside a synced visual pulse. The player taps SPACE on each beat.
// We measure the signed error between each tap and the nearest beat: a
// consistently late tap means the player perceives the beat late, which is
// exactly the latency (audio output + reaction) we want to compensate for.
// Averaging those errors yields the offset. Reaction time is intentionally
// included because it applies equally in-game, so the calibration stays
// consistent with real play.
// ---------------------------------------------------------------------------

var audioContext = null;
var schedulerId = null;
var rafId = null;
var running = false;
var intervalSeconds = 60 / METRONOME_BPM;
var startAudioTime = 0; // AudioContext time of beat 0
var audioAnchor = 0; // AudioContext time captured at start
var perfAnchor = 0; // performance.now() captured at the same instant
var nextBeatToSchedule = 0;
var lastPulsedBeat = -1;
var taps = [];

// UI references (assigned in setupCalibration).
var overlay;
var pulseEl;
var tapCountEl;
var detectedEl;
var metronomeBtn;
var applyBtn;
var slider;
var readoutEl;

// Maps a beat index to its time on the performance.now() clock, so taps
// (whose timestamps are on that same clock) can be compared against beats.
var beatPerfTime = function (index) {
  var beatAudioTime = startAudioTime + index * intervalSeconds;
  return perfAnchor + (beatAudioTime - audioAnchor) * 1000;
};

// A short, percussive click at the given AudioContext time.
var scheduleClick = function (time) {
  var osc = audioContext.createOscillator();
  var gain = audioContext.createGain();
  osc.type = 'square';
  osc.frequency.value = 1100;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.5, time + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start(time);
  osc.stop(time + 0.06);
};

// Schedule any beats falling inside the next lookahead window.
var scheduler = function () {
  var lookahead = 0.2; // seconds
  while (startAudioTime + nextBeatToSchedule * intervalSeconds < audioContext.currentTime + lookahead) {
    scheduleClick(startAudioTime + nextBeatToSchedule * intervalSeconds);
    nextBeatToSchedule++;
  }
};

var flashPulse = function () {
  pulseEl.classList.remove('is-beat');
  void pulseEl.offsetWidth; // force reflow so the animation can restart
  pulseEl.classList.add('is-beat');
};

// Drives the visual pulse in step with the scheduled beats.
var visualLoop = function () {
  if (!running) {
    return;
  }
  var elapsedBeats = (performance.now() - beatPerfTime(0)) / (intervalSeconds * 1000);
  var currentBeat = Math.floor(elapsedBeats);
  if (currentBeat >= 0 && currentBeat !== lastPulsedBeat) {
    lastPulsedBeat = currentBeat;
    flashPulse();
  }
  rafId = requestAnimationFrame(visualLoop);
};

// Average tap error, ignoring the warmup taps.
var detectedOffset = function () {
  var usable = taps.slice(WARMUP_TAPS);
  if (usable.length === 0) {
    return 0;
  }
  var sum = usable.reduce(function (total, value) {
    return total + value;
  }, 0);
  return sum / usable.length;
};

var updateTapStats = function () {
  var usable = taps.slice(WARMUP_TAPS);
  tapCountEl.innerHTML = String(usable.length);
  if (usable.length === 0) {
    detectedEl.innerHTML = '--';
  } else {
    detectedEl.innerHTML = (detectedOffset() >= 0 ? '+' : '') + Math.round(detectedOffset()) + ' ms';
  }
  applyBtn.disabled = usable.length < MIN_TAPS_TO_APPLY;
};

var registerTap = function (tapPerfTime) {
  if (!running) {
    return;
  }
  var relative = (tapPerfTime - beatPerfTime(0)) / (intervalSeconds * 1000);
  var nearestBeat = Math.round(relative);
  if (nearestBeat < 0) {
    return;
  }
  // Signed error in ms: positive means the player tapped after the beat.
  var error = tapPerfTime - beatPerfTime(nearestBeat);
  // Guard against wildly off taps (more than half a beat away isn't a real
  // attempt to hit this beat).
  if (Math.abs(error) > (intervalSeconds * 1000) / 2) {
    return;
  }
  taps.push(error);
  flashPulse();
  updateTapStats();
};

var startMetronome = function () {
  if (running) {
    return;
  }
  if (!audioContext) {
    var Ctor = window.AudioContext || window.webkitAudioContext;
    audioContext = new Ctor();
  }
  audioContext.resume();

  running = true;
  taps = [];
  nextBeatToSchedule = 0;
  lastPulsedBeat = -1;

  audioAnchor = audioContext.currentTime;
  perfAnchor = performance.now();
  startAudioTime = audioAnchor + 0.3; // brief lead-in before the first beat

  updateTapStats();
  metronomeBtn.innerHTML = 'Stop Test';
  metronomeBtn.classList.add('is-active');

  schedulerId = window.setInterval(scheduler, 25);
  rafId = requestAnimationFrame(visualLoop);
};

var stopMetronome = function () {
  running = false;
  if (schedulerId !== null) {
    window.clearInterval(schedulerId);
    schedulerId = null;
  }
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  pulseEl.classList.remove('is-beat');
  metronomeBtn.innerHTML = 'Start Test';
  metronomeBtn.classList.remove('is-active');
};

// ---------------------------------------------------------------------------
// Slider / readout syncing
// ---------------------------------------------------------------------------

var syncSliderUI = function () {
  slider.value = String(audioOffsetMs);
  readoutEl.innerHTML = (audioOffsetMs > 0 ? '+' : '') + audioOffsetMs + ' ms';
};

var openOverlay = function () {
  syncSliderUI();
  updateTapStats();
  overlay.classList.add('is-open');
  overlay.setAttribute('aria-hidden', 'false');
};

var closeOverlay = function () {
  stopMetronome();
  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
};

// Wires up the calibration UI. Safe to call once on load.
export var setupCalibration = function () {
  overlay = document.querySelector('.calibration');
  if (!overlay) {
    return;
  }

  pulseEl = overlay.querySelector('.calibration__pulse');
  tapCountEl = overlay.querySelector('[data-taps]');
  detectedEl = overlay.querySelector('[data-detected]');
  metronomeBtn = overlay.querySelector('.btn--metronome');
  applyBtn = overlay.querySelector('.btn--apply');
  slider = overlay.querySelector('.calibration__slider');
  readoutEl = overlay.querySelector('[data-offset]');

  var openBtn = document.querySelector('.btn--calibrate');
  var doneBtn = overlay.querySelector('.btn--done');
  var resetBtn = overlay.querySelector('.btn--reset');

  if (openBtn) {
    openBtn.addEventListener('click', openOverlay);
  }
  doneBtn.addEventListener('click', closeOverlay);

  metronomeBtn.addEventListener('click', function () {
    if (running) {
      stopMetronome();
    } else {
      startMetronome();
    }
  });

  applyBtn.addEventListener('click', function () {
    setOffset(detectedOffset());
    syncSliderUI();
  });

  resetBtn.addEventListener('click', function () {
    setOffset(0);
    syncSliderUI();
  });

  slider.addEventListener('input', function () {
    setOffset(parseInt(slider.value, 10) || 0);
    syncSliderUI();
  });

  // Capture-phase key handling so, while the overlay is open, SPACE taps feed
  // the calibration test instead of advancing the tutorial or the game. Using
  // the capture phase and stopping propagation prevents the other document
  // keydown listeners (registered in the bubble phase) from firing.
  document.addEventListener('keydown', function (event) {
    if (!overlay.classList.contains('is-open')) {
      return;
    }
    if (event.key === 'Escape') {
      closeOverlay();
      return;
    }
    if (event.key === ' ' || event.code === 'Space') {
      event.preventDefault();
      event.stopPropagation();
      if (running) {
        registerTap(event.timeStamp);
      }
    }
  }, true);

  syncSliderUI();
};
