// Local-only visual fixture. No app store, network requests, or family archives.
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { FamilyExplorer } from "../../src/FamilyExplorer";
import { createTranslator } from "../../src/i18n";
import { SvgTreeCanvas } from "../../src/SvgTreeCanvas";
import type { TreeCanvasHandle } from "../../src/TreeCanvas";
import type { Person, FamilyRelationship } from "../../src/types";
import "../../src/base.css";
import "../../src/shell.css";
import "../../src/canvas-actions.css";
import "../../src/responsive.css";
import "../../src/svg-canvas.css";

function Fixture() {
  const [mode, setMode] = useState<"fan" | "focus" | "full">("fan");
  const [long, setLong] = useState(false);
  const canvas = useRef<TreeCanvasHandle>(null);
  const [selected, setSelected] = useState<string>();
  const [language, setLanguage] = useState<"en" | "id">("en");
  const t = createTranslator(language);
  const ids = ["Current", "Parent A", "Parent B", "Grandparent A", "Grandparent B", ...Array.from({ length: 20 }, (_, i) => "Child " + (i + 1))];
  const people: Person[] = ids.map((id) => ({ id, displayName: id + (long ? " — VeryLongUnbrokenFamilyName".repeat(6) + " 王明👨‍👩‍👧‍👦" : ""),
    treeId: "fixture", gender: "unspecified", createdAt: "2026-01-01", birthDatePrecision: "year", birthDate: "2000", notes: "", addressLine: "",
    city: long ? "VeryLongUnbrokenLocation".repeat(5) : "", province: "", country: "", postalCode: "" }));
  const edges = [["Parent A", "Current"], ["Parent B", "Current"], ["Grandparent A", "Parent A"], ["Grandparent B", "Parent B"], ...ids.slice(5).map((id) => ["Current", id])];
  const relationships: FamilyRelationship[] = edges.map(([from, to]) => ({ id: from + to, treeId: "fixture", kind: "parent", subtype: "biologicalParent", fromPersonId: from, toPersonId: to, createdAt: "2026-01-01" }));
  return <>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: 12, alignItems: "center" }}>
      <label>View <select aria-label="Fixture view" value={mode} onChange={(event) => { setMode(event.target.value as typeof mode); setSelected(undefined); }}>
        <option value="fan">Fan</option><option value="focus">Focus</option><option value="full">Full</option>
      </select></label>
      <label><input type="checkbox" checked={long} onChange={(event) => setLong(event.target.checked)} /> Long names</label>
      <label>Language <select value={language} onChange={(event) => setLanguage(event.target.value as "en" | "id")}><option value="en">English</option><option value="id">Indonesian</option></select></label>
    </div>
    {mode === "fan" ? <FamilyExplorer key={mode} mode={mode} people={people} relationships={relationships} initialPersonId="Current"
      selectedPersonId={selected} onSelect={(id) => setSelected((current) => current === id ? undefined : id)}
      actionsVisible onAdd={() => {}} onEdit={() => {}} onInteract={() => {}} onBackToTree={() => {}}
      language={language} t={t} /> : <div style={{ position: "absolute", inset: "96px 0 80px" }}>
      <SvgTreeCanvas key={mode} ref={canvas} treeId="fixture" treeTitle="Synthetic family" people={people} relationships={relationships}
        language={language} relationshipLanguage="en" t={t} actionsVisible selectedPersonId={selected}
        familyFocus={mode === "focus" ? { personId: selected ?? "Current", ancestors: 1, descendants: 1 } : undefined}
        generationLimits={{ ancestors: null, descendants: null }} onSelectPerson={(id) => { setSelected(id); if (mode === "full") canvas.current?.focusPerson(id); }}
        onDeselectPerson={() => setSelected(undefined)} onAddRelative={() => {}} onEditPerson={() => {}} onCanvasInteract={() => {}} onViewportChange={() => {}} />
    </div>}
  </>;
}

const root = createRoot(document.getElementById("root")!);
root.render(<Fixture />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
