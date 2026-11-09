/**
 * Tests for the money helper (electron/utils/money.js)
 */
import { describe, it, expect } from 'vitest';
import { toMinor, fromMinor, format } from '../electron/utils/money.js';

describe('money helpers', () => {
  describe('toMinor', () => {
    it('converts decimal to integer minor units', () => {
      expect(toMinor(12.5)).toBe(1250);
      expect(toMinor(250.5)).toBe(25050);
      expect(toMinor(0)).toBe(0);
      expect(toMinor(1)).toBe(100);
    });

    it('handles string input', () => {
      expect(toMinor('12.50')).toBe(1250);
      expect(toMinor('0.01')).toBe(1);
    });

    it('handles null/undefined/empty', () => {
      expect(toMinor(null)).toBe(0);
      expect(toMinor(undefined)).toBe(0);
      expect(toMinor('')).toBe(0);
    });

    it('rounds floating-point noise', () => {
      // 0.1 + 0.2 = 0.30000000000000004 in JS float
      expect(toMinor(0.1 + 0.2)).toBe(30);
    });

    it('avoids 12.505 → 1250 float trap', () => {
      expect(toMinor(12.505)).toBe(1251);
    });
  });

  describe('fromMinor', () => {
    it('converts minor units to decimal', () => {
      expect(fromMinor(1250)).toBe(12.5);
      expect(fromMinor(25050)).toBe(250.5);
      expect(fromMinor(0)).toBe(0);
    });

    it('handles null/undefined', () => {
      expect(fromMinor(null)).toBe(0);
      expect(fromMinor(undefined)).toBe(0);
    });
  });

  describe('format', () => {
    it('formats with 2 decimal places', () => {
      expect(format(25050)).toBe('250.50');
      expect(format(100)).toBe('1.00');
      expect(format(1)).toBe('0.01');
      expect(format(0)).toBe('0.00');
    });

    it('handles null/undefined', () => {
      expect(format(null)).toBe('0.00');
      expect(format(undefined)).toBe('0.00');
    });
  });
});
