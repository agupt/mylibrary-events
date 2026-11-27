import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Library Storytime",
  description:
    "How mylibrary-events.com handles searches, analytics, feedback, cookies, and advertising.",
};

const EFFECTIVE_DATE = "November 26, 2026";

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
            search tool: there are no user accounts, sign-ups, profiles, or
            messaging features.
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

        <Section title="Usage analytics">
          <p>
            We use PostHog to count how the site is used — pages viewed,
            which site referred you, whether a search found your location,
            which libraries came up without a connected calendar, filter use,
            and clicks through to a library&rsquo;s website. This tells us
            which libraries to add next and whether the site works.
          </p>
          <p>
            Each page view is labeled with the kind of page it is (home,
            state, city, library, and so on) and, where it applies, the state,
            the city, and the public library ID shown on that page. On those
            pages we also count whether the events list loaded and how many
            events it showed, and which of our links were clicked: the kind
            of link (for example &ldquo;nearby city&rdquo; or
            &ldquo;breadcrumb&rdquo;) and the kind of page it leads to, or,
            for links to other sites, only that site&rsquo;s domain name.
            These counts help us see which pages are useful and which
            aren&rsquo;t. They contain nothing you type, and for a clicked
            link we record only the kind of page or the other site&rsquo;s
            domain, never the full link.
          </p>
          <p>
            Analytics run in <strong>cookieless mode</strong>: no cookies,
            local storage, or other identifiers are stored in your browser,
            and we don&rsquo;t build user profiles. The text you type into
            the search box is not sent to analytics — only whether it was a
            city or a zip code and which library system it matched. IP
            addresses are discarded by PostHog before storage.
          </p>
          <p>
            We also count visits from known AI search crawlers (for example
            GPTBot or ClaudeBot) by their published user-agent name, to see
            whether answer engines read this site. That count contains no
            visitor information, and we send it without an IP address.
          </p>
        </Section>

        <Section title="Feedback you send">
          <p>
            When a search doesn&rsquo;t find what you need, you can send a
            short note. It is sent without your name or IP address, together
            with the library system you searched near, and is used only to
            decide what to add or fix. Before it leaves your browser, email
            addresses, phone numbers, and long ID-like numbers are removed and
            the note is shortened to 500 characters. That filter can&rsquo;t
            catch everything (names or street addresses, for example), so
            please don&rsquo;t include personal details.
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
            from children under 13. The site has no accounts or comments; the
            only free-text field is the optional feedback note described
            above, which is filtered for contact details before sending.
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
          data-analytics-slot="finder"
          className="text-sm font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
        >
          ← Back to search
        </Link>
      </main>
    </div>
  );
}
