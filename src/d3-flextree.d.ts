declare module 'd3-flextree' {
  export interface FlexNode<T> {
    data: T;
    x: number;
    y: number;
    depth: number;
    children?: FlexNode<T>[];
    parent?: FlexNode<T>;
    descendants(): FlexNode<T>[];
  }
  export interface FlexLayout<T> {
    (root: FlexNode<T>): FlexNode<T>;
    hierarchy(data: T): FlexNode<T>;
  }
  export function flextree<T>(options: {
    nodeSize: (node: FlexNode<T>) => [number, number];
    spacing: number;
  }): FlexLayout<T>;
}
