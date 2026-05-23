async function apiFetch(path, options = {}) {
  const { json, ...rest } = options;

  const fetchOptions = {
    ...rest,
    credentials: "include",
  };

  if (json !== undefined) {
    fetchOptions.body = JSON.stringify(json);
    fetchOptions.headers = {
      "Content-Type": "application/json",
      ...rest.headers,
    };
  }

  const response = await fetch(path, fetchOptions);

  if (!response.ok) {
    let message = response.statusText;
    try {
      const data = await response.json();
      message = data.message || data.error || message;
    } catch (err) {
      //ignore
    }

    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return response;
}

export async function apiJSON(path, options = {}) {
  const res = await apiFetch(path, options);
  return res.json();
}

export async function apiBlob(path, options = {}) {
  const res = await apiFetch(path, options);
  return res.blob();
}

export { apiFetch };
