/**
 * 初始化数据库：创建表 + 插入默认用户
 *
 * 用法：node scripts/init-db.mjs
 * 需要 DATABASE_URL 环境变量（可从 .env.local 读取）
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { hashSync } from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 读 .env.local
const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx < 0) continue;
  const key = trimmed.slice(0, eqIdx);
  const value = trimmed.slice(eqIdx + 1);
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

const sql = neon(process.env.DATABASE_URL);

const DEFAULT_PASSWORD = 'REDACTED_PASSWORD';
const passwordHash = hashSync(DEFAULT_PASSWORD, 10);

const users = [
  { shortname: 'lm', displayName: '李淼', role: 'user' },
  { shortname: 'lhn', displayName: '赖慧楠', role: 'user' },
  { shortname: 'smy', displayName: '孙蜜遥', role: 'user' },
  { shortname: 'xlhh', displayName: '徐刘淏华', role: 'user' },
  { shortname: 'ly', displayName: '刘洋', role: 'user' },
  { shortname: 'srwy', displayName: '孙瑞雯烨', role: 'user' },
  { shortname: 'ceshi', displayName: '测试用户', role: 'user' },
  { shortname: 'jklroot0', displayName: 'Root', role: 'admin' },
];

async function main() {
  console.log('Creating tables...');

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      shortname    TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role         TEXT NOT NULL DEFAULT 'user',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id           TEXT PRIMARY KEY,
      user_shortname TEXT NOT NULL REFERENCES users(shortname),
      title        TEXT NOT NULL DEFAULT 'New chat',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_shortname)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id           TEXT PRIMARY KEY,
      session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role         TEXT NOT NULL,
      content      JSONB NOT NULL DEFAULT '[]',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)
  `;

  console.log('Tables created.');

  console.log('Inserting users...');
  for (const user of users) {
    await sql`
      INSERT INTO users (shortname, display_name, password_hash, role)
      VALUES (${user.shortname}, ${user.displayName}, ${passwordHash}, ${user.role})
      ON CONFLICT (shortname) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        role = EXCLUDED.role
    `;
    console.log(`  ✓ ${user.shortname} (${user.displayName})`);
  }

  console.log('\nDone! Default password for all users: ' + DEFAULT_PASSWORD);
}

main().catch((err) => {
  console.error('Init failed:', err);
  process.exit(1);
});
