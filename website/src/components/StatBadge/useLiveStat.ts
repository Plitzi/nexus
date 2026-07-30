import { useEffect, useState } from 'react';

const TTL = 60 * 60 * 1000;

type Cached = {
  value: number;
  at: number;
  url: string;
  version: string;
};

// localStorage is scoped to the ORIGIN, not the path, so every site ever served from this GitHub Pages domain shares
// these keys. When the store moved out of the monorepo, the badge kept serving the old repository's star count under
// an unchanged key. So the entry carries its own identity: a release bump invalidates every cached stat, and a
// changed endpoint invalidates that one even without a release. Entries written before these fields existed have
// neither, so they read as a miss and are refetched.
const readCache = (key: string, url: string): number | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Cached;
    if (parsed.version !== __NEXUS_VERSION__ || parsed.url !== url || Date.now() - parsed.at > TTL) {
      return null;
    }

    return parsed.value;
  } catch {
    return null;
  }
};

const writeCache = (key: string, url: string, value: number) => {
  try {
    const entry: Cached = { value, at: Date.now(), url, version: __NEXUS_VERSION__ };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Ignore quota / privacy-mode failures — the badge just refetches next visit.
  }
};

// Fetches a single number from a public JSON endpoint, caching it in localStorage for an hour so repeat visits don't
// hammer the API (GitHub's unauthenticated limit is 60 req/h). `extract` pulls the number out of the parsed payload;
// returning null on any failure lets the badge render a graceful fallback instead of a broken count.
const useLiveStat = (cacheKey: string, url: string, extract: (data: unknown) => number | undefined) => {
  const [value, setValue] = useState<number | null>(() => readCache(cacheKey, url));

  useEffect(() => {
    if (value !== null) {
      return;
    }

    let active = true;
    fetch(url)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: unknown) => {
        const next = extract(data);
        if (active && typeof next === 'number') {
          setValue(next);
          writeCache(cacheKey, url, next);
        }
      })
      .catch(() => {
        // Network/rate-limit failure: leave value null so the badge shows its fallback.
      });

    return () => {
      active = false;
    };
  }, [cacheKey, url, extract, value]);

  return value;
};

export default useLiveStat;
