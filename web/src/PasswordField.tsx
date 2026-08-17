import { Check, Eye, EyeOff, X } from "lucide-react";
import { useState, type KeyboardEventHandler } from "react";

import type { PasswordRequirementsState } from "./passwordPolicy";

export function PasswordRequirementList({
  label,
  requirements,
  items,
  highlightUnmet = false
}: {
  label: string;
  requirements: PasswordRequirementsState;
  items: readonly (readonly [keyof PasswordRequirementsState, string])[];
  highlightUnmet?: boolean;
}) {
  return (
    <div aria-label={label} aria-live="polite" className="password-requirements">
      {items.map(([key, itemLabel]) => {
        const met = requirements[key];
        return (
          <div
            className="password-requirement"
            data-highlight-unmet={highlightUnmet}
            data-met={met}
            key={key}
          >
            <span aria-hidden="true" className="password-requirement-icon">
              {met ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={2.5} />}
            </span>
            <span>{itemLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  maxLength,
  help,
  error,
  showLabel,
  hideLabel,
  id,
  autoFocus,
  onKeyDown
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "new-password" | "current-password";
  disabled?: boolean;
  maxLength?: number;
  help?: string;
  error?: string;
  showLabel: string;
  hideLabel: string;
  id: string;
  autoFocus?: boolean;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
}) {
  const [visible, setVisible] = useState(false);
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <label className={`field password-field ${error ? "has-error" : ""}`}>
      {label}
      <span className="password-input-wrap">
        <input
          aria-describedby={[helpId, errorId].filter(Boolean).join(" ") || undefined}
          aria-invalid={Boolean(error)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          disabled={disabled}
          id={id}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          type={visible ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={visible ? hideLabel : showLabel}
          className="password-visibility"
          disabled={disabled}
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          {visible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
        </button>
      </span>
      {help ? <small id={helpId}>{help}</small> : null}
      {error ? <small className="field-error" id={errorId} role="alert">{error}</small> : null}
    </label>
  );
}
