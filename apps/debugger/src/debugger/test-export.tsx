import { toLiveKitTest } from "@danolekh/earshot/formats";
/* A test case's ways out: a JSON file, the JSON on the clipboard, or a LiveKit Agents unit test
 * (which needs the call's trace, for the history and what the caller said). */
import type { CallTrace, TestCase } from "@danolekh/earshot/trace";
import { ChevronDown, ClipboardCopy, Download, FileCode } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fileName } from "@/lib/saved-tests";

const json = (test: TestCase) => `${JSON.stringify(test, null, 2)}\n`;

function download(test: TestCase) {
  const url = URL.createObjectURL(new Blob([json(test)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName(test);
  a.click();
  URL.revokeObjectURL(url);
}

async function copy(text: string, what: string) {
  await navigator.clipboard.writeText(text);
  toast(`Copied ${what}`);
}

export function ExportMenu({ test, trace }: { test: TestCase; trace?: CallTrace | undefined }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
        Export
        <ChevronDown aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onClick={() => download(test)}>
          <Download aria-hidden />
          Download .json
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void copy(json(test), "as JSON")}>
          <ClipboardCopy aria-hidden />
          Copy as JSON
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!trace}
          onClick={() => trace && void copy(toLiveKitTest(test, trace), "as a LiveKit test")}
        >
          <FileCode aria-hidden />
          Copy as LiveKit test (pytest)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
