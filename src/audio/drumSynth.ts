import * as Tone from 'tone';

export const DRUM_INSTRUMENTS = [
  // Standard
  { id: 'kick',     name: 'Kick',      color: '#ef5350' },
  { id: 'snare',    name: 'Snare',     color: '#ff9800' },
  { id: 'hihat_c',  name: 'HH Cls',    color: '#fdd835' },
  { id: 'hihat_o',  name: 'HH Opn',    color: '#aed581' },
  { id: 'crash',    name: 'Crash',     color: '#ce93d8' },
  { id: 'ride',     name: 'Ride',      color: '#9fa8da' },
  { id: 'tom_h',    name: 'Tom Hi',    color: '#4db6ac' },
  { id: 'tom_m',    name: 'Tom Mid',   color: '#26c6da' },
  { id: 'tom_l',    name: 'Tom Lo',    color: '#4fc3f7' },
  // Electronic / 808
  { id: 'kick808',  name: 'Kick 808',  color: '#e53935' },
  { id: 'snare808', name: 'Snare 808', color: '#fb8c00' },
  { id: 'clap',     name: 'Clap',      color: '#ffcc02' },
  { id: 'rimshot',  name: 'Rimshot',   color: '#dce775' },
  { id: 'cowbell',  name: 'Cowbell',   color: '#ffab40' },
  // Percussion
  { id: 'shaker',   name: 'Shaker',    color: '#a5d6a7' },
  { id: 'snap',     name: 'Snap',      color: '#80cbc4' },
];

export interface DrumKit { name: string; rows: string[] }

export const DRUM_KITS: DrumKit[] = [
  { name: 'Standard',   rows: ['kick',    'snare',    'hihat_c', 'hihat_o', 'tom_h', 'tom_l', 'crash', 'ride'] },
  { name: '808',        rows: ['kick808', 'snare808', 'hihat_c', 'hihat_o', 'clap',  'cowbell','crash', 'ride'] },
  { name: 'Trap',       rows: ['kick808', 'snare',    'hihat_c', 'hihat_c', 'hihat_o','clap',  'crash', 'snap'] },
  { name: 'Lo-fi',      rows: ['kick',    'snare808', 'hihat_c', 'hihat_o', 'rimshot','shaker','crash', 'ride'] },
  { name: 'Acoustic',   rows: ['kick',    'snare',    'hihat_c', 'hihat_o', 'tom_h', 'tom_m', 'tom_l', 'crash', 'ride'] },
];

// ─── Destination ─────────────────────────────────────────────────────────────

let limiter: Tone.Limiter | null = null;
function dst() {
  if (!limiter) limiter = new Tone.Limiter(-2).toDestination();
  return limiter;
}

// ─── Membrane synths (kick / toms) ───────────────────────────────────────────

let _kick: Tone.MembraneSynth | null = null;
let _kick808: Tone.MembraneSynth | null = null;
let _snareBody: Tone.MembraneSynth | null = null;
let _rimshot: Tone.MembraneSynth | null = null;
let _tomH: Tone.MembraneSynth | null = null;
let _tomM: Tone.MembraneSynth | null = null;
let _tomL: Tone.MembraneSynth | null = null;

function getKick() {
  if (!_kick) _kick = new Tone.MembraneSynth({
    pitchDecay: 0.05, octaves: 10,
    envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.5 },
  }).connect(dst());
  return _kick;
}
function getKick808() {
  if (!_kick808) _kick808 = new Tone.MembraneSynth({
    pitchDecay: 0.5, octaves: 10,
    envelope: { attack: 0.001, decay: 0.9, sustain: 0, release: 0.8 },
    volume: 2,
  }).connect(dst());
  return _kick808;
}
function getSnareBody() {
  if (!_snareBody) _snareBody = new Tone.MembraneSynth({
    pitchDecay: 0.02, octaves: 3,
    envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.04 },
    volume: -6,
  }).connect(dst());
  return _snareBody;
}
function getRimshot() {
  if (!_rimshot) _rimshot = new Tone.MembraneSynth({
    pitchDecay: 0.008, octaves: 2,
    envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.03 },
  }).connect(dst());
  return _rimshot;
}
function getTomH() {
  if (!_tomH) _tomH = new Tone.MembraneSynth({ pitchDecay: 0.07, octaves: 6, envelope: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.1 } }).connect(dst());
  return _tomH;
}
function getTomM() {
  if (!_tomM) _tomM = new Tone.MembraneSynth({ pitchDecay: 0.09, octaves: 7, envelope: { attack: 0.001, decay: 0.26, sustain: 0, release: 0.1 } }).connect(dst());
  return _tomM;
}
function getTomL() {
  if (!_tomL) _tomL = new Tone.MembraneSynth({ pitchDecay: 0.11, octaves: 8, envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.12 } }).connect(dst());
  return _tomL;
}

// ─── Noise + filter synths (snare, cymbal family) ────────────────────────────
// NoiseSynth → Filter → Limiter   (fully reliable in Tone.js v15)

interface NoiseChan { synth: Tone.NoiseSynth; filter: Tone.Filter }

