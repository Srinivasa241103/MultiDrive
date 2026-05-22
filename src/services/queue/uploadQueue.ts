import { Queue } from 'bullmq';
import { redisConnection } from './connection';
import type { UploadJobData } from '../../types/domain';

export const uploadQueue = new Queue<UploadJobData>('chunk-upload',{
    connection: redisConnection,
    defaultJobOptions: {
    attempts: 3,
    backoff:{
        type: 'exponential',
        delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 200,
},
});