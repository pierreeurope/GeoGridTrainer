export type Primitive = string | number | boolean | null;

export type CellValue = Primitive | Primitive[]; // we treat JSON arrays as arrays of primitives

export type Row = Record<string, CellValue>;

export type ColumnKind = 'country' | 'string' | 'number' | 'boolean' | 'list';

export type ColumnSpec = {
  key: string;
  label: string;
  kind: ColumnKind;
  group?: string;
  hiddenByDefault?: boolean;
  description?: string;
};


