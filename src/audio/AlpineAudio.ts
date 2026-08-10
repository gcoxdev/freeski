export type AlpineSoundCue =
  | "jump"
  | "landing"
  | "crash"
  | "bump"
  | "gate-start"
  | "gate-correct"
  | "gate-penalty"
  | "gate-finish"
  | "beginner-fall"
  | "snowboard-air"
  | "dog-bark"
  | "lift-clack"
  | "walking-tree"
  | "mushroom-secret"
  | "fire-secret"
  | "yellow-snow"
  | "turbo-on"
  | "turbo-off"
  | "pause"
  | "resume"
  | "reset"
  | "ui-toggle"
  | "yeti-warning"
  | "yeti-pounce"
  | "yeti-grab"
  | "yeti-eat";

export const ALPINE_SOUND_BANK: readonly AlpineSoundCue[] = Object.freeze([
  "jump",
  "landing",
  "crash",
  "bump",
  "gate-start",
  "gate-correct",
  "gate-penalty",
  "gate-finish",
  "beginner-fall",
  "snowboard-air",
  "dog-bark",
  "lift-clack",
  "walking-tree",
  "mushroom-secret",
  "fire-secret",
  "yellow-snow",
  "turbo-on",
  "turbo-off",
  "pause",
  "resume",
  "reset",
  "ui-toggle",
  "yeti-warning",
  "yeti-pounce",
  "yeti-grab",
  "yeti-eat",
]);

export const AUDIO_MUTE_STORAGE_KEY = "freeski.audio.muted.v1";

