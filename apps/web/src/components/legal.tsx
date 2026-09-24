/**
 * The frame for the public legal pages — privacy policy, account deletion:
 * one narrow column, the app's name above the title, the date below it.
 * Lives outside app/ because a page file may export nothing but the page.
 */
export function Legal({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen justify-center px-6 py-12">
      <article className="w-full max-w-2xl">
        <p className="text-[12.5px] font-medium tracking-wide text-muted uppercase">SLK Mobile · Sree Lakshmi Kalamkari</p>
        <h1 className="mt-1 text-[24px] leading-tight font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-[12.5px] text-muted">Last updated {updated}</p>
        <div className="legal mt-7 text-[14.5px] leading-relaxed text-ink [&_h2]:mt-7 [&_h2]:mb-2 [&_h2]:text-[16px] [&_h2]:font-semibold [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1.5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5">
          {children}
        </div>
      </article>
    </div>
  );
}
