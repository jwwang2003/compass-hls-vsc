import {
  getTree,
  checkForMacro
} from "./helpers";

import { Node, Parser, Tree } from "web-tree-sitter";

export interface FunctionNode {
  functionName: string,
  identifier: Node | null;
  returnType: Node | null;
  parameters: Node | null;
};

/**
 * Represents one group under `loopList`,
 * e.g. `group1` in your example.
 */
export interface LoopGroup {
  level: string[];
  unroll: string[];
  pipeline: string[];
  flatten: string[];
}

/**
 * The top‐level configuration object.
 */
export interface Config {
  top: string[];                       // ["bfs"]
  funcList: string[];                  // []
  arrList: string[];                   // []
  interList: string[];                 // ["bfs nodes", "bfs edges", …]
  loopList: {
    [groupName: string]: LoopGroup;    // e.g. "group1": { level: […], unroll: […], … }
  };
  dictOp: {
    int: Record<string, string[]>;     // e.g. "bfs/loop_horizons horizon": ["add"], …
    float: string[];                   // []
    double: string[];                  // []
    half: string[];                    // []
  };
}

export default function index(parser: Parser, sourceCode: string) {
  const tree: Tree = getTree(parser, sourceCode);
  return tree;
}

export function extractData(rootNode: Node) {
  const functions = [];

  for (const child of rootNode.children) {
    if (!child) {continue;}

    switch (child.type) {
      // ========================== TOP-LEVEL FUNCTIONS ==========================
      case "function_definition":
        functions.push(handleFunction(child));
        break;
      case "": {
        break;
      }
      default: continue;
    }
  }

  console.log(functions);
}

function handleFunction(node: Node): FunctionNode {
  let fucntionNode: FunctionNode = {
    functionName: "",
    identifier: null,
    returnType: null,
    parameters: null
  };
  const children = node.children;
  for (let i = 0; i < node.children.length; ++i) {
    const child = children[i];
    if (!child) {continue;}

    if (i === 0) {
      // function return type
      fucntionNode.returnType = child;
    }

    switch (child.type) {
      case "function_declarator":
        /**
         * identifier
         * parameter_list
         */

        // Function name
        fucntionNode.identifier = child;
        fucntionNode.functionName = child.children.find(e => {
          if (e && e.type === "identifier") {return e;}
        })?.text.trim() || fucntionNode.functionName;

        // Function parameters
        fucntionNode.parameters = child.children.find(e => {
          if (e && e.type === "parameter_list") {return e;}
        }) || fucntionNode.parameters;
        break;
      case "compound_statement":
        // DC
        break;
      default:
        // DC
        break;
    }
  }

  return fucntionNode;
}

export {
  checkForMacro
};
