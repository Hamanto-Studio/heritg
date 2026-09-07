export type MeasureName = (text: string) => number;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
// Conservative fallback until the browser font is ready; widths are in em.
export const estimateName: MeasureName = (text) => Array.from(graphemes.segment(text)).length;

/** Complete words, one to three lines, no ellipses or hidden suffixes. */
export function fitFanName(name: string, box: { width: number; height: number }, preferredSize: number, measure: MeasureName = estimateName) {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return { lines: [], fontSize: preferredSize, lineHeight: preferredSize * 1.2 };
  const widths = words.map(measure), space = measure(" ");
  const wrap = (limit: number) => {
    const lines: string[] = [];
    let line = "", width = 0;
    words.forEach((word, i) => {
      const next = widths[i] + (line ? space : 0);
      if (line && width + next > limit) { lines.push(line); line = word; width = widths[i]; }
      else { line += (line ? " " : "") + word; width += next; }
    });
    if (line) lines.push(line);
    return lines;
  };
  let best = { lines: [words.join(" ")], fontSize: 0, lineHeight: 0 };
  for (let count = 1; count <= Math.min(3, words.length); count++) {
    let low = Math.max(...widths), high = widths.reduce((sum, value) => sum + value, 0) + space * words.length;
    for (let pass = 0; pass < 18; pass++) {
      const middle = (low + high) / 2;
      if (wrap(middle).length <= count) high = middle; else low = middle;
    }
    const lines = wrap(high);
    // Measure complete lines too, so kerning and ligatures cannot clip a name.
    const longest = Math.max(...lines.map(measure), 0.001);
    const fontSize = Math.min(preferredSize, box.width / (longest * 1.06), box.height / (lines.length * 1.2));
    if (fontSize > best.fontSize + 0.001) best = { lines, fontSize, lineHeight: fontSize * 1.2 };
  }
  return best;
}
