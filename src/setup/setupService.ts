import { executeRequest } from "../api/request";

export async function getSetupStatus(signal?: AbortSignal): Promise<boolean> {
    const response = await executeRequest({ action: "setup.status" }, { signal });
    return parseInitialized(response.data);
}

function parseInitialized(data: Record<string, unknown>[]): boolean {
    if (data.length !== 1
        || Object.keys(data[0]).some(key => key !== "initialized")
        || typeof data[0].initialized !== "boolean") {
        throw new Error("The API returned an invalid setup response.");
    }
    return data[0].initialized;
}
