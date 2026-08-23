import { createContext, useContext, type ReactNode } from "react";

import type { FamilyContextValue } from "./familyTypes";
import { unavailableFamilyContext } from "./familyTypes";

const FamilyContext = createContext<FamilyContextValue>(unavailableFamilyContext);

export function FamilyProvider({ children }: { children: ReactNode }) {
  return <FamilyContext.Provider value={unavailableFamilyContext}>{children}</FamilyContext.Provider>;
}

export const useFamily = () => useContext(FamilyContext);
