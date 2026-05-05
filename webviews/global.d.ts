import * as _vscode from "vscode";

declare global {
  interface ProjectStatus {
    isOpened: boolean;
    rootName: string;
    initCompassFolder: boolean;
  }

  interface VSCodeMessage<T = unknown> {
    type: string;
    value: T;
  }

  const vscode_comm: {
    postMessage: <T>(msg: VSCodeMessage<T>) => void;
    getState: () => any;
    setState: (state: any) => void;
  };

  const tsvscode: {
    postMessage: ({ type: string, value: any }) => void;
    getState: () => any;
    setState: (state: any) => void;
  };
  const apiBaseUrl: string;
}
