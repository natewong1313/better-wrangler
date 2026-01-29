/**
 * KV namespace binding
 */
type KVProps = {
  /**
   * Namespace name (used as ID in wrangler config)
   */
  name: string;
};

export type KVBinding = {
  _type: "KV";
  _runtimeType: KVNamespace;
  name: string;
};

export const KV = (props: KVProps): KVBinding => ({
  _type: "KV",
  _runtimeType: null as unknown as KVNamespace,
  name: props.name,
});
