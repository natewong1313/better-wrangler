type D1Props = {
  name: string;
  id?: string;
};

export type D1Binding = {
  _type: "D1";
  _runtimeType: D1Database;
  name: string;
  id?: string;
};

export const D1 = (props: D1Props): D1Binding => ({
  _type: "D1",
  _runtimeType: null as unknown as D1Database,
  name: props.name,
  id: props.id,
});
