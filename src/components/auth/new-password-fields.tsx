"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { PasswordFieldWithToggle } from "@/components/auth/password-field-with-toggle";
import { PASSWORD_MIN_LENGTH, passwordChecks } from "@/lib/auth/password-policy";

type RuleState = "ok" | "bad" | "todo";

/**
 * New password + repeat, with the rules shown and ticked off while typing.
 * Local UI state only — does not log or persist the value.
 */
export function NewPasswordFields({
  name,
  label,
  confirmLabel,
}: {
  name: "password" | "newPassword";
  label: string;
  confirmLabel: string;
}) {
  const t = useTranslations("auth.newPasswordFields");
  const tf = useTranslations("auth.authForms");
  const rulesId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onReset = () => {
      setPassword("");
      setConfirm("");
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  const checks = passwordChecks(password, confirm);
  const rule = (ok: boolean, started: boolean): RuleState =>
    ok ? "ok" : started ? "bad" : "todo";
  const rules: { id: string; state: RuleState; text: string }[] = [
    {
      id: "length",
      state: rule(checks.length, password.length > 0),
      text:
        password.length > 0 && !checks.length
          ? t("dlugoscMasz", { min: PASSWORD_MIN_LENGTH, n: password.length })
          : t("dlugosc", { min: PASSWORD_MIN_LENGTH }),
    },
    ...(checks.notTooLong
      ? []
      : [{ id: "max", state: "bad" as const, text: t("zaDlugie") }]),
    {
      id: "match",
      state: rule(checks.match, confirm.length > 0),
      text: confirm.length > 0 && !checks.match ? t("rozne") : t("takieSame"),
    },
  ];

  return (
    <div ref={ref} className="flex flex-col gap-3">
      <PasswordFieldWithToggle
        label={label}
        name={name}
        required
        minLength={PASSWORD_MIN_LENGTH}
        autoComplete="new-password"
        value={password}
        onValueChange={setPassword}
        describedBy={rulesId}
      />
      <PasswordFieldWithToggle
        label={confirmLabel}
        name="confirmPassword"
        required
        minLength={PASSWORD_MIN_LENGTH}
        autoComplete="new-password"
        value={confirm}
        onValueChange={setConfirm}
        showLabel={tf("pokazPowtorzoneHaslo")}
        hideLabel={tf("ukryjPowtorzoneHaslo")}
        describedBy={rulesId}
      />
      <div id={rulesId} className="text-sm" data-testid="password-rules">
        <p className="text-muted-foreground">{t("haslo")}</p>
        <ul className="mt-1 flex flex-col gap-1">
          {rules.map((r) => (
            <li
              key={r.id}
              data-rule={r.id}
              data-state={r.state}
              className={
                r.state === "bad"
                  ? "flex gap-2 text-destructive"
                  : r.state === "ok"
                    ? "flex gap-2 text-foreground"
                    : "flex gap-2 text-muted-foreground"
              }
            >
              <span aria-hidden="true" className="w-4 shrink-0 text-center">
                {r.state === "ok" ? "✓" : r.state === "bad" ? "✗" : "•"}
              </span>
              <span>
                {r.text}
                {r.state === "todo" ? null : (
                  <span className="sr-only">
                    {" "}
                    {t(r.state === "ok" ? "spelnione" : "niespelnione")}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
