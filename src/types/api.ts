export interface ApiMeta {
    page: number | null;
    pageSize: number | null;
    totalRows: number;
    rowsReturned: number;
    executionTime: number | null;
}

export interface ApiError {
    code: string;
    details: Array<{
        path?: string;
        message?: string;
        attemptsRemaining?: number;
        locked?: boolean;
        retryAfterSeconds?: number;
    } | string>;
}

export interface ApiResponse {
    success: boolean;
    message: string;
    data: Record<string, unknown>[];
    meta?: ApiMeta;
    error?: ApiError;
}

export interface QuerySort {
    field: string;
    direction: "ASC" | "DESC";
}

export type QueryOperator =
    | "=" | "!=" | "<>" | ">" | "<" | ">=" | "<="
    | "LIKE" | "NOT LIKE" | "IN" | "NOT IN"
    | "BETWEEN" | "NOT BETWEEN" | "IS NULL" | "IS NOT NULL"
    | "EXISTS" | "NOT EXISTS";

export type SqlRuntimeOperator = Exclude<QueryOperator, "EXISTS" | "NOT EXISTS">;

export interface QueryFilter {
    field?: string;
    operator: QueryOperator;
    value?: unknown;
    query?: Omit<UniversalQueryRequest, "action">;
}

export interface SqlRuntimeFilter {
    field: string;
    operator: SqlRuntimeOperator;
    value?: unknown;
    type?: "date" | "daterange";
}

export interface SqlExecutionFilter {
    expression?: string;
    placement?: "output" | "source" | "having";
    valueType?: "integer-date";
}

export interface SqlExecutionMetadata {
    columns?: string[];
    filters?: Record<string, SqlExecutionFilter>;
    defaultSort?: QuerySort[];
}

export type QueryField = string | {
    field?: string;
    fields?: string[];
    function?: string;
    alias?: string;
    sort?: QuerySort[];
    [key: string]: unknown;
};

export interface QueryJoin {
    type: "INNER" | "LEFT" | "RIGHT";
    source: { table: string; alias?: string };
    on: { left: string; operator: "="; right: string };
}

export interface HavingCondition {
    function: "COUNT" | "SUM" | "AVG" | "MIN" | "MAX" | "STRING_AGG";
    field: string;
    operator: "=" | "!=" | "<>" | ">" | "<" | ">=" | "<=";
    value: unknown;
}

export interface UniversalQueryRequest {
    action: "select";
    source: { table: string; alias?: string };
    fields: QueryField[];
    filters?: QueryFilter[];
    joins?: QueryJoin[];
    groupBy?: string[];
    having?: HavingCondition[];
    sort?: QuerySort[];
    pagination?: { page: number; pageSize: number };
    distinct?: boolean;
    limit?: number;
    filterLogic?: "AND" | "OR";
    with?: unknown;
}

export interface SqlResourceRequest {
    action: "sql";
    resource: string;
    execution?: SqlExecutionMetadata;
    filters?: SqlRuntimeFilter[];
    sort?: QuerySort[];
    pagination?: { page: number; pageSize: number };
    filterLogic?: "AND" | "OR";
}

export type DataRequest = UniversalQueryRequest | SqlResourceRequest;
