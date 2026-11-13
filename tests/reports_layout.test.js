/**
 * Layout regression tests for the Reports screen.
 *
 * These tests verify structural CSS properties that prevent the layout bugs
 * described in the task spec:
 *   1. .content must use display:block (not flex) so sections stack at their
 *      natural height instead of being flex-shrunk to fractional viewport heights.
 *   2. .content must have overflow-y:auto so it scrolls (not the page).
 *   3. .section must have flex-shrink:0 as a safety rail.
 *   4. .section must NOT have overflow:hidden (which clipped header text).
 *   5. .chartWrap must have an explicit height so charts are never blank strips.
 *   6. All new CSS class names expected by the JSX exist in the stylesheet.
 *
 * These checks run in Node (no DOM) by parsing the CSS file directly.
 * They are fast and stable — they will catch regressions if someone
 * accidentally reverts the layout fixes.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CSS_PATH = path.join(
  process.cwd(),
  'src/features/reports/ReportsScreen.module.css'
);

const css = fs.readFileSync(CSS_PATH, 'utf8');

// ── Helper: check that a rule block for `selector` contains `declaration` ──

/**
 * Very lightweight CSS checker: finds the LAST occurrence of `selector {`
 * and checks whether the following block (up to the next `}`) contains
 * `declaration` as a substring.
 *
 * Not a full CSS parser — but sufficient for specific, known rule blocks.
 */
function blockContains(selector, declaration) {
  // Build a pattern: selector { ... declaration ... }
  // We use the selector literally (escape for regex)
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match the selector opening brace, then capture everything until the closing brace
  const re = new RegExp(escaped + '\\s*\\{([^}]*?)\\}', 'gs');
  let match;
  let lastBlock = null;
  while ((match = re.exec(css)) !== null) {
    lastBlock = match[1];
  }
  if (!lastBlock) return false;
  return lastBlock.includes(declaration);
}

/** Check that the selector is present at all in the CSS. */
function selectorExists(selector) {
  return css.includes(selector);
}

// ── 1. .content layout ─────────────────────────────────────────────

describe('ReportsScreen.module.css — .content scroll container', () => {
  it('uses display: block (not flex)', () => {
    expect(blockContains('.content', 'display: block')).toBe(true);
  });

  it('has overflow-y: auto', () => {
    expect(blockContains('.content', 'overflow-y: auto')).toBe(true);
  });

  it('has overflow-x: hidden to prevent horizontal page scroll', () => {
    expect(blockContains('.content', 'overflow-x: hidden')).toBe(true);
  });

  it('has min-height: 0 to allow shrinking inside a flex parent', () => {
    expect(blockContains('.content', 'min-height: 0')).toBe(true);
  });

  it('has flex: 1 to fill remaining space inside .root', () => {
    expect(blockContains('.content', 'flex: 1')).toBe(true);
  });
});

// ── 2. .section rules ──────────────────────────────────────────────

describe('ReportsScreen.module.css — .section collapsible block', () => {
  it('has flex-shrink: 0 so it is never compressed', () => {
    expect(blockContains('.section', 'flex-shrink: 0')).toBe(true);
  });

  it('does NOT have overflow: hidden (would clip content)', () => {
    // The block may have overflow: visible or no overflow at all.
    // It must not contain the specific "overflow: hidden" value.
    const escaped = '.section'.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped + '\\s*\\{([^}]*?)\\}', 'gs');
    let lastBlock = null;
    let match;
    while ((match = re.exec(css)) !== null) {
      lastBlock = match[1];
    }
    expect(lastBlock).toBeTruthy();
    // Strip CSS comments before checking so a comment explaining the fix
    // (e.g. "/* NO overflow:hidden */") does not cause a false positive.
    const noComments = lastBlock.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(noComments).not.toMatch(/overflow\s*:\s*hidden/);
  });

  it('has height: auto so content drives the height', () => {
    expect(blockContains('.section', 'height: auto')).toBe(true);
  });
});

// ── 3. .sectionHeader touch target ────────────────────────────────

describe('ReportsScreen.module.css — .sectionHeader', () => {
  it('has min-height: 56px (touch target requirement)', () => {
    expect(blockContains('.sectionHeader', 'min-height: 56px')).toBe(true);
  });
});

// ── 4. .chartWrap height ──────────────────────────────────────────

describe('ReportsScreen.module.css — .chartWrap', () => {
  it('has an explicit height so charts are never blank strips', () => {
    // The height value is 280px per the fix
    expect(blockContains('.chartWrap', 'height: 280px')).toBe(true);
  });

  it('uses display: flex for the title + chart stacking', () => {
    expect(blockContains('.chartWrap', 'display: flex')).toBe(true);
  });
});

// ── 5. New class names expected by the JSX ────────────────────────

describe('ReportsScreen.module.css — new class names present', () => {
  const required = [
    '.contentToolbar',
    '.expandBtns',
    '.chartEmpty',
    '.backToTop',
    '.backToTopVisible',
  ];

  for (const cls of required) {
    it(`${cls} class is defined`, () => {
      expect(selectorExists(cls)).toBe(true);
    });
  }
});

// ── 6. .tableWrap scroll ──────────────────────────────────────────

describe('ReportsScreen.module.css — .tableWrap', () => {
  it('has overflow: auto so the table scrolls without paging', () => {
    expect(blockContains('.tableWrap', 'overflow: auto')).toBe(true);
  });

  it('has a max-height so it never pushes the page beyond viewport', () => {
    expect(blockContains('.tableWrap', 'max-height')).toBe(true);
  });
});
