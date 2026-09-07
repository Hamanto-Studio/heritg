// Developer-only fixture: no stored archives, credentials, or real family data.
import { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { SvgTreeCanvas } from "../../src/SvgTreeCanvas";
import type { TreeCanvasHandle } from "../../src/TreeCanvas";
import { createTranslator } from "../../src/i18n";
import { indonesianFamilyFixture, indonesianScenarios, reconnectedScenarios, type IndonesianFamilyScenario } from "../../src/testFixtures/indonesianFamilies";
import { cousinFamilyFixture } from "../../src/testFixtures/cousinFamilies";
import { crossGenerationFamilyFixture } from "../../src/testFixtures/crossGenerationFamilies";
import { relatedParentSetsFixture } from "../../src/testFixtures/relatedParentSets";
import { CanvasTargetDiagnostics } from "./CanvasTargetDiagnostics";
import "../../src/base.css";
import "../../src/shell.css";
import "../../src/canvas-actions.css";
import "../../src/responsive.css";
import "../../src/svg-canvas.css";

function LargeFamilyFixture() {
  const [size, setSize] = useState(100), [scenario, setScenario] = useState<IndonesianFamilyScenario>("multiple-wives");
  const [mode, setMode] = useState<"full" | "focus">("full"), [selected, setSelected] = useState<string>();
  const [seed, setSeed] = useState(0), [extraUnion, setExtraUnion] = useState<"none" | "cousin" | "cross-depth" | "related-parents">("none");
  const cousinAvailable = (size === 500 || size >= 100 && seed === 0) && ["extended", "compound", "interwoven"].includes(scenario);
  const crossDepthAvailable = size >= 100 && scenario === "compound";
  const relatedAvailable = size >= 15 && (scenario === "shared-adoption" || scenario === "shared-parent-sets");
  const union = extraUnion === "cousin" && cousinAvailable || extraUnion === "cross-depth" && crossDepthAvailable || extraUnion === "related-parents" && relatedAvailable ? extraUnion : "none";
  const data = useMemo(() => union === "cross-depth" ? crossGenerationFamilyFixture(size, seed)
    : union === "related-parents" ? relatedParentSetsFixture(size, scenario as "shared-adoption" | "shared-parent-sets", seed)
    : union === "cousin" ? cousinFamilyFixture(size, scenario, seed) : indonesianFamilyFixture(size, scenario, seed), [size, scenario, seed, union]);
  const canvas = useRef<TreeCanvasHandle>(null);
  const focus = useMemo(() => mode === "focus" ? { personId: selected ?? data.rootId, ancestors: 2, descendants: 2, siblings: true } : undefined, [mode, selected, data.rootId]);
  return <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
    <header style={{ padding: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", flexShrink: 0 }}>
      <strong>Data sintetis — {data.people.length} orang</strong>
      <label>Jumlah <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setSelected(undefined); }}>
        {[15, 100, 250, 500].map((n) => <option key={n}>{n}</option>)}
      </select></label>
      <label>Kombinasi <select value={scenario} onChange={(e) => { setScenario(e.target.value as IndonesianFamilyScenario); setSelected(undefined); }}>
        {[...indonesianScenarios, ...reconnectedScenarios].map((value) => <option key={value}>{value}</option>)}
      </select></label>
      <label>Varian <select value={seed} onChange={(e) => { setSeed(Number(e.target.value)); setSelected(undefined); }}>
        {[0, 2, 4].map((value) => <option key={value}>{value}</option>)}
      </select></label>
      <label style={{ maxWidth: "100%" }}>Koneksi tambahan <select style={{ maxWidth: "100%" }} value={union} onChange={(e) => { setExtraUnion(e.target.value as typeof extraUnion); setSelected(undefined); }}>
        <option value="none">Tidak ada</option>
        <option value="cousin" disabled={!cousinAvailable}>Sepupu sintetis</option>
        <option value="cross-depth" disabled={!crossDepthAvailable}>Beda kedalaman silsilah</option>
        <option value="related-parents" disabled={!relatedAvailable}>Orang tua kandung dan angkat bersaudara</option>
      </select></label>
      <label>Tampilan <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="full">Full</option><option value="focus">Focus</option></select></label>
      <button onClick={() => canvas.current?.fitAll()}>Muat semua</button>
      <button onClick={() => canvas.current?.zoomIn()}>Perbesar</button>
      <button onClick={() => canvas.current?.zoomOut()}>Perkecil</button>
    </header>
    <main style={{ position: "relative", flex: 1, minHeight: 0 }}>
      <SvgTreeCanvas key={`${size}:${scenario}:${seed}:${union}`} ref={canvas} treeId="synthetic-indonesia" treeTitle="Data sintetis"
        people={data.people} relationships={data.relationships} familyFocus={focus} generationLimits={{ ancestors: null, descendants: null }}
        language="id" relationshipLanguage="id" t={createTranslator("id")} readOnly selectedPersonId={selected}
        onSelectPerson={(id) => { setSelected(id); if (mode === "full") canvas.current?.focusPerson(id); }}
        onDeselectPerson={() => setSelected(undefined)} onCanvasInteract={() => {}} onAddRelative={() => {}} onEditPerson={() => {}} onViewportChange={() => {}} />
    </main>
    <CanvasTargetDiagnostics />
  </div>;
}
const root = createRoot(document.getElementById("root")!);
root.render(<LargeFamilyFixture />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
