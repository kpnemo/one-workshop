import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ScrapeFormProps {
  onSubmit: (urls: string[], topic: string) => void;
  disabled: boolean;
}

export function ScrapeForm({ onSubmit, disabled }: ScrapeFormProps) {
  const [urls, setUrls] = useState<string[]>([""]);
  const [topic, setTopic] = useState("");

  const addUrl = () => setUrls([...urls, ""]);

  const removeUrl = (index: number) => {
    if (urls.length === 1) return;
    setUrls(urls.filter((_, i) => i !== index));
  };

  const updateUrl = (index: number, value: string) => {
    const updated = [...urls];
    updated[index] = value;
    setUrls(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validUrls = urls.filter((u) => u.trim().length > 0);
    if (validUrls.length === 0 || topic.trim().length === 0) return;
    onSubmit(validUrls, topic.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">URLs</label>
        {urls.map((url, i) => (
          <div key={i} className="flex gap-2">
            <Input
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => updateUrl(i, e.target.value)}
              disabled={disabled}
            />
            {urls.length > 1 && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => removeUrl(i)}
                disabled={disabled}
              >
                X
              </Button>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addUrl} disabled={disabled}>
          + Add URL
        </Button>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Topic</label>
        <Input
          type="text"
          placeholder="e.g. soccer, machine learning, recipes..."
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={disabled}
        />
      </div>

      <Button type="submit" disabled={disabled || urls.every((u) => !u.trim()) || !topic.trim()}>
        {disabled ? "Scraping..." : "Scrape"}
      </Button>
    </form>
  );
}
