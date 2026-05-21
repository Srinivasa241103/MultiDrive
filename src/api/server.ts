import Fastify from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health.routes.js';
import {logger} from '../utils/logger.js';
import { config } from '../config/env.js';

async function startServer(){
    const app = Fastify({
        logger: { instance: logger },
    });

    await app.register(cors,{
        origin: true,
    })

    await app.register(healthRoutes);

    try{
        await app.listen({
            port: config.PORT || 3000,
            host: "0.0.0.0",
        });

        app.log.info(
            `Server is running on port ${config.PORT || 3000}`
        );
    }catch(error){
        app.log.error(error);
        process.exit(1);
    }

}
startServer();
