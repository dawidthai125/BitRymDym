/**
 * Producent Bitów — startowe P0 hip-hop (2026-11-17).
 * Jedno źródło liczb dla denoise/gate, ride, lekkiego pitch i compingu.
 * Gate FX schema ma tylko threshold/range/release (bez atk/hold).
 */

/** HPF rumble on denoise / start vocal chain. */
export const P0_HPF_HZ = 80;

/** Denoise reduction depth (gate range). */
export const P0_DENOISE_RANGE_DB = 8;

/** Start gate threshold when inserting a default gate. */
export const P0_GATE_THRESHOLD_DBFS = -42;

/** Gate release (schema has no attack/hold; Producent: atk 2 ms / hold 40 ms). */
export const P0_GATE_RELEASE_MS = 100;

/** Clip / rider max correction per word (Producent ±3.5 dB). */
export const P0_RIDE_MAX_DB = 3.5;

/** Soft ride target (documentation; rider DSP tracks phrase envelope, not LUFS). */
export const P0_RIDE_TARGET_RMS_DBFS = -18;

/** Peak ceiling already used by gain autofix. */
export const P0_PEAK_MAX_DBFS = -6;

/** BRD Tune „natural” retune (Producent 60 ms). */
export const P0_TUNE_NATURAL_RETUNE_MS = 60;

/** Light pitch: leave ~15 % of drift (amount 0.85). Max ±30 cent is guidance, not a hard clip. */
export const P0_TUNE_NATURAL_AMOUNT = 0.85;
export const P0_TUNE_LIGHT_MAX_CENTS = 30;
export const P0_TUNE_HOOK_RETUNE_MS_MIN = 25;
export const P0_TUNE_HOOK_RETUNE_MS_MAX = 35;
/** Hook melody style — midpoint of Producent 25–35 ms. */
export const P0_TUNE_HOOK_RETUNE_MS = 30;
export const P0_TUNE_HOOK_AMOUNT = 0.9;

/** Comping overlap between A/B takes. */
export const P0_COMPING_CROSSFADE_MS = 8;
