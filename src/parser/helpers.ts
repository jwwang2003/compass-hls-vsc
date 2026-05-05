import { Parser, Tree } from "web-tree-sitter";
import type { Node } from "web-tree-sitter";

export function getTree(parser: Parser, source: string): Tree {
  return parser.parse(source)! || parser.parse("");
}

export function getFunctions(node: Node) {

}

export function checkForMacro(node: Node) {
  // There are two types of macros to check
  // 1. preproc_def
  // 2. preproc_function_def
  let isFunc = false;

  console.log(node.type);

  if (node.type === "preproc_def" || node.type === "preproc_function_def") {
    isFunc = node.type === "preproc_function_def";
    let macroName = '';
    let macroParam = '';
    let macroValue = '';

    // Loop through the children of the macro definition node
    for (const grandchild of node.children) {
      if (!grandchild) {continue;}
      console.log(grandchild);
      switch(grandchild.type) {
        case "identifier":
          macroName = grandchild.text.trim();
          break;
        case "preproc_params":
          macroParam = grandchild.text.trim();
          break;
        case "preproc_arg":
          macroValue = grandchild.text.trim();
          break;
        default:
          break;
      }
    }

    if (macroName !== '')
      {return [{ isFunc, macroName, macroParam, macroValue, node }];}
  }
  return [];
}
