import { createContext } from 'react';

// An app-defined grouping tag that `StoreProvider` attaches to every store it registers in the dev store registry. A
// devtools panel can then group stores by their origin — e.g. the SDK instance that owns them. It has no effect on
// store behaviour, but providing it IS the opt-in to the registry outside dev builds: a panel that ships in production
// (enabled per session, say) mounts it, and a build that never mounts it keeps no registry bookkeeping at all.
const DevStoreScopeContext = createContext<string | undefined>(undefined);
DevStoreScopeContext.displayName = 'DevStoreScopeContext';

export default DevStoreScopeContext;
