// Every sound HALOCLINE makes, synthesised at run time with WebAudio: no audio files, so the
// game loads nothing over the network and the entry's references gate stays clean. Each cue is
// a short envelope on an oscillator or a noise burst. Audio is optional throughout: a browser
// that blocks it, or a player who mutes, loses nothing but the cues.

const MASTER_GAIN = 0.22;

/** Cue definitions: waveform, start and end frequency, seconds, and how loud. */
const CUES = {
  ping: { wave: 'sine', from: 1180, to: 540, seconds: 0.55, gain: 0.9 },
  salvage: { wave: 'triangle', from: 620, to: 940, seconds: 0.16, gain: 0.7 },
  hit: { wave: 'sawtooth', from: 210, to: 58, seconds: 0.42, gain: 1 },
  tank: { wave: 'triangle', from: 340, to: 700, seconds: 0.28, gain: 0.6 },
  vent: { wave: 'sine', from: 440, to: 300, seconds: 0.2, gain: 0.4 },
  zone: { wave: 'sine', from: 300, to: 900, seconds: 0.7, gain: 0.55 },
  win: { wave: 'triangle', from: 520, to: 1040, seconds: 1.1, gain: 0.8 },
  lose: { wave: 'sawtooth', from: 260, to: 44, seconds: 1.3, gain: 0.9 },
  deny: { wave: 'square', from: 180, to: 120, seconds: 0.1, gain: 0.35 },
};

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  /** Built on the first player gesture, since browsers refuse audio before one. */
  function ensure() {
    if (context !== null) return context;
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) return null;
    try {
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(context.destination);
    } catch {
      context = null;
      master = null;
    }
    return context;
  }

  function tone(cue) {
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = cue.wave;
    oscillator.frequency.setValueAtTime(cue.from, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, cue.to), now + cue.seconds);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(cue.gain, now + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + cue.seconds);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(now);
    oscillator.stop(now + cue.seconds + 0.02);
  }

  /** A short filtered noise burst, used under the ping for the sonar's hiss. */
  function noise(seconds, gain) {
    const now = context.currentTime;
    const frames = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frames; index += 1) {
      const fade = 1 - index / frames;
      data[index] = (Math.random() * 2 - 1) * fade * fade;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    filter.Q.value = 0.7;
    envelope.gain.value = gain;
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    source.start(now);
  }

  /** Play a named cue. Unknown names and a missing context are silent, never an error. */
  function play(name) {
    if (muted) return;
    if (ensure() === null) return;
    if (context.state === 'suspended') context.resume().catch(() => {});
    const cue = CUES[name];
    if (!cue) return;
    try {
      tone(cue);
      if (name === 'ping') noise(0.5, 0.16);
      if (name === 'hit' || name === 'lose') noise(0.3, 0.12);
    } catch {
      // A closed or suspended context drops the cue; the game plays on without it.
    }
  }

  /** Wake the context on the player's first interaction, as browsers require. */
  function unlock() {
    if (ensure() === null) return;
    if (context.state === 'suspended') context.resume().catch(() => {});
  }

  function toggleMute() {
    muted = !muted;
    if (master !== null) master.gain.value = muted ? 0 : MASTER_GAIN;
    return muted;
  }

  return { play, unlock, toggleMute, isMuted: () => muted };
}