export interface AlpineAudioSnapshot {
  readonly activeAmbientLayers: number;
  readonly availableCues: number;
  readonly cueCount: number;
  readonly gestureRequired: boolean;
  readonly lastCue: AlpineSoundCue | "none";
  readonly muted: boolean;
  readonly unlocked: boolean;
  readonly volume: number;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

interface CueShape {
  readonly duration: number;
  readonly endFrequency: number;
  readonly gain: number;
  readonly noise: number;
  readonly startFrequency: number;
  readonly type: OscillatorType;
}

const CUE_SHAPES: Readonly<Record<AlpineSoundCue, CueShape>> = Object.freeze({
  jump: {
    duration: 0.22,
    endFrequency: 520,
    gain: 0.12,
    noise: 0.04,
    startFrequency: 210,
    type: "sine",
  },
  landing: {
    duration: 0.28,
    endFrequency: 92,
    gain: 0.1,
    noise: 0.14,
    startFrequency: 170,
    type: "triangle",
  },
  crash: {
    duration: 0.46,
    endFrequency: 48,
    gain: 0.16,
    noise: 0.22,
    startFrequency: 130,
    type: "sawtooth",
  },
  bump: {
    duration: 0.13,
    endFrequency: 380,
    gain: 0.09,
    noise: 0.05,
    startFrequency: 250,
    type: "triangle",
  },
  "gate-start": {
    duration: 0.3,
    endFrequency: 660,
    gain: 0.1,
    noise: 0,
    startFrequency: 330,
    type: "square",
  },
  "gate-correct": {
    duration: 0.18,
    endFrequency: 880,
    gain: 0.08,
    noise: 0,
    startFrequency: 560,
    type: "sine",
  },
  "gate-penalty": {
    duration: 0.32,
    endFrequency: 120,
    gain: 0.1,
    noise: 0.02,
    startFrequency: 280,
    type: "square",
  },
  "gate-finish": {
    duration: 0.55,
    endFrequency: 1040,
    gain: 0.11,
    noise: 0,
    startFrequency: 390,
    type: "triangle",
  },
  "beginner-fall": {
    duration: 0.3,
    endFrequency: 110,
    gain: 0.09,
    noise: 0.07,
    startFrequency: 330,
    type: "triangle",
  },
  "snowboard-air": {
    duration: 0.2,
    endFrequency: 710,
    gain: 0.08,
    noise: 0.05,
    startFrequency: 310,
    type: "sine",
  },
  "dog-bark": {
    duration: 0.2,
    endFrequency: 150,
    gain: 0.12,
    noise: 0.1,
    startFrequency: 240,
    type: "square",
  },
  "lift-clack": {
    duration: 0.1,
    endFrequency: 80,
    gain: 0.07,
    noise: 0.06,
    startFrequency: 160,
    type: "square",
  },
  "walking-tree": {
    duration: 0.38,
    endFrequency: 54,
    gain: 0.08,
    noise: 0.09,
    startFrequency: 95,
    type: "triangle",
  },
  "mushroom-secret": {
    duration: 0.46,
    endFrequency: 1180,
    gain: 0.1,
    noise: 0,
    startFrequency: 440,
    type: "sine",
  },
  "fire-secret": {
    duration: 0.52,
    endFrequency: 760,
    gain: 0.1,
    noise: 0.13,
    startFrequency: 260,
    type: "triangle",
  },
  "yellow-snow": {
    duration: 0.25,
    endFrequency: 230,
    gain: 0.08,
    noise: 0.04,
    startFrequency: 510,
    type: "square",
  },
  "turbo-on": {
    duration: 0.38,
    endFrequency: 920,
    gain: 0.11,
    noise: 0.08,
    startFrequency: 150,
    type: "sawtooth",
  },
  "turbo-off": {
    duration: 0.26,
    endFrequency: 120,
    gain: 0.08,
    noise: 0.03,
    startFrequency: 520,
    type: "sine",
  },
  pause: {
    duration: 0.14,
    endFrequency: 180,
    gain: 0.08,
    noise: 0,
    startFrequency: 360,
    type: "square",
  },
  resume: {
    duration: 0.14,
    endFrequency: 480,
    gain: 0.08,
    noise: 0,
    startFrequency: 240,
    type: "square",
  },
  reset: {
    duration: 0.32,
    endFrequency: 640,
    gain: 0.08,
    noise: 0.03,
    startFrequency: 190,
    type: "triangle",
  },
  "ui-toggle": {
    duration: 0.08,
    endFrequency: 620,
    gain: 0.06,
    noise: 0,
    startFrequency: 520,
    type: "sine",
  },
  "yeti-warning": {
    duration: 0.75,
    endFrequency: 42,
    gain: 0.12,
    noise: 0.1,
    startFrequency: 88,
    type: "sawtooth",
  },
  "yeti-pounce": {
    duration: 0.42,
    endFrequency: 38,
    gain: 0.15,
    noise: 0.2,
    startFrequency: 130,
    type: "sawtooth",
  },
  "yeti-grab": {
    duration: 0.36,
    endFrequency: 56,
    gain: 0.14,
    noise: 0.16,
    startFrequency: 170,
    type: "square",
  },
  "yeti-eat": {
    duration: 0.8,
    endFrequency: 34,
    gain: 0.16,
    noise: 0.2,
    startFrequency: 96,
    type: "sawtooth",
  },
});

/** Original procedural sound bank. AudioContext is created only after a gesture. */
export class AlpineAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private glideGain?: GainNode;
  private windGain?: GainNode;
  private carveGain?: GainNode;
  private cueCount = 0;
  private lastCue: AlpineSoundCue | "none" = "none";
  private mutedValue: boolean;
  private unlockedValue = false;
  private volumeValue = 1;

  constructor(private readonly storage?: StorageLike) {
    let persisted = false;
    try {
      persisted = storage?.getItem(AUDIO_MUTE_STORAGE_KEY) === "true";
    } catch {
      persisted = false;
    }
    this.mutedValue = persisted;
  }

  async unlock(): Promise<void> {
    if (!this.context) this.createGraph();
    if (!this.context) return;
    if (this.context.state === "suspended") await this.context.resume();
    this.unlockedValue = this.context.state === "running";
  }

