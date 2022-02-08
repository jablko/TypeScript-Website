import type * as mdast from "mdast";
import ts from "typescript";
import type * as unist from "unist";

declare module "typescript" {
  function getOptionsNameMap(): {optionsNameMap: Map_<string, unknown>}
}

interface Map_<K, V> extends Map<K, V> {}

type Child<T> = T extends unist.Parent<infer U> ? U : never;
//type DescendantOrSelf<T> = T | DescendantOrSelf<Child<T>>
type DescendantOrSelf<T> = T | Child<T>

const {optionsNameMap} = ts.getOptionsNameMap();
const options = new RegExp(String.raw`\b(?:${[...optionsNameMap.keys()].join("|")})\b`, "gi")

export default () => transformer

function transformer(tree: mdast.Root) {
  visit(tree)
}

function visit(node: DescendantOrSelf<mdast.Root> & Partial<mdast.Parent & mdast.Literal>) {
  for (const child of node.children ?? []) visit(child);
  node.value &&= node.value.replace(options, "bar");
}
