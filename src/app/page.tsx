import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { DemoButton } from '@/components/shell/demo-button';
import { LogoMark } from '@/components/ui/icons';

export const dynamic = 'force-dynamic';

const QUESTIONS = [
  { q: 'What happened?', a: 'Spend, conversions, CPA and ROAS for the period, against the equal-length period before it.' },
  { q: 'Which campaigns need a look?', a: 'A queue of rule-based flags, each with the numbers and the rule that triggered it.' },
  { q: 'What should I check next?', a: 'One practical next step per flag. Observations, never claimed causes.' },
  { q: 'What can I tell the client?', a: 'A summary split into what the data supports and what needs a caveat.' },
];

export default async function LandingPage() {
  if (await getSessionUser()) redirect('/clients');

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[1.05rem] font-semibold tracking-tight">
          <LogoMark />
          CampaignLens
        </span>
        <Link href="/sign-in" className="btn btn-sm">
          Sign in
        </Link>
      </header>

      <main className="grid flex-1 items-center gap-10 py-10 md:grid-cols-[1.15fr_1fr] md:gap-14">
        <div>
          <p className="eyebrow">For agency account managers</p>
          <h1 className="display mt-3 text-[2.3rem] leading-[1.1] sm:text-[2.9rem]">Walk into the client review knowing what changed, and what you can stand behind.</h1>
          <p className="mt-4 max-w-xl text-[1.02rem] text-ink-2">
            CampaignLens turns campaign exports into a checked performance view, a budget pacing read, a short list of things to investigate, and a branded report you can share.
          </p>
          <div className="mt-6 flex flex-wrap items-start gap-3">
            <DemoButton />
            <Link href="/sign-up" className="btn">
              Create a workspace
            </Link>
          </div>
          <p className="muted mt-3 max-w-xl text-[0.85rem]">
            The demo opens a private sandbox with three fictional clients and 90 days of synthetic data. No account, ad platform connection or API key is needed.
          </p>
        </div>

        <section aria-label="What the workspace answers" className="panel">
          <ol className="divide-y divide-line">
            {QUESTIONS.map((item, i) => (
              <li key={item.q} className="flex gap-3.5 px-5 py-4">
                <span className="num mt-0.5 text-[0.8rem] font-semibold text-brand">0{i + 1}</span>
                <div>
                  <p className="font-semibold">{item.q}</p>
                  <p className="muted mt-0.5 text-[0.9rem]">{item.a}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="muted border-t border-line pt-4 text-[0.8rem]">
        Figures are platform-reported. ROAS is not profit, and nothing here proves incremental impact. Summaries are rule-based, not AI-generated.
      </footer>
    </div>
  );
}
