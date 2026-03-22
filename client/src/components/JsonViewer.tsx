import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ScrapeResult } from "@/lib/types";

interface JsonViewerProps {
  result: ScrapeResult | null;
}

export function JsonViewer({ result }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);

  if (!result) return null;

  const jsonString = JSON.stringify(result.data, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Result</h3>
          {result.success ? (
            <Badge variant="outline" className="bg-green-100 text-green-800">
              Success
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-red-100 text-red-800">
              Failed
            </Badge>
          )}
          {result.warning && (
            <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
              Warning
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? "Copied!" : "Copy JSON"}
        </Button>
      </div>

      {result.errors.length > 0 && (
        <div className="px-4 py-2 border-b bg-red-50">
          <p className="text-sm text-red-700 font-medium">Fetch errors:</p>
          {result.errors.map((err, i) => (
            <p key={i} className="text-sm text-red-600">
              {err.url}: {err.error}
            </p>
          ))}
        </div>
      )}

      {result.warning && (
        <div className="px-4 py-2 border-b bg-yellow-50">
          <p className="text-sm text-yellow-700">{result.warning}</p>
        </div>
      )}

      <ScrollArea className="h-96">
        <pre className="p-4 text-sm overflow-x-auto">
          <code>{result.data ? jsonString : "No data extracted"}</code>
        </pre>
      </ScrollArea>
    </Card>
  );
}
