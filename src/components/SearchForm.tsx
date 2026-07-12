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
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(query);
      }}
    >
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="City, ST or zip code (e.g. Oakland, CA or 94110)"
        aria-label="City or zip code"
        className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
      <button
        type="submit"
        disabled={isLoading || query.trim().length === 0}
        className="rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? "Searching…" : "Find Libraries"}
      </button>
    </form>
  );
}
