import IORedis from 'ioredis';
import { config} from '../../config/env';

export const redisConnection = new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
});