function makeNoiseChan(
  noiseType: 'white' | 'pink',
  filterFreq: number,
  filterType: BiquadFilterType,
  filterQ: number,
  decay: number,
  release: number,
  vol = 0,
): NoiseChan {
  const filter = new Tone.Filter({ frequency: filterFreq, type: filterType, Q: filterQ }).connect(dst());
  const synth = new Tone.NoiseSynth({
    noise: { type: noiseType },
    envelope: { attack: 0.001, decay, sustain: 0, release },
    volume: vol,
  });
  synth.connect(filter);
  return { synth, filter };
}

let _snare: NoiseChan | null = null;
let _snare808: NoiseChan | null = null;
let _clap: NoiseChan | null = null;
let _hihatC: NoiseChan | null = null;
let _hihatO: NoiseChan | null = null;
let _crash: NoiseChan | null = null;
let _ride: NoiseChan | null = null;
let _shaker: NoiseChan | null = null;
let _snap: NoiseChan | null = null;

function getSnare()   { if (!_snare)   _snare   = makeNoiseChan('white', 2500, 'bandpass', 0.8, 0.18, 0.06,  0); return _snare; }
function getSnare808(){ if (!_snare808) _snare808 = makeNoiseChan('white', 4000, 'highpass', 1,   0.08, 0.03, -2); return _snare808; }
function getClap()    { if (!_clap)    _clap    = makeNoiseChan('pink',  1200, 'bandpass', 0.6, 0.12, 0.08,  0); return _clap; }
function getHihatC()  { if (!_hihatC)  _hihatC  = makeNoiseChan('white', 9000, 'highpass', 1.5, 0.04, 0.01, -3); return _hihatC; }
function getHihatO()  { if (!_hihatO)  _hihatO  = makeNoiseChan('white', 7000, 'highpass', 1,   0.35, 0.15, -3); return _hihatO; }
function getCrash()   { if (!_crash)   _crash   = makeNoiseChan('white', 5000, 'bandpass', 0.4, 2.2,  0.8,  -1); return _crash; }
function getRide()    { if (!_ride)    _ride    = makeNoiseChan('white', 7500, 'bandpass', 1.2, 0.65, 0.25, -2); return _ride; }
function getShaker()  { if (!_shaker)  _shaker  = makeNoiseChan('white', 8500, 'highpass', 2,   0.06, 0.02, -8); return _shaker; }
function getSnap()    { if (!_snap)    _snap    = makeNoiseChan('white',10000, 'highpass', 2,   0.02, 0.01, -4); return _snap; }

// ─── Cowbell (oscillator pair) ────────────────────────────────────────────────

interface BellChan { osc1: Tone.Oscillator; osc2: Tone.Oscillator; env: Tone.AmplitudeEnvelope }
let _cowbell: BellChan | null = null;

function getCowbell(): BellChan {
  if (!_cowbell) {
    const env = new Tone.AmplitudeEnvelope({ attack: 0.001, decay: 0.5, sustain: 0, release: 0.1 }).connect(dst());
    const osc1 = new Tone.Oscillator({ frequency: 562, type: 'square' }).connect(env);
    const osc2 = new Tone.Oscillator({ frequency: 845, type: 'square' }).connect(env);
    _cowbell = { osc1, osc2, env };
  }
  return _cowbell;
}

// ─── Trigger ─────────────────────────────────────────────────────────────────

export function playDrumHit(instrumentId: string, time: number, velocity: number): void {
  const vel = Math.max(0.01, Math.min(1, velocity));

  switch (instrumentId) {
    case 'kick':
      getKick().triggerAttackRelease('C1', '8n', time, vel);
      break;
    case 'kick808':
      getKick808().triggerAttackRelease('C1', '8n', time, vel);
      break;
    case 'snare':
      getSnare().synth.triggerAttackRelease('16n', time, vel);
      getSnareBody().triggerAttackRelease('A2', '32n', time, vel);
      break;
    case 'snare808':
      getSnare808().synth.triggerAttackRelease('16n', time, vel);
      break;
    case 'clap':
      getClap().synth.triggerAttackRelease('16n', time, vel);
      break;
    case 'rimshot':
      getRimshot().triggerAttackRelease('E3', '32n', time, vel);
      break;
    case 'hihat_c':
      getHihatC().synth.triggerAttackRelease('16n', time, vel);
      break;
    case 'hihat_o':
      getHihatO().synth.triggerAttackRelease('16n', time, vel);
      break;
    case 'crash':
      getCrash().synth.triggerAttackRelease('16n', time, vel);
      break;
    case 'ride':
      getRide().synth.triggerAttackRelease('16n', time, vel);
      break;
    case 'tom_h':
      getTomH().triggerAttackRelease('G2', '8n', time, vel);
      break;
    case 'tom_m':
      getTomM().triggerAttackRelease('E2', '8n', time, vel);
      break;
    case 'tom_l':
      getTomL().triggerAttackRelease('C2', '8n', time, vel);
      break;
    case 'shaker':
      getShaker().synth.triggerAttackRelease('16n', time, vel);
      break;
    case 'snap':
      getSnap().synth.triggerAttackRelease('16n', time, vel);
      break;
    case 'cowbell': {
      const bell = getCowbell();
      if (bell.osc1.state !== 'started') { bell.osc1.start(); bell.osc2.start(); }
      bell.env.triggerAttackRelease('8n', time, vel);
      break;
    }
  }
}
