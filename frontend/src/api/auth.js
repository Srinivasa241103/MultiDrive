import { apiJSON, apiFetch } from "./client.js";

export const authApi = {
  /** Register a new user. Backend sets the HttpOnly session cookie on success. */
  register: (username, email, password) =>
    apiJSON("/auth/register", {
      method: "POST",
      json: { username, email, password },
    }),

  /** Log in. Backend sets the HttpOnly session cookie on success. */
  login: (username, password) =>
    apiJSON("/auth/login", {
      method: "POST",
      json: { username, password },
    }),

  /** Log out. Backend clears the session cookie. */
  logout: () => apiFetch("/auth/logout", { method: "POST" }),

  /** Check if the current session cookie is valid. Returns the user object or throws 401. */
  me: () => apiJSON("/auth/me"),
};
