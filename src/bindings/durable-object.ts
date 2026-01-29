// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClass = new (...args: any[]) => any;

/**
 * Props for DurableObject binding.
 * The class is optional and only used for TypeScript type inference.
 * At runtime, className and classPath are used by the CLI.
 */
type DurableObjectProps<T extends AnyClass = AnyClass> = {
  /** Binding name for wrangler config */
  name: string;
  /** Class name as string - used in wrangler config */
  className: string;
  /**
   * Path to the class file from project root.
   * Used by CLI to auto-generate DO exports in wrapper entrypoint.
   * Example: './src/shared/my-durable-object.ts'
   */
  classPath: string;
  /**
   * @deprecated Use className and classPath instead.
   * Optional: The actual class for TypeScript type inference only.
   * Not evaluated at runtime - CLI will import via classPath.
   */
  class?: T;
};

export type DurableObjectBinding<T extends AnyClass = AnyClass> = {
  _type: "DurableObject";
  _runtimeType: DurableObjectNamespace<InstanceType<T>>;
  /**
   * Worker name that owns this DO.
   * undefined = unbound (not yet attached to a worker)
   * When a binding is used in a different worker than its owner,
   * generateWranglerConfig will add script_name to the output.
   */
  _owner?: string;
  name: string;
  className: string;
  /**
   * Path to the class file from project root.
   * Used by CLI to auto-generate DO exports in wrapper entrypoint.
   */
  classPath: string;
};

export const DurableObject = <T extends AnyClass = AnyClass>(
  props: DurableObjectProps<T>,
): DurableObjectBinding<T> => ({
  _type: "DurableObject",
  _runtimeType: null as unknown as DurableObjectNamespace<InstanceType<T>>,
  _owner: undefined,
  name: props.name,
  className: props.className,
  classPath: props.classPath,
});
