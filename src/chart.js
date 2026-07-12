const d = {
  color: 'rgba(255, 255, 255, 1)',
  next: 0,
  notes: [
    { beat: 1.00 },
  ]
};

const f = {
  color: 'rgba(255, 255, 255, 1)',
  next: 0,
  notes: [
    { beat: 1.00, speed: 1.25 },
  ]
};

const j = {
  color: 'rgba(255, 255, 255, 1)',
  next: 0,
  notes: [
    { beat: 6.00 },
    { beat: 6.50 },
    { beat: 7.00 },
    { beat: 7.50 },
  ]
};

const k = {
  color: 'rgba(255, 255, 255, 1)',
  next: 0,
  notes: [
  ]
};

export const chart = {
  duration: 30,
  bpm: 190,
  preRollMs: 2050,
  sheet: [d, f, j, k]
};