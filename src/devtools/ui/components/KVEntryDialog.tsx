import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { KVEntry } from "../../server";

type KVEntryDialogProps = {
  open: boolean;
  entry: KVEntry | null; // null for new entry, existing entry for edit
  initialValue?: string; // Full value for editing (when entry.value is truncated)
  onSave: (key: string, value: string, metadata?: unknown, expirationTtl?: number) => void;
  onClose: () => void;
};

export function KVEntryDialog({ open, entry, initialValue, onSave, onClose }: KVEntryDialogProps) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [metadata, setMetadata] = useState("");
  const [ttl, setTtl] = useState("");
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [ttlError, setTtlError] = useState<string | null>(null);

  const isEditing = entry !== null;

  // Reset form when dialog opens/closes or entry changes
  useEffect(() => {
    if (open) {
      if (entry) {
        setKey(entry.key);
        // Use initialValue if provided (for expanded values), otherwise use entry.value
        setValue(initialValue ?? entry.value ?? "");
        setMetadata(entry.metadata ? JSON.stringify(entry.metadata, null, 2) : "");
        setTtl("");
      } else {
        setKey("");
        setValue("");
        setMetadata("");
        setTtl("");
      }
      setMetadataError(null);
      setTtlError(null);
    }
  }, [open, entry, initialValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate key
    if (!key.trim()) {
      return;
    }

    // Parse metadata if provided
    let parsedMetadata: unknown = undefined;
    if (metadata.trim()) {
      try {
        parsedMetadata = JSON.parse(metadata);
        setMetadataError(null);
      } catch {
        setMetadataError("Invalid JSON");
        return;
      }
    }

    // Parse TTL if provided
    const parsedTtl = ttl.trim() ? parseInt(ttl, 10) : undefined;
    if (ttl.trim() && (isNaN(parsedTtl!) || parsedTtl! <= 0)) {
      setTtlError("TTL must be a positive number");
      return;
    }
    setTtlError(null);

    onSave(key, value, parsedMetadata, parsedTtl);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Entry" : "Add Entry"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modify the value, metadata, or TTL for this entry."
              : "Create a new key-value entry in the KV namespace."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="key" className="text-sm font-medium">
              Key
            </label>
            <Input
              id="key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="my-key"
              disabled={isEditing}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="value" className="text-sm font-medium">
              Value
            </label>
            <Textarea
              id="value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter value..."
              rows={6}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="metadata" className="text-sm font-medium">
              Metadata (optional JSON)
            </label>
            <Textarea
              id="metadata"
              value={metadata}
              onChange={(e) => {
                setMetadata(e.target.value);
                setMetadataError(null);
              }}
              placeholder='{"type": "cache", "version": 1}'
              rows={3}
              className="font-mono text-sm"
            />
            {metadataError && <p className="text-sm text-destructive">{metadataError}</p>}
          </div>

          <div className="space-y-2">
            <label htmlFor="ttl" className="text-sm font-medium">
              TTL (seconds, optional)
            </label>
            <Input
              id="ttl"
              type="number"
              value={ttl}
              onChange={(e) => {
                setTtl(e.target.value);
                setTtlError(null);
              }}
              placeholder="3600"
              min={1}
            />
            {ttlError && <p className="text-sm text-destructive">{ttlError}</p>}
            <p className="text-xs text-muted-foreground">
              Time-to-live in seconds. Leave empty for no expiration.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{isEditing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
