import { Eye, EyeOff } from "lucide-react";
import { useState, type KeyboardEventHandler } from "react";

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
