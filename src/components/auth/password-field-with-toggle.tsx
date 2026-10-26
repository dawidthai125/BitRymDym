"use client";

import { useId, useState } from "react";

import { AUTH_FIELD_CLASS } from "@/components/auth/auth-field-class";
import { Button } from "@/components/ui/button";

type PasswordFieldWithToggleProps = {
  label: string;
  name: string;
  autoComplete: string;
  required?: boolean;
  minLength?: number;
  /** Accessible name when the value is hidden. */
  showLabel?: string;
  /** Accessible name when the value is visible. */
  hideLabel?: string;
};

/**
 * Auth password input with show/hide toggle.
 * Local UI state only — does not log or persist the value.
 */
export function PasswordFieldWithToggle({
  label,
  name,
  autoComplete,
  required = false,
  minLength,
  showLabel = "Pokaż hasło",
  hideLabel = "Ukryj hasło",
}: PasswordFieldWithToggleProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? hideLabel : showLabel;

  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={id}>{label}</label>
      <div className="relative w-full">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          className={`${AUTH_FIELD_CLASS} pr-12`}
        />
        <Button
          type="button"
          variant="ghost"
          className="absolute top-0 right-0 h-11 w-11 min-h-11 min-w-11 shrink-0 p-0"
          aria-label={toggleLabel}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((prev) => !prev)}
        >
          <span aria-hidden="true" className="text-xs font-medium">
            {visible ? "Ukryj" : "Pokaż"}
          </span>
        </Button>
      </div>
    </div>
  );
}
