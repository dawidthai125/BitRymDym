import {
  EMAIL_CHANGE_NOTICE_COPY,
  type EmailChangeNoticeStatus,
} from "@/lib/auth/email-change";

export function EmailChangeNotice({
  status,
}: {
  status: EmailChangeNoticeStatus;
}) {
  const copy = EMAIL_CHANGE_NOTICE_COPY[status];
  return (
    <div
      className="space-y-1 border border-[var(--brd-line)] p-4"
      role="status"
    >
      <h2 className="text-base font-semibold text-[var(--brd-ink)]">
        {copy.title}
      </h2>
      <p className="text-sm leading-6 text-[var(--brd-ink-soft)]">{copy.body}</p>
    </div>
  );
}
