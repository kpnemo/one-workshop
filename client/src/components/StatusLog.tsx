import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { LogEntry } from "@/lib/types";

interface StatusLogProps {
  entries: LogEntry[];
}

const badgeStyles: Record<LogEntry["type"], string> = {
  info: "bg-blue-100 text-blue-800",
  success: "bg-green-100 text-green-800",
  error: "bg-red-100 text-red-800",
  agent: "bg-purple-100 text-purple-800",
};

const icons: Record<LogEntry["type"], string> = {
  info: "...",
  success: "OK",
  error: "!",
  agent: ">",
};

export function StatusLog({ entries }: StatusLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  if (entries.length === 0) return null;

  return (
    <div className="border rounded-lg">
      <div className="px-4 py-2 border-b bg-muted/50">
        <h3 className="text-sm font-medium">Execution Log</h3>
      </div>
      <ScrollArea className="h-64">
        <div className="p-4 space-y-1 font-mono text-sm">
          {entries.map((entry, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-muted-foreground text-xs whitespace-nowrap">
                {entry.timestamp.toLocaleTimeString()}
              </span>
              <Badge variant="outline" className={`text-xs ${badgeStyles[entry.type]}`}>
                {icons[entry.type]}
              </Badge>
              <span>{entry.message}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
