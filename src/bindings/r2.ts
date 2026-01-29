/**
 * R2 object storage bucket
 */
type R2Props = {
  /**
   * Bucket name
   */
  name: string;
};

export type R2Binding = {
  _type: "R2";
  _runtimeType: R2Bucket;
  name: string;
};

export const R2 = (props: R2Props): R2Binding => ({
  _type: "R2",
  _runtimeType: null as unknown as R2Bucket,
  name: props.name,
});
