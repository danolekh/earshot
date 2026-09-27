# The orb: inspirations and motion spec

Research pass, 2026-09-25. (unverified) = recalled, not fetched.

## Read the source of

- **ElevenLabs UI Orb** (github.com/elevenlabs/ui, `registry/elevenlabs-ui/ui/orb.tsx`): a flat disc, 7 soft ovals in polar space bent by Perlin, two noisy rings, a 4-stop ramp. Input and output volume are separate channels (input stretches the ovals and pushes the rings, output raises the distortion and the speed). Volume lerps ~75 ms, speed ~130 ms, colours ~200 ms. **Phase is accumulated (`phase += dt * speed`), never `time * speed`**, so a speed change never jumps. A random seed per instance.
- **LiveKit Aura** (Unicorn Studio, Polyform Non-Resale, so reference only): a turbulence ring, 36 glow samples, Reinhard tonemap and dither. Speed by state 10 / 20 / 30 / 70 (idle, listening, thinking, speaking) is the main state signal; thinking pulses brightness every 0.35 s and reads anxious.
- **orb-ui** (github.com/alexanderqchen/orb-ui): the nearest competitor, provider adapters, themes with calm/balanced/expressive presets. Its best idea: **turn ownership as opposite motion**: the cloud _shrinks_ with the caller's voice (drawing in to listen) and _grows_ with the agent's (pushing out to speak).
- Galleries: voiceorbs.vercel.app (Plasma, Halo, Particles, Glass, Nebula, Edge Glow, Mercury...), orbkit, VapiBlocks 3D orb, 21st.dev orbs, Paper Shaders (Apache-2.0).

## Platform assistants

- ChatGPT Advanced Voice: a sky-blue sphere with slow white cloud inside; barely changes size, the churn carries the state. One hue, low-contrast texture, motion mostly internal.
- Siri iOS 18: a glow around the screen edge that thickens and brightens with the voice; the assistant as ambient light that leaves content usable.
- Siri iOS 7-13 wave (siriwave.js): `sin(kx - phase) * (K/(K+x^4))^K`, eased amplitude.
- Gemini Live (design.google/library/gemini-ai-visual-design): gradients with a sharp leading edge that diffuses at the tail; voice as outward ripples; thinking as activity _inside_ a contained circle; every animation starts and ends with the user's action.
- Google Assistant dots: one set of shapes morphing through every state.
- Alexa ring: a small, fixed vocabulary; listening is a cyan spotlight **pointing at the speaker**.
- Cortana: 18 moods, half indistinguishable. Too many states read as none.
- Copilot's Mico, Rabbit r1, Humane: characters are commitments; charm from very little.
- Her (Geoff McFetridge): warm coral and off-white, paper-like softness instead of neon.

## Shader references

- Inigo Quilez, domain warping (iquilezles.org/articles/warp): `fbm(p + 4r)`, `r = fbm2(p + 4q)`, `q = fbm2(p)`; colour by f, then by |q| and r.y.
- Shadertoy llj3WR (Orb), wttXz8 (domain-warped fbm), Ml3Gz8 (smooth min), csVcWd (metaballs); vishald.com/blog/gooey-webgl; Codrops 3D audio visualizer (fresnel haze shell at 1.2x).

## Motion language

1. Speed is the main state signal; size is secondary.
2. Turn ownership: listening draws in, speaking pushes out.
3. Thinking is internal activity with no audio, inside a steady outline; never a spinner or a strobe.
4. Alive: several motions with unrelated periods, accumulated phase, asymmetric smoothing, a seed per instance, dither, tonemapping instead of clipping.
5. Cheap: raw amplitude jitter, the whole orb scaling like a speaker cone, one sine, banding, hard state cuts.

## Spec

**Level** (CPU, per frame): RMS to dBFS, map -60..-12 dB to 0..1, gate at -55 dB, curve `x^0.6`; envelope attack 50 ms, release 250 ms; input level while listening, output while speaking, cross-faded by the state weights; dt clamped to 50 ms; `phase += dt * speed(state, level)`.

**State weights:** springs to a one-hot target, response 0.45 s, damping 0.85 (0.6 into listening for one small overshoot). Colours ease 300 ms.

|                 | Idle                                  | Listening                   | Thinking                                     | Speaking                     |
| --------------- | ------------------------------------- | --------------------------- | -------------------------------------------- | ---------------------------- |
| Breathing       | 5 s period, scale ±2%, brightness ±5% | ±1%                         | none                                         | none                         |
| Base scale      | 1.00                                  | 0.97                        | 0.98                                         | 1.00                         |
| Level to scale  |                                       | -0.04 x level (contracts)   |                                              | +0.10 x level                |
| Displacement    | 0.03                                  | 0.04 + 0.12 x level, inward | 0.05                                         | 0.05 + 0.20 x level, outward |
| Speed (phase/s) | 0.15                                  | 0.3 + 0.4 x level           | 0.9, a shimmer highlight turning every 1.6 s | 0.4 + 1.2 x level            |
| Brightness      | 1.0                                   | 1.1 + 0.2 x level           | 1.0 ± 0.15 over 1.6 s                        | 1.15 + 0.35 x level          |
| Noise frequency | 1.0                                   | 1.2                         | 1.6                                          | 1.4                          |

Every column blends by its weight, so a state change is a morph. Nothing but the audio itself oscillates faster than 1.2 s.

## Presets

1. **Nebula**: a 2D-faked sphere (`z = sqrt(1 - r^2)`), IQ domain-warped fbm sampled on the normal and turned slowly for parallax, a 3-stop ramp with the warp tinting a second colour, a fresnel rim `pow(1 - n.z, 3)` and a soft outer halo. Audio raises warp, speed and rim.
2. **Blob**: 4-5 circles joined by `smin(k = 0.25)` on out-of-phase Lissajous paths, polar noise on the edge; listening pulls them in and tightens k, speaking pushes them out; filled by distance to the edge; `fwidth` antialiasing. The cheapest.
3. **Halo**: a ring bent by seamless polar noise, `1/(d + e)` glow, Reinhard tonemap and dither, a conic gradient running along it; listening lights an arc at the bottom "pointing at the caller", thinking sends the arc around, speaking thickens and ripples. The same shader on a rounded-rectangle distance field is a Siri-style frame around a container.

Palette: 3 colours and a background tint, light and dark; light needs extra saturation on white.

## Accessibility and performance

- Reduced motion: the phase stops; state shows by a slow colour and brightness change (300 ms); level may lift brightness by 10% at most, no scale; a text state label always.
- Canvas `aria-hidden`, the state in a polite live region; never the only way to stop.
- No flashing over 3 per second (WCAG 2.3.1).
- DPR 2 max, pause off screen and in hidden tabs, handle context loss, one shared context; a low-power tier (30 fps, DPR 1, fewer octaves) when frames run slow; a CSS radial-gradient fallback on the same level signal without WebGL2.

## Avoid

Apple's rainbow palette and the stock purple-to-blue AI gradient; speaker-cone scaling; spinners and strobes; listening and speaking that look alike; too many states; `time * speed`; visible loops and single sines; banding; blown-out bloom; an idle that looks like recording; HUD clutter and faces.
