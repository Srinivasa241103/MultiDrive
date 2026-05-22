import { FastifyInstance } from "fastify";
import { randomBytes } from "crypto";
import { getAuthUrl, exchangeCode, createOAuthClient } from "../../services/oauthService";
import { saveTokens } from "../../services/tokenStore";
import { getStorageQuota } from "../../services/driveService";
import { db } from "../../db/client";
import { redisConnection } from "../../services/queue/connection";
import { logger } from "../../utils/logger";

const STATE_TTL = 600;
const STATE_PREFIX = 'oauth:state:';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/auth/google', async (request, reply) => {
    const state = randomBytes(16).toString('hex');
    await redisConnection.set(`${STATE_PREFIX}${state}`, '1', 'EX', STATE_TTL);
    const url = getAuthUrl(state);
    reply.redirect(url);
  });

  app.get<{ Querystring: { code: string; state: string } }>(
    '/auth/google/callback',
    async (request, reply) => {
      const { code, state } = request.query;

      const valid = await redisConnection.get(`${STATE_PREFIX}${state}`);
      if (!valid) {
        return reply.status(400).send({ error: 'Invalid or expired state parameter' });
      }
      await redisConnection.del(`${STATE_PREFIX}${state}`);

      const tokens = await exchangeCode(code);

      const oauthClient = createOAuthClient();
      oauthClient.setCredentials({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expiry_date: tokens.expiryDate,
      });

      const { data: googleUser } = await oauthClient.request<{ email?: string; name?: string }>(
        { url: 'https://www.googleapis.com/oauth2/v2/userinfo' }
      );

      if (!googleUser.email) {
        return reply.status(400).send({ error: 'Could not retrieve email from Google' });
      }

      const user = await db.user.upsert({
        where: { email: googleUser.email },
        create: {
          email: googleUser.email,
          name: googleUser.name ?? null,
        },
        update: {
          name: googleUser.name ?? undefined,
        },
      });

      const account = await db.account.upsert({
        where: { email: googleUser.email },
        create: {
          email: googleUser.email,
          health: true,
          userId: user.id,
          quotaTotalBytes: 0n,
          quotaUsedBytes: 0n,
        },
        update: {
          health: true,
        },
      });

      await saveTokens(account.id, tokens);

      try {
        const quota = await getStorageQuota(account.id);
        await db.account.update({
          where: { id: account.id },
          data: {
            quotaTotalBytes: quota.total,
            quotaUsedBytes: quota.used,
          },
        });
      } catch (err) {
        logger.warn({ accountId: account.id, err }, 'could not fetch storage quota — will retry later');
      }

      logger.info({ accountId: account.id, email: googleUser.email }, 'account linked');
      reply.send({ message: 'Account linked successfully', accountId: account.id });
    },
  );
}