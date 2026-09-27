# Visualizer and transcript motion (2026-09-25)

## Why five plain bars look vibecoded

Heights jump to the level with no smoothing and fall as fast as they rise; no history; no minimum height, so silence disappears; no edge treatment; every state looks the same.

## References

- ElevenLabs LiveWaveform (source): bars 3/1 px, radius 1.5, edge fade 24 px via destination-out, smoothing 0.8, history 60, update 30 ms, static (mirrored) or scrolling.
- LiveKit Agents UI: Bar, Grid (5×5, 100 ms tick), Radial, Wave, Aura behind one interface; each state has its own motion.
- SiriWave: attenuation (K/(K+x^K))^K, sin(kx - t), amplitude lerped; iOS 9 style adds blended RGB curves.
- audioMotion-analyzer: peak hold 500 ms then gravity; LED bars; radial; mirror.
- Telegram blob: layered bezier blobs moving toward targets by dt.
- Voice Memos: scrolling mirrored history with a dotted baseline.
- OP-1 / Rabbit: a strict grid, one accent.

## Engine

Log bands 80 Hz-8 kHz, gamma 0.6; `v += (t - v) * (t > v ? 0.5 : 0.12)` scaled by `1-(1-k)^(dt·60)`; one rAF loop writing refs, CSS variables or canvas; a state layer so thinking and listening aren't a flat line.

## Variants

1. History: 2 px rounded bars, 2 px gap, mirrored, 2 px minimum, a sample every 50 ms gliding between samples, newest bar scaling in over 120 ms, a CSS mask at the edges; thinking pulses the dots.
2. Radial: 48 bars around the orb, 3 px, springs (300/30), opacity 0.35-1 by length; thinking sends a 90° arc round in 1.4 s; listening breathes.
3. Matrix: 5×9 dots, peak hold 400 ms then a 300 ms fade, state sequences on a 100 ms tick.

## Transcript

- Streamdown: one span per word, 150 ms, blurIn (blur 4 px→0) or slideUp (4 px); only new words animate.
- Apple Music (AMLL): active line full, others dimmed and blurred by distance; words fill with a moving mask; the column scrolls on a spring with per-line delay.
- Motion: splitText + stagger 0.03-0.05; blur per word, never per character.
- Emil Kowalski: under 300 ms, ease-out `cubic-bezier(.23,1,.32,1)`, blur 2 px hides crossfade ghosting.
- Specs: new words opacity 0→1, blur 4→0, y 4→0, 180 ms, stagger 30 ms capped at 150 ms; interim at 0.6, final to 1 over 200 ms; new turns spring in (400/36), earlier turns `layout="position"`; review: others at 0.35, scale 0.97, blur by distance capped 3 px, 400 ms; scroll on a spring, pause on user scroll with "Jump to live"; reduced motion: opacity only.
- Performance: transform, opacity, filter only; memoised finished turns; `contain: layout paint`; `content-visibility: auto`.
