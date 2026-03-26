import usersConfig from '@/config/users.json';

export type AppUser = (typeof usersConfig.users)[number];

export function getAllUsers(): AppUser[] {
  return usersConfig.users;
}

export function getUserByShortname(shortname: string): AppUser | null {
  const normalized = shortname.trim().toLowerCase();
  return (
    usersConfig.users.find(
      (user) => user.shortname.toLowerCase() === normalized
    ) ?? null
  );
}

export function isValidUser(shortname: string): boolean {
  return getUserByShortname(shortname) !== null;
}
