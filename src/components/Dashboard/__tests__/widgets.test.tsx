import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardProvider, useDashboard } from "../../../engine/DashboardContext";
import { clearRequestCache } from "../../../engine/RequestCache";
import ChartWidget from "../ChartWidget";
import StatWidget from "../StatWidget";
import TableWidget from "../TableWidget";
import { getDashboardTableViewportHeight } from "../tableViewport";

const { executeRequestMock, genericGridProps } = vi.hoisted(() => ({
    executeRequestMock: vi.fn(),
    genericGridProps: vi.fn(),
}));

vi.mock("../../../api/request", () => ({
    executeRequest: executeRequestMock,
    getRequestErrorMessage: (error: unknown) => error instanceof Error ? error.message : "Request failed",
    isRequestAbort: (error: unknown) => error instanceof Error && error.name === "AbortError",
}));

vi.mock("../../Grid/GenericGrid", () => ({
    default: (props: unknown) => {
        genericGridProps(props);
        return <div data-testid="shared-generic-grid" />;
    },
}));

const request = {
    action: "select" as const,
    source: { table: "ItemMasterTable" },
    fields: ["Item_Code", "Item_Desc"],
};

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(next => {
        resolve = next;
    });
    return { promise, resolve };
}

function ApplyItemFiltersButton() {
    const { applyFilters } = useDashboard();
    return <button type="button" onClick={() => applyFilters({ Item_Desc: "ABC", Std_Vat: "5" })}>Apply item filters</button>;
}

function ApplyChartFiltersButton({
    label,
    filters,
}: {
    label: string;
    filters: Record<string, string>;
}) {
    const { applyFilters } = useDashboard();
    return <button type="button" onClick={() => applyFilters(filters)}>{label}</button>;
}

