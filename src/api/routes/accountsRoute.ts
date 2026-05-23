import { FastifyInstance } from "fastify";
import { authenticate } from "../../middleware/authMiddleware";
import { db } from "../../db/client";

export async function accountsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/accounts',
    { onRequest: [authenticate] },
    async (request, reply) => {
      const accounts = await db.account.findMany({
        where: { userId: request.user.id },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send(
        accounts.map((a) => ({
          id:                 a.id,
          email:              a.email,
          health:             a.health,
          quotaTotalBytes:    Number(a.quotaTotalBytes),
          quotaUsedBytes:     Number(a.quotaUsedBytes),
          uploadedTodayBytes: Number(a.uploadedTodayBytes),
          lastCheckedAt:      a.lastCheckedAt,
          createdAt:          a.createdAt,
        })),
      );
    },
  );
}
