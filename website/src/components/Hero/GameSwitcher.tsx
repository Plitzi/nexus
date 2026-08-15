import { type GameDef } from './heroGames';

export type GameSwitcherProps = {
  games: GameDef[];
  active: string;
  onSelect: (id: string) => void;
};

// The full cabinet list never fits a phone, so the rail scrolls sideways there. `justify-start` while it overflows is
// deliberate: a centered flex row puts its overflow out of reach of the scroller.
const GameSwitcher = ({ games, active, onSelect }: GameSwitcherProps) => (
  <div className="pointer-events-auto flex w-full justify-start overflow-x-auto px-4 sm:justify-center">
    <div className="border-ink-700/70 bg-ink-900/70 flex items-center gap-1 rounded-full border p-1 backdrop-blur-md">
      {games.map(game => (
        <button
          key={game.id}
          type="button"
          onClick={() => onSelect(game.id)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition sm:px-4 ${
            active === game.id ? 'bg-brand-600 text-white' : 'text-zinc-400 hover:text-white'
          }`}
        >
          {game.name}
        </button>
      ))}
    </div>
  </div>
);

export default GameSwitcher;
