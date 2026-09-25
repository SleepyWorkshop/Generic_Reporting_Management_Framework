import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { AgGridReact } from "ag-grid-react";

import { useGrid } from "../../engine/GridContext";

import {
    compareGridValues,
    defaultColumn,
    defaultGridOptions,
    gridTheme,
} from "../../engine/GridEngine";
import { getContentMinWidth } from "../../engine/GridEngine/contentWidth";
import { formatValueForDisplay } from "../../engine/ValueFormatter";

import type { GridConfig, SortDefinition } from "../../types/report";
import type { ColumnDefinition } from "../../types/column";
import MobileReportView from "./MobileReportView";

import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

interface Props {
    rows: Record<string, unknown>[];
    columns: ColumnDefinition[];
    gridConfig: GridConfig;
    height?: CSSProperties["height"];
    autoHeight?: boolean;
    initialSort?: SortDefinition[];
    serverPagination?: {
        page: number;
        pageSize: number;
        totalRows: number;
        disabled?: boolean;
        onPageChange: (page: number) => void;
        onPageSizeChange: (pageSize: number) => void;
    };
    onSortChange?: (sort: Array<{ field: string; direction: "ASC" | "DESC" }>) => void;
}

function formatGridValue(value: unknown, dataType?: ColumnDefinition["dataType"]): string {
    return formatValueForDisplay(value, dataType);
}

