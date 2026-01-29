type KVProps = {
  name: string;
  id?: string;
  preview_id?: string;
};

export type KVBinding = {
  _type: "KV";
  _runtimeType: KVNamespace;
  name: string;
  id?: string;
  preview_id?: string;
};

export const KV = (props: KVProps): KVBinding => ({
  _type: "KV",
  _runtimeType: null as unknown as KVNamespace,
  name: props.name,
  id: props.id,
  preview_id: props.preview_id,
});
