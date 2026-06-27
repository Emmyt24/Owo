import { z } from 'zod';

/**
 * Validated environment. Fail fast on boot if required config is missing — money
 * services must never start half-configured. Secrets come from the secrets manager
 * in prod, not committed env files (Section 10/12).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),

  // chain
  CELO_CHAIN_ID: z.coerce.number().default(44787), // default to Alfajores in non-prod
  CELO_RPC_URL: z.string().url().optional(),
  GDOLLAR_TOKEN_ADDRESS: z.string().optional(),

  // data
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),

  // observability
  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${parsed.error.toString()}`);
  }
  return parsed.data;
}
