import "fastify";

export interface AuthContext {
  userId: string;
  orgId: string;
  role: "owner" | "admin" | "member";
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
  }
  interface FastifyInstance {
    authenticate: (req: import("fastify").FastifyRequest) => Promise<void>;
  }
}
