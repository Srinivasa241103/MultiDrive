import { FastifyInstance } from "fastify";
import { randomBytes } from "crypto";
import { getAuthUrl, exchangeCode, createOAuthClient } from "../../services/oauthService";
import { saveTokens } from "../../services/tokenStore";
import { getStorageQuota } from "../../services/driveService";
import { db } from "../../db/client";
import { redisConnection } from "../../services/queue/connection";
import { logger } from "../../utils/logger";
import { config } from "../../config/env";

const STATE_TTL    = 600;
const STATE_PREFIX = 'oauth:state:';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ── Initiate OAuth flow ──────────────────────────────────────────────────
  // This route IS hit through the Vite proxy (same origin as frontend),
  // so the session cookie is present here. We capture the logged-in userId
  // and embed it in the Redis state so the callback can link correctly.
  app.get('/auth/google', async (request, reply) => {
    const state = randomBytes(16).toString('hex');

    let userId: string | null = null;
    try {
      await request.jwtVerify();
      userId = request.user.id;
    } catch {
      // Not logged in — callback will fall back to email-based upsert
    }

    await redisConnection.set(
      `${STATE_PREFIX}${state}`,
      JSON.stringify({ userId }),
      'EX',
      STATE_TTL,
    );

    reply.redirect(getAuthUrl(state));
  });

  // ── OAuth callback ───────────────────────────────────────────────────────
  // Google redirects the browser directly to localhost:3000 (bypasses Vite
  // proxy), so the frontend session cookie is NOT available here.
  // We recover the userId from the Redis state written above instead.
  app.get<{ Querystring: { code: string; state: string } }>(
    '/auth/google/callback',
    async (request, reply) => {
      const { code, state } = request.query;

      const raw = await redisConnection.get(`${STATE_PREFIX}${state}`);
      if (!raw) {
        return reply.status(400).send({ error: 'Invalid or expired state parameter' });
      }
      await redisConnection.del(`${STATE_PREFIX}${state}`);

      const { userId: loggedInUserId } = JSON.parse(raw) as { userId: string | null };

      const tokens = await exchangeCode(code);

      const oauthClient = createOAuthClient();
      oauthClient.setCredentials({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expiry_date: tokens.expiryDate,
      });

      const { data: googleUser } = await oauthClient.request<{ email?: string; name?: string }>(
        { url: 'https://www.googleapis.com/oauth2/v2/userinfo' },
      );

      if (!googleUser.email) {
        return reply.redirect(`${config.FRONTEND_URL}?oauth=error`);
      }

      // Determine which user this account belongs to:
      //   • If the user was logged in when they started OAuth → link to them
      //   • Otherwise → upsert a user record by the Google email
      let userId: string;
      if (loggedInUserId) {
        userId = loggedInUserId;
      } else {
        const user = await db.user.upsert({
          where: { email: googleUser.email },
          create: { email: googleUser.email, name: googleUser.name ?? null },
          update: { name: googleUser.name ?? undefined },
        });
        userId = user.id;
      }

      const account = await db.account.upsert({
        where: { email: googleUser.email },
        create: {
          email: googleUser.email,
          health: true,
          userId,
          quotaTotalBytes: 0n,
          quotaUsedBytes: 0n,
        },
        update: {
          health: true,
          userId, // re-link to current user if previously owned by a different one
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

      logger.info({ accountId: account.id, email: googleUser.email, userId }, 'account linked');

      // Redirect back to the frontend — the Drives tab will show the new account
      reply.redirect(`${config.FRONTEND_URL}?oauth=success`);
    },
  );
}