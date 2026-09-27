/* A dropped recording, read in the browser: decoded with Web Audio, and each channel's waveform
 * level worked out (earshot's `computeMinMax`), for `recording()` to find the speech in. Stereo is
 * caller left and agent right, as LiveKit and Pipecat record it (`swap` for a file that isn't);
 * a mono file, or a stereo one whose channels are the same, is both sides mixed. */
import { computeMinMax, type PeakLevel } from "@danolekh/earshot/core";
import type { AudioChannel } from "@danolekh/earshot/trace";

export interface DecodedRecording {
  channels: AudioChannel[];
  peaks: Partial<Record<AudioChannel, PeakLevel>>;
  /** Seconds. */
  duration: number;
}

/** Whether two channels carry the same sound (a mono recording saved as stereo). */
function same(a: Float32Array, b: Float32Array): boolean {
  let diff = 0;
  let level = 0;
  for (let i = 0; i < a.length; i += 64) {
    diff += Math.abs(a[i]! - b[i]!);
    level += Math.abs(a[i]!);
  }
  return diff <= level * 0.02;
}

export async function decodeRecording(file: Blob, swap = false): Promise<DecodedRecording> {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const rate = buffer.sampleRate;
    const level = (samples: Float32Array) => computeMinMax(samples, rate, 200);
    if (buffer.numberOfChannels >= 2) {
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);
      if (!same(left, right)) {
        const [caller, agent] = swap ? [right, left] : [left, right];
        return {
          channels: ["caller", "agent"],
          peaks: { caller: level(caller), agent: level(agent) },
          duration: buffer.duration,
        };
      }
    }
    return {
      channels: ["mixed"],
      peaks: { mixed: level(buffer.getChannelData(0)) },
      duration: buffer.duration,
    };
  } finally {
    void context.close();
  }
}
