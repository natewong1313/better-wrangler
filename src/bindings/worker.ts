import type { WorkerBinding } from "./bindings";

export type Bindings = Record<string, WorkerBinding>;

type InferBindingType<B> = B extends { _runtimeType: infer T } ? T : never;

export type InferEnv<
  B extends Bindings,
  V extends Record<string, string> = Record<string, never>,
> = {
  [K in keyof B]: InferBindingType<B[K]>;
} & V;

export type Triggers = {
  crons?: string[];
};

export type Compatibility = {
  date?: string;
  flags?: string[];
};

export type WorkerProps<
  B extends Bindings,
  V extends Record<string, string> = Record<string, never>,
> = {
  name: string;
  entryPoint: string;
  port?: number;
  primary?: boolean;
  bindings?: B;
  vars?: V;
  triggers?: Triggers;
  compatibility?: Compatibility;
};

export type WorkerConfig<
  B extends Bindings,
  V extends Record<string, string> = Record<string, never>,
> = WorkerProps<B, V> & {
  Env: InferEnv<B, V>;
  bindings: B;
  vars: V;
};

/**
 * Creates a Worker configuration with properly owned bindings.
 *
 * The _owner field is needed since sharing a DO across multiple workers
 * requires one worker to "own" it. If a DO binding is declared without
 * an owner we auto assign it.
 */
export const Worker = <
  B extends Bindings,
  V extends Record<string, string> = Record<string, never>,
>(
  props: WorkerProps<B, V>,
): WorkerConfig<B, V> => {
  const ownedBindings = props.bindings
    ? (Object.fromEntries(
        Object.entries(props.bindings).map(([key, binding]) => {
          if (binding._type === "DurableObject" && !binding._owner) {
            return [key, { ...binding, _owner: props.name }];
          }
          return [key, binding];
        }),
      ) as B)
    : ({} as B);

  return {
    ...props,
    bindings: ownedBindings,
    vars: (props.vars ?? {}) as V,
    Env: null as unknown as InferEnv<B, V>,
  };
};
