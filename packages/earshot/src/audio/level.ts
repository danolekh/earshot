/** Loudness as the ear hears it: RMS in dBFS mapped from `floor`..`ceiling` to 0..1, gated,
 * then raised to the 0.6 power (Stevens' law for loudness), so speech fills the range instead of
 * idling near zero with spikes on plosives. */
export function perceivedLevel(rms: number, floor = -60, ceiling = -12, gate = -55): number {
  const db = 20 * Math.log10(Math.max(rms, 1e-9));
  if (db < gate) return 0;
  const x = Math.min(1, Math.max(0, (db - floor) / (ceiling - floor)));
  return x ** 0.6;
}
