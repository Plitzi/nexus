import { type CSSProperties, useCallback, useState } from 'react';

import Arcade from './Arcade';
import { useDockInset } from './dockStore';
import LogDock from './LogDock';
import { GITHUB_URL, INSTALL_COMMAND } from '../../content';
import { GithubStars, NpmDownloads } from '../StatBadge';

const Hero = () => {
  const [copied, setCopied] = useState(false);
  const dockInset = useDockInset();

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(INSTALL_COMMAND)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => setCopied(false));
  }, []);

  return (
    <section
      id="top"
      className="bg-noise relative flex w-full flex-col overflow-hidden xl:min-h-[94vh] xl:flex-row xl:items-center"
    >
      <div className="hero-wash pointer-events-none absolute inset-0" />

      {/* The arcade is one self-contained, movable component. Up to xl it stacks under the copy as a normal block that
          sizes itself; from xl — the first width where a 36rem column of copy and a half-width playfield both fit — it
          moves into the right column, shifted off the edge so it reads as a centered, framed playfield. There it also
          keeps the open log dock's width clear (`--dock-inset`), so the panel never sits on top of the cabinets; the
          arcade widens again, animated in step with the panel, the moment you collapse it. */}
      <div
        style={{ '--dock-inset': `${dockInset}px` } as CSSProperties}
        className="relative order-2 mx-auto w-full max-w-400 pb-12 xl:absolute xl:inset-y-0 xl:right-12 xl:order-0 xl:mx-0 xl:w-[52%] xl:max-w-none xl:pr-(--dock-inset) xl:pb-0 xl:transition-[padding] xl:duration-300 xl:ease-out"
      >
        <Arcade />
      </div>

      <div className="from-ink-950 pointer-events-none absolute inset-x-0 bottom-0 hidden h-24 bg-linear-to-t to-transparent xl:block" />

      <LogDock />

      <div className="pointer-events-none relative z-10 order-1 mx-auto w-full max-w-400 px-6 pt-20 pb-10 xl:order-0 xl:px-12 xl:py-28">
        <div className="max-w-xl">
          <div className="border-ink-700 bg-ink-900/70 pointer-events-auto inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-zinc-300 backdrop-blur">
            <span className="live-dot bg-brand-400 h-1.5 w-1.5 rounded-full" />
            Next-generation state management
          </div>

          <h1 className="mt-6 text-4xl leading-[0.95] font-extrabold tracking-tight text-white sm:text-6xl xl:text-7xl">
            Give your state
            <br />
            <span className="text-gradient">an address.</span>
          </h1>

          <p className="mt-6 max-w-lg text-lg leading-relaxed text-zinc-300/90">
            Reach any value by its path — get it, set it, watch it — and re-render only what changed. One agnostic core,
            first-class bindings for <span className="text-white">React and Vue</span>. This whole arcade is a single
            Nexus store: the scoreboard reads it, the logger streams every write.
          </p>

          <div className="pointer-events-auto mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
            <a
              href="#core-api"
              className="bg-brand-600 shadow-brand-900/50 hover:bg-brand-500 rounded-xl px-6 py-3.5 text-center text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5"
            >
              Start building →
            </a>
            <button
              onClick={handleCopy}
              className="group border-ink-600 bg-ink-900/70 hover:border-brand-500 flex items-center gap-3 rounded-xl border px-4 py-3.5 font-mono text-sm text-zinc-200 backdrop-blur transition"
            >
              <span className="text-brand-400">$</span>
              {INSTALL_COMMAND}
              <span className="group-hover:text-brand-300 ml-1 text-xs text-zinc-500">
                {copied ? 'copied!' : 'copy'}
              </span>
            </button>
          </div>

          <div className="pointer-events-auto mt-8 flex flex-wrap items-center gap-3">
            <GithubStars />
            <NpmDownloads />
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-zinc-500 transition hover:text-zinc-300"
            >
              View source →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
