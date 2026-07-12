import { StorytimeFinder } from "@/components/StorytimeFinder";

export default function Home() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-10">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          📚 Library Storytime
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Find storytimes and kids&apos; events at your local library. Enter
          your city or zip code to get started.
        </p>
      </header>
      <StorytimeFinder />
    </main>
  );
}
