import { useState, useMemo } from "react";
import { Plus, RefreshCw, Search, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { KVEntryDialog } from "./KVEntryDialog";
import type { KVEntry } from "../../server";

type KVViewerProps = {
  entries: KVEntry[];
  expandedValues: Map<string, string>; // "namespace:key" -> full value
  namespace: string;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onGetValue: (key: string) => void;
  onPut: (
    key: string,
    value: string,
    metadata?: unknown,
    expirationTtl?: number,
    callback?: (success: boolean, error?: string) => void,
  ) => void;
  onDelete: (key: string, callback?: (success: boolean, error?: string) => void) => void;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatExpiration(expiration?: number): string {
  if (!expiration) return "-";
  const date = new Date(expiration * 1000);
  const now = new Date();
  if (date < now) return "Expired";
  return date.toLocaleString();
}

export function KVViewer({
  entries,
  expandedValues,
  namespace,
  loading,
  error,
  onRefresh,
  onGetValue,
  onPut,
  onDelete,
}: KVViewerProps) {
  const [search, setSearch] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KVEntry | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Filter entries based on search
  const filteredEntries = useMemo(() => {
    if (!search.trim()) return entries;
    const searchLower = search.toLowerCase();
    return entries.filter(
      (entry) =>
        entry.key.toLowerCase().includes(searchLower) ||
        (entry.value && entry.value.toLowerCase().includes(searchLower)),
    );
  }, [entries, search]);

  const handleToggleExpand = (key: string) => {
    const expandKey = `${namespace}:${key}`;
    const newExpanded = new Set(expandedKeys);

    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
      // Fetch full value if not already loaded
      if (!expandedValues.has(expandKey)) {
        onGetValue(key);
      }
    }

    setExpandedKeys(newExpanded);
  };

  const handleEdit = (entry: KVEntry) => {
    // Fetch full value if truncated before opening edit dialog
    const expandKey = `${namespace}:${entry.key}`;
    if (entry.valueTruncated && !expandedValues.has(expandKey)) {
      onGetValue(entry.key);
    }
    setEditingEntry(entry);
  };

  const handleSave = (key: string, value: string, metadata?: unknown, expirationTtl?: number) => {
    onPut(key, value, metadata, expirationTtl, (success) => {
      if (success) {
        setDialogOpen(false);
        setEditingEntry(null);
        onRefresh();
      }
    });
  };

  const handleDelete = (key: string) => {
    onDelete(key, (success) => {
      if (success) {
        setDeleteConfirm(null);
        onRefresh();
      }
    });
  };

  const getDisplayValue = (entry: KVEntry): string => {
    const expandKey = `${namespace}:${entry.key}`;
    const isExpanded = expandedKeys.has(entry.key);

    if (entry.value === null) {
      return "[Binary data]";
    }

    if (isExpanded && expandedValues.has(expandKey)) {
      return expandedValues.get(expandKey)!;
    }

    if (entry.valueTruncated && !isExpanded) {
      return entry.value + "...";
    }

    return entry.value;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search keys or values..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh entries"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Entry
        </Button>
      </div>

      {/* Error display */}
      {error && (
        <div className="mx-3 mt-3 px-4 py-2 rounded-md bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Content */}
      {filteredEntries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          {entries.length === 0 ? (
            <div className="text-center">
              <p className="mb-2">No entries in this namespace.</p>
              <p className="text-sm">Click "Add Entry" to create one.</p>
            </div>
          ) : (
            <p>No entries match your search.</p>
          )}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Key</TableHead>
                <TableHead className="w-[300px]">Value</TableHead>
                <TableHead className="w-20">Size</TableHead>
                <TableHead className="w-40">Expiration</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.map((entry) => {
                const isExpanded = expandedKeys.has(entry.key);
                const canExpand = entry.valueTruncated || (entry.value && entry.value.length > 50);

                return (
                  <TableRow key={entry.key}>
                    <TableCell className="p-1">
                      {canExpand && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleToggleExpand(entry.key)}
                          aria-label={isExpanded ? "Collapse value" : "Expand value"}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{entry.key}</TableCell>
                    <TableCell>
                      <div
                        className={`font-mono text-sm break-all ${
                          isExpanded ? "whitespace-pre-wrap" : "truncate max-w-[300px]"
                        }`}
                      >
                        {getDisplayValue(entry)}
                      </div>
                      {entry.metadata && (
                        <div className="text-xs text-muted-foreground mt-1">
                          metadata: {JSON.stringify(entry.metadata)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatBytes(entry.valueSize)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatExpiration(entry.expiration)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEdit(entry)}
                          aria-label="Edit entry"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirm(entry.key)}
                          aria-label="Delete entry"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      )}

      {/* Add/Edit Dialog */}
      <KVEntryDialog
        open={dialogOpen || editingEntry !== null}
        entry={editingEntry}
        initialValue={
          editingEntry ? expandedValues.get(`${namespace}:${editingEntry.key}`) : undefined
        }
        onSave={handleSave}
        onClose={() => {
          setDialogOpen(false);
          setEditingEntry(null);
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
