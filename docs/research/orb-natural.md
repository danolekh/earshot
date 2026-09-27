# Natural orbs: features, state vocabulary, a test (2026-09-25)

## Features per frame (AnalyserNode, fftSize 2048, smoothingTimeConstant 0, own smoothing)

| Feature                | Formula                                                                                                                                                    | Smoothing                           | Drives                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| Loudness               | RMS to dB, -60..-10 to 0..1, gate                                                                                                                          | attack 15-30 ms, release 150-250 ms | size, energy; never the only input                           |
| Spectral centroid      | Σf·                                                                                                                                                        | X                                   | / Σ                                                          | X   | over 80-8000 Hz; log2(C/400)/log2(10) | ~100 ms, frozen when gated | colour temperature, core heat |
| Spectral flux / onsets | Σ rectified log-spectrum rise; onset > 1.5 × 0.5 s median + δ; 90-120 ms refractory (Dixon 2006)                                                           | event                               | spring impulse: plosives, syllable attacks                   |
| Sibilance              | E(4-10 kHz)/E(total) (or ZCR)                                                                                                                              | 10/80 ms                            | fine grain and rim sparkle, never the silhouette             |
| Bands                  | low 80-300, mid 300-2500, high 2500-8000 Hz                                                                                                                | 60-120 ms                           | mass, shape, texture                                         |
| Pitch (YIN)            | CMNDF 0.1-0.15, clarity > 0.8, semitones from running median                                                                                               | 150-250 ms, hold when unvoiced      | lift ±4 %, hue ±10-15°                                       |
| Vowel shape            | F1 (open), F2 (front) via LPC; or band deviation from each band's own long-term mean (fixed bands alone: 14 % accuracy; with per-band normalisation: 71 %) | 60-80 ms                            | open = vertical stretch, round = contraction, spread = widen |

Visemes: Meta OVR LipSync (15), Rhubarb (6 mouth shapes), Azure viseme events, uLipSync/wLipSync (MFCC profiles, web port), threelipsync (3 bands). Reduce to four controls: open, round, spread, closure pulse. For agent audio, analyse ahead of a ~40 ms delay: visuals leading sound are tolerated, lagging is not.

## How assistants make states unmistakable

- LiveKit (source): connecting sweeps, listening pulses at 500 ms, thinking cycles fast at 150 ms, speaking shows the spectrum. Thinking is regular and audio-free; speaking irregular and audio-driven.
- ElevenLabs Orb (source): separate in/out volumes, slow synthetic sines per state (0.6-0.8 Hz), flow speed from output.
- Alexa: listening is an arc pointing at the speaker; thinking spins; speaking pulses.
- Siri iOS 26: a dark liquid-glass orb whose waveform reacts to the voice.
- Gemini: directional motion that mirrors the user; sharp leading edges diffusing at the tail; thinking cycles colours.
- Material 3 Expressive: spatial springs (ζ 0.8) for shape, effect springs (ζ 1) for colour.
- **Pattern: listening moves inward and follows the mic; thinking moves tangentially on a clock with no audio; speaking moves outward and follows the agent.**

## Organic motion

Incommensurate noise layers (1 : φ : √5 : π); domain warping, curl noise; springs (jelly body ~3 Hz, ζ 0.35-0.5, the speech envelope peaks at 4-5 Hz); onsets as velocity impulses; follow-through on a second, slower spring; squash and stretch with volume kept; low angular modes only (surface tension); breathing 5 s, inhale 40 %; gates, asymmetric attack/release, 300 ms hysteresis on state, clamped dt.

## Vocabulary

|            | Idle              | Listening                       | Thinking                     | Speaking                         |
| ---------- | ----------------- | ------------------------------- | ---------------------------- | -------------------------------- |
| Silhouette | small sphere 0.70 | 0.80, flattened toward the user | 0.75, broken ring / crescent | largest, deformed by vowels      |
| Luminance  | low, flat         | bright rim, dim core            | one bright sector            | hot core fading out              |
| Colour     | neutral blue-grey | cool cyan                       | violet cycle                 | warm, amber to white             |
| Motion     | breathing 0.2 Hz  | inward ripples, lean            | tangential rotation ~1 Hz    | outward ripples per onset, jelly |
| Audio      | none              | mic                             | none                         | agent                            |

## The test

Greyscale 64 px frames, 8 per state: area, aspect, radial luminance slope, angular asymmetry; a nearest-centroid classifier must label all four states, also after a σ 8 px blur.
