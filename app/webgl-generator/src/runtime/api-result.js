export function apiSuccess(data = null, metadata = {}) {
  return {
    ok: true,
    data: cloneApiValue(data),
    metadata: {
      ...metadata,
      at: new Date().toISOString()
    }
  };
}

export function apiFailure(error, metadata = {}) {
  return {
    ok: false,
    error: normalizeApiError(error, metadata.code),
    metadata: {
      ...metadata,
      at: new Date().toISOString()
    }
  };
}

export function apiCall(task, metadata = {}) {
  try {
    const result = task();
    if (result && typeof result.then === "function") {
      return result.then(data => apiSuccess(data, metadata), error => apiFailure(error, metadata));
    }
    return apiSuccess(result, metadata);
  } catch (error) {
    return apiFailure(error, metadata);
  }
}

function normalizeApiError(error, code = "api_error") {
  if (error instanceof Error) {
    return {
      code: String(error.code || code),
      name: error.name,
      message: error.message,
      ...(error.stage ? {stage: String(error.stage)} : {}),
      ...(error.suggestion ? {suggestion: String(error.suggestion)} : {})
    };
  }
  return {
    code,
    name: "Error",
    message: String(error)
  };
}

function cloneApiValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    if (Array.isArray(value)) return value.map(item => cloneApiValue(item));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneApiValue(item)]));
  }
}
