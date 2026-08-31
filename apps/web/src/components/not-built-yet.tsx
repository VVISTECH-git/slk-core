import Link from "next/link";

/**
 * A screen the prototype has and this app does not yet. Says what it will be
 * and what it is waiting on, rather than pretending to be under construction.
 */
export function NotBuiltYet({
  title,
  what,
  waitingOn,
}: {
  title: string;
  what: string;
  waitingOn: string;
}) {
  return (
    <div className="mx-auto max-w-2xl px-8 py-16">
      <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-faint">
        Not built yet
      </p>
      <h1 className="mb-3 text-[27px] font-semibold tracking-tight text-ink">
        {title}
      </h1>
      <p className="mb-4 text-[15px] leading-relaxed text-ink-2">{what}</p>
      <p className="mb-8 text-[14px] leading-relaxed text-muted">
        Waiting on {waitingOn}
      </p>
      <Link
        href="/vocabulary"
        className="inline-block rounded-md bg-brick px-4 py-2 text-[14px] font-medium text-on-brick hover:bg-brick-2"
      >
        Categories &amp; Attributes
      </Link>
    </div>
  );
}
