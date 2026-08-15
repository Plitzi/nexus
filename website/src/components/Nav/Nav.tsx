import { useCallback, useEffect, useState } from 'react';

import { DOCS_HOME } from '../Docs';
import Logo from '../Logo';
import ThemeToggle from '../ThemeToggle';
import { NAV_LINKS, NPM_URL, REPO_URL } from '../../content';
import { useHashRoute } from '../../useHashRoute';

const Nav = () => {
  const [activeId, setActiveId] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const hash = useHashRoute();
  const onDocs = hash.startsWith('#/docs');

  // Any navigation closes the sheet — every entry in it is a same-page hash link, so the route change is the only
  // signal that the visitor picked one.
  useEffect(() => setMenuOpen(false), [hash]);

  // Tapping the entry for the section you are already on leaves the hash untouched, so the effect above never fires.
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Re-attach the scrollspy on every route change. The landing sections unmount while the Docs view is shown and
  // remount as brand-new DOM nodes on return; an observer created once would keep watching the stale (detached) nodes
  // and freeze `activeId`. The `requestAnimationFrame` lets the freshly remounted sections lay out before we observe.
  useEffect(() => {
    let observer: IntersectionObserver | undefined;
    const attach = () => {
      if (hash.startsWith('#/docs')) {
        return;
      }

      const sections = NAV_LINKS.map(link => document.getElementById(link.href.slice(1))).filter(
        (el): el is HTMLElement => el !== null
      );

      if (sections.length === 0) {
        return;
      }

      const io = new IntersectionObserver(
        entries => {
          const visible = entries
            .filter(entry => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

          if (visible[0]) {
            setActiveId(visible[0].target.id);
          }
        },
        // Mark a section active once its middle band crosses the viewport center.
        { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.5, 1] }
      );

      sections.forEach(section => io.observe(section));
      observer = io;
    };

    const raf = requestAnimationFrame(attach);

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [hash]);

  return (
    <header className="border-ink-700/60 bg-ink-950/70 sticky top-0 z-50 border-b backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <a href="#top" className="flex items-center gap-2.5 font-semibold text-white">
          <Logo size={32} className="drop-shadow-md" />
          <span className="text-sm">@plitzi/nexus</span>
        </a>

        <div className="hidden items-center gap-0.5 whitespace-nowrap lg:flex">
          {NAV_LINKS.map(link => (
            <a
              key={link.href}
              href={link.href}
              aria-current={!onDocs && activeId === link.href.slice(1) ? 'true' : undefined}
              className={
                !onDocs && activeId === link.href.slice(1)
                  ? 'bg-ink-800 rounded-lg px-2.5 py-1.5 text-sm font-medium text-white'
                  : 'rounded-lg px-2.5 py-1.5 text-sm font-medium text-zinc-400 transition hover:text-white'
              }
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Docs stays in the always-visible cluster (from sm) so tablets keep it even when the quick-jump links above
              collapse below lg. */}
          <a
            href={DOCS_HOME}
            aria-current={onDocs ? 'true' : undefined}
            className={
              onDocs
                ? 'bg-ink-800 hidden rounded-lg px-2.5 py-1.5 text-sm font-medium text-white sm:block'
                : 'hidden rounded-lg px-2.5 py-1.5 text-sm font-medium text-zinc-400 transition hover:text-white sm:block'
            }
          >
            Docs
          </a>
          <ThemeToggle />
          <a
            href={NPM_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-lg px-2.5 py-1.5 text-sm font-medium text-zinc-400 transition hover:text-white sm:block"
          >
            npm
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="border-ink-600 bg-ink-800 hover:border-brand-500 hover:bg-ink-700 rounded-lg border px-3.5 py-1.5 text-sm font-medium text-white transition"
          >
            GitHub
          </a>

          <button
            type="button"
            onClick={() => setMenuOpen(open => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="border-ink-600 bg-ink-800 hover:border-brand-500 rounded-lg border p-2 text-zinc-300 transition lg:hidden"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </nav>

      {menuOpen && (
        // Dropped over the page rather than pushed into it: growing the sticky header would shift every section by the
        // sheet's height, and the anchor the visitor just tapped would land off by that much.
        <div
          id="mobile-menu"
          className="border-ink-700/60 bg-ink-950/95 absolute inset-x-0 top-full border-t backdrop-blur-xl lg:hidden"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-0.5 px-5 py-3">
            {NAV_LINKS.map(link => (
              <a
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                aria-current={!onDocs && activeId === link.href.slice(1) ? 'true' : undefined}
                className={
                  !onDocs && activeId === link.href.slice(1)
                    ? 'bg-ink-800 rounded-lg px-3 py-2.5 text-sm font-medium text-white'
                    : 'rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition hover:text-white'
                }
              >
                {link.label}
              </a>
            ))}

            <a
              href={DOCS_HOME}
              onClick={closeMenu}
              aria-current={onDocs ? 'true' : undefined}
              className={
                onDocs
                  ? 'bg-ink-800 rounded-lg px-3 py-2.5 text-sm font-medium text-white'
                  : 'rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition hover:text-white'
              }
            >
              Docs
            </a>
            <a
              href={NPM_URL}
              target="_blank"
              rel="noreferrer"
              onClick={closeMenu}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition hover:text-white"
            >
              npm ↗
            </a>
          </div>
        </div>
      )}
    </header>
  );
};

export default Nav;
