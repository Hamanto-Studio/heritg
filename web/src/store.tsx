import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";

import { ACCOUNT_SYNC_LOCK_NAME, loadAppData, saveAppData, saveSyncedState, type SyncMapping } from "./db";
import { publishActiveFamilyDebugContext } from "./debugContext";
import {
  addRelationship as addRelationshipToData,
  createInitialAppData,
  createPerson as createPersonInData,
  copyFocusedTree as copyFocusedTreeInData,
  createTree as createTreeInData,
  deletePerson as deletePersonFromData,
  deleteTree as deleteTreeFromData,
  removeRelationship as removeRelationshipFromData,
  renameTree as renameTreeInData,
  replaceAppData,
  selectPerson as selectPersonInData,
  selectTree as selectTreeInData,
  setLanguage as setLanguageInData,
  setRelationshipLanguage as setRelationshipLanguageInData,
  setViewport as setViewportInData,
  updatePerson as updatePersonInData,
  DomainError,
  type AppLanguage,
  type NewPersonInput,
  type PersonChanges
} from "./domain";
import { allowsCoParent } from "./relationshipRoles";
import { newId } from "./types";
import type { AppData, DirectRole, RelationshipLanguage, ViewportState } from "./types";

export interface RelationshipDraftInput {
  relativePersonId: string;
  role: DirectRole;
  marriageDate?: string;
  divorceDate?: string;
}

export interface AppActions {
  createTree(title: string): string;
  copyFocusedTree(
    sourceTreeId: string,
    title: string,
    focusPersonId: string
  ): string;
  renameTree(treeId: string, title: string): void;
  deleteTree(treeId: string): void;
  selectTree(treeId?: string): void;
  createPerson(treeId: string, input: NewPersonInput | string): string;
  createRelative(
    treeId: string,
    targetPersonId: string,
    input: NewPersonInput,
    role: DirectRole,
    marriageDate?: string,
    coParentId?: string,
    divorceDate?: string
  ): string;
  updatePerson(personId: string, changes: PersonChanges): void;
  savePerson(
    personId: string,
    changes: PersonChanges,
    removedRelationshipIds: readonly string[],
    additions: readonly RelationshipDraftInput[]
  ): void;
  deletePerson(personId: string): void;
  selectPerson(personId?: string): void;
  addRelationship(
    personId: string,
    relativePersonId: string,
    role: DirectRole,
    marriageDate?: string,
    divorceDate?: string
  ): string;
  linkRelative(
    targetPersonId: string,
    relativePersonId: string,
    role: DirectRole,
    marriageDate?: string,
    coParentId?: string,
    divorceDate?: string
  ): void;
  removeRelationship(relationshipId: string): void;
  setLanguage(language: AppLanguage): void;
  setRelationshipLanguage(language: RelationshipLanguage): void;
  setViewport(treeId: string, viewport: ViewportState): void;
  replaceData(data: unknown): void;
  importData(data: unknown): void;
  replaceDataPersisted(data: unknown, expectedDataFingerprint: string): Promise<boolean>;
  applySyncedData(data: unknown, expectedDataFingerprint: string, accountId: string, mappings: readonly SyncMapping[]): Promise<boolean>;
  prepareSyncData(): Promise<{ data: AppData; currentDataFingerprint: string }>;
  flushLocalSaves(): Promise<void>;
}

export interface AppStoreValue extends AppActions {
  data: AppData | null;
  state: AppData | null;
  isLoading: boolean;
  ready: boolean;
  error: Error | null;
  actions: AppActions;
}

const AppStoreContext = createContext<AppStoreValue | undefined>(undefined);

const asError = (value: unknown) =>
  value instanceof Error ? value : new Error("Unable to access local family data.");

export const syncTreeVersion = (data: AppData): string => data.trees
  .map((tree) => `${tree.id}:${tree.updatedAt}`)
  .sort()
  .join("|");

export const syncDataFingerprint = (data: AppData): string => JSON.stringify(data);

