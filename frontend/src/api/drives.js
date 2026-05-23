import { apiJSON } from "./client.js";

export const drivesApi = {
  /**
   * List all linked Google Drive accounts for the current user.
   * Expected response: [{ email, quotaUsedBytes, quotaTotalBytes, uploadedTodayBytes, healthy }, ...]
   */
  list: () => apiJSON("/accounts"),
};
