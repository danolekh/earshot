# Craft, motion and access

Research pass, 2026-09-25.

## Presenting headless parts

- **Base UI**: compound parts, animation by data attributes (`data-starting-style`, `data-open`) and CSS vars, a code switcher (CSS Modules / Tailwind), a Handbook, `llms.txt` and "View as Markdown". earshot follows it: `data-state`, `--orb-level`, `--word-progress`.
- **cmdk** (cmdk.paco.me): unstyled, and the site shows it skinned as Raycast, Linear, Vercel, Framer through a switcher. earshot's hero does the same with one call.
- ElevenLabs UI and LiveKit Agents UI are styled kits; neither ships a scrubbable review timeline. Lead with that.
- React Aria: accessibility documented per part. Ark UI: state-machine diagrams (for the orb). Stripe: prose and code in step. Josh Comeau: a slider that changes a live widget (for the level pipeline). Motion: small live examples, springs by default. Paper Shaders: dependency-free WebGL skins.
- Emil Kowalski: under 300 ms, ease-out `cubic-bezier(.23,1,.32,1)`, in-out `(.77,0,.175,1)`, drawers `(.32,.72,0,1)`; no animation on keyboard or high-frequency actions; transform and opacity; interruptible.
- Rauno Freiberg: momentum on release; light actions mid-gesture; things come from where they live; frequent actions instant; big close targets.
- Linear, Raycast, Resend: dark canvas, one accent, 13-14 px UI type, display tracking -0.02 to -0.03em, 1 px hairlines at 6-10% white.

## Audio-visual craft

- Level: RMS to dB, -60..-10 dBFS to 0..1, gamma ~0.6 (Stevens), one-pole attack 15-30 ms / release 120-250 ms, gate at -55 dB; log bands 80 Hz-4 kHz (3-5 for an orb, 16-32 for bars); values to CSS vars in rAF, never React state; pause hidden or off screen; a small idle breath; state changes cross-fade 320-480 ms, level never through CSS transitions.
- Scrubbing: iOS rubber-band `(1 - 1/(x*0.55/d + 1))*d` past the ends, spring back; magnetic snap to turn edges within ~8 px; a 120 ms tick when the playhead crosses a turn; mute or grain audio while dragging; a hover loupe with timecode and speaker.
- Karaoke: never change weight (reflow); colour or background only; past full ink, current word pill or underline, future 55-65% ink but still 4.5:1; advance ~50 ms early; scroll only when the line leaves the middle third; pause follow ~3 s after the reader scrolls and offer "Jump to live"; reduced motion highlights whole sentences and jumps.
- Access: WCAG 2.2.2 (motion over 5 s needs a pause, or stops when idle), 2.3.1 (no more than 3 flashes a second), 2.3.3 (reduced motion), 1.4.3 (dimmed text). Transcript `role="log"`, only finished turns announced, `aria-busy` while one streams; agent state in a separate `role="status"`, debounced ~500 ms; **a screen reader reading a live transcript talks over the agent**, so live announcing is opt-in during a call and on in review.

## Docs direction

cardstock's docs are warm paper, vermilion, Instrument Serif, so earshot's docs go **cool and instrument-like**, letting warm and light skins stand out:

- Dark `#0b0c0e`, raised `#131519`, hairlines `rgba(255,255,255,.07)`, text `#e9ecef` / `#9aa1ab`; one signal accent **meter lime `#c6ff3d`** (clear of orange and indigo), a peak red `#ff5a4e` only for errors. Light: `#f4f5f7`, ink `#0e1013`, accent `#5a7d00`.
- Inter Display at -0.03em (56/40/28), UI 14/13, a mono with tabular numerals for timecodes and readouts. No serif.
- Radius 10 (cards) / 6 (controls); `(.23,1,.32,1)` at 200 ms, state morphs 480 ms; a faint 4 px dot grid; hairline "rack" rules with timecode eyebrows (`00:00:12:04`).
- **Hero, "One call, many skins"**: a live orb, a waveform strip and a karaoke transcript playing a canned support call (captions first, click to unmute), a scrubbable review timeline under it that rewinds all of them together (the shared clock in one gesture), and a cmdk-style skin switcher: Unstyled (an x-ray of parts with their `data-state`), Mono, a warm contact-centre skin, an indigo SMB skin; a code tab shows only the CSS changing. Opt-in "Use your mic".
- Then an explainer with attack/release/gamma sliders beside a live meter, then Base UI-style part pages.
- Skins get generic names and no logos.
