/* Importing a call: drop what a stack exported (LiveKit's spans and session report, Pipecat's spans
 * and observer events, an ElevenLabs conversation) and its recording, see what was read and what
 * can't be checked on it, and open it. The call is kept in this browser (IndexedDB), with its
 * recording, and joins the list. Files are recognised by their shape (earshot's `detectFormat`);
 * the recording is decoded here, and its speech found, before anything is kept. */
import {
  type ExportKind,
  detectFormat,
  parseExport,
  readExports,
  type ReadExports,
} from "@danolekh/earshot/formats";
import { summarizeCall } from "@danolekh/earshot/review";
import { blindSpots, findingLabel, type FindingType } from "@danolekh/earshot/trace";
import { CircleAlert, FileAudio, FileJson, TriangleAlert, Upload, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { type DecodedRecording, decodeRecording } from "@/lib/decode-audio";
import { newImportId, putImport } from "@/lib/imports";
import { stackName } from "@/lib/stacks";

import { useOpenCall } from "./call-link";

type Kind = ExportKind | "audio" | "unknown";

interface Picked {
  file: File;
  kind: Kind;
  value?: unknown;
}

const KIND_NAMES: Readonly<Record<Kind, string>> = {
  "call-trace": "earshot call trace",
  "livekit-otlp": "LiveKit spans",
  "livekit-report": "LiveKit session report",
  "pipecat-otlp": "Pipecat spans",
  "pipecat-events": "Pipecat observer events",
  "elevenlabs-conversation": "ElevenLabs conversation",
  "elevenlabs-otlp": "ElevenLabs OpenTelemetry (use the conversation instead)",
  otlp: "Spans from another framework",
  audio: "Recording",
  unknown: "Not an export earshot reads",
};

const isAudio = (f: File) =>
  f.type.startsWith("audio/") || /\.(mp3|ogg|opus|wav|m4a|flac|webm)$/i.test(f.name);

async function pick(file: File): Promise<Picked> {
  if (isAudio(file)) return { file, kind: "audio" };
  try {
    const value = parseExport(await file.text());
    return { file, kind: detectFormat(value) ?? "unknown", value };
  } catch {
    return { file, kind: "unknown" };
  }
}

export function ImportDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
        <Upload aria-hidden />
        Import call
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        {open && <ImportForm onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ImportForm({ onDone }: { onDone: () => void }) {
  const [files, setFiles] = useState<Picked[]>([]);
  const [swap, setSwap] = useState(false);
  const [decodedAs, setDecodedAs] = useState<{
    file: File;
    swap: boolean;
    result?: DecodedRecording;
    error?: string;
  }>();
  const [dragging, setDragging] = useState(false);
  const inputId = useId();
  const zone = useRef<HTMLLabelElement>(null);
  const openCall = useOpenCall();
  const audio = files.find((f) => f.kind === "audio");

  // The recording, decoded again when it or the side it's on changes; pending until then.
  useEffect(() => {
    if (!audio) return;
    let live = true;
    const file = audio.file;
    decodeRecording(file, swap).then(
      (result) => live && setDecodedAs({ file, swap, result }),
      (e: unknown) =>
        live && setDecodedAs({ file, swap, error: `The recording didn't decode: ${(e as Error).message}` }),
    );
    return () => {
      live = false;
    };
  }, [audio, swap]);
  const current = audio && decodedAs?.file === audio.file && decodedAs.swap === swap ? decodedAs : undefined;
  const pending = audio !== undefined && current === undefined;
  const decoded = useMemo(() => ({ ...current, pending }), [current, pending]);

  const read = useMemo((): { ok?: ReadExports; error?: string } | undefined => {
    const values = files.filter((f) => f.value !== undefined).map((f) => f.value);
    if (!values.length || decoded.pending) return undefined;
    try {
      return {
        ok: readExports(values, {
          ...(decoded.result && {
            recording: {
              peaks: decoded.result.peaks,
              channels: decoded.result.channels,
              sources: [{ src: "", type: audio!.file.type || "audio/mpeg" }],
            },
            call: { duration: decoded.result.duration },
          }),
        }),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [files, decoded, audio]);
  const spots = useMemo(
    () => (read?.ok ? (Object.entries(blindSpots(read.ok.trace)) as [FindingType, string][]) : []),
    [read],
  );

  const add = async (list: Iterable<File>) => {
    const picked = await Promise.all([...list].map(pick));
    setFiles((now) => {
      // One recording: a new one replaces the last.
      const next = picked.some((p) => p.kind === "audio") ? now.filter((f) => f.kind !== "audio") : now;
      return [...next, ...picked];
    });
  };

  // Files dropped on the zone, as well as chosen through it.
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    const over = (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    };
    const leave = () => setDragging(false);
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer) void add(e.dataTransfer.files);
    };
    el.addEventListener("dragover", over);
    el.addEventListener("dragleave", leave);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragover", over);
      el.removeEventListener("dragleave", leave);
      el.removeEventListener("drop", drop);
    };
  });

  const save = async () => {
    if (!read?.ok) return;
    const { trace, provider, warnings } = read.ok;
    const id = newImportId();
    const title = trace.call.title ?? `${stackName(provider)} call`;
    const kept = {
      ...trace,
      call: { ...trace.call, id, title },
      ...(trace.audio && { audio: { ...trace.audio, sources: [] } }),
    };
    await putImport({
      id,
      importedAt: new Date().toISOString(),
      trace: kept,
      summary: summarizeCall(kept),
      ...(audio && { audio: audio.file }),
      warnings,
    });
    onDone();
    openCall(id);
  };

  const call = read?.ok?.trace;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Import a call</DialogTitle>
        <DialogDescription>
          Drop what your stack exported: LiveKit&apos;s spans and session report, Pipecat&apos;s spans and
          observer events, or an ElevenLabs conversation. Add the recording to see and hear it. It&apos;s kept
          in this browser.
        </DialogDescription>
      </DialogHeader>

      <label
        ref={zone}
        htmlFor={inputId}
        data-dragging={dragging || undefined}
        className="hover:bg-muted/40 data-dragging:bg-muted/60 data-dragging:border-foreground/40 flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center text-sm"
      >
        <Upload className="text-muted-foreground size-5" aria-hidden />
        <span>Drop files here, or choose them</span>
        <span className="text-muted-foreground text-xs">.json, .jsonl, and one audio file</span>
        <input
          id={inputId}
          type="file"
          multiple
          accept=".json,.jsonl,.ndjson,audio/*"
          aria-label="Files to import"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) void add(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {files.length > 0 && (
        <ul aria-label="Files" className="m-0 list-none space-y-1 p-0 text-sm">
          {files.map((f, i) => {
            const Icon = f.kind === "audio" ? FileAudio : FileJson;
            const bad = f.kind === "unknown" || f.kind === "elevenlabs-otlp" || f.kind === "otlp";
            return (
              <li key={`${f.file.name}${i}`} data-kind={f.kind} className="flex items-center gap-2">
                <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{f.file.name}</span>
                <span className={`shrink-0 text-xs ${bad ? "text-destructive" : "text-muted-foreground"}`}>
                  {f.kind === "audio" && decoded.result
                    ? `Recording, ${decoded.result.channels.includes("mixed") ? "mono" : "stereo"}`
                    : KIND_NAMES[f.kind]}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${f.file.name}`}
                  onClick={() => setFiles((now) => now.filter((x) => x !== f))}
                >
                  <X aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {decoded.result?.channels.includes("caller") && (
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Caller on the right
            <span className="text-muted-foreground block text-xs">
              LiveKit and Pipecat record the caller left; switch if this file differs.
            </span>
          </span>
          <Switch checked={swap} onCheckedChange={setSwap} />
        </label>
      )}

      {(read || decoded.error || decoded.pending) && (
        <section
          aria-label="What was read"
          aria-live="polite"
          className="bg-muted/40 space-y-2 rounded-lg p-3 text-sm"
        >
          {decoded.pending && <p className="text-muted-foreground">Reading the recording…</p>}
          {decoded.error && <p className="text-destructive">{decoded.error}</p>}
          {read?.error && (
            <p className="text-destructive flex gap-1.5">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {read.error}
            </p>
          )}
          {call && read?.ok && (
            <>
              <p>
                <span className="font-medium">{stackName(read.ok.provider)}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {call.turns.length} turns · {call.spans.length} spans · {call.findings.length}{" "}
                  {call.findings.length === 1 ? "finding" : "findings"}
                </span>
              </p>
              {spots.length > 0 && (
                <div>
                  <h3 className="text-muted-foreground text-xs font-medium">Can&apos;t check on this call</h3>
                  <ul className="m-0 list-none p-0 text-xs">
                    {spots.map(([type, why]) => (
                      <li key={type}>
                        {findingLabel(type)}
                        <span className="text-muted-foreground">: {why}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {read.ok.warnings.length > 0 && (
                <ul aria-label="Assumed" className="m-0 list-none space-y-0.5 p-0 text-xs">
                  {read.ok.warnings.map((w) => (
                    <li key={w} className="text-warning flex gap-1.5">
                      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                      {w}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      <DialogFooter>
        <Button disabled={!read?.ok || decoded.pending === true} onClick={() => void save()}>
          Open call
        </Button>
      </DialogFooter>
    </>
  );
}
