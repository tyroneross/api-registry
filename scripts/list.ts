#!/usr/bin/env tsx
import { openDatabase, listServices, defaultDbPath } from '../src/db.ts';

const category = process.argv[2];
const db = openDatabase(defaultDbPath());
const services = listServices(db, category);

const grouped: Record<string, typeof services> = {};
for (const s of services) {
  (grouped[s.category] ??= []).push(s);
}

console.log(JSON.stringify({
  count: services.length,
  category_filter: category ?? null,
  by_category: grouped,
}, null, 2));
