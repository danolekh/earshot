/* The keyboard sheet, and the switch for single-key shortcuts: people using speech input or
 * sticky keys can turn them off (WCAG 2.1.4); arrows, Home/End, Escape and ⌘/Ctrl+B keep working. */
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Switch } from "@/components/ui/switch";
import { singleKeys } from "@/lib/stored";

const KEYS: [string, string][] = [
  ["Space / K", "Play or pause"],
  ["J / L", "Back or forward 10 s"],
  ["← →", "A word (Shift: 5 s, Alt: a turn)"],
  ["] / [", "Next or previous finding"],
  ["Shift + ] / [", "Next or previous error"],
  ["W / S", "Zoom in or out at the playhead"],
  ["A / D", "Pan"],
  ["0", "Show the whole call"],
  ["Z", "Zoom to what's picked"],
  ["Ctrl/⌘ + wheel", "Zoom at the pointer"],
  ["B", "Show or hide the inspector"],
  ["⌘/Ctrl + B", "The same, always on"],
  ["F", "Follow playback on or off"],
  ["V", "The View menu: lanes, panels, density, theme"],
  ["T", "Fold the transcript away or back"],
  ["1 / 2 / 3 / 4", "Show or hide the caller, agent, pipeline or word lanes"],
  [", / .", "Slower or faster"],
  ["Esc", "Clear the selection"],
  ["?", "This sheet"],
];

export function Shortcuts(props: { open: boolean; onOpenChange: (open: boolean) => void; follow: boolean }) {
  const [on, setOn] = singleKeys.use();
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard</DialogTitle>
          <DialogDescription>Follow playback is {props.follow ? "on" : "off"}.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {KEYS.map(([k, what]) => (
            <div key={k} className="contents">
              <dt>
                <Kbd>{k}</Kbd>
              </dt>
              <dd className="text-muted-foreground m-0">{what}</dd>
            </div>
          ))}
        </dl>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={on} onCheckedChange={setOn} />
          Single-key shortcuts
        </label>
      </DialogContent>
    </Dialog>
  );
}
