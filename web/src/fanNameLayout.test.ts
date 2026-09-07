import { describe, expect, it } from "vitest";
import { estimateName, fitFanName } from "./fanNameLayout";
import { fanLabelLayout } from "./explorerChartGeometry";

describe('complete fan names', () => {
  it.each(['Sukamto', 'Alya Maharani', 'Raden Dwi Saputra', 'A Very Long Family Member Name With Several Words',
    'VeryLongUnbrokenFamilyName'.repeat(10), '王明 陳麗華 👨‍👩‍👧‍👦', 'A\t  B\nC'])('fits every word of %s without truncation', (name) => {
    for (const box of [{ width: 76, height: 56 }, { width: 14, height: 48 }, { width: 140, height: 96 }]) {
      const result = fitFanName(name, box, 20);
      expect(result.lines.join(' ')).toBe(name.trim().replace(/\s+/gu, ' '));
      expect(result.lines.length).toBeLessThanOrEqual(3);
      expect(result.fontSize).toBeGreaterThan(0);
      expect(result.lines.every((line) => estimateName(line) * result.fontSize <= box.width)).toBe(true);
      expect(result.lines.length * result.lineHeight).toBeLessThanOrEqual(box.height + 0.00001);
      expect(result.lines.join('')).not.toContain('…');
    }
  });
  it('wraps on spaces instead of splitting a name component and uses measured font widths', () => {
    const measure = (s: string) => [...s].reduce((sum, c) => sum + (c === 'W' ? 1.1 : 0.5), 0);
    const result = fitFanName('Maharani Dwi Saputra', { width: 76, height: 56 }, 20, measure);
    expect(result.lines).toEqual(['Maharani', 'Dwi', 'Saputra']);
    expect(result.fontSize).toBeLessThan(20);
    expect(result.lines.every((line) => measure(line) * result.fontSize <= 76)).toBe(true);
  });
  it('keeps names in even very narrow ancestor segments instead of dropping their text', () => {
    for (let i = 0; i < 128; i++) {
      const box = fanLabelLayout({ key: String(i), depth: 5, start: i / 128, end: (i + 1) / 128, repeat: false }, 0, 0);
      const result = fitFanName('Full Ancestor Name', box, 12);
      expect(result.lines.join(' ')).toBe('Full Ancestor Name');
      expect(result.fontSize).toBeGreaterThan(0);
    }
  });
});
