import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Library Storytime",
  description:
    "How mylibrary-events.com handles searches, cookies, and advertising.",
};

const EFFECTIVE_DATE = "July 14, 2026";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-200">
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-14 sm:pt-20">
        <header className="mb-10">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Effective {EFFECTIVE_DATE} · applies to mylibrary-events.com
          </p>
        </header>

        <Section title="What this site does">
          <p>
            Library Storytime helps parents and caregivers find free
            storytimes and kids&rsquo; events at US public libraries. It is a
            read-only search tool: there are no user accounts, sign-ups,
            profiles, or messaging features.
          </p>
        </Section>

        <Section title="Information we process">
          <p>
            <strong>Search queries.</strong> When you search by city or zip
            code, that query is sent to our server to find matching libraries
            and events. Queries are processed transiently and are not linked
            to your identity. We do not ask for or store your name, email
            address, or precise location.
          </p>
          <p>
            <strong>Server and network logs.</strong> Like nearly every
            website, our hosting provider (Fly.io) and content delivery
            network (Cloudflare) generate standard technical logs — IP
            address, browser type, pages requested, timestamps — used for
            security, debugging, and capacity planning. These logs are
            retained briefly and are not used to build visitor profiles.
          </p>
          <p>
            <strong>Caching.</strong> Responses are cached by Cloudflare and
            on our servers to keep the site fast. Caches store event and
            library data, not information about you.
          </p>
        </Section>

        <Section title="Advertising and cookies">
          <p>
            We use Google AdSense to show advertisements, which is how the
            site stays free. Google and its partners may use cookies and
            similar technologies to serve and measure ads. Where required,
            ads are served on a non-personalized basis.
          </p>
          <p>
            Because this site&rsquo;s content concerns children&rsquo;s
            events, we apply Google&rsquo;s child-directed treatment settings
            to ad requests, which disables personalized advertising for this
            site&rsquo;s ad inventory.
          </p>
          <p>
            You can learn how Google uses data from sites like this one at{" "}
            <a
              href="https://policies.google.com/technologies/partner-sites"
              className="underline underline-offset-2"
            >
              policies.google.com/technologies/partner-sites
            </a>{" "}
            and manage ad preferences at{" "}
            <a
              href="https://adssettings.google.com"
              className="underline underline-offset-2"
            >
              adssettings.google.com
            </a>
            . Most browsers also let you block or delete cookies entirely; the
            site works fine without them.
          </p>
        </Section>

        <Section title="Children's privacy">
          <p>
            The site is intended for parents, caregivers, and educators — not
            for children. We do not knowingly collect personal information
            from children under 13, and the site has no features (accounts,
            comments, forms) through which anyone could submit personal
            information.
          </p>
        </Section>

        <Section title="Where the data comes from">
          <p>
            Library locations come from the{" "}
            <a
              href="https://www.imls.gov/research-evaluation/data-collection/public-libraries-survey"
              className="underline underline-offset-2"
            >
              IMLS Public Libraries Survey
            </a>
            ; zip code geography comes from GeoNames; event listings are
            fetched live from each library system&rsquo;s public calendar.
            Events belong to their libraries — always confirm details on the
            library&rsquo;s own website.
          </p>
        </Section>

        <Section title="Changes and contact">
          <p>
            If this policy changes, the new version will be posted here with
            an updated effective date. Questions can be sent to{" "}
            <a
              href="mailto:privacy@mylibrary-events.com"
              className="underline underline-offset-2"
            >
              privacy@mylibrary-events.com
            </a>
            .
          </p>
        </Section>

        <Link
          href="/"
          className="text-sm font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
        >
          ← Back to search
        </Link>
      </main>
    </div>
  );
}
