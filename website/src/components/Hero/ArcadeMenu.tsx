import { type GameDef } from './heroGames';

export type ArcadeMenuProps = {
  games: GameDef[];
  onPlay: (id: string) => void;
  onPurge: () => void;
};

// The landing state of the hero: a cabinet-style game picker instead of an auto-running game. Each card names the
// Nexus capability its game puts on display, so the arcade reads as a feature tour. Picking one boots that game.
const ArcadeMenu = ({ games, onPlay, onPurge }: ArcadeMenuProps) => (
  <div className="@container pointer-events-auto flex h-full w-full flex-col items-center justify-center px-6 py-4 @md:py-8">
    <div className="mb-1 flex items-center gap-2">
      <span className="live-dot bg-brand-400 h-1.5 w-1.5 rounded-full" />
      <span className="text-brand-300 font-mono text-[11px] tracking-[0.3em] uppercase">Nexus Arcade</span>
    </div>
    <p className="mb-4 text-center text-sm text-zinc-500 @md:mb-6">
      Pick a cabinet — every game runs on one Nexus store
    </p>

    {/* Stacked under the hero copy the cabinets share its gutters, so both blocks line up on the same edges; in the
        narrow right-hand column at xl the grid keeps its own cap. Columns follow the arcade's own width, not the
        window's — opening the log dock narrows this box, and the cabinets drop to two abreast instead of being
        squeezed. */}
    <div className="grid w-full grid-cols-2 gap-2 xl:max-w-2xl @md:grid-cols-3 @md:gap-3">
      {games.map(game => (
        <button
          key={game.id}
          type="button"
          onClick={() => onPlay(game.id)}
          className="group border-ink-700 bg-ink-900/60 hover:border-brand-500 hover:bg-ink-800/70 relative flex flex-col items-start gap-1.5 overflow-hidden rounded-xl border p-3 text-left backdrop-blur transition hover:-translate-y-0.5"
        >
          <span className="text-2xl">{game.icon}</span>
          <span className="text-sm font-semibold text-white">{game.name}</span>
          {/* In the docked hero column the cabinets have a fixed height to live in, and two abreast is already five
              rows; the hook is what gives so every cabinet stays on screen. Stacked below xl the page just scrolls, so
              it stays. */}
          <span className="text-[11px] leading-snug text-zinc-500 xl:@max-md:hidden">{game.tagline}</span>
          <span className="border-brand-500/30 bg-brand-500/10 text-brand-300 mt-1 rounded-full border px-2 py-0.5 font-mono text-[9px]">
            {game.feature}
          </span>
          <span className="text-brand-400 absolute top-3 right-3 text-xs opacity-0 transition group-hover:opacity-100">
            play →
          </span>
        </button>
      ))}
    </div>

    <button
      type="button"
      onClick={onPurge}
      title="Wipe every saved game and setting"
      className="mt-4 font-mono text-[11px] text-zinc-600 transition hover:text-rose-300 @md:mt-6"
    >
      purge all saved data
    </button>
  </div>
);

export default ArcadeMenu;
