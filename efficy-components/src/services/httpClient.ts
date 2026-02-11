export class HttpError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.payload = payload;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

function toJsonBody(body: unknown): string | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }

  return JSON.stringify(body);
}

function withLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export function resolveApiBaseUrl(apiBasePath: string): string {
  if (/^https?:\/\//i.test(apiBasePath)) {
    return apiBasePath;
  }

  const maybeContextPath = window.contextJsParameters?.contextPath?.trim() ?? "";
  if (!maybeContextPath) {
    return apiBasePath;
  }

  if (apiBasePath.startsWith(maybeContextPath)) {
    return apiBasePath;
  }

  return `${maybeContextPath}${withLeadingSlash(apiBasePath)}`;
}

export class HttpClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, { method: "GET", signal });
  }

  async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, { method: "POST", body, signal });
  }

  async put<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, { method: "PUT", body, signal });
  }

  async request<T>(path: string, options: RequestOptions): Promise<T> {
    const body = toJsonBody(options.body);
    const response = await fetch(`${this.baseUrl}${withLeadingSlash(path)}`, {
      method: options.method ?? "GET",
      body,
      signal: options.signal,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers ?? {}),
      },
    });

    const contentType = response.headers.get("content-type") ?? "";
    const payload = await this.readPayload(contentType, response);

    if (!response.ok) {
      throw new HttpError(
        this.extractErrorMessage(payload, response.status),
        response.status,
        payload,
      );
    }

    return payload as T;
  }

  private async readPayload(contentType: string, response: Response): Promise<unknown> {
    if (contentType.includes("application/json")) {
      return response.json();
    }

    const text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private extractErrorMessage(payload: unknown, status: number): string {
    if (payload && typeof payload === "object") {
      const maybeMessage = (payload as Record<string, unknown>).message;
      if (typeof maybeMessage === "string" && maybeMessage.length > 0) {
        return maybeMessage;
      }

      const maybeError = (payload as Record<string, unknown>).error;
      if (typeof maybeError === "string" && maybeError.length > 0) {
        return maybeError;
      }
    }

    return `HTTP ${status}`;
  }
}
