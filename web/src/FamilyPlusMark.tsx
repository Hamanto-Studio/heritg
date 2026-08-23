import { BadgePlus } from "lucide-react";

export function FamilyPlusMark({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <BadgePlus
      aria-hidden="true"
      className={["family-plus-mark", className].filter(Boolean).join(" ")}
      size={size}
      strokeWidth={1.9}
    />
  );
}

export function FamilyPlusWordmark() {
  return <span className="family-plus-wordmark">Heritg Family+</span>;
}
