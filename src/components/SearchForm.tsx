"use client";

import { useState } from "react";

interface SearchFormProps {
  isLoading: boolean;
  onSearch: (query: string) => void;
}

export function SearchForm({ isLoading, onSearch }: SearchFormProps) {
  const [query, setQuery] = useState("");

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(query);
      }}
    >
      <div className="relative flex-1">
        <span
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="City, ST or zip code — try 94609 or Portland, OR"
          aria-label="City or zip code"
          className="w-full rounded-2xl border border-slate-200 bg-white/90 py-3.5 pl-11 pr-4 text-base shadow-lg shadow-violet-100/50 outline-none backdrop-blur transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-800/90 dark:shadow-none dark:focus:border-violet-500 dark:focus:ring-violet-500/20"
        />
      </div>
      <button
        type="submit"
        disabled={isLoading || query.trim().length === 0}
        className="rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-7 py-3.5 font-semibold text-white shadow-lg shadow-violet-200/60 transition hover:from-violet-500 hover:to-fuchsia-500 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 dark:shadow-none"
      >
        {isLoading ? "Searching…" : "Find events"}
      </button>
    </form>
  );
}
