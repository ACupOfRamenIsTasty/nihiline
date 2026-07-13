// Results screen
// ---------------
// Self-contained end-of-chart summary. Kept separate from the core game loop
// in app.js so the presentation can evolve independently of the gameplay.
//
// Responsibilities:
//   1. Fade out the play field (lanes, live score, live accuracy) so the
//      results can take over a clean stage.
//   2. Grade the run and render a minimal, ordered stat panel.
//
// The only entry point is showResult(stats).

// How long the play field takes to fade out before the panel fades in.
// Mirrors the 1s opacity transitions already defined in app.css.
var FADE_OUT_MS = 1000;

// Heading variants. The grade is derived purely from the hit tallies:
//   - Every note pristine (no tainted, no corrupted)  -> ALL PRISTINE
//   - Nothing corrupted (but some tainted)            -> FULL COMBO
//   - Otherwise                                       -> COMPLETE
var GRADES = {
  pristine: { text: 'ALL PRISTINE', color: 'var(--perfect-color)' },
  fullCombo: { text: 'FULL COMBO', color: 'var(--good-color)' },
  complete: { text: 'COMPLETE', color: 'var(--score-color)' }
};

var getGrade = function (hits) {
  if (hits.good === 0 && hits.miss === 0) {
    return GRADES.pristine;
  }
  else if (hits.miss === 0) {
    return GRADES.fullCombo;
  }
  else return GRADES.complete;
};

// Accuracy grades hit notes: pristine = 100%, tainted = 65%, corrupted = 0%.
// Matches the live HUD calculation in app.js.
var computeAccuracy = function (hits) {
  var judged = hits.perfect + hits.good + hits.miss;
  if (judged === 0) {
    return 100;
  }
  return (hits.perfect * 100 + hits.good * 65) / judged;
};

// Builds one detail line: "label : value". `modifier` colors the row via a
// CSS class; `sub` is optional extra markup rendered beneath (tainted split).
var buildDetail = function (label, value, modifier, sub) {
  return (
    '<div class="result__detail' + (modifier ? ' result__detail--' + modifier : '') + '">' +
      '<dt class="result__label">' + label + '</dt>' +
      '<dd class="result__value">' + value + '</dd>' +
      (sub || '') +
    '</div>'
  );
};

// Early/late breakdown grouped under the Tainted row.
var buildTaintedSub = function (hits) {
  return (
    '<div class="result__sub">' +
      '<span class="result__sub-item result__sub-item--early">' +
        '<span>Early</span><span>' + hits.taintedEarly + '</span>' +
      '</span>' +
      '<span class="result__sub-item result__sub-item--late">' +
        '<span>Late</span><span>' + hits.taintedLate + '</span>' +
      '</span>' +
    '</div>'
  );
};

var render = function (panel, stats) {
  var hits = stats.hits;
  var grade = getGrade(hits);
  var score = Math.round(stats.score).toString().padStart(7, '0');
  var accuracy = computeAccuracy(hits).toFixed(2) + '%';

  // Visual hierarchy:
  //   1. Grade heading  (most prominent)
  //   2. Score          (centered, bold, largest number)
  //   3. Accuracy + Max Combo  (paired, bold, medium)
  //   4. Perfect / Tainted (+early/late) / Corrupted  (divided detail rows)
  panel.innerHTML =
    '<h2 class="result__heading" style="color: ' + grade.color + '">' + grade.text + '</h2>' +
    '<div class="result__score">' +
      '<span class="result__score-label">Score</span>' +
      '<span class="result__score-value">' + score + '</span>' +
    '</div>' +
    '<div class="result__headline">' +
      '<div class="result__headline-item">' +
        '<span class="result__headline-label">Accuracy</span>' +
        '<span class="result__headline-value">' + accuracy + '</span>' +
      '</div>' +
      '<div class="result__headline-item">' +
        '<span class="result__headline-label">Max Combo</span>' +
        '<span class="result__headline-value">' + stats.maxCombo + '</span>' +
      '</div>' +
    '</div>' +
    '<dl class="result__details">' +
      buildDetail('Perfect', hits.perfect, 'perfect') +
      buildDetail('Tainted', hits.good, 'good', buildTaintedSub(hits)) +
      buildDetail('Corrupted', hits.miss, 'miss') +
    '</dl>';
};

// Fades the play field away, then reveals the freshly rendered results panel.
// stats: { score, maxCombo, hits: { perfect, good, miss, taintedEarly, taintedLate } }
export var showResult = function (stats) {
  var fadeTargets = [
    document.querySelector('.track-container'),
    document.querySelector('.key-container'),
    document.querySelector('.hud'),
    document.querySelector('.hit__combo')
  ];

  fadeTargets.forEach(function (el) {
    if (!el) {
      return;
    }
    el.style.transition = 'opacity 1s ease';
    el.style.opacity = 0;
  });

  document.querySelector('.summary__timer').style.opacity = 0;

  var summary = document.querySelector('.summary');
  var panel = document.querySelector('.summary__result');
  render(panel, stats);

  // Let the stage clear before the results settle in.
  window.setTimeout(function () {
    summary.style.pointerEvents = 'auto';
    panel.style.opacity = 1;
  }, FADE_OUT_MS);
};
