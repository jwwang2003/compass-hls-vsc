import * as vscode from 'vscode';

/**
 * This is the helper method that checks whether a file is suppoprted.
 * Also remember to update the "activationEvents" in the package.json to make
 * sure methods () gets corrently triggered
 * "activationEvents": [
 *  "onLanguage:c"
 * ],
 */
const languages: String[] = ["c", /* "cpp" */];
export function isFileSupported(document: vscode.TextDocument): boolean {
  for (const lang of languages) { return document.languageId === lang; }
  return false;
}