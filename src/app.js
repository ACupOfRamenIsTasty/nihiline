import { chart } from './chart.js';

// Tracks states of keys being held down.
// White lane keys (d, f, j, k) and the overlapping red lane keys (e, r, u, i).
var isHolding = {
  d: false,
  f: false,
  j: false,
  k: false,
  e: false,
  r: false,
  u: false,
  i: false,
  // Wide centered blue lane key (index 8).
  ' ': false
};

var hits = { perfect: 0, good: 0, miss: 0 }; // Count of hits
var judgement = { perfect: 0.08, good: 0.16, miss: 0.18 }; // Note judgement times (s)
var totalNotes = 0; // number of total notes
var noteValue = 0; // value of each note
var isPlaying = false; // Whether game started
var defaultNoteDuration = 3; // Standardized note duration (s)
var combo = 0; // Current combo
var maxCombo = 0; // Max combo
var score = 0;
var animation = 'moveDown'; // Downscroll animation for notes
var startTime; // Time when the chart started playing
var trackContainer;
var tracks;
var keypress;
var comboText; // Text that indicates combo
var scoreDisplay; // Real-time score in the top-right HUD
var accuracyDisplay; // Real-time accuracy in the top-right HUD

// Converts the beat of a note to seconds
var getNoteDelayInSeconds = function (note) {
  return note.beat * 60 / chart.bpm;
};

// Initializes the notes on the screen based on the chart data
var initializeNotes = function () {
  var noteElement;
  var trackElement;

  while (trackContainer.hasChildNodes()) {
    trackContainer.removeChild(trackContainer.lastChild);
  }

  chart.sheet.forEach(function (key, index) {
    trackElement = document.createElement('div');
    trackElement.classList.add('track');

    if (index === 8) {
      // The blue lane is a single wide lane, twice the width of a normal lane,
      // centered over the middle two columns.
      trackElement.classList.add('track--blue');
      trackElement.style.left = '25%';
      trackElement.style.width = '50%';
    } else {
      // Each of the 8 keyed lanes maps onto one of 4 visible columns.
      // Indices 0-3 are the white lanes; 4-7 are the red lanes that overlap them.
      var lane = index % 4;
      trackElement.classList.add(index < 4 ? 'track--white' : 'track--red');
      trackElement.style.left = (lane * 25) + '%';
      trackElement.style.width = '25%';
    }

    key.notes.forEach(function (note) {
      noteElement = document.createElement('div');
      noteElement.classList.add('note');
      noteElement.classList.add('note--' + index);
      noteElement.style.backgroundColor = key.color;

      var noteSpeed = typeof note.speed === 'number' && note.speed > 0 ? 4*note.speed : 4;
      var travelDuration = defaultNoteDuration / noteSpeed;
      var startDelay = getNoteDelayInSeconds(note) + defaultNoteDuration - travelDuration;

      noteElement.style.animationName = animation + ', linger';
      noteElement.style.animationTimingFunction = 'linear, linear';
      noteElement.style.animationDuration = travelDuration + 's, ' + judgement.miss + 's';
      noteElement.style.animationDelay = startDelay + 's, ' + (startDelay + travelDuration) + 's';
      noteElement.style.animationPlayState = 'paused, paused';
      trackElement.appendChild(noteElement);
    });

    trackContainer.appendChild(trackElement);
    tracks = document.querySelectorAll('.track');
  });
};

var setupStartButton = function () {
  var startButton = document.querySelector('.btn--start');
  startButton.addEventListener('click', function () {
    initializeScore();
    isPlaying = true;
    startTime = Date.now();

    startTimer(chart.duration);
    document.querySelector('.menu').style.opacity = 0;

    // Wait for preRollMs before playing the chart
    var audio = document.querySelector('.chart');
    if (chart.preRollMs && chart.preRollMs > 0) {
      audio.currentTime = 0;
      window.setTimeout(function () {
        audio.play();
      }, chart.preRollMs);
    } else {
      audio.play();
    }

    document.querySelectorAll('.note').forEach(function (note) {
      note.style.animationPlayState = 'running, running';
    });
  });
};

