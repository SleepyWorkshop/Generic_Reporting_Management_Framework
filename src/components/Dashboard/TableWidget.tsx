import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import {
    executeRequest,
    getRequestErrorMessage,
    isRequestAbort,
} from "../../api/request";
import { useDashboard } from "../../engine/DashboardContext";
import { buildFilters } from "../../engine/FilterQueryBuilder";
import { createRequestCacheKey, getCachedResponse, getOrCreateInFlightRequest, setCachedResponse } from "../../engine/RequestCache";
import { exportExcel, exportRowsCSV, fetchAllRowsForExport } from "../../engine/ExportEngine";

import type { ExportConfig, ExportFormat } from "../../types/export";
import type { FilterDefinition } from "../../types/filter";
import type { ColumnDefinition } from "../../types/column";
import type { GridConfig } from "../../types/report";
import type { WidgetRequest } from "../../types/widget";
import ExportMenu, { type ExportMenuOption } from "../Common/ExportMenu";
import Loading from "../Common/Loading";
import GenericGrid from "../Grid/GenericGrid";
import ReportTableFrame from "../Grid/ReportTableFrame";
import { getDashboardTableViewportHeight } from "./tableViewport";


const EMPTY_FILTER_DEFINITIONS: FilterDefinition[] = [];
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
interface TableWidgetProps {
    title: string;
    description?: string;
    pageSize?: number;
    pageSizeOptions?: number[];
    request: WidgetRequest;
    columns?: ColumnDefinition[];
    filterDefinitions?: FilterDefinition[];
    cacheScope?: string;
    exportConfig?: ExportConfig;
}

type SortDirection = "ASC" | "DESC";

interface SortState {
    field: string;
    direction: SortDirection;
}

interface PageState {
    queryKey: string;
    page: number;
}

interface PageSizeState {
    configured: number;
    value: number;
}

function normalizePageSize(value: number | undefined) {
    return Number.isInteger(value) && (value ?? 0) > 0
        ? value as number
        : DEFAULT_PAGE_SIZE;
}

function formatHeader(field: string) {
    return field
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, character => character.toUpperCase());
}

function getColumnWidth(
    field: string,
    rows: Record<string, unknown>[]
) {
    const contentLength = rows
        .slice(0, 20)
        .reduce(
            (largest, row) => Math.max(
                largest,
                String(row[field] ?? "").length
            ),
            formatHeader(field).length
        );

    return Math.min(320, Math.max(140, contentLength * 8 + 32));
}

