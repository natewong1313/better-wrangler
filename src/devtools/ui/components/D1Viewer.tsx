import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Database,
  Table as TableIcon,
  Play,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useD1Api, type D1Column, type D1QueryResult, type D1TableData } from "@/hooks/useD1Api";
import { ThemeToggle } from "@/components/ThemeToggle";

const PAGE_SIZE = 50;

/**
 * Formats a cell value for display.
 */
function formatCellValue(value: unknown): string {
  if (value === null) return "NULL";
  if (value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Table list sidebar component.
 */
function TableList({
  tables,
  selectedTable,
  onSelectTable,
  loading,
}: {
  tables: string[];
  selectedTable: string | null;
  onSelectTable: (table: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2 p-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <TableIcon className="size-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No tables found</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2">
      {tables.map((table) => (
        <button
          key={table}
          onClick={() => onSelectTable(table)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors",
            "hover:bg-accent",
            selectedTable === table && "bg-accent text-accent-foreground",
          )}
        >
          <TableIcon className="size-4 shrink-0" />
          <span className="truncate">{table}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Table data viewer component with pagination.
 */
function DataViewer({
  tableName,
  columns,
  data,
  loading,
  onRefresh,
  onPageChange,
}: {
  tableName: string;
  columns: D1Column[];
  data: D1TableData | null;
  loading: boolean;
  onRefresh: () => void;
  onPageChange: (offset: number) => void;
}) {
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Database className="size-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Select a table to view data</p>
      </div>
    );
  }

  const currentPage = Math.floor(data.offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(data.total / PAGE_SIZE);
  const hasNextPage = data.offset + data.rows.length < data.total;
  const hasPrevPage = data.offset > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header with table info and actions */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{tableName}</h2>
          <Badge variant="secondary">{data.total} rows</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.name} className="whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span>{col.name}</span>
                    <span className="text-xs text-muted-foreground font-normal">{col.type}</span>
                    {col.pk === 1 && (
                      <Badge variant="outline" className="text-xs py-0">
                        PK
                      </Badge>
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No data
                </TableCell>
              </TableRow>
            ) : (
              data.rows.map((row, i) => (
                <TableRow key={i}>
                  {columns.map((col) => (
                    <TableCell key={col.name} className="font-mono text-xs">
                      <span
                        className={cn(row[col.name] === null && "text-muted-foreground italic")}
                      >
                        {formatCellValue(row[col.name])}
                      </span>
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-4 border-t">
          <p className="text-sm text-muted-foreground">
            Showing {data.offset + 1} - {Math.min(data.offset + data.rows.length, data.total)} of{" "}
            {data.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(data.offset - PAGE_SIZE)}
              disabled={!hasPrevPage || loading}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(data.offset + PAGE_SIZE)}
              disabled={!hasNextPage || loading}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * SQL query editor component.
 */
function QueryEditor({
  onExecute,
  result,
  loading,
}: {
  onExecute: (sql: string) => void;
  result: D1QueryResult | null;
  loading: boolean;
}) {
  const [query, setQuery] = useState("");

  const handleExecute = () => {
    if (query.trim()) {
      onExecute(query.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + Enter to execute
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleExecute();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Query input */}
      <div className="p-4 border-b">
        <div className="space-y-2">
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter SQL query... (Cmd/Ctrl + Enter to execute)"
            className="font-mono text-sm min-h-[120px] resize-none"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Press Cmd/Ctrl + Enter to execute</p>
            <Button onClick={handleExecute} disabled={loading || !query.trim()}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              Execute
            </Button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && result && (
          <div className="p-4">
            {result.error ? (
              <div className="p-4 rounded-md bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive font-medium">Error</p>
                <p className="text-sm text-destructive/80 mt-1">{result.error}</p>
              </div>
            ) : result.results && result.results.length > 0 ? (
              <div className="space-y-4">
                {result.meta && (
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{result.results.length} rows returned</span>
                    <span>{result.meta.duration.toFixed(2)}ms</span>
                    {result.meta.rows_read > 0 && <span>{result.meta.rows_read} rows read</span>}
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(result.results[0]).map((key) => (
                        <TableHead key={key}>{key}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.results.map((row, i) => (
                      <TableRow key={i}>
                        {Object.values(row).map((value, j) => (
                          <TableCell key={j} className="font-mono text-xs">
                            <span className={cn(value === null && "text-muted-foreground italic")}>
                              {formatCellValue(value)}
                            </span>
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="p-4 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                  Query executed successfully
                </p>
                {result.meta && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    {result.meta.changes} rows affected in {result.meta.duration.toFixed(2)}ms
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {!loading && !result && (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-sm text-muted-foreground">
              Enter a SQL query and click Execute to see results
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Main D1 database viewer page component.
 */
export function D1Viewer() {
  const { bindingName } = useParams<{ bindingName: string }>();
  const { error: apiError, listTables, getTableSchema, getTableData, executeQuery } = useD1Api();

  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [columns, setColumns] = useState<D1Column[]>([]);
  const [tableData, setTableData] = useState<D1TableData | null>(null);
  const [queryResult, setQueryResult] = useState<D1QueryResult | null>(null);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false);

  // Fetch tables on mount
  useEffect(() => {
    if (!bindingName) return;

    const fetchTables = async () => {
      setTablesLoading(true);
      const result = await listTables(bindingName);
      setTables(result);
      setTablesLoading(false);
    };

    fetchTables();
  }, [bindingName, listTables]);

  // Fetch table data when selected table changes
  useEffect(() => {
    if (!bindingName || !selectedTable) {
      setColumns([]);
      setTableData(null);
      return;
    }

    const fetchTableData = async () => {
      setDataLoading(true);
      const [schemaResult, dataResult] = await Promise.all([
        getTableSchema(bindingName, selectedTable),
        getTableData(bindingName, selectedTable, PAGE_SIZE, 0),
      ]);
      setColumns(schemaResult);
      setTableData(dataResult);
      setDataLoading(false);
    };

    fetchTableData();
  }, [bindingName, selectedTable, getTableSchema, getTableData]);

  // Handle table selection
  const handleSelectTable = useCallback((table: string) => {
    setSelectedTable(table);
    setQueryResult(null);
  }, []);

  // Handle data refresh
  const handleRefresh = useCallback(async () => {
    if (!bindingName || !selectedTable) return;

    setDataLoading(true);
    const dataResult = await getTableData(
      bindingName,
      selectedTable,
      PAGE_SIZE,
      tableData?.offset ?? 0,
    );
    setTableData(dataResult);
    setDataLoading(false);
  }, [bindingName, selectedTable, tableData?.offset, getTableData]);

  // Handle pagination
  const handlePageChange = useCallback(
    async (offset: number) => {
      if (!bindingName || !selectedTable) return;

      setDataLoading(true);
      const dataResult = await getTableData(bindingName, selectedTable, PAGE_SIZE, offset);
      setTableData(dataResult);
      setDataLoading(false);
    },
    [bindingName, selectedTable, getTableData],
  );

  // Handle query execution
  const handleExecuteQuery = useCallback(
    async (sql: string) => {
      if (!bindingName) return;

      setQueryLoading(true);
      const result = await executeQuery(bindingName, sql);
      setQueryResult(result);
      setQueryLoading(false);
    },
    [bindingName, executeQuery],
  );

  if (!bindingName) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">No database specified</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </Link>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-2">
            <Database className="size-5 text-purple-500" />
            <h1 className="text-lg font-semibold">{bindingName}</h1>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Error display */}
      {apiError && (
        <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20">
          <p className="text-sm text-destructive">{apiError}</p>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar with table list */}
        <div className="w-64 border-r border-border flex flex-col">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Tables
            </h2>
          </div>
          <ScrollArea className="flex-1">
            <TableList
              tables={tables}
              selectedTable={selectedTable}
              onSelectTable={handleSelectTable}
              loading={tablesLoading}
            />
          </ScrollArea>
        </div>

        {/* Main content area with tabs */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Tabs defaultValue="data" className="flex-1 flex flex-col">
            <div className="px-4 pt-4">
              <TabsList>
                <TabsTrigger value="data">Data</TabsTrigger>
                <TabsTrigger value="query">Query</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="data" className="flex-1 overflow-hidden m-0">
              <DataViewer
                tableName={selectedTable ?? ""}
                columns={columns}
                data={tableData}
                loading={dataLoading}
                onRefresh={handleRefresh}
                onPageChange={handlePageChange}
              />
            </TabsContent>

            <TabsContent value="query" className="flex-1 overflow-hidden m-0">
              <QueryEditor
                onExecute={handleExecuteQuery}
                result={queryResult}
                loading={queryLoading}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
