import { prepareTree, type TreePreparationRequest } from "./treePreparation";

self.onmessage = (event: MessageEvent<TreePreparationRequest>) => {
  self.postMessage(prepareTree(event.data));
};