export default function TableWidget({
    title,
    description,
    pageSize,
    pageSizeOptions,
    request,
    columns: configuredColumns,
    filterDefinitions = EMPTY_FILTER_DEFINITIONS,
    cacheScope = title,
    exportConfig,
}: TableWidgetProps) {
    const { refreshKey, appliedFilters } = useDashboard();

    const configuredPageSize = normalizePageSize(pageSize);
    const [pageSizeState, setPageSizeState] = useState<PageSizeState>({
        configured: configuredPageSize,
        value: configuredPageSize,
    });
    const activePageSize = pageSizeState.configured === configuredPageSize
        ? pageSizeState.value
        : configuredPageSize;
    const [rows, setRows] = useState<Record<string, unknown>[]>([]);
    const [totalRows, setTotalRows] = useState(0);
    const [resultViewKey, setResultViewKey] = useState("");
    const [pageState, setPageState] = useState<PageState>({
        queryKey: "",
        page: 1,
    });
    const [sort, setSort] = useState<SortState | null>(null);
    const [retryKey, setRetryKey] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const latestRequest = useRef(0);
    const resultViewKeyRef = useRef("");
    const previousRefreshKey = useRef(refreshKey);
    const previousRetryKey = useRef(retryKey);
    const [exportController, setExportController] = useState<AbortController | null>(null);
    const [exporting, setExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState("");
    const [exportError, setExportError] = useState("");

    const dashboardFilters = useMemo(
        () => buildFilters(appliedFilters, filterDefinitions, request.action === "sql"),
        [appliedFilters, filterDefinitions, request.action]
    );

    const queryKey = useMemo(
        () => JSON.stringify({
            request,
            dashboardFilters,
            configuredPageSize,
        }),
        [request, dashboardFilters, configuredPageSize]
    );

    const currentPage = pageState.queryKey === queryKey
        ? pageState.page
        : 1;
    const viewKey = useMemo(
        () => JSON.stringify({ queryKey, currentPage, activePageSize, sort }),
        [queryKey, currentPage, activePageSize, sort]
    );
    const requestPayload = useMemo(() => ({
        ...request,
        filters: [
            ...(Array.isArray(request.filters) ? request.filters : []),
            ...dashboardFilters,
        ],
        pagination: { page: currentPage, pageSize: activePageSize },
        ...(sort ? { sort: [sort] } : {}),
    }), [request, dashboardFilters, currentPage, activePageSize, sort]);
    const cacheKey = useMemo(
        () => createRequestCacheKey(`dashboard:${cacheScope}`, requestPayload),
        [cacheScope, requestPayload]
    );
    const cachedResponse = useMemo(
        () => getCachedResponse(cacheKey),
        [cacheKey]
    );

    const sizeOptions = useMemo(() => {
        const configured = pageSizeOptions?.filter(
            option => Number.isInteger(option) && option > 0
        ) ?? DEFAULT_PAGE_SIZE_OPTIONS;

        return [...new Set([...configured, activePageSize])]
            .sort((a, b) => a - b);
    }, [pageSizeOptions, activePageSize]);
    const gridConfig = useMemo<GridConfig>(() => ({
        pagination: {
            enabled: true,
            pageSize: activePageSize,
            pageSizeOptions: sizeOptions,
        },
        rowSelection: "multiple",
    }), [activePageSize, sizeOptions]);

    useEffect(() => {
        const forceRefresh = previousRefreshKey.current !== refreshKey
            || previousRetryKey.current !== retryKey;
        previousRefreshKey.current = refreshKey;
        previousRetryKey.current = retryKey;

        const controller = new AbortController();
        const requestId = ++latestRequest.current;

        const loadTable = async () => {
            if (!forceRefresh) {
                const cachedResponse = getCachedResponse(cacheKey);
                if (cachedResponse) {
                    const cachedRows = cachedResponse.data ?? [];
                    setRows(cachedRows);
                    setTotalRows(cachedResponse.meta?.totalRows ?? cachedResponse.meta?.rowsReturned ?? cachedRows.length);
                    resultViewKeyRef.current = viewKey;
                    setResultViewKey(viewKey);
                    setError(null);
                    setLoading(false);
                    return;
                }
            }

            setLoading(true);
            setError(null);

            try {
                const response = await getOrCreateInFlightRequest(
                    cacheKey,
                    signal => executeRequest(requestPayload, { signal }),
                    controller.signal
                );

                if (requestId !== latestRequest.current) {
                    return;
                }

                if (!response.success) {
                    if (resultViewKeyRef.current !== viewKey) {
                        setRows([]);
                        setTotalRows(0);
                    }
                    resultViewKeyRef.current = viewKey;
                    setResultViewKey(viewKey);
                    setError(response.message || "The API could not load this table.");
                    return;
                }

                const responseRows = response.data ?? [];
                const responseTotal = response.meta?.totalRows
                    ?? response.meta?.rowsReturned
                    ?? responseRows.length;
                const pageCount = Math.max(
                    1,
                    Math.ceil(responseTotal / activePageSize)
                );

                if (responseTotal > 0 && currentPage > pageCount) {
                    setPageState({ queryKey, page: pageCount });
                    return;
                }

                setRows(responseRows);
                setTotalRows(responseTotal);
                setCachedResponse(cacheKey, response);
                resultViewKeyRef.current = viewKey;
                setResultViewKey(viewKey);
            } catch (caughtError: unknown) {
                if (
                    isRequestAbort(caughtError)
                    || requestId !== latestRequest.current
                ) {
                    return;
                }

                if (resultViewKeyRef.current !== viewKey) {
                    setRows([]);
                    setTotalRows(0);
                }
                resultViewKeyRef.current = viewKey;
                setResultViewKey(viewKey);
                setError(getRequestErrorMessage(
                    caughtError,
                    "An unexpected error occurred while loading the table."
                ));
            } finally {
                if (requestId === latestRequest.current) {
                    setLoading(false);
                }
            }
        };

        void loadTable();

        return () => {
            // Abort the HTTP consumer and independently invalidate its result.
            // The sequence guard protects the view if cancellation cannot stop
            // work already executing on the server.
            if (latestRequest.current === requestId) {
                latestRequest.current += 1;
            }
            controller.abort();
        };
    }, [
        requestPayload,
        cacheKey,
        queryKey,
        viewKey,
        currentPage,
        activePageSize,
        sort,
        refreshKey,
        retryKey,
    ]);

    useEffect(() => () => exportController?.abort(), [exportController]);

    const resultMatchesView = resultViewKey === viewKey;
    const canShowCachedResponse = !resultMatchesView && cachedResponse !== null;
    const cachedRows = cachedResponse?.data ?? [];
    const visibleRows = resultMatchesView ? rows : cachedRows;
    const visibleTotalRows = resultMatchesView
        ? totalRows
        : cachedResponse?.meta?.totalRows
            ?? cachedResponse?.meta?.rowsReturned
            ?? cachedRows.length;
    const isViewLoading = canShowCachedResponse ? false : loading;
    const configuredGridColumns = useMemo<ColumnDefinition[]>(
        () => configuredColumns?.map(column => ({
            ...column,
            visible: column.visible !== false,
            sortable: column.sortable !== false,
        })) ?? [],
        [configuredColumns]
    );
    const inferredGridColumns = useMemo<ColumnDefinition[]>(
        () => visibleRows.length > 0
            ? Object.keys(visibleRows[0]).map(field => ({
                field,
                header: formatHeader(field),
                visible: true,
                sortable: true,
                width: getColumnWidth(field, visibleRows),
            }))
            : [],
        [visibleRows]
    );
    const columns = configuredGridColumns.length > 0
        ? configuredGridColumns
        : inferredGridColumns;
    const handleSort = (sorting: SortState[]) => {
        const nextSort = sorting[0] ?? null;
        if (sort?.field === nextSort?.field && sort?.direction === nextSort?.direction) {
            return;
        }

        setSort(nextSort);
        setPageState({ queryKey, page: 1 });
    };

    const handlePageSize = (value: number) => {
        setPageSizeState({
            configured: configuredPageSize,
            value,
        });
        setPageState({ queryKey, page: 1 });
    };

    const exportFileName = exportConfig?.filename || title.replace(/\s+/g, "-").toLowerCase();
    const exportRows = useCallback((data: Record<string, unknown>[], format: ExportFormat) => {
        if (format === "csv") exportRowsCSV(data, `${exportFileName}.csv`);
        else exportExcel(data, `${exportFileName}.xlsx`);
    }, [exportFileName]);

    const handleExportAll = useCallback(async (format: ExportFormat) => {
        const controller = new AbortController();
        setExportController(previous => {
            previous?.abort();
            return controller;
        });
        setExporting(true);
        setExportProgress("Preparing export…");
        setExportError("");

        try {
            const data = await fetchAllRowsForExport({
                ...request,
                pagination: undefined,
                filters: [
                    ...(Array.isArray(request.filters) ? request.filters : []),
                    ...dashboardFilters,
                ],
                ...(sort ? { sort: [sort] } : {}),
            }, {
                signal: controller.signal,
                onProgress: (loadedRows, totalRowsForExport) => {
                    setExportProgress(totalRowsForExport === null
                        ? `Preparing export… ${loadedRows.toLocaleString()} rows`
                        : `Preparing export… ${loadedRows.toLocaleString()} of ${totalRowsForExport.toLocaleString()} rows`);
                },
            });
            if (!data.length) {
                setExportError("Export failed: there are no matching rows to export.");
                return;
            }
            exportRows(data, format);
        } catch (caughtError: unknown) {
            if (!isRequestAbort(caughtError)) {
                const message = getRequestErrorMessage(caughtError, "Unable to prepare the table export.");
                setExportError(`Export failed: ${message}`);
            }
        } finally {
            setExportController(previous => previous === controller ? null : previous);
            setExportProgress("");
            setExporting(false);
        }
    }, [request, dashboardFilters, sort, exportRows]);

    const exportOptions: ExportMenuOption[] = [];
    if (exportConfig?.enabled) {
        if (exportConfig.exportCurrentView !== false) {
            exportConfig.formats.forEach(format => exportOptions.push({
                id: `current-${format}`,
                label: `Current page — ${format === "csv" ? "CSV" : "Excel"}`,
                disabled: visibleRows.length === 0,
                onSelect: () => exportRows(visibleRows, format),
            }));
        }
        if (exportConfig.exportAll) {
            exportConfig.formats.forEach(format => exportOptions.push({
                id: `all-${format}`,
                label: `All rows — ${format === "csv" ? "CSV" : "Excel"}`,
                onSelect: () => void handleExportAll(format),
            }));
        }
    }

    const tableState = (!resultMatchesView && !canShowCachedResponse) || (isViewLoading && visibleRows.length === 0)
        ? "loading"
        : error && visibleRows.length === 0
            ? "error"
            : visibleTotalRows === 0
                ? "empty"
                : "success";

    return (
        <ReportTableFrame
            className="dashboard-table"
            title={title}
            description={description}
            busy={isViewLoading || tableState === "loading"}
            actions={(
                <>
                    {isViewLoading && visibleRows.length > 0 && (
                        <span className="report-table-frame__status" role="status">Refreshing…</span>
                    )}
                    <ExportMenu
                        options={exportOptions}
                        disabled={isViewLoading && !visibleRows.length}
                        busy={exporting}
                        mobileTriggerLabel="More"
                    />
                </>
            )}
        >

            {exportProgress && (
                <div className="dashboard-table__export-progress" role="status">{exportProgress}</div>
            )}

            {exportError && (
                <div className="dashboard-table__inline-error" role="alert">{exportError}</div>
            )}

            {tableState === "loading" && (
                <Loading label="Loading table data…" compact />
            )}

            {tableState === "error" && (
                <div className="dashboard-table__state dashboard-table__state--error" role="alert">
                    <strong>Unable to load table</strong>
                    <span>{error}</span>
                    <span>Refresh the dashboard or change a filter to try again.</span>
                    <button
                        type="button"
                        className="app-button ui-state__action"
                        onClick={() => setRetryKey(previous => previous + 1)}
                    >
                        Try again
                    </button>
                </div>
            )}

            {tableState === "empty" && (
                <div className="dashboard-table__state" role="status">
                    <strong>No records found</strong>
                    <span>The current filters returned no table data.</span>
                </div>
            )}

            {tableState === "success" && (
                <>
                    {error && (
                        <div className="dashboard-table__inline-error" role="alert">
                            <span>The latest refresh failed. Existing data is still shown.</span>
                            <button
                                type="button"
                                className="app-button"
                                onClick={() => setRetryKey(previous => previous + 1)}
                            >
                                Retry
                            </button>
                        </div>
                    )}
                    <GenericGrid
                        rows={visibleRows}
                        columns={columns}
                        gridConfig={gridConfig}
                        height={getDashboardTableViewportHeight(activePageSize)}
                        autoHeight={visibleRows.length <= 10}
                        initialSort={request.sort}
                        serverPagination={{
                            page: currentPage,
                            pageSize: activePageSize,
                            totalRows: visibleTotalRows,
                            disabled: isViewLoading,
                            onPageChange: page => setPageState({ queryKey, page }),
                            onPageSizeChange: handlePageSize,
                        }}
                        onSortChange={handleSort}
                    />
                </>
            )}
        </ReportTableFrame>
    );
}
