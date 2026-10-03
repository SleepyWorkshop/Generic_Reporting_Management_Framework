const GRID_HEADER_HEIGHT = 44;
const GRID_ROW_HEIGHT = 42;
const GRID_BORDER_HEIGHT = 2;
const MAX_VISIBLE_DASHBOARD_ROWS = 10;

export function getDashboardTableViewportHeight(pageSize: number) {
    const normalizedPageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 10;
    const visibleRows = Math.min(normalizedPageSize, MAX_VISIBLE_DASHBOARD_ROWS);
    return GRID_HEADER_HEIGHT + visibleRows * GRID_ROW_HEIGHT + GRID_BORDER_HEIGHT;
}
