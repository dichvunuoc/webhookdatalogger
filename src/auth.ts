import type { FastifyReply, FastifyRequest } from "fastify";

export function createAuthPreHandler(keys: Set<string>) {
  return async function authPreHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const key = request.headers["x-api-key"];
    if (typeof key !== "string" || !keys.has(key)) {
      await reply.code(401).send({ error: "Unauthorized" });
    }
  };
}
