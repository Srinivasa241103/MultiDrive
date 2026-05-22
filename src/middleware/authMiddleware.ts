import { FastifyRequest, FastifyReply } from "fastify";

declare module '@fastify/jwt' {
    interface FastifyJWT {
        user: { id: string; email: string };
    }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}
