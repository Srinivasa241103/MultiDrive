import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import jwt from '@fastify/jwt';
import { healthRoutes } from './routes/health.routes.js';
import { authRoutes } from './routes/authRoutes.js';
import { fileRoutes } from './routes/filesRoute.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';
import { CONSTANTS } from '../config/constants.js';

export async function buildServer(): Promise<FastifyInstance> {
    const app = Fastify({
        loggerInstance: logger,
    });

    await app.register(cors, { origin: true });
    await app.register(multipart, {
        limits: { fileSize: CONSTANTS.MAX_UPLOAD_SIZE_BYTES },
    });
    await app.register(jwt, { secret: config.JWT_SECRET });

    await app.register(healthRoutes);
    await app.register(authRoutes);
    await app.register(fileRoutes);
    app.get('/dev/token', async (request, reply) => {
        const email = 'dev@test.com';
        const user = await import('../db/client.js').then(m => m.db.user.upsert({
            where: { email },
            create: { email, name: 'Dev User' },
            update: {},
        }));
        const token = app.jwt.sign({ id: user.id, email: user.email });
        reply.send({ token, userId: user.id });
    });

    return app as unknown as FastifyInstance;
}

async function startServer() {
    const app = await buildServer();

    try {
        await app.listen({
            port: config.PORT || 3000,
            host: '0.0.0.0',
        });
        app.log.info(`Server is running on port ${config.PORT || 3000}`);
    } catch (error) {
        app.log.error(error);
        process.exit(1);
    }
}

startServer();
