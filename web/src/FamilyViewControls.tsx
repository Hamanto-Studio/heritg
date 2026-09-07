import { ChevronDown, GitBranch } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function FamilyViewControls({ label, mode, shortMode, personName, describedBy, hint, children }: {
  label: string;
  mode: string;
  shortMode: string;
  personName?: string;
  describedBy?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return <section className="family-view-controls" ref={root} aria-label={label}
    onClick={(event) => {
      if (event.target instanceof Element && event.target.closest("[data-view-option]")) {
        setOpen(false); trigger.current?.focus();
      }
    }}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}
    onKeyDown={(event) => {
      if (open && event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        setOpen(false); trigger.current?.focus();
      }
    }}>
    <button type="button" className="family-view-summary" ref={trigger}
      aria-label={`${label}: ${mode}${personName ? ` · ${personName}` : ""}`}
      aria-describedby={!open ? describedBy : undefined}
      aria-expanded={open} aria-controls={open ? panelId : undefined}
      onClick={() => setOpen(!open)}>
      <GitBranch aria-hidden="true" size={16} />
      <span className="family-view-summary-mode">{shortMode}</span>
      <ChevronDown aria-hidden="true" size={15} className="family-view-chevron" />
    </button>
    {!open ? hint : null}
    {open ? <div className="family-view-options" id={panelId}>{children}</div> : null}
  </section>;
}
