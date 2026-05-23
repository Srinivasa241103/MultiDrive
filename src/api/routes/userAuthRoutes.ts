import { FastifyInstance } from "fastify";
import { db } from "../../db/client";
import { hashPassword, verifyPassword } from "../../utils/password";
import { authenticate } from "../../middleware/authMiddleware";
import { logger } from "../../utils/logger";
import { config } from "../../config/env";

const COOKIE_NAME = 'session';
const COOKIE_TTL  = 7 * 24 * 60 * 60; // 7 days in seconds

function cookieOpts(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    path: '/',
    secure,
    maxAge: COOKIE_TTL,
  };
}

export async function userAuthRoutes(app: FastifyInstance): Promise<void> {
  const secure = config.NODE_ENV === 'production';

  app.post<{ Body: { username: string; email: string; password: string } }>(
    '/auth/register',
    async (request, reply) => {
      const { username, email, password } = request.body;

      if (!username?.trim() || !email?.trim() || !password || password.length < 4) {
        return reply.status(400).send({ error: 'username, email and a password of at least 4 characters are required' });
      }

      const existing = await db.user.findFirst({
        where: { OR: [{ username }, { email }] },
      });
      if (existing) {
        return reply.status(409).send({ error: 'Username or email already taken' });
      }

      const passwordHash = await hashPassword(password);
      const user = await db.user.create({
        data: { username, email, passwordHash },
      });

      const token = app.jwt.sign({ id: user.id, email: user.email });
      reply.setCookie(COOKIE_NAME, token, cookieOpts(secure));
      logger.info({ userId: user.id }, 'user registered');
      return reply.status(201).send({ id: user.id, username: user.username, email: user.email });
    },
  );

  app.post<{ Body: { username: string; password: string } }>(
    '/auth/login',
    async (request, reply) => {
      const { username, password } = request.body;

      if (!username?.trim() || !password) {
        return reply.status(400).send({ error: 'username and password are required' });
      }

      const user = await db.user.findUnique({ where: { username } });
      if (!user || !user.passwordHash) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const token = app.jwt.sign({ id: user.id, email: user.email });
      reply.setCookie(COOKIE_NAME, token, cookieOpts(secure));
      logger.info({ userId: user.id }, 'user logged in');
      return reply.send({ id: user.id, username: user.username, email: user.email });
    },
  );

  app.post('/auth/logout', async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.send({ message: 'Logged out' });
  });

  app.get(
    '/auth/me',
    { onRequest: [authenticate] },
    async (request, reply) => {
      const user = await db.user.findUnique({ where: { id: request.user.id } });
      if (!user) {
        return reply.status(401).send({ error: 'User not found' });
      }
      return reply.send({ id: user.id, username: user.username, email: user.email });
    },
  );
}
