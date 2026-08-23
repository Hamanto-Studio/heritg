import { createContext, useContext, type ReactNode } from "react";

import type { ProContextValue } from "./proTypes";
import { unavailableProContext } from "./proTypes";

const ProContext = createContext<ProContextValue>(unavailableProContext);

export function ProProvider({ children, value }: { children: ReactNode; value?: ProContextValue }) {
  return <ProContext.Provider value={value ?? unavailableProContext}>{children}</ProContext.Provider>;
}

export const usePro = () => useContext(ProContext);
