export interface States {
  islocalSupported: boolean;  // does the local environment have python & VitisHLS installed?

  remoteHost: string;         // remote host address (contains http:// or https://)
  authToken: string;          // temporary storage for the authentication token
}

export class StateManager implements States {
  islocalSupported: boolean;

  remoteHost: string;
  authToken: string;

  constructor() {
    this.islocalSupported = false;

    this.remoteHost = "";
    this.authToken = "";
  }

  public getState(): States {
    return this;
  }

}