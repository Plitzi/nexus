import { useDemoStore } from '../../demoStore';

const DemoStateView = () => {
  const [state] = useDemoStore();

  return (
    <div className="flex min-w-0 grow basis-0 flex-col">
      <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase">store.getState()</span>
      {/* `grow basis-0` fills the row while the three panels sit side by side; stacked in one column there is no row
          height to divide, so the floor is what keeps the JSON readable instead of collapsing to a single clipped line. */}
      <pre className="border-ink-700 bg-ink-950 text-brand-200 mt-2 min-h-48 grow basis-0 overflow-auto rounded-lg border p-3 font-mono text-xs leading-relaxed">
        {JSON.stringify(state, null, 2)}
      </pre>
    </div>
  );
};

export default DemoStateView;
