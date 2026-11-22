/**
 * Sample Lab — browser audio engine (client only).
 * Raw input (no echo cancellation / noise suppression / auto gain: they ruin instruments),
 * lossless capture through an AudioWorklet, an analyser for the meter and the tuner,
 * and a sample-accurate metronome on the same AudioContext clock.
 */

const RECORDER_WORKLET = `
class BrdLabRecorder extends AudioWorkletProcessor {
  constructor() { super(); this.on = false; this.port.onmessage = (e) => { this.on = e.data === 'start'; if (this.on) this.port.postMessage({ type: 'start', frame: currentFrame }); }; }
  process(inputs) {
    const input = inputs[0];
    if (this.on && input && input.length) this.port.postMessage({ type: 'data', channels: input.map((c) => c.slice(0)) });
    return true;
  }
}
registerProcessor('brd-lab-recorder', BrdLabRecorder);
`;

export type LabInput = { deviceId: string; label: string };

/** Audio inputs. Labels appear only after the user allowed the microphone once. */
export async function listLabInputs(): Promise<LabInput[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "audioinput")
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Wejście ${i + 1}` }));
}

export type LabEngine = {
  ctx: AudioContext;
  analyser: AnalyserNode;
  /** Start capturing. Resolves with the AudioContext time of the first captured frame. */
  startCapture: () => Promise<number>;
  /** Stop capturing and return the recorded channels. */
  stopCapture: () => Float32Array[];
  setMonitor: (on: boolean) => void;
  /** Output latency estimate in seconds (click → ear → instrument → mic). */
  latency: () => number;
  close: () => Promise<void>;
};

export async function openLabEngine(opts: { deviceId?: string; stereo: boolean }): Promise<LabEngine> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: opts.deviceId ? { exact: opts.deviceId } : undefined,
      channelCount: { ideal: opts.stereo ? 2 : 1 },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: { ideal: 48_000 },
    },
  });
  const channelCount = opts.stereo ? 2 : 1;
  let ctx: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode;
  let analyser: AnalyserNode;
  let recorder: AudioWorkletNode;
  let monitor: GainNode;
  try {
    ctx = new AudioContext({ latencyHint: "interactive", sampleRate: 48_000 });
    const url = URL.createObjectURL(new Blob([RECORDER_WORKLET], { type: "application/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    recorder = new AudioWorkletNode(ctx, "brd-lab-recorder", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount,
      channelCountMode: "explicit",
    });
    monitor = ctx.createGain();
    monitor.gain.value = 0;
    source.connect(analyser);
    source.connect(recorder);
    source.connect(monitor).connect(ctx.destination);
  } catch (error) {
    // Setup failed after the mic was granted: release it so the browser's mic indicator turns off.
    stream.getTracks().forEach((track) => track.stop());
    await ctx?.close().catch(() => undefined);
    throw error;
  }

  let chunks: Float32Array[][] = [];
  let firstFrame = 0;
  let onStart: ((frame: number) => void) | null = null;
  recorder.port.onmessage = (e: MessageEvent<{ type: string; frame?: number; channels?: Float32Array[] }>) => {
    if (e.data.type === "start") {
      firstFrame = e.data.frame ?? 0;
      onStart?.(firstFrame);
    } else if (e.data.channels) {
      chunks.push(e.data.channels);
    }
  };

  return {
    ctx,
    analyser,
    startCapture: () =>
      new Promise<number>((resolve) => {
        chunks = [];
        onStart = (frame) => resolve(frame / ctx.sampleRate);
        recorder.port.postMessage("start");
      }),
    stopCapture: () => {
      recorder.port.postMessage("stop");
      const n = chunks[0]?.length ?? channelCount;
      const total = chunks.reduce((sum, c) => sum + (c[0]?.length ?? 0), 0);
      const out = Array.from({ length: Math.max(1, Math.min(2, n)) }, () => new Float32Array(total));
      let o = 0;
      for (const c of chunks) {
        for (let ch = 0; ch < out.length; ch++) out[ch].set(c[ch] ?? c[0], o);
        o += c[0]?.length ?? 0;
      }
      chunks = [];
      return out;
    },
    setMonitor: (on) => {
      monitor.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.02);
    },
    latency: () => (ctx.outputLatency || 0) + (ctx.baseLatency || 0),
    close: async () => {
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();
    },
  };
}

/**
 * Metronome clicks from `startTime`, `count` beats, accent on beat 1 of every bar.
 * Returns a stop function that silences the remaining clicks.
 */
export function scheduleClicks(ctx: AudioContext, startTime: number, bpm: number, count: number, volume = 0.6): () => void {
  const bus = ctx.createGain();
  bus.gain.value = volume;
  bus.connect(ctx.destination);
  const spb = 60 / bpm;
  for (let i = 0; i < count; i++) {
    const t = startTime + i * spb;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.value = i % 4 === 0 ? 1760 : 1175;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.002);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(env).connect(bus);
    osc.start(t);
    osc.stop(t + 0.06);
  }
  return () => {
    bus.gain.setValueAtTime(0, ctx.currentTime);
    bus.disconnect();
  };
}

/** Play channels once (or looped) on a context; returns a stop function. */
export function playChannels(ctx: AudioContext, channels: Float32Array[], sampleRate: number, loop: boolean, onEnd?: () => void): () => void {
  const buffer = ctx.createBuffer(channels.length, channels[0]?.length || 1, sampleRate);
  channels.forEach((ch, i) => buffer.copyToChannel(new Float32Array(ch), i));
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = loop;
  src.connect(ctx.destination);
  src.onended = () => onEnd?.();
  src.start();
  return () => {
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
  };
}