const validateCoParent = (
  data: AppData,
  targetPersonId: string,
  coParentId: string,
  role: DirectRole
) => {
  if (!allowsCoParent(role)) {
    throw new DomainError(
      "invalidData",
      data.language === "id"
        ? "Hubungan ini tidak dapat memiliki orang tua bersama."
        : "This relationship does not allow a co-parent."
    );
  }
  const target = data.people.find((person) => person.id === targetPersonId);
  if (!target) {
    throw new DomainError("notFound", "The target person does not exist.");
  }
  const coParent = data.people.find((person) => person.id === coParentId);
  const hasActiveUnion = data.relationships.some((relationship) =>
    relationship.treeId === target.treeId &&
    relationship.kind === "partner" &&
    (relationship.subtype === "partner" || relationship.subtype === "spouse") &&
    ((relationship.fromPersonId === targetPersonId && relationship.toPersonId === coParentId) ||
      (relationship.fromPersonId === coParentId && relationship.toPersonId === targetPersonId))
  );
  if (!coParent || coParent.treeId !== target.treeId || !hasActiveUnion) {
    throw new DomainError(
      "invalidData",
      data.language === "id"
        ? "Orang tua bersama harus merupakan pasangan aktif dalam silsilah yang sama."
        : "The selected co-parent must be a same-tree active partner or spouse of the target person."
    );
  }
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const dataRef = useRef<AppData | null>(null);
  const mountedRef = useRef(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveErrorRef = useRef<Error | undefined>(undefined);
  const persistedFingerprintRef = useRef<string | undefined>(undefined);
  const queuedFingerprintRef = useRef<string | undefined>(undefined);
  const skipNextAutomaticSaveRef = useRef(false);
  const skipAutomaticSaveDataRef = useRef<AppData | undefined>(undefined);

  const queueSave = (next: AppData) => {
    const expectedFingerprint = queuedFingerprintRef.current;
    const nextFingerprint = syncDataFingerprint(next);
    queuedFingerprintRef.current = nextFingerprint;
    const persisted = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const persist = async () => {
          const stored = await loadAppData();
          const storedFingerprint = stored ? syncDataFingerprint(stored) : undefined;
          if (storedFingerprint !== expectedFingerprint && storedFingerprint !== persistedFingerprintRef.current) {
            throw new Error("Family data changed in another tab. Reload before continuing.");
          }
          await saveAppData(next);
          persistedFingerprintRef.current = nextFingerprint;
        };
        if (navigator.locks) await navigator.locks.request(ACCOUNT_SYNC_LOCK_NAME, persist);
        else await persist();
        saveErrorRef.current = undefined;
      });
    saveQueueRef.current = persisted.catch((reason: unknown) => {
      const nextError = asError(reason);
      saveErrorRef.current = nextError;
      if (mountedRef.current) setError(nextError);
    });
    return persisted;
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void loadAppData()
      .then((stored) => {
        if (!active) return;
        const next = stored ? replaceAppData(stored) : createInitialAppData();
        persistedFingerprintRef.current = stored ? syncDataFingerprint(stored) : undefined;
        queuedFingerprintRef.current = persistedFingerprintRef.current;
        dataRef.current = next;
        setData(next);
        setIsLoading(false);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(asError(reason));
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isLoading || !data) return;
    if (skipAutomaticSaveDataRef.current) {
      const skip = skipAutomaticSaveDataRef.current === data;
      skipAutomaticSaveDataRef.current = undefined;
      if (skip) return;
    }
    if (skipNextAutomaticSaveRef.current) {
      skipNextAutomaticSaveRef.current = false;
      return;
    }
    queueSave(dataRef.current ?? data);
  }, [data, isLoading]);

  useEffect(() => {
    if (isLoading || !data || !__DEBUG_CONTEXT_ENABLED__) return;
    void publishActiveFamilyDebugContext(data).catch((reason: unknown) => {
      console.warn("Unable to update the local family debug context.", reason);
    });
  }, [data, isLoading]);

  function commit<T>(change: (current: AppData) => [AppData, T]): T {
    const current = dataRef.current;
    if (!current) throw new Error("The family data store is not ready.");
    const [next, result] = change(current);
    if (next !== current) {
      dataRef.current = next;
      setData(next);
    }
    return result;
  }

  function createTree(title: string) {
    const id = newId();
    return commit((current) => [
      createTreeInData(current, title, { id }),
      id
    ]);
  }

  function copyFocusedTree(
    sourceTreeId: string,
    title: string,
    focusPersonId: string
  ) {
    return commit((current) => {
      const result = copyFocusedTreeInData(current, sourceTreeId, {
        title,
        focusPersonId
      });
      return [result.data, result.treeId];
    });
  }

  function renameTree(treeId: string, title: string) {
    commit((current) => [renameTreeInData(current, treeId, title), undefined]);
  }

  function deleteTree(treeId: string) {
    commit((current) => [deleteTreeFromData(current, treeId), undefined]);
  }

  function selectTree(treeId?: string) {
    commit((current) => [selectTreeInData(current, treeId), undefined]);
  }

  function createPerson(treeId: string, input: NewPersonInput | string) {
    const id = newId();
    const personInput = typeof input === "string" ? { displayName: input } : input;
    return commit((current) => [
      createPersonInData(current, treeId, personInput, { id }),
      id
    ]);
  }

  function createRelative(
    treeId: string,
    targetPersonId: string,
    input: NewPersonInput,
    role: DirectRole,
    marriageDate?: string,
    coParentId?: string,
    divorceDate?: string
  ) {
    const personId = newId();
    const relationshipId = newId();
    const coParentRelationshipId = coParentId === undefined ? undefined : newId();
    return commit((current) => {
      if (coParentId !== undefined) {
        validateCoParent(current, targetPersonId, coParentId, role);
      }
      let next = createPersonInData(
        current,
        treeId,
        { ...input, role },
        { id: personId }
      );
      next = addRelationshipToData(
        next,
        targetPersonId,
        personId,
        role,
        marriageDate,
        { id: relationshipId },
        divorceDate
      );
      if (coParentId !== undefined && coParentRelationshipId) {
        next = addRelationshipToData(
          next,
          coParentId,
          personId,
          role,
          undefined,
          { id: coParentRelationshipId }
        );
      }
      return [next, personId];
    });
  }

  function updatePerson(personId: string, changes: PersonChanges) {
    commit((current) => [updatePersonInData(current, personId, changes), undefined]);
  }

  function savePerson(
    personId: string,
    changes: PersonChanges,
    removedRelationshipIds: readonly string[],
    additions: readonly RelationshipDraftInput[]
  ) {
    const relationshipIds = additions.map(() => newId());
    commit((current) => {
      let next = updatePersonInData(current, personId, changes);
      for (const relationshipId of removedRelationshipIds) {
        next = removeRelationshipFromData(next, relationshipId);
      }
      additions.forEach((addition, index) => {
        next = addRelationshipToData(
          next,
          personId,
          addition.relativePersonId,
          addition.role,
          addition.marriageDate,
          { id: relationshipIds[index] },
          addition.divorceDate
        );
      });
      return [next, undefined];
    });
  }

  function deletePerson(personId: string) {
    commit((current) => [deletePersonFromData(current, personId), undefined]);
  }

  function selectPerson(personId?: string) {
    const current = dataRef.current;
    if (!current) throw new Error("The family data store is not ready.");
    const next = selectPersonInData(current, personId);
    if (next === current) return;
    dataRef.current = next;
    skipNextAutomaticSaveRef.current = true;
    setData(next);
    queueSave(next);
  }

  function addRelationship(
    personId: string,
    relativePersonId: string,
    role: DirectRole,
    marriageDate?: string,
    divorceDate?: string
  ) {
    const id = newId();
    return commit((current) => [
      addRelationshipToData(
        current,
        personId,
        relativePersonId,
        role,
        marriageDate,
        { id },
        divorceDate
      ),
      id
    ]);
  }

  function linkRelative(
    targetPersonId: string,
    relativePersonId: string,
    role: DirectRole,
    marriageDate?: string,
    coParentId?: string,
    divorceDate?: string
  ) {
    const relationshipId = newId();
    const coParentRelationshipId = coParentId === undefined ? undefined : newId();
    commit((current) => {
      if (coParentId !== undefined) {
        validateCoParent(current, targetPersonId, coParentId, role);
      }
      let next = addRelationshipToData(
        current,
        targetPersonId,
        relativePersonId,
        role,
        marriageDate,
        { id: relationshipId },
        divorceDate
      );
      if (coParentId !== undefined && coParentRelationshipId) {
        next = addRelationshipToData(
          next,
          coParentId,
          relativePersonId,
          role,
          undefined,
          { id: coParentRelationshipId }
        );
      }
      return [next, undefined];
    });
  }

  function removeRelationship(relationshipId: string) {
    commit((current) => [
      removeRelationshipFromData(current, relationshipId),
      undefined
    ]);
  }

  function setLanguage(language: AppLanguage) {
    commit((current) => [setLanguageInData(current, language), undefined]);
  }

  function setRelationshipLanguage(language: RelationshipLanguage) {
    commit((current) => [setRelationshipLanguageInData(current, language), undefined]);
  }

  function setViewport(treeId: string, viewport: ViewportState) {
    const current = dataRef.current;
    if (!current) throw new Error("The family data store is not ready.");
    const next = setViewportInData(current, treeId, viewport);
    if (next === current) return;
    dataRef.current = next;
    queueSave(next);
  }

  function replaceData(replacement: unknown) {
    const next = replaceAppData(replacement);
    commit(() => [next, undefined]);
  }

  async function replaceDataPersisted(replacement: unknown, expectedDataFingerprint: string) {
    const current = dataRef.current;
    if (!current || syncDataFingerprint(current) !== expectedDataFingerprint) return false;
    const next = replaceAppData(replacement);
    skipAutomaticSaveDataRef.current = next;
    dataRef.current = next;
    setData(next);
    try {
      await queueSave(next);
    } catch (cause) {
      if (dataRef.current === next) {
        dataRef.current = current;
        setData(current);
      }
      throw cause;
    }
    return true;
  }

  async function applySyncedData(replacement: unknown, expectedDataFingerprint: string, accountId: string, mappings: readonly SyncMapping[]) {
    const current = dataRef.current;
    if (!current || syncDataFingerprint(current) !== expectedDataFingerprint) return false;
    const next = replaceAppData(replacement);
    const previousFingerprint = persistedFingerprintRef.current;
    const previousQueuedFingerprint = queuedFingerprintRef.current;
    persistedFingerprintRef.current = syncDataFingerprint(next);
    queuedFingerprintRef.current = persistedFingerprintRef.current;
    skipAutomaticSaveDataRef.current = next;
    dataRef.current = next;
    setData(next);
    try {
      await saveSyncedState(accountId, next, mappings);
    } catch (cause) {
      persistedFingerprintRef.current = previousFingerprint;
      if (dataRef.current === next) {
        queuedFingerprintRef.current = previousQueuedFingerprint;
        dataRef.current = current;
        setData(current);
      }
      throw cause;
    }
    return true;
  }

  async function prepareSyncData() {
    const current = dataRef.current;
    if (!current) throw new Error("The family data store is not ready.");
    const stored = await loadAppData();
    return {
      data: stored ? replaceAppData(stored) : current,
      currentDataFingerprint: syncDataFingerprint(dataRef.current ?? current)
    };
  }

  async function flushLocalSaves() {
    await saveQueueRef.current;
    if (saveErrorRef.current) throw saveErrorRef.current;
  }

  const actions: AppActions = {
    createTree,
    copyFocusedTree,
    renameTree,
    deleteTree,
    selectTree,
    createPerson,
    createRelative,
    updatePerson,
    savePerson,
    deletePerson,
    selectPerson,
    addRelationship,
    linkRelative,
    removeRelationship,
    setLanguage,
    setRelationshipLanguage,
    setViewport,
    replaceData,
    importData: replaceData,
    replaceDataPersisted,
    applySyncedData,
    prepareSyncData,
    flushLocalSaves
  };
  const value: AppStoreValue = {
    data,
    state: data,
    isLoading,
    ready: !isLoading && data !== null,
    error,
    actions,
    ...actions
  };

  return (
    <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
  );
}

export function useAppStore() {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error("useAppStore must be used inside AppProvider.");
  return store;
}

export const useApp = useAppStore;