  update(
    speedMetersPerSecond: number,
    carving: boolean,
    warning: number,
    paused: boolean,
  ): void {
    if (!this.context || !this.master || !this.unlockedValue) return;
    const now = this.context.currentTime;
    const enabled = !paused && !this.mutedValue;
    const speed = Math.max(0, Math.min(1, speedMetersPerSecond / 32));
    this.glideGain?.gain.setTargetAtTime(
      enabled ? 0.018 + speed * 0.055 : 0,
      now,
      0.08,
    );
    this.windGain?.gain.setTargetAtTime(
      enabled ? Math.max(0, speed - 0.18) * 0.12 + warning * 0.035 : 0,
      now,
      0.12,
    );
    this.carveGain?.gain.setTargetAtTime(
      enabled && carving ? 0.07 * speed : 0,
      now,
      0.045,
    );
  }

  play(cue: AlpineSoundCue): void {
    this.lastCue = cue;
    this.cueCount += 1;
    if (!this.context || !this.master || !this.unlockedValue || this.mutedValue)
      return;
    const shape = CUE_SHAPES[cue];
    const now = this.context.currentTime;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(shape.gain, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + shape.duration);
    gain.connect(this.master);
    const oscillator = this.context.createOscillator();
    oscillator.type = shape.type;
    oscillator.frequency.setValueAtTime(shape.startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(20, shape.endFrequency),
      now + shape.duration,
    );
    oscillator.connect(gain);
    oscillator.start(now);
    oscillator.stop(now + shape.duration + 0.02);
    if (shape.noise > 0) this.noiseBurst(now, shape.duration, shape.noise);
  }

  toggleMuted(): void {
    this.setMuted(!this.mutedValue);
  }

  setMuted(muted: boolean): void {
    this.mutedValue = muted;
    try {
      this.storage?.setItem(AUDIO_MUTE_STORAGE_KEY, muted.toString());
    } catch {
      // Storage denial must not disable gameplay or audio controls.
    }
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(
        muted ? 0 : 0.72 * this.volumeValue,
        this.context.currentTime,
        0.025,
      );
  }

  setVolume(volume: number): void {
    this.volumeValue = Number.isFinite(volume)
      ? Math.max(0, Math.min(1, volume))
      : this.volumeValue;
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(
        this.mutedValue ? 0 : 0.72 * this.volumeValue,
        this.context.currentTime,
        0.025,
      );
  }

  getSnapshot(): AlpineAudioSnapshot {
    return Object.freeze({
      activeAmbientLayers:
        this.unlockedValue && !this.mutedValue && this.volumeValue > 0 ? 3 : 0,
      availableCues: ALPINE_SOUND_BANK.length,
      cueCount: this.cueCount,
      gestureRequired: !this.unlockedValue,
      lastCue: this.lastCue,
      muted: this.mutedValue,
      unlocked: this.unlockedValue,
      volume: this.volumeValue,
    });
  }

  destroy(): void {
    void this.context?.close();
    this.context = undefined;
    this.unlockedValue = false;
  }

  private createGraph(): void {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    const context = new AudioContextConstructor();
    const master = context.createGain();
    master.gain.value = this.mutedValue ? 0 : 0.72 * this.volumeValue;
    master.connect(context.destination);
    this.context = context;
    this.master = master;
    this.glideGain = this.createNoiseLayer("bandpass", 720, master);
    this.windGain = this.createNoiseLayer("highpass", 1_100, master);
    this.carveGain = this.createNoiseLayer("bandpass", 2_600, master);
  }

  private createNoiseLayer(
    type: BiquadFilterType,
    frequency: number,
    destination: AudioNode,
  ): GainNode {
    const context = this.context!;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer(2);
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(destination);
    source.start();
    return gain;
  }

  private noiseBuffer(seconds: number): AudioBuffer {
    const context = this.context!;
    const length = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let state = 0x46524545;
    for (let index = 0; index < samples.length; index += 1) {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      samples[index] = (state / 0xffff_ffff) * 2 - 1;
    }
    return buffer;
  }

  private noiseBurst(at: number, duration: number, amount: number): void {
    const context = this.context!;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer(Math.max(0.1, duration));
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900;
    const gain = context.createGain();
    gain.gain.setValueAtTime(amount, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(gain).connect(this.master!);
    source.start(at);
    source.stop(at + duration + 0.02);
  }
}
