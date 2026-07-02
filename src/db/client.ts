import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import { runMigrations } from './migrations';
import * as schema from './schema';

const sqlite = openDatabaseSync('coach.db');
runMigrations(sqlite);

export const db = drizzle(sqlite, { schema });
export { sqlite };