describe("dashboard widgets", () => {
    beforeEach(() => {
        clearRequestCache();
        executeRequestMock.mockReset();
        genericGridProps.mockClear();
    });

    it("renders dashboard tables through GenericGrid with presentation columns", async () => {
        executeRequestMock.mockResolvedValue({
            success: true,
            message: "ok",
            data: [{ Item_Code: "A1", Item_Desc: "Alpha" }],
            meta: { page: 1, pageSize: 10, totalRows: 1, rowsReturned: 1, executionTime: 1 },
        });
        const columns = [
            { field: "Item_Code", header: "Item Code" },
            { field: "Item_Desc", header: "Item Description" },
        ];
        render(
            <DashboardProvider>
                <TableWidget title="Items" request={request} columns={columns} pageSize={10} />
            </DashboardProvider>
        );

        await waitFor(() => expect(screen.getByTestId("shared-generic-grid")).toBeTruthy());
        const props = genericGridProps.mock.calls.at(-1)?.[0];
        expect(props.columns.map((column: { field: string }) => column.field)).toEqual(["Item_Code", "Item_Desc"]);
        expect(props.serverPagination).toMatchObject({ page: 1, pageSize: 10, totalRows: 1 });
        expect(props.height).toBe(466);
        expect(props.autoHeight).toBe(true);
        expect(executeRequestMock).toHaveBeenCalledTimes(1);
    });

    it("sizes dashboard table viewports for ten complete rows without growing for larger pages", () => {
        expect(getDashboardTableViewportHeight(10)).toBe(466);
        expect(getDashboardTableViewportHeight(25)).toBe(466);
        expect(getDashboardTableViewportHeight(50)).toBe(466);
        expect(getDashboardTableViewportHeight(100)).toBe(466);
    });

    it("uses the controlled scroll viewport only when the returned page exceeds ten rows", async () => {
        executeRequestMock.mockResolvedValue({
            success: true,
            message: "ok",
            data: Array.from({ length: 25 }, (_, index) => ({ Item_Code: String(index + 1) })),
            meta: { page: 1, pageSize: 25, totalRows: 25, rowsReturned: 25, executionTime: 1 },
        });
        render(
            <DashboardProvider>
                <TableWidget title="Items" request={request} pageSize={25} />
            </DashboardProvider>
        );

        await waitFor(() => expect(genericGridProps.mock.calls.at(-1)?.[0].autoHeight).toBe(false));
        expect(genericGridProps.mock.calls.at(-1)?.[0].height).toBe(466);
    });

    it("passes configured sort into dashboard table grid state and its initial request", async () => {
        executeRequestMock.mockResolvedValue({
            success: true,
            message: "ok",
            data: [{ Item_Code: "A1", Item_Desc: "Alpha" }],
            meta: { page: 1, pageSize: 10, totalRows: 1, rowsReturned: 1, executionTime: 1 },
        });
        const sortedRequest = {
            ...request,
            sort: [
                { field: "Item_Desc", direction: "DESC" as const },
                { field: "Item_Code", direction: "ASC" as const },
            ],
        };
        render(
            <DashboardProvider>
                <TableWidget title="Items" request={sortedRequest} pageSize={10} />
            </DashboardProvider>
        );

        await waitFor(() => expect(screen.getByTestId("shared-generic-grid")).toBeTruthy());
        expect(genericGridProps.mock.calls.at(-1)?.[0].initialSort).toEqual(sortedRequest.sort);
        expect(executeRequestMock.mock.calls[0][0].sort).toEqual(sortedRequest.sort);
    });

    it("uses dashboard valueField and formatting for columnless stat widgets", async () => {
        executeRequestMock.mockResolvedValue({
            success: true,
            message: "ok",
            data: [{ TotalItems: 1234, Ignored: 9 }],
        });
        render(
            <DashboardProvider>
                <StatWidget title="Total Items" request={request} valueField="TotalItems" format="number" />
            </DashboardProvider>
        );
        expect(await screen.findByText("1,234")).toBeTruthy();
    });

    it("removes floating-point artifacts from stat presentation", async () => {
        executeRequestMock.mockResolvedValue({
            success: true,
            message: "ok",
            data: [{ value: 12.199999999999998 }],
        });
        render(
            <DashboardProvider>
                <StatWidget title="Calculated" request={request} valueField="value" format="number" />
            </DashboardProvider>
        );

        expect(await screen.findByText("12.2")).toBeTruthy();
    });

    it("formats numeric string statistics without mutating the response row", async () => {
        const row = { value: "12509.549999999999" };
        executeRequestMock.mockResolvedValue({
            success: true,
            message: "ok",
            data: [row],
        });
        render(
            <DashboardProvider>
                <StatWidget title="Calculated string" request={request} valueField="value" format="number" />
            </DashboardProvider>
        );

        expect(await screen.findByText("12,509.55")).toBeTruthy();
        expect(row.value).toBe("12509.549999999999");
    });

    it("renders a returned null statistic as an em dash", async () => {
        const row = { value: null };
        executeRequestMock.mockResolvedValue({
            success: true,
            message: "ok",
            data: [row],
        });
        render(
            <DashboardProvider>
                <StatWidget title="Nullable" request={request} valueField="value" />
            </DashboardProvider>
        );

        expect(await screen.findByText("—")).toBeTruthy();
        expect(row.value).toBeNull();
        expect(screen.queryByText("No data")).toBeNull();
    });

    it("applies Item Dashboard filters to every statistic and maps all statistic fields", async () => {
        executeRequestMock.mockResolvedValue({
            success: true,
            message: "ok",
            data: [{ TotalItems: 4, MinimumSP: 10, MaximumSP: 20, TotalValue: 30 }],
        });
        const statsRequest = { action: "sql" as const, resource: "widgets/item-dashboard-stats" };
        const filterDefinitions = [
            { field: "Item_Desc", label: "Item Name", type: "text" as const },
            { field: "Std_Vat", label: "GST %", type: "text" as const },
        ];

        render(
            <DashboardProvider>
                <ApplyItemFiltersButton />
                <StatWidget title="Total" request={statsRequest} valueField="TotalItems" filterDefinitions={filterDefinitions} cacheScope="total" />
                <StatWidget title="Minimum" request={statsRequest} valueField="MinimumSP" filterDefinitions={filterDefinitions} cacheScope="minimum" />
                <StatWidget title="Maximum" request={statsRequest} valueField="MaximumSP" filterDefinitions={filterDefinitions} cacheScope="maximum" />
                <StatWidget title="Value" request={statsRequest} valueField="TotalValue" filterDefinitions={filterDefinitions} cacheScope="value" />
            </DashboardProvider>
        );

        await waitFor(() => expect(executeRequestMock).toHaveBeenCalledTimes(4));
        expect(await screen.findByText("4")).toBeTruthy();
        expect(screen.getByText("10")).toBeTruthy();
        expect(screen.getByText("20")).toBeTruthy();
        expect(screen.getByText("30")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Apply item filters" }));
        await waitFor(() => expect(executeRequestMock).toHaveBeenCalledTimes(8));
        executeRequestMock.mock.calls.slice(-4).forEach(call => {
            expect(call[0].filters).toEqual([
                { field: "Item_Desc", operator: "LIKE", value: "%ABC%" },
                { field: "Std_Vat", operator: "LIKE", value: "%5%" },
            ]);
        });
    });

    it("loads a SQL Resource chart without filters and applies shared dashboard filters", async () => {
        executeRequestMock.mockResolvedValue({
            success: true,
            message: "ok",
            data: [
                { Category: "DELICATESSEN", StockValue: 3425154.06 },
                { Category: "KITCHEN WARE", StockValue: 2705972.65 },
            ],
            meta: { page: null, pageSize: null, totalRows: 2, rowsReturned: 2, executionTime: 1 },
        });
        const chartRequest = {
            action: "sql" as const,
            resource: "widgets/item-stock-value-by-category",
            execution: {
                filters: {
                    Cat_code: { placement: "source" as const },
                    Std_Vat: { placement: "source" as const },
                },
            },
        };
        const filterDefinitions = [
            { field: "Cat_code", label: "Category", type: "text" as const },
            { field: "Std_Vat", label: "GST %", type: "select" as const, operator: "equals" as const, options: [{ label: "5", value: "5" }] },
        ];

        render(
            <DashboardProvider>
                <ApplyChartFiltersButton label="Category only" filters={{ Cat_code: "10" }} />
                <ApplyChartFiltersButton label="GST only" filters={{ Std_Vat: "5" }} />
                <ApplyChartFiltersButton label="Both filters" filters={{ Cat_code: "10", Std_Vat: "5" }} />
                <ChartWidget
                    title="Stock Value by Category"
                    request={chartRequest}
                    xField="Category"
                    yField="StockValue"
                    filterDefinitions={filterDefinitions}
                />
            </DashboardProvider>
        );

        await waitFor(() => expect(executeRequestMock).toHaveBeenCalledTimes(1));
        expect(executeRequestMock.mock.calls[0][0]).toMatchObject({
            action: "sql",
            resource: "widgets/item-stock-value-by-category",
            filters: [],
        });
        expect(screen.queryByText("Unable to load chart")).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Category only" }));
        await waitFor(() => expect(executeRequestMock).toHaveBeenCalledTimes(2));
        expect(executeRequestMock.mock.calls[1][0].filters).toEqual([
            { field: "Cat_code", operator: "LIKE", value: "%10%" },
        ]);

        fireEvent.click(screen.getByRole("button", { name: "GST only" }));
        await waitFor(() => expect(executeRequestMock).toHaveBeenCalledTimes(3));
        expect(executeRequestMock.mock.calls[2][0].filters).toEqual([
            { field: "Std_Vat", operator: "=", value: "5" },
        ]);

        fireEvent.click(screen.getByRole("button", { name: "Both filters" }));
        await waitFor(() => expect(executeRequestMock).toHaveBeenCalledTimes(4));
        expect(executeRequestMock.mock.calls[3][0].filters).toEqual([
            { field: "Cat_code", operator: "LIKE", value: "%10%" },
            { field: "Std_Vat", operator: "=", value: "5" },
        ]);
    });

    it("aborts an obsolete widget request and ignores its late response", async () => {
        const oldResponse = deferred<{
            success: boolean;
            message: string;
            data: Record<string, unknown>[];
        }>();
        const newResponse = deferred<{
            success: boolean;
            message: string;
            data: Record<string, unknown>[];
        }>();
        let obsoleteSignal: AbortSignal | undefined;

        executeRequestMock.mockImplementation((payload: { source: { table: string } }, options?: RequestInit) => {
            if (payload.source.table === "SlowDashboard") {
                obsoleteSignal = options?.signal ?? undefined;
                return oldResponse.promise;
            }
            return newResponse.promise;
        });

        const slowRequest = {
            ...request,
            source: { table: "SlowDashboard" },
        };
        const fastRequest = {
            ...request,
            source: { table: "FastDashboard" },
        };
        const view = render(
            <DashboardProvider>
                <StatWidget title="Dashboard value" request={slowRequest} valueField="value" cacheScope="slow" />
            </DashboardProvider>
        );

        await waitFor(() => expect(executeRequestMock).toHaveBeenCalledTimes(1));
        view.rerender(
            <DashboardProvider>
                <StatWidget title="Dashboard value" request={fastRequest} valueField="value" cacheScope="fast" />
            </DashboardProvider>
        );

        await waitFor(() => expect(executeRequestMock).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(obsoleteSignal?.aborted).toBe(true));

        await act(async () => {
            newResponse.resolve({ success: true, message: "ok", data: [{ value: 2 }] });
        });
        expect(await screen.findByText("2")).toBeTruthy();

        await act(async () => {
            oldResponse.resolve({ success: true, message: "ok", data: [{ value: 1 }] });
        });
        expect(screen.queryByText("1")).toBeNull();
        expect(screen.queryByText("Unable to load statistic")).toBeNull();
    });
});
