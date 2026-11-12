/**
 * Item 4: CSS token enforcement test.
 * Fails if any CSS file outside tokens.css contains raw hex/rgb color values.
 *
 * Allowed exceptions:
 *   - #fff  (white on colored backgrounds – text-inverse; always correct for contrast)
 *   - rgba(0,0,0,...)  (overlay/shadow, acceptable semantic use)
 *   - rgb(0 0 0 / ...)  (shadows)
 *   - The file is tokens.css itself
 */
import { describe, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.join(process.cwd(), 'src');
const TOKENS_CSS = path.join(SRC_DIR, 'styles', 'tokens.css');

/** Collect all .css files under src except tokens.css */
function collectCssFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectCssFiles(full));
    else if (entry.isFile() && full.endsWith('.css') && full !== TOKENS_CSS) results.push(full);
  }
  return results;
}

describe('CSS: no hard-coded colors outside tokens.css', () => {
  const files = collectCssFiles(SRC_DIR);

  for (const file of files) {
    it(`${path.relative(SRC_DIR, file)} has no raw colors`, () => {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      const violations = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments
        if (line.trim().startsWith('/*') || line.trim().startsWith('*')) continue;

        // Allow: #fff (white on colored bg – always contrast-safe when bg is a var)
        // Allow: rgba(0,0,0 and rgb(0 0 0 (overlay/shadow) 
        // Disallow: any other hex or rgb/rgba color
        const stripped = line
          .replace(/#fff\b/gi, '')
          .replace(/rgba?\(0\s*,\s*0\s*,\s*0[^)]*\)/gi, '')
          .replace(/rgb\(0 0 0[^)]*\)/gi, '');

        if (/#[0-9a-fA-F]{3,6}\b/.test(stripped) || /\brgba?\s*\(/.test(stripped)) {
          violations.push(`Line ${i + 1}: ${line.trim()}`);
        }
      }

      if (violations.length > 0) {
        throw new Error(
          `Hard-coded colors found in ${path.relative(SRC_DIR, file)}:\n` +
          violations.join('\n') +
          '\nUse CSS custom properties from tokens.css instead.'
        );
      }
    });
  }
});
