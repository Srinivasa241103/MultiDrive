import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import jwt from '@fastify/jwt';
import { healthRoutes } from './routes/health.routes.js';
import { authRoutes } from './routes/authRoutes.js';
import { fileRoutes } from './routes/filesRoute.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

export async function buildServer(): Promise<FastifyInstance> {
    const app = Fastify({
        loggerInstance: logger,
    });

    await app.register(cors, { origin: true });
    await app.register(multipart);
    await app.register(jwt, { secret: config.JWT_SECRET });

    await app.register(healthRoutes);
    await app.register(authRoutes);
    await app.register(fileRoutes);

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
