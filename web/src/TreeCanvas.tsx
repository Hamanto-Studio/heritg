import { Suspense, forwardRef, lazy } from "react";

import type { TreeCanvasHandle, TreeCanvasProps } from "./ExcalidrawTreeCanvas";
import { SvgTreeCanvas } from "./SvgTreeCanvas";

export type { TreeCanvasHandle } from "./ExcalidrawTreeCanvas";

const ExcalidrawTreeCanvas = __EXCALIDRAW_FALLBACK__
  ? lazy(() => import("./ExcalidrawTreeCanvas").then((module) => ({
      default: module.ExcalidrawTreeCanvas
    })))
  : undefined;

export const TreeCanvas = forwardRef<TreeCanvasHandle, TreeCanvasProps>(function TreeCanvas(props, ref) {
  return ExcalidrawTreeCanvas ? (
    <Suspense fallback={null}>
      <ExcalidrawTreeCanvas {...props} ref={ref} />
    </Suspense>
  ) : <SvgTreeCanvas {...props} ref={ref} />;
});
