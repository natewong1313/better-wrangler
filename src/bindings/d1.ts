/**
 * D1 database
 */
type D1Props = {
  /**
   * Database name
   */
  name: string;
};

export type D1Binding = {
  _type: "D1";
  _runtimeType: D1Database;
  name: string;
};

export const D1 = (props: D1Props): D1Binding => ({
  _type: "D1",
  _runtimeType: null as unknown as D1Database,
  name: props.name,
});
