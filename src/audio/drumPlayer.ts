import * as Tone from 'tone';
import { getTicksPerBar, TICKS_PER_BEAT } from '../store/midiStore';
import type { MidiTrack } from '../store/midiStore';
import { playDrumHit } from './drumSynth';

// Suppress unused import warning
void TICKS_PER_BEAT;

interface DrumEvent {
  time: string;
  instrumentId: string;
  velocity: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let drumParts: Tone.Part<any>[] = [];

export function startDrumPlayback(tracks: MidiTrack[], bpm: number, timeSig: string): void {
  stopDrumPlayback();
  Tone.Transport.bpm.value = bpm;
  const ticksPerBar = getTicksPerBar(timeSig);

  for (const track of tracks) {
    if (track.muted || track.trackType !== 'drums') continue;
    for (const clip of track.clips) {
      if (!clip.drumRows?.length) continue;
      const stepCount = clip.stepCount ?? 16;
      const events: DrumEvent[] = [];

      clip.drumRows.forEach(row => {
        row.steps.forEach((step, stepIdx) => {
          if (!step.active) return;
          const barTick = clip.startBar * ticksPerBar;
          const stepTick = Math.round(stepIdx * clip.lengthBars * ticksPerBar / stepCount);
          const totalTick = barTick + stepTick;
          events.push({
            time: `${totalTick}i`,
            instrumentId: row.instrumentId,
            velocity: step.velocity,
          });
        });
      });

      if (!events.length) continue;
      const part = new Tone.Part<DrumEvent>(
        (time, evt: DrumEvent) => {
          playDrumHit(evt.instrumentId, time, evt.velocity);
        },
        events,
      );
      part.start(0);
      drumParts.push(part);
    }
  }
}

export function stopDrumPlayback(): void {
  drumParts.forEach(p => { try { p.stop(); p.dispose(); } catch { /* ignore */ } });
  drumParts = [];
}
