"use client";

import {
  useEffect,
  useRef,
  type ChangeEventHandler,
  type InputHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

type BrdCheckboxProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "className"
> & {
  /** Visual indeterminate (partial select-all). Native input.indeterminate. */
  indeterminate?: boolean;
  className?: string;
  /** Optional class for the 44px hit-area wrapper. */
  wrapperClassName?: string;
};

/**
 * Brand checkbox — cream/paper + bottle green.
 * Native input kept for a11y / keyboard; visual chrome is custom.
 */
export function BrdCheckbox({
  indeterminate = false,
  className,
  wrapperClassName,
  disabled,
  onChange,
  ...props
}: BrdCheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    onChange?.(event);
  };

  return (
    <span
      className={cn(
        "relative inline-flex size-11 shrink-0 items-center justify-center",
        wrapperClassName,
      )}
    >
      <input
        ref={inputRef}
        type="checkbox"
        disabled={disabled}
        onChange={handleChange}
        className={cn(
          "peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0",
          "disabled:cursor-not-allowed",
          className,
        )}
        {...props}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none relative flex size-[1.125rem] items-center justify-center",
          "rounded-[var(--brd-r-xs)] border border-[var(--brd-green)] bg-[var(--brd-paper)]",
          "transition-colors duration-100",
          "peer-hover:border-[var(--brd-green-soft)] peer-hover:bg-[var(--brd-green-wash)]",
          "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--brd-green-soft)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--brd-paper)]",
          "peer-checked:border-[var(--brd-green)] peer-checked:bg-[var(--brd-green)]",
          "peer-checked:peer-hover:border-[var(--brd-green-soft)] peer-checked:peer-hover:bg-[var(--brd-green-soft)]",
          "peer-indeterminate:border-[var(--brd-green)] peer-indeterminate:bg-[var(--brd-green)]",
          "peer-indeterminate:peer-hover:border-[var(--brd-green-soft)] peer-indeterminate:peer-hover:bg-[var(--brd-green-soft)]",
          "peer-disabled:opacity-45",
          "peer-checked:[&_svg[data-mark=check]]:opacity-100",
          "peer-indeterminate:[&_svg[data-mark=dash]]:opacity-100",
          "peer-indeterminate:[&_svg[data-mark=check]]:opacity-0",
        )}
      >
        <svg
          data-mark="check"
          viewBox="0 0 12 12"
          className="size-3 opacity-0 text-[var(--brd-paper)] transition-opacity duration-100"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 6.2 4.8 8.5 9.5 3.5" />
        </svg>
        <svg
          data-mark="dash"
          viewBox="0 0 12 12"
          className="absolute size-3 opacity-0 text-[var(--brd-paper)] transition-opacity duration-100"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M3 6h6" />
        </svg>
      </span>
    </span>
  );
}
