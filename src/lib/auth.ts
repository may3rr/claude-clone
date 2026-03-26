import { getDb } from '@/lib/db';

export function getApiKeyForUser(shortname: string): string | null {
  const envKey = `KEY_${shortname.toUpperCase()}`;
  return process.env[envKey] || null;
}

export async function isValidUserDb(shortname: string): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    SELECT 1 FROM users WHERE shortname = ${shortname.trim().toLowerCase()}
  `;
  return rows.length > 0;
}

// Keep sync version for backward compat (reads from users.json)
export { isValidUser, getUserByShortname, getAllUsers } from '@/lib/users';
