import { FileStatus, ChunkStatus, PermissionRole} from "@prisma/client";

//chunk metadata interface
export interface ChunkMeta{
    sequenceNo: number;
    sha256: string;
    sizeBytes: number;
    data: Buffer;
    localPath: string;
}

export interface ChunkRecord{
    id: string;
    fileId: string;
    sequenceNo: number;
    sha256: string;
    sizeBytes: number;
    accountId: string;    
    driveFileId: string;  
    status: ChunkStatus;
    replicaOf: string | null; 
}

export interface FileRecord{
    id: string;
    ownerId: string;
    name: string;
    sizeBytes: number;
    mimeType: string;
    totalChunks: number;
    sha256Full: string | null;  
    status: FileStatus;
    createdAt: Date;
    updatedAt: Date;
}

export interface AccountRecord {
  id: string;
  ownerId: string;
  email: string;
  encryptedRefreshToken: string; 
  quotaTotalBytes: number;
  quotaUsedBytes: number;
  uploadedTodayBytes: number;    
  healthy: boolean;              
  lastCheckedAt: Date;
}

export interface UploadJobData {
  fileId: string;
  sequenceNo: number;
  sha256: string;         
  sizeBytes: number;
  accountId: string;      
  localPath: string;      
  encrypt: boolean;       
}

// What the worker writes back when a job completes successfully.
export interface UploadJobResult {
  driveFileId: string;    // Drive's ID for the uploaded chunk
  md5Checksum: string;    // Drive's own MD5 — worker cross-checks this
  bytesUploaded: number;
}

export interface PlacementDecision {
  accountId: string;
  accountEmail: string;   // for logging — easier to read than a UUID
}

export interface ChunkManifestEntry {
  sequenceNo: number;
  sha256: string;
  sizeBytes: number;
  driveFileId: string;
  accountId: string;
}

export interface PermissionRecord {
  id: string;
  fileId: string;
  principalId: string;  // user ID
  role: PermissionRole;
}

// Returned by POST /files/upload immediately — before chunks are uploaded.
export interface UploadInitResponse {
  uploadId: string;       // = fileId — the client polls /files/:id/status with this
  totalChunks: number;
  chunkSize: number;
}

// Returned by GET /files/:id/status
export interface FileStatusResponse {
  fileId: string;
  status: FileStatus;
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  progressPercent: number;
}