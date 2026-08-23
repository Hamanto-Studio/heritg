import { useEffect, useMemo, useState } from "react";

import {
  personForTreePreparation,
  prepareTree,
  type TreePreparationRequest,
  type TreePreparationResult
} from "./treePreparation";
import type {
  AppData,
  FamilyRelationship,
  GenerationLimits,
  Person,
  RelationshipLanguage
} from "./types";

interface TreePreparationOptions {
  people: Person[];
  relationships: FamilyRelationship[];
  layoutSelectionId?: string;
  generationLimits: GenerationLimits;
  language: AppData["language"];
  relationshipLanguage: RelationshipLanguage;
  controlsVisible: boolean;
}

export function useTreePreparation(options: TreePreparationOptions) {
  const request = useMemo<TreePreparationRequest>(() => {
    const payload = {
      people: options.people.map(personForTreePreparation),
      relationships: options.relationships,
      layoutSelectionId: options.layoutSelectionId,
      generationLimits: options.generationLimits,
      language: options.language,
      relationshipLanguage: options.relationshipLanguage,
      controlsVisible: options.controlsVisible
    };
    return { ...payload, requestKey: JSON.stringify(payload) };
  }, [
    options.controlsVisible,
    options.generationLimits,
    options.language,
    options.relationshipLanguage,
    options.layoutSelectionId,
    options.people,
    options.relationships
  ]);
  const [result, setResult] = useState<TreePreparationResult>();

  useEffect(() => {
    let active = true;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    let worker: Worker | undefined;
    const accept = (next: TreePreparationResult) => {
      if (active && next.requestKey === request.requestKey) setResult(next);
    };
    const runFallback = () => {
      fallbackTimer = setTimeout(() => accept(prepareTree(request)), 0);
    };

    try {
      worker = new Worker(new URL("./treePreparation.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<TreePreparationResult>) => accept(event.data);
      worker.onerror = () => {
        worker?.terminate();
        worker = undefined;
        runFallback();
      };
      worker.postMessage(request);
    } catch {
      runFallback();
    }

    return () => {
      active = false;
      worker?.terminate();
      if (fallbackTimer !== undefined) clearTimeout(fallbackTimer);
    };
  }, [request]);

  const current = result?.requestKey === request.requestKey ? result : undefined;
  return { result: current, isPreparing: current === undefined };
}