export default function GenericGrid({
    rows,
    columns,
    gridConfig,
    height,
    autoHeight = false,
    initialSort = [],
    serverPagination,
    onSortChange,
}: Props) {

    const { setApi } = useGrid();
    const usesNaturalHeight = autoHeight || height === undefined;

    const gridRef = useRef<AgGridReact>(null);
    const [selectedRows, setSelectedRows] = useState<Set<Record<string, unknown>>>(() => new Set());
    const [mobileSort, setMobileSort] = useState<{ field: string; direction: "asc" | "desc" } | null>(() => {
        const firstSort = initialSort[0];
        return firstSort ? {
            field: firstSort.field,
            direction: firstSort.direction === "DESC" ? "desc" : "asc",
        } : null;
    });
    const [mobileClientPage, setMobileClientPage] = useState(1);
    const [mobileClientPageSize, setMobileClientPageSize] = useState(gridConfig.pagination.pageSize);

    useEffect(() => () => setApi(null), [setApi]);

    const columnDefs = useMemo(() => {
        const getInitialSortState = (field: string) => {
            const sortIndex = initialSort.findIndex(sort => sort.field === field);
            if (sortIndex < 0) return {};

            return {
                initialSort: initialSort[sortIndex].direction === "DESC" ? "desc" as const : "asc" as const,
                initialSortIndex: sortIndex,
            };
        };
        const hasConfiguredGrouping = gridConfig.grouping?.enabled
            && ((gridConfig.grouping.groups?.length ?? 0) > 0
                || (gridConfig.grouping.aggregates?.length ?? 0) > 0);
        const groupedColumns = hasConfiguredGrouping
            ? gridConfig.grouping?.groups ?? []
            : [];
        const aggregateColumns = hasConfiguredGrouping
            ? gridConfig.grouping?.aggregates ?? []
            : [];

        return hasConfiguredGrouping
            ? [
                ...groupedColumns.map(group => ({
                    field: group.field,
                    headerName: group.header ?? group.field,
                    sortable: true,
                    filter: false,
                    initialWidth: 200,
                    minWidth: getContentMinWidth(
                        rows,
                        group.field,
                        group.header ?? group.field,
                        true,
                    ),
                    valueFormatter: ({ value }: { value: unknown }) => formatGridValue(value),
                    dataType: undefined,
                    comparator: (left: unknown, right: unknown) => compareGridValues(left, right),
                    ...getInitialSortState(group.field),
                })),
                ...aggregateColumns.map(aggregate => ({
                    field: aggregate.alias ?? `${aggregate.function}_${aggregate.field}`,
                    headerName: aggregate.header
                        ?? aggregate.alias
                        ?? `${aggregate.function} ${aggregate.field}`,
                    sortable: true,
                    filter: false,
                    initialWidth: 180,
                    minWidth: getContentMinWidth(
                        rows,
                        aggregate.alias ?? `${aggregate.function}_${aggregate.field}`,
                        aggregate.header
                            ?? aggregate.alias
                            ?? `${aggregate.function} ${aggregate.field}`,
                        true,
                    ),
                    valueFormatter: ({ value }: { value: unknown }) => formatGridValue(value, "number"),
                    dataType: "number" as const,
                    comparator: (left: unknown, right: unknown) => compareGridValues(left, right, "number"),
                    ...getInitialSortState(aggregate.alias ?? `${aggregate.function}_${aggregate.field}`),
                })),
            ]
            : columns
                .filter(column => column.visible)
                .map(column => ({
                    field: column.field,
                    headerName: column.header,
                    sortable: column.sortable,
                    filter: false,
                    initialWidth: column.width,
                    minWidth: getContentMinWidth(
                        rows,
                        column.field,
                        column.header,
                        column.sortable ?? true,
                        undefined,
                        column.dataType,
                    ),
                    valueFormatter: ({ value }: { value: unknown }) => formatGridValue(value, column.dataType),
                    dataType: column.dataType,
                    comparator: (left: unknown, right: unknown) => compareGridValues(left, right, column.dataType),
                    ...getInitialSortState(column.field),
                }));
    }, [columns, gridConfig.grouping, initialSort, rows]);

    const mobileColumns = columnDefs.map(column => ({
        field: column.field,
        headerName: column.headerName,
        sortable: column.sortable !== false,
        dataType: column.dataType,
    }));

    const mobileRows = useMemo(() => {
        if (!mobileSort) return rows;

        return [...rows].sort((left, right) => {
            const leftValue = left[mobileSort.field];
            const rightValue = right[mobileSort.field];
            const dataType = mobileColumns.find(column => column.field === mobileSort.field)?.dataType;
            const comparison = compareGridValues(leftValue, rightValue, dataType);
            return mobileSort.direction === "desc" ? -comparison : comparison;
        });
    }, [mobileColumns, mobileSort, rows]);

    const usesClientPagination = gridConfig.pagination.enabled && !serverPagination;
    const clientTotalPages = Math.max(1, Math.ceil(mobileRows.length / mobileClientPageSize));
    const activeClientPage = Math.min(mobileClientPage, clientTotalPages);
    const displayedMobileRows = usesClientPagination
        ? mobileRows.slice(
            (activeClientPage - 1) * mobileClientPageSize,
            activeClientPage * mobileClientPageSize,
        )
        : mobileRows;
    const pagination = serverPagination
        ? {
            page: serverPagination.page,
            pageSize: serverPagination.pageSize,
            totalRows: serverPagination.totalRows,
            disabled: serverPagination.disabled ?? false,
            onPageChange: serverPagination.onPageChange,
            onPageSizeChange: serverPagination.onPageSizeChange,
        }
        : usesClientPagination
            ? {
                page: activeClientPage,
                pageSize: mobileClientPageSize,
                totalRows: mobileRows.length,
                disabled: false,
                onPageChange: setMobileClientPage,
                onPageSizeChange: (pageSize: number) => {
                    setMobileClientPageSize(pageSize);
                    setMobileClientPage(1);
                },
            }
            : null;
    const totalPages = pagination
        ? Math.max(1, Math.ceil(pagination.totalRows / pagination.pageSize))
        : 1;
    const rangeStart = pagination && pagination.totalRows > 0
        ? (pagination.page - 1) * pagination.pageSize + 1
        : 0;
    const rangeEnd = pagination
        ? Math.min(rangeStart + displayedMobileRows.length - 1, pagination.totalRows)
        : 0;

    const applyMobileSort = (field: string, direction: "asc" | "desc") => {
        const nextSort = field ? { field, direction } : null;
        setMobileSort(nextSort);
        setMobileClientPage(1);
        gridRef.current?.api.applyColumnState({
            state: nextSort ? [{ colId: nextSort.field, sort: nextSort.direction }] : [],
            defaultState: { sort: null },
        });
        if (!gridRef.current?.api && onSortChange) {
            onSortChange(nextSort ? [{ field: nextSort.field, direction: nextSort.direction === "desc" ? "DESC" : "ASC" }] : []);
        }
    };

    const toggleMobileSelection = (row: Record<string, unknown>) => {
        const nextSelected = !selectedRows.has(row);
        const singleSelection = gridConfig.rowSelection === "single";
        gridRef.current?.api.forEachNode(node => {
            if (node.data === row) node.setSelected(nextSelected, singleSelection);
        });
        setSelectedRows(previous => {
            const next = singleSelection ? new Set<Record<string, unknown>>() : new Set(previous);
            if (nextSelected) next.add(row);
            else next.delete(row);
            return next;
        });
    };

    return (

        <div className={`universal-grid${usesNaturalHeight ? " universal-grid--natural-height" : ""}`}>
            <div
                className={gridTheme.className}
                style={{
                    ...gridTheme.style,
                    ...(!usesNaturalHeight && height !== undefined ? { height } : { height: "auto" }),
                }}
            >

            <AgGridReact
                ref={gridRef}

                {...defaultGridOptions}

                onGridReady={(params) => {
                    setApi(params.api);
                }}

                onSelectionChanged={event => {
                    setSelectedRows(new Set(event.api.getSelectedRows()));
                }}

                rowData={rows}
                columnDefs={columnDefs}

                defaultColDef={defaultColumn}
                headerHeight={44}
                rowHeight={42}
                domLayout={usesNaturalHeight ? "autoHeight" : "normal"}
                enableCellTextSelection

                pagination={gridConfig.pagination.enabled && !serverPagination}
                paginationPageSize={gridConfig.pagination.pageSize}
                paginationPageSizeSelector={
                    gridConfig.pagination.pageSizeOptions
                }

                rowSelection={gridConfig.rowSelection}

                onSortChanged={event => {
                    const sorting: Array<{ field: string; direction: "ASC" | "DESC" }> = event.api.getColumnState()
                        .filter(column => column.sort === "asc" || column.sort === "desc")
                        .map(column => ({
                            field: column.colId,
                            direction: column.sort === "desc" ? "DESC" : "ASC",
                        }));
                    const firstSort = sorting[0];
                    setMobileSort(firstSort ? {
                        field: firstSort.field,
                        direction: firstSort.direction === "DESC" ? "desc" : "asc",
                    } : null);
                    onSortChange?.(sorting);
                }}
            />

            </div>

            <MobileReportView
                rows={displayedMobileRows}
                columns={mobileColumns}
                selectable={gridConfig.rowSelection === "single" || gridConfig.rowSelection === "multiple"}
                sort={mobileSort}
                isSelected={row => selectedRows.has(row)}
                onToggleSelection={toggleMobileSelection}
                onSortFieldChange={field => applyMobileSort(field, mobileSort?.direction ?? "asc")}
                onSortDirectionChange={() => {
                    if (mobileSort) applyMobileSort(mobileSort.field, mobileSort.direction === "asc" ? "desc" : "asc");
                }}
            />

            {pagination && gridConfig.pagination.enabled && (
                <footer className={`universal-grid__pagination${serverPagination ? "" : " universal-grid__pagination--client"}`} aria-label="Grid pagination">
                    <span className="universal-grid__range">
                        Showing {rangeStart}–{Math.max(rangeStart, rangeEnd)} of {pagination.totalRows}
                    </span>
                    <label className="universal-grid__page-size">
                        <span>Rows per page</span>
                        <select
                            aria-label="Rows per page"
                            value={pagination.pageSize}
                            disabled={pagination.disabled}
                            onChange={event => pagination.onPageSizeChange(Number(event.target.value))}
                        >
                            {[...new Set([
                                ...(gridConfig.pagination.pageSizeOptions ?? []),
                                pagination.pageSize,
                            ])].sort((left, right) => left - right).map(option => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                    </label>
                    <div className="universal-grid__page-buttons" role="group" aria-label="Page navigation">
                        <button type="button" className="universal-grid__page-button--first" aria-label="First page" title="First page" disabled={pagination.disabled || pagination.page <= 1} onClick={() => pagination.onPageChange(1)}>«</button>
                        <button type="button" className="universal-grid__page-button--previous" aria-label="Previous page" title="Previous page" disabled={pagination.disabled || pagination.page <= 1} onClick={() => pagination.onPageChange(pagination.page - 1)}>‹</button>
                        <span className="universal-grid__page-indicator">Page <strong>{pagination.page}</strong> of {totalPages}</span>
                        <button type="button" className="universal-grid__page-button--next" aria-label="Next page" title="Next page" disabled={pagination.disabled || pagination.page >= totalPages} onClick={() => pagination.onPageChange(pagination.page + 1)}>›</button>
                        <button type="button" className="universal-grid__page-button--last" aria-label="Last page" title="Last page" disabled={pagination.disabled || pagination.page >= totalPages} onClick={() => pagination.onPageChange(totalPages)}>»</button>
                    </div>
                </footer>
            )}
        </div>

    );

}
