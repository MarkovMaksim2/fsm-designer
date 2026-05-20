/** @typedef {import("./lib/fsmModel").FSMDefinition} FSMDefinition */
import { serializeFSM } from "./lib/fsmModel";

/**
 * @typedef {{
 *   requestId: string,
 *   path: string,
 *   startedAt: string,
 *   durationMs: number,
 *   ok: boolean,
 *   status: number | null,
 * }} RequestMeta
 */

const IS_TAURI =
  typeof window !== "undefined"
  && (window.location.protocol === "tauri:" || "__TAURI_INTERNALS__" in window);
const DEFAULT_BASE_URL = IS_TAURI ? "http://127.0.0.1:38123" : "http://localhost:8000";
const RAW_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_BASE_URL;
const BASE_URL = RAW_BASE_URL.endsWith("/") ? RAW_BASE_URL.slice(0, -1) : RAW_BASE_URL;
const IS_DEV = import.meta.env.DEV;

function buildRequestId(path) {
  return `${path.replace("/", "")}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {"request:start"|"request:success"|"request:error"} event
 * @param {Record<string, unknown>} payload
 */
function logRequestEvent(event, payload) {
  if (!IS_DEV) {
    return;
  }

  console.info(`[fsm-ui] ${event}`, payload);
}

/**
 * @param {string} path
 * @param {FSMDefinition} fsm
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<{ data: any, meta: RequestMeta }>}
 */
async function request(path, fsm, signal) {
  const payload = serializeFSM(fsm);
  const requestId = buildRequestId(path);
  const startedAt = new Date().toISOString();
  const startedAtMs = performance.now();

  logRequestEvent("request:start", {
    requestId,
    path,
    startedAt,
    states: payload.states.length,
    transitions: payload.transitions.length,
    signals: payload.signals.length,
  });

  let response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error) {
    const meta = {
      requestId,
      path,
      startedAt,
      durationMs: Math.round(performance.now() - startedAtMs),
      ok: false,
      status: null,
    };

    logRequestEvent("request:error", {
      ...meta,
      message: error instanceof Error ? error.message : "Неизвестная сетевая ошибка",
    });

    throw Object.assign(
      new Error(error instanceof Error ? error.message : "Неизвестная сетевая ошибка"),
      { meta },
    );
  }

  const meta = {
    requestId,
    path,
    startedAt,
    durationMs: Math.round(performance.now() - startedAtMs),
    ok: response.ok,
    status: response.status,
  };

  if (!response.ok) {
    let message = `Ошибка запроса: ${response.status}`;

    try {
      const body = await response.json();
      if (typeof body.detail === "string") {
        message = body.detail;
      }
    } catch {
      // Keep fallback message for non-JSON responses.
    }

    logRequestEvent("request:error", {
      ...meta,
      message,
    });

    throw Object.assign(new Error(message), { meta });
  }

  const data = await response.json();

  logRequestEvent("request:success", meta);

  return { data, meta };
}

/**
 * @param {FSMDefinition} fsm
 * @param {AbortSignal | undefined} signal
 */
export function generateVerilog(fsm, signal) {
  return request("/generate", fsm, signal);
}

/**
 * @param {FSMDefinition} fsm
 * @param {AbortSignal | undefined} signal
 */
export function analyzeFSM(fsm, signal) {
  return request("/analyze", fsm, signal);
}

export async function importVerilogModule(source, signal) {
  const requestId = buildRequestId("/import-verilog");
  const startedAt = new Date().toISOString();
  const startedAtMs = performance.now();

  logRequestEvent("request:start", {
    requestId,
    path: "/import-verilog",
    startedAt,
  });

  let response;

  try {
    response = await fetch(`${BASE_URL}/import-verilog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
      signal,
    });
  } catch (error) {
    const meta = {
      requestId,
      path: "/import-verilog",
      startedAt,
      durationMs: Math.round(performance.now() - startedAtMs),
      ok: false,
      status: null,
    };
    throw Object.assign(
      new Error(error instanceof Error ? error.message : "Неизвестная сетевая ошибка"),
      { meta },
    );
  }

  const meta = {
    requestId,
    path: "/import-verilog",
    startedAt,
    durationMs: Math.round(performance.now() - startedAtMs),
    ok: response.ok,
    status: response.status,
  };

  if (!response.ok) {
    let message = `Ошибка запроса: ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") {
        message = body.detail;
      }
    } catch {
      // Ignore non-JSON error body.
    }

    throw Object.assign(new Error(message), { meta });
  }

  const data = await response.json();
  logRequestEvent("request:success", meta);
  return { data, meta };
}

export async function simulateModule(source, testbench, signal) {
  const requestId = buildRequestId("/simulate");
  const startedAt = new Date().toISOString();
  const startedAtMs = performance.now();

  let response;

  try {
    response = await fetch(`${BASE_URL}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, testbench }),
      signal,
    });
  } catch (error) {
    const meta = {
      requestId,
      path: "/simulate",
      startedAt,
      durationMs: Math.round(performance.now() - startedAtMs),
      ok: false,
      status: null,
    };

    throw Object.assign(
      new Error(error instanceof Error ? error.message : "Неизвестная сетевая ошибка"),
      { meta },
    );
  }

  const meta = {
    requestId,
    path: "/simulate",
    startedAt,
    durationMs: Math.round(performance.now() - startedAtMs),
    ok: response.ok,
    status: response.status,
  };

  if (!response.ok) {
    let message = `Ошибка запроса: ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") {
        message = body.detail;
      }
    } catch {
      // Ignore non-JSON error body.
    }

    throw Object.assign(new Error(message), { meta });
  }

  const data = await response.json();
  return { data, meta };
}
