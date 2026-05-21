import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { config } from '../config/env.js';

const adapter = new PrismaPg({ connectionString: config.DATABASE_URL });

export const db = new PrismaClient({
    adapter,
    log: ["error", "warn"],
});
