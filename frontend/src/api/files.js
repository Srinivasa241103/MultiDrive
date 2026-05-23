import { apiJSON, apiBlob, apiFetch } from "./client.js";

export const filesApi = {
  /** List all files for the current user. */
  list: () => apiJSON("/files"),

  /**
   * Upload a file. Sends as multipart/form-data.
   * Returns { id, name, ... } — the backend assigns the file ID.
   */
  upload: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    // No Content-Type header — the browser sets it with the correct multipart boundary.
    return apiJSON("/files/upload", {
      method: "POST",
      body: formData,
    });
  },

  /**
   * Poll upload progress for a given file ID.
   * Expected response shape: { id, status, chunksComplete, totalChunks }
   */
  status: (id) => apiJSON(`/files/${id}/status`),

  /**
   * Get the chunk placement map for a file.
   * Expected response: [{ sequenceNo, email, driveFileId, sizeBytes, status }, ...]
   */
  chunks: (id) => apiJSON(`/files/${id}/chunks`),

  /**
   * Download the reassembled file as a Blob.
   * The caller is responsible for triggering the browser save dialog.
   */
  download: (id) => apiBlob(`/files/${id}/download`),

  /** Delete a file and all its chunks from Google Drive. */
  delete: (id) => apiFetch(`/files/${id}`, { method: "DELETE" }),
};
