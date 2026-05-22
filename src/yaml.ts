import type { Service } from './types.ts';

function quote(s: string): string {
  if (s === '') return '""';
  if (/^[\w./:@-]+$/.test(s) && !['null', 'true', 'false', '~'].includes(s) && !/^\d/.test(s)) return s;
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function emitValue(v: unknown, indent: string): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return quote(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    return '\n' + v.map(item => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const entries = Object.entries(item as Record<string, unknown>);
        return entries.map((e, i) => `${indent}${i === 0 ? '- ' : '  '}${e[0]}: ${emitValue(e[1], indent + '    ')}`).join('\n');
      }
      return `${indent}- ${emitValue(item, indent + '  ')}`;
    }).join('\n');
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return '\n' + entries.map(([k, val]) => `${indent}${k}: ${emitValue(val, indent + '  ')}`).join('\n');
  }
  return quote(String(v));
}

export function dumpServices(services: Service[]): string {
  const out: string[] = ['# api-registry — generated from registry.db', 'services:'];
  for (const s of services) {
    out.push(`  - name: ${quote(s.name)}`);
    const rest = Object.entries(s).filter(([k]) => k !== 'name');
    for (const [k, v] of rest) {
      out.push(`    ${k}: ${emitValue(v, '      ')}`);
    }
  }
  return out.join('\n') + '\n';
}

function unquote(s: string): string | null {
  s = s.trim();
  if (s === 'null' || s === '~') return null;
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return s;
}

export function parseServices(yaml: string): Service[] {
  const lines = yaml.split('\n');
  const services: any[] = [];
  let current: any = null;
  let currentKey: string | null = null;
  let currentKeyIndent = 0;
  let accumulator: any = null;

  const flush = () => {
    if (current && currentKey && accumulator !== null) {
      current[currentKey] = accumulator;
      currentKey = null;
      accumulator = null;
    }
  };

  for (const raw of lines) {
    if (raw.trim().startsWith('#') || raw.trim() === '' || raw.trim() === 'services:') continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();

    if (indent === 2 && line.startsWith('- name:')) {
      flush();
      if (current) services.push(current);
      current = { name: unquote(line.slice('- name:'.length)) };
      continue;
    }

    if (indent === 4 && line.includes(':')) {
      flush();
      const idx = line.indexOf(':');
      const key = line.slice(0, idx);
      const val = line.slice(idx + 1).trim();
      if (val === '' || val === 'null') {
        // either null or start of nested structure — default null, overwrite if indent-6 follows
        current[key] = null;
        currentKey = key;
        currentKeyIndent = 6;
        accumulator = null;
      } else if (val === '{}') {
        current[key] = {};
      } else if (val === '[]') {
        current[key] = [];
      } else {
        current[key] = unquote(val);
      }
      continue;
    }

    if (indent === currentKeyIndent && currentKey) {
      if (line.startsWith('- ')) {
        if (!Array.isArray(accumulator)) accumulator = [];
        const rest = line.slice(2);
        if (rest.includes(':')) {
          const idx = rest.indexOf(':');
          const obj: any = {};
          obj[rest.slice(0, idx)] = unquote(rest.slice(idx + 1));
          accumulator.push(obj);
        } else {
          accumulator.push(unquote(rest));
        }
      } else if (line.includes(':')) {
        if (accumulator === null || typeof accumulator !== 'object' || Array.isArray(accumulator)) {
          accumulator = {};
        }
        const idx = line.indexOf(':');
        accumulator[line.slice(0, idx)] = unquote(line.slice(idx + 1));
      }
      continue;
    }

    if (indent === currentKeyIndent + 2 && Array.isArray(accumulator) && accumulator.length > 0 && line.includes(':')) {
      const idx = line.indexOf(':');
      accumulator[accumulator.length - 1][line.slice(0, idx)] = unquote(line.slice(idx + 1));
      continue;
    }
  }
  flush();
  if (current) services.push(current);
  return services as Service[];
}
