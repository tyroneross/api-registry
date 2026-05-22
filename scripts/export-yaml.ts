#!/usr/bin/env tsx
import { writeFileSync } from 'node:fs';
import { openDatabase, listServices, defaultDbPath } from '../src/db.ts';
import { dumpServices } from '../src/yaml.ts';

const out = process.argv[2] ?? `${process.env.HOME}/.api-registry/registry.yaml`;
const db = openDatabase(defaultDbPath());
const all = listServices(db);
writeFileSync(out, dumpServices(all));
console.log(JSON.stringify({ ok: true, path: out, count: all.length }));
