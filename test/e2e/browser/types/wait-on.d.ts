declare module 'wait-on' {
  interface WaitOnOptions {
    resources: string[];
    delay?: number;
    interval?: number;
    log?: boolean;
    reverse?: boolean;
    simultaneous?: boolean;
    timeout?: number;
    verbose?: boolean;
    window?: number;
  }

  function waitOn(options: WaitOnOptions): Promise<void>;
  
  export = waitOn;
}