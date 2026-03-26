import { getAllUsers, getUserByShortname, isValidUser } from '@/lib/users';

export function getApiKeyForUser(shortname: string): string | null {
  const envKey = `KEY_${shortname.toUpperCase()}`;
  return process.env[envKey] || null;
}

export { getAllUsers, getUserByShortname, isValidUser };
