import * as Tone from 'tone';

const hiVol = new Tone.Volume(-3).toDestination();
const loVol = new Tone.Volume(-7).toDestination();

const hi = new Tone.Synth({
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.04 },
}).connect(hiVol);

const lo = new Tone.Synth({
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.04 },
}).connect(loVol);

let seq: Tone.Sequence | null = null;

export function startMetronome(bpm: number, beatsPerBar: number) {
  stopMetronome();
  Tone.Transport.bpm.value = bpm;
  seq = new Tone.Sequence(
    (time, beat) => {
      if ((beat as number) === 0) hi.triggerAttackRelease(1200, '32n', time);
      else lo.triggerAttackRelease(800, '32n', time);
    },
    Array.from({ length: beatsPerBar }, (_, i) => i),
    '4n',
  );
  seq.start(0);
  Tone.Transport.start();
}

export function stopMetronome() {
  seq?.stop(0);
  seq?.dispose();
  seq = null;
  Tone.Transport.stop();
  Tone.Transport.position = 0 as unknown as Tone.Unit.TransportTime;
}

export function setMetronomeBpm(bpm: number) {
  Tone.Transport.bpm.value = bpm;
}
