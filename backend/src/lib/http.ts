import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

/** An error whose statusCode is safe to surface to the client. */
export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: unknown, _req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: "validation_error", details: err.issues });
    }
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: err.message });
    }
    // Postgres constraint violations -> 4xx where the cause is the client's input.
    const code = (err as { code?: string })?.code;
    if (code === "23505") return reply.status(409).send({ error: "conflict" });
    if (code === "23514" || code === "23503" || code === "22P02") {
      return reply.status(400).send({ error: "invalid_input" });
    }
    // Fastify's own errors carry a statusCode (e.g. rate limit 429, body-too-large).
    const status = (err as { statusCode?: number })?.statusCode;
    if (typeof status === "number" && status < 500) {
      return reply.status(status).send({ error: (err as Error).message });
    }
    app.log.error(err);
    return reply.status(500).send({ error: "internal_error" });
  });
}
