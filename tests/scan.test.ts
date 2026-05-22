import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanProjects } from '../scripts/scan.ts';
import { join } from 'node:path';

const FIXTURES = join(import.meta.dirname, 'fixtures/sample-projects');

test('scan discovers npm deps from package.json', async () => {
  const candidates = await scanProjects([FIXTURES], { skipNetwork: true });
  const names = candidates.map(c => c.name);
  assert.ok(names.includes('better-auth'));
  assert.ok(names.includes('@neondatabase/serverless'));
});

test('scan skips devDependencies by default', async () => {
  const candidates = await scanProjects([FIXTURES], { skipNetwork: true });
  assert.ok(!candidates.some(c => c.name === 'typescript'));
});

test('scan discovers pypi deps', async () => {
  const candidates = await scanProjects([FIXTURES], { skipNetwork: true });
  const names = candidates.map(c => c.name);
  assert.ok(names.includes('requests'));
  assert.ok(names.includes('anthropic'));
});

test('scan discovers MCP servers', async () => {
  const candidates = await scanProjects([FIXTURES], { skipNetwork: true });
  assert.ok(candidates.some(c => c.name === 'context7' && c.source_file.endsWith('.mcp.json')));
});

test('scan discovers env-key prefixes', async () => {
  const candidates = await scanProjects([FIXTURES], { skipNetwork: true });
  const names = candidates.map(c => c.name);
  assert.ok(names.includes('groq'));
  assert.ok(names.includes('openai'));
  assert.ok(names.includes('stripe'));
});
