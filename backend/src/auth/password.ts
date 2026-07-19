import { hash, verify } from "@node-rs/argon2";

// Argon2id with sensible interactive-login parameters.
const opts = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, opts);
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain, opts);
  } catch {
    return false;
  }
}
