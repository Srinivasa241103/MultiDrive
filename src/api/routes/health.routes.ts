import {FastifyInstance} from 'fastify';
import {db} from '../../db/client.js';
import {redis} from '../../db/redis.js';

export async function healthRoutes(fastify: FastifyInstance) {
    fastify.get("/health", async () => {
        return{
            status: "ok",
        };
    });

    fastify.get("/ready", async (_request, reply) => {
        try{
            await db.$queryRaw`SELECT 1`;
            await redis.ping();

            return {
                status: "ready",
            };
        }catch(error){
            fastify.log.error(error);
            return reply.status(503).send({
                status: "not_ready",
            });
        }
    });
}