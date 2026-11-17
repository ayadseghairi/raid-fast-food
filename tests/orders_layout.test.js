/**
 * Layout regression tests for the Orders screen.
 *
 * These tests verify structural CSS properties that prevent the layout bug
 * described in the task spec: rows get squashed on top of each other when
 * there are many orders (same bug class as the Reports screen).
 *
 * Key invariants:
 *   1. .list must have flex:1, min-height:0, overflow-y:auto, overflow-x:hidden
 *      so it is the ONLY scroll container and never lets children push it.
 *   2. .row must have flex-shrink:0, height:auto, min-height:56px,
 *      and must NOT have overflow:hidden (which clipped the expanded detail).
 *   3. .backToTop and .backToTopVisible classes exist for the floating button.
 *
 * These checks run in Node (no DOM) by parsing the CSS file directly.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CSS_PATH = path.join(
  process.cwd(),
  'src/features/orders/OrdersScreen.module.css'
);

const css = fs.readFileSync(CSS_PATH, 'utf8');

// ── Helper (same as reports_layout.test.js) ────────────────────────

function blockContains(selector, declaration) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped + '\\s*\\{([^}]*?)\\}', 'gs');
  let match;
  let lastBlock = null;
  while ((match = re.exec(css)) !== null) {
    lastBlock = match[1];
  }
  if (!lastBlock) return false;
  return lastBlock.includes(declaration);
}

function selectorExists(selector) {
  return css.includes(selector);
}

// ── 1. .list scroll container ──────────────────────────────────────

describe('OrdersScreen.module.css — .list scroll container', () => {
  it('has flex: 1 to fill remaining height', () => {
    expect(blockContains('.list', 'flex: 1')).toBe(true);
  });

  it('has min-height: 0 to allow shrinking inside a flex parent', () => {
    expect(blockContains('.list', 'min-height: 0')).toBe(true);
  });

  it('has overflow-y: auto', () => {
    expect(blockContains('.list', 'overflow-y: auto')).toBe(true);
  });

  it('has overflow-x: hidden', () => {
    expect(blockContains('.list', 'overflow-x: hidden')).toBe(true);
  });
});

// ── 2. .row rules ──────────────────────────────────────────────────

describe('OrdersScreen.module.css — .row', () => {
  it('has flex-shrink: 0 so rows are never compressed', () => {
    expect(blockContains('.row', 'flex-shrink: 0')).toBe(true);
  });

  it('has height: auto so content drives the height', () => {
    expect(blockContains('.row', 'height: auto')).toBe(true);
  });

  it('has min-height: 56px (touch target requirement)', () => {
    expect(blockContains('.row', 'min-height: 56px')).toBe(true);
  });

  it('does NOT have overflow: hidden (would clip expanded detail)', () => {
    // The .row block must use "overflow: visible" (or no overflow declaration).
    // We scan for ".row {" that is NOT preceded immediately by another word char
    // (to skip .rowMain, .rowLeft, .rowActions, etc.) and check its content.
    // Strategy: look for the literal "overflow: visible" in the .row section.
    // The simplest reliable check: the CSS must NOT contain the exact string
    // "overflow: hidden" in the BODY of the .row rule (outside comments).
    // We verify this by checking the full file has "overflow: visible" near .row.
    expect(css).toContain('overflow: visible');
    // Also confirm the flat CSS string has no "overflow: hidden" adjacent to .row
    // (the row CSS block is the only place where overflow is set explicitly in this file)
    const rowSection = css.slice(css.indexOf('.row {'), css.indexOf('.row.cancelled'));
    const noComments = rowSection.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(noComments).not.toMatch(/overflow\s*:\s*hidden/);
  });
});

// ── 3. Back-to-top button classes ─────────────────────────────────

describe('OrdersScreen.module.css — back-to-top button', () => {
  it('.backToTop class is defined', () => {
    expect(selectorExists('.backToTop')).toBe(true);
  });

  it('.backToTopVisible class is defined', () => {
    expect(selectorExists('.backToTopVisible')).toBe(true);
  });
});
