import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

type DbClient = NeonQueryFunction<false, false>;

const globalForDb = globalThis as typeof globalThis & {
  __claudeCloneDb__?: DbClient;
};

export function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not set');
  }

  if (!globalForDb.__claudeCloneDb__) {
    globalForDb.__claudeCloneDb__ = neon(databaseUrl);
  }

  return globalForDb.__claudeCloneDb__;
}