var startTimer = function (duration) {
  var timerContainer = document.querySelector('.summary__timer');
  var timerBar = document.querySelector('.summary__timer-bar');
  var timer = duration;
  var intervalId;

  timerContainer.style.opacity = 1;

  intervalId = setInterval(function () {
    if (timer <= 0) {
      clearInterval(intervalId);
      timerBar.style.width = '100%';
      timerContainer.style.opacity = 0;
      showResult();
      comboText.style.transition = 'all 1s';
      comboText.style.opacity = 0;
      return;
    }

    timerBar.style.width = ((duration - timer) / duration * 100) + '%';
    timer -= 1;
  }, 1000);
};

var initializeScore = function () {
  totalNotes = chart.sheet.reduce(function (count, track) {
    return count + track.notes.length;
  }, 0);
  noteValue = 1000000 / totalNotes;
  score = 0;
  combo = 0;
  maxCombo = 0;
  hits = { perfect: 0, good: 0, miss: 0 };
  updateHud();
};

// Updates the top-right real-time score and accuracy displays.
// Score mirrors the result screen figure (7 digits, zero-padded).
// Accuracy grades hit notes: perfect = 100%, good = 50%, miss = 0%.
var updateHud = function () {
  var judged = hits.perfect + hits.good + hits.miss;
  var accuracy = judged === 0
    ? 100
    : (hits.perfect * 100 + hits.good * 50) / judged;

  scoreDisplay.innerHTML = Math.round(score).toString().padStart(7, '0');
  accuracyDisplay.innerHTML = accuracy.toFixed(2) + '%';
};

// Shows end screen results
var showResult = function () {
  document.querySelector('.perfect__count').innerHTML = hits.perfect;
  document.querySelector('.good__count').innerHTML = hits.good;
  document.querySelector('.miss__count').innerHTML = hits.miss;
  document.querySelector('.combo__count').innerHTML = maxCombo;
  document.querySelector('.score__count').innerHTML = Math.round(score).toString().padStart(7, '0');
  document.querySelector('.summary__timer').style.opacity = 0;
  document.querySelector('.summary__result').style.opacity = 1;
};

// Handles missed notes
var setupNoteMiss = function () {
  trackContainer.addEventListener('animationend', function (event) {
    if (event.animationName !== 'linger') {
      return; // this is moveDown finishing — note just reached the line, not a miss
    }

    var index = event.target.classList.item(1)[6];

    displayAccuracy('miss');
    updateHits('miss');
    updateCombo('miss');
    updateMaxCombo();
    removeNoteFromTrack(event.target.parentNode, event.target);
    updateNext(index);
  });
};

/**
 * Allows keys to be only pressed one time. Prevents keydown event
 * from being handled multiple times while held down.
 */
var setupKeys = function () {
  document.addEventListener('keydown', function (event) {
    // Stop the spacebar from scrolling the page or re-triggering a focused button.
    if (event.key === ' ') {
      event.preventDefault();
    }

    var keyIndex = getKeyIndex(event.key);

    if (Object.keys(isHolding).indexOf(event.key) !== -1
      && !isHolding[event.key]) {
      isHolding[event.key] = true;
      keypress[keyIndex].style.display = 'block';

      if (isPlaying && tracks[keyIndex].firstChild) {
        judge(keyIndex);
      }
    }
  });

  document.addEventListener('keyup', function (event) {
    if (Object.keys(isHolding).indexOf(event.key) !== -1) {
      var keyIndex = getKeyIndex(event.key);
      isHolding[event.key] = false;
      keypress[keyIndex].style.display = 'none';
    }
  });
};

// Map input key to lane index.
// White lanes: d=0, f=1, j=2, k=3. Red lanes: e=4, r=5, u=6, i=7. Blue lane: space=8.
var getKeyIndex = function (key) {
  if (key === 'd') {
    return 0;
  } else if (key === 'f') {
    return 1;
  } else if (key === 'j') {
    return 2;
  } else if (key === 'k') {
    return 3;
  } else if (key === 'e') {
    return 4;
  } else if (key === 'r') {
    return 5;
  } else if (key === 'u') {
    return 6;
  } else if (key === 'i') {
    return 7;
  } else if (key === ' ') {
    return 8;
  }
};

