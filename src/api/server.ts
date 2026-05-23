import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import jwt from '@fastify/jwt';
import { healthRoutes } from './routes/health.routes.js';
import { authRoutes } from './routes/authRoutes.js';
import { userAuthRoutes } from './routes/userAuthRoutes.js';
import { fileRoutes } from './routes/filesRoute.js';
import { accountsRoutes } from './routes/accountsRoute.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';
import { CONSTANTS } from '../config/constants.js';
import { register } from '../utils/metrics';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { createBullBoard } from '@bull-board/api';
import { uploadQueue } from '../services/queue/uploadQueue';


export async function buildServer(): Promise<FastifyInstance> {
    const app = Fastify({
        loggerInstance: logger,
    });

    await app.register(cors, { origin: true, credentials: true });
    await app.register(cookie);
    await app.register(multipart, {
        limits: { fileSize: CONSTANTS.MAX_UPLOAD_SIZE_BYTES },
    });
    await app.register(jwt, {
        secret: config.JWT_SECRET,
        cookie: { cookieName: 'session', signed: false },
    });

    const serverAdapter = new FastifyAdapter();
    serverAdapter.setBasePath('/admin/queues');
    createBullBoard({
        queues: [new BullMQAdapter(uploadQueue)],
        serverAdapter,
    });
    await app.register(serverAdapter.registerPlugin(), { prefix: '/admin/queues' });

    await app.register(healthRoutes);
    await app.register(authRoutes);
    await app.register(userAuthRoutes);
    await app.register(fileRoutes);
    await app.register(accountsRoutes);
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

    app.get('/metrics', async (request, reply) => {
        reply.header('Content-Type', register.contentType);
        reply.send(await register.metrics());
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
