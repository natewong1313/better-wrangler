import type { WorkerBinding } from "./bindings";

export type Bindings = Record<string, WorkerBinding>;

type InferBindingType<B> = B extends { _runtimeType: infer T } ? T : never;

export type InferEnv<B extends Bindings> = {
  [K in keyof B]: InferBindingType<B[K]>;
};

export type WorkerProps<B extends Bindings> = {
  /**
   * Name of the worker
   */
  name: string;
  /**
   * Entrypoint of the worker file
   */
  entryPoint: string;
  /**
   * Dev server port (optional, auto-assigned if not specified)
   */
  port?: number;
  /**
   * Mark this worker as primary (starts first in dev mode).
   * Only one worker should be marked as primary.
   */
  primary?: boolean;
  /**
   * Bindings for the worker
   */
  bindings?: B;
};

export type WorkerConfig<B extends Bindings> = WorkerProps<B> & {
  Env: InferEnv<B>;
  bindings: B;
};

/**
 * Creates a Worker configuration with properly owned bindings.
 *
 * The _owner field is needed since sharing a DO across multiple workers
 * requires one worker to "own" it
 *
 * If a DO binding is declared without an owner we auto assign it
 */
export const Worker = <B extends Bindings>(props: WorkerProps<B>): WorkerConfig<B> => {
  const ownedBindings = props.bindings
    ? (Object.fromEntries(
        Object.entries(props.bindings).map(([key, binding]) => {
          if (binding._type === "DurableObject" && !binding._owner) {
            // Own the DO
            return [key, { ...binding, _owner: props.name }];
          }
          return [key, binding];
        }),
      ) as B)
    : ({} as B);

  return {
    ...props,
    bindings: ownedBindings,
    Env: null as unknown as InferEnv<B>,
  };
};
