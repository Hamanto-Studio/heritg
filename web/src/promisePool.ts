type PromiseSource<T> = Iterator<PromiseLike<T> | T> | (() => PromiseLike<T> | T | undefined);

interface PoolEvent<T> {
  type: "fulfilled";
  data: { promise: PromiseLike<T> | T; result: T };
}

type PoolListener<T> = (event: PoolEvent<T>) => void;

const iteratorFor = <T>(source: PromiseSource<T>): Iterator<PromiseLike<T> | T> => {
  if (typeof source !== "function") return source;
  return {
    next: () => {
      const value = source();
      return value === undefined ? { done: true, value: undefined } : { done: false, value };
    }
  };
};

// Excalidraw uses this tiny surface from the legacy CommonJS package.
export default class PromisePool<T = unknown> {
  private readonly iterator: Iterator<PromiseLike<T> | T>;
  private readonly listeners = new Set<PoolListener<T>>();
  private active = 0;
  private done = false;
  private settled = false;

  constructor(source: PromiseSource<T>, private readonly concurrency: number) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error("Invalid concurrency");
    }
    this.iterator = iteratorFor(source);
  }

  addEventListener(type: string, listener: PoolListener<T>) {
    if (type === "fulfilled") this.listeners.add(listener);
  }

  removeEventListener(type: string, listener: PoolListener<T>) {
    if (type === "fulfilled") this.listeners.delete(listener);
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const proceed = () => {
        if (this.settled) return;
        try {
          while (!this.done && this.active < this.concurrency) {
            const result = this.iterator.next();
            this.done = Boolean(result.done);
            if (result.done) break;
            this.active += 1;
            const original = result.value;
            void Promise.resolve(original).then((value) => {
              this.active -= 1;
              const event: PoolEvent<T> = {
                type: "fulfilled",
                data: { promise: original, result: value }
              };
              this.listeners.forEach((listener) => listener(event));
              proceed();
            }, (error: unknown) => {
              this.settled = true;
              reject(error);
            });
          }
          if (this.done && this.active === 0) {
            this.settled = true;
            resolve();
          }
        } catch (error) {
          this.settled = true;
          reject(error);
        }
      };
      proceed();
    });
  }
}
