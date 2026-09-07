import { useState } from "react";

/** Read-only measurements of the synthetic canvas, including native Safari
 * where the browser automation bridge cannot inspect the DOM directly. */
export function CanvasTargetDiagnostics() {
  const [report, setReport] = useState<string>();
  const inspect = () => {
    const layer = document.querySelector<HTMLElement>(".canvas-actions-scene");
    const overlay = document.querySelector<HTMLElement>(".canvas-actions");
    const buttons = [...document.querySelectorAll<HTMLElement>(".canvas-person-hit")];
    const style = layer && getComputedStyle(layer);
    const rectangles = buttons.map((button) => button.getBoundingClientRect());
    const round = (value: number) => Math.round(value * 1000) / 1000;
    const samples = [...new Set([0, Math.floor(buttons.length / 2), buttons.length - 1])].filter((index) => index >= 0 && buttons[index]);
    setReport(JSON.stringify({
      pageVisibility: document.visibilityState,
      overlay: overlay && { overflow: getComputedStyle(overlay).overflow,
        scrollLeft: overlay.scrollLeft, scrollTop: overlay.scrollTop },
      count: buttons.length, layer: style && { visibility: style.visibility, transform: style.transform,
        width: style.width, height: style.height, hitScale: style.getPropertyValue("--canvas-hit-scale") },
      samples: samples.map((index) => {
        const button = buttons[index], box = rectangles[index], x = box.x + box.width / 2, y = box.y + box.height / 2;
        return { id: button.dataset.canvasPerson, visibility: getComputedStyle(button).visibility,
          box: [box.x, box.y, box.width, box.height].map(round),
          hit: document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-canvas-person]")?.dataset.canvasPerson ?? null };
      })
    }, null, 2));
  };
  return <aside style={{ position: "fixed", right: 12, bottom: 12, zIndex: 30, maxWidth: "calc(100% - 24px)" }}>
    <button onClick={inspect}>Diagnostik tombol</button>
    {report ? <div style={{ background: "#fffdf8", color: "#302b25", padding: 12, border: "1px solid #d6c7b6", maxHeight: "60vh", overflow: "auto" }}>
      <button onClick={() => setReport(undefined)}>Tutup diagnostik</button>
      <div role="status" style={{ fontFamily: "monospace", overflowWrap: "anywhere", fontSize: 12 }}>
        {report.split("\n").map((line, index) => <div key={index}>{line}</div>)}
      </div>
    </div> : null}
  </aside>;
}
