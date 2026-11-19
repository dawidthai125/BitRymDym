import vm from "node:vm";

import { describe, expect, it } from "vitest";

import { P0_RIDE_MAX_DB } from "@/lib/studio/p0-hiphop-start";
import { buildTuneWorkletSource } from "@/lib/studio/tune/tune-worklet";

import { buildGateWorkletSource } from "./gate-worklet";
import { buildHarmonyWorkletSource } from "./harmony-worklet";
import { buildPocketWorkletSource } from "./pocket-worklet";
import { buildRiderWorkletSource } from "./rider-worklet";
import { VOCAL_LEVEL_DEFAULT_MAX_DB } from "./vocal-level";
import { buildVoiceWorkletSource } from "./voice-worklet";

/**
 * Each AudioWorklet module is the toString() of a core class. If the class touches a free variable
 * (an imported constant, a helper) the module throws ReferenceError in the browser and the slot
 * stays dry, while the offline render still applies the effect. Load every module in a sandbox.
 */
const SOURCES: Record<string, () => string> = {
  rider: buildRiderWorkletSource,
  gate: buildGateWorkletSource,
  harmony: buildHarmonyWorkletSource,
  pocket: buildPocketWorkletSource,
  voice: buildVoiceWorkletSource,
  tune: buildTuneWorkletSource,
};

describe("AudioWorklet sources are self-contained", () => {
  for (const [name, build] of Object.entries(SOURCES)) {
    it(`${name} loads and its processor can be constructed`, () => {
      const registered: { name: string; ctor: new (o?: unknown) => unknown }[] = [];
      class AudioWorkletProcessor {
        port = { onmessage: null as unknown, postMessage() {} };
      }
      const sandbox = {
        AudioWorkletProcessor,
        registerProcessor: (n: string, c: new (o?: unknown) => unknown) => registered.push({ name: n, ctor: c }),
        sampleRate: 48000,
        currentTime: 0,
        Float32Array,
        Math,
        console,
      };
      vm.createContext(sandbox);
      expect(() => vm.runInContext(build(), sandbox)).not.toThrow();
      expect(registered).toHaveLength(1);
      expect(() => new registered[0]!.ctor({ processorOptions: {} })).not.toThrow();
    });
  }

  it("rider default cap equals the product constant", () => {
    expect(VOCAL_LEVEL_DEFAULT_MAX_DB).toBe(P0_RIDE_MAX_DB);
  });
});