var judge = function (index) {
  var timeInSecond = (Date.now() - startTime) / 1000;
  var nextNoteIndex = chart.sheet[index].next;
  var nextNote = chart.sheet[index].notes[nextNoteIndex];
  var perfectTime = defaultNoteDuration + getNoteDelayInSeconds(nextNote);

  var accuracy = timeInSecond - perfectTime;
  var hitJudgement;

  // Ignore (too early) < Miss (early) < Good (early) < Perfect < Good (late) < Miss (late) = Ignore (too late)
  if (Math.abs(accuracy) > judgement.miss || accuracy > judgement.good) {
    return;
  }

  var hitJudgement = getHitJudgement(Math.abs(accuracy));
  displayAccuracy(hitJudgement);
  showHitEffect(index, hitJudgement);
  updateHits(hitJudgement);
  updateCombo(hitJudgement);
  updateMaxCombo();
  calculateScore(hitJudgement);
  removeNoteFromTrack(tracks[index], tracks[index].firstChild);
  updateNext(index);
};

var getHitJudgement = function (accuracy) {
  if (accuracy <= judgement.perfect) {
    return 'perfect';
  } else if (accuracy <= judgement.good) {
    return 'good';
  } else {
    return 'miss';
  }
};

var displayAccuracy = function (judgement) {
  // If good, display whether late (below hit zone) or early (above hit zone)
  return;
};

var showHitEffect = function (index, judgement) {
  var flashColor = judgement === 'perfect' ? 'var(--key-perfect)'
    : judgement === 'good' ? 'var(--key-good)'
    : 'var(--key-miss)';

  // The blue lane (index 8) flashes its own centered wide key overlay, which
  // fades back to transparent so it doesn't cover the columns underneath.
  if (index === 8) {
    var blueKey = document.querySelector('.key--blue');
    blueKey.style.setProperty('--flash-color', flashColor);
    blueKey.classList.remove('key--blue-flash');
    void blueKey.offsetWidth;
    blueKey.classList.add('key--blue-flash');
    return;
  }

  // Red lanes (4-7) share a visible key box with the white lane in the same column.
  var key = document.querySelectorAll('.key')[index % 4];

  key.style.setProperty('--flash-color', flashColor);

  // Restart the animation even if it's already running (rapid consecutive hits
  // on the same key). Removing the class doesn't take effect until the browser
  // repaints, so re-adding it immediately after would be a no-op — forcing a
  // reflow in between makes the browser "notice" the class was removed first.
  key.classList.remove('key--flash');
  void key.offsetWidth;
  key.classList.add('key--flash');
};

var updateHits = function (judgement) {
  hits[judgement]++;
  updateComboIndicator();
  updateHud();
};

var updateCombo = function (judgement) {
  if (judgement === 'miss') {
    combo = 0;
    comboText.innerHTML = '';
  } else {
    comboText.innerHTML = ++combo;
  }
};

var updateMaxCombo = function () {
  maxCombo = maxCombo > combo ? maxCombo : combo;
};

var updateComboIndicator = function () {
  if (hits.miss > 0) {
    comboText.style.color = 'white';
  } else if (hits.good > 0) {
    comboText.style.color = 'var(--good-color)';
  } else if (hits.perfect > 0) {
    comboText.style.color = 'var(--perfect-color)';
  } else {
    comboText.style.color = 'white';
  }
};

var calculateScore = function (judgement) {
  if (judgement === 'miss') {
    return;
  }

  score += noteValue * (judgement === 'perfect' ? 1 : 0.5);
  updateHud();
};

// Remove note from track after hit/miss
var removeNoteFromTrack = function (parent, child) {
  parent.removeChild(child);
};

var updateNext = function (index) {
  chart.sheet[index].next++;
};

window.onload = function () {
  trackContainer = document.querySelector('.track-container');
  // Build the keypress lookup in lane-index order: white overlays (0-3),
  // then red overlays (4-7), then the wide centered blue overlay (8), so
  // keypress[keyIndex] lights the right one.
  keypress = [].concat(
    Array.prototype.slice.call(document.querySelectorAll('.keypress--white')),
    Array.prototype.slice.call(document.querySelectorAll('.keypress--red')),
    Array.prototype.slice.call(document.querySelectorAll('.keypress--blue'))
  );
  comboText = document.querySelector('.hit__combo');
  scoreDisplay = document.querySelector('.hud__score');
  accuracyDisplay = document.querySelector('.hud__accuracy');

  updateComboIndicator();
  initializeNotes();
  setupStartButton();
  setupKeys();
  setupNoteMiss();
}
