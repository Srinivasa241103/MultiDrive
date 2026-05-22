import { uploadQueue } from "./uploadQueue";
import type { UploadJobData } from "../../types/domain";

export async function enqueueChunkUpload(data: UploadJobData): Promise<void>{
    await uploadQueue.add(
        `chunk-${data.fileId}-${data.sequenceNo}`,
    data,
    {
      jobId: `${data.fileId}-${data.sequenceNo}`,
    },
    );
}