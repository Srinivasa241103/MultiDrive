import { Worker } from 'bullmq';
import { redisConnection } from '../services/queue/connection';
import { db } from '../db/client';
import { getValidAccessToken } from '../services/tokenStore';
import { logger } from '../utils/logger';

export const tokenRefreshWorker = new Worker(
  'token-refresh',
  async (job) => {
    const accounts = await db.account.findMany({
      where: { health: true },
    });

    for (const account of accounts) {
      try {
        await getValidAccessToken(account.id);
        logger.info({ accountId: account.id }, 'token refreshed successfully');
      } catch (err: any) {
        logger.error({ accountId: account.id, err }, 'token refresh failed');
      }
    }
  },
  {
    connection: redisConnection,
  },
);

tokenRefreshWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'token refresh job failed');
});
