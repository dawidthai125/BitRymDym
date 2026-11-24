import Link from "@/components/ui/app-link";

/**
 * A creator's name. A link to the public profile when that profile is on (`href`), plain text
 * otherwise. `label` is a sentence around the name ("Autor: X"): only the name is the link.
 * `relative z-10` keeps it clickable on a card whose title link covers the whole card; never put
 * it inside another link.
 */
export function AuthorName({
  name,
  href,
  label,
  className,
}: {
  name: string;
  href?: string | null;
  label?: string;
  className?: string;
}) {
  const text = label ?? name;
  if (!href) return className ? <span className={className}>{text}</span> : <>{text}</>;
  const at = text.lastIndexOf(name);
  const [before, shown, after] = at >= 0 && name ? [text.slice(0, at), name, text.slice(at + name.length)] : ["", text, ""];
  return (
    <span className={className}>
      {before}
      <Link
        href={href}
        className="relative z-10 py-2 underline decoration-dotted underline-offset-4 hover:text-[var(--brd-ink)] hover:decoration-solid"
        data-testid="author-link"
      >
        {shown}
      </Link>
      {after}
    </span>
  );
}
