// This file is automatically loaded by Jest
// It adds Jest globals to the TypeScript compiler

export {};

declare global {
  // eslint-disable-next-line no-var
  var describe: (name: string, fn: () => void) => void;
  // eslint-disable-next-line no-var
  var test: (name: string, fn: (done?: jest.DoneCallback) => void | Promise<void>) => void;
  // eslint-disable-next-line no-var
  var expect: jest.Expect;
  // eslint-disable-next-line no-var
  var beforeAll: (fn: (done?: jest.DoneCallback) => void | Promise<void>) => void;
  // eslint-disable-next-line no-var
  var afterAll: (fn: (done?: jest.DoneCallback) => void | Promise<void>) => void;
  // eslint-disable-next-line no-var
  var beforeEach: (fn: (done?: jest.DoneCallback) => void | Promise<void>) => void;
  // eslint-disable-next-line no-var
  var afterEach: (fn: (done?: jest.DoneCallback) => void | Promise<void>) => void;
  // eslint-disable-next-line no-var
  var jest: jest.Jest;
}

namespace jest {
  export interface Jest {
    [key: string]: any;
  }

  export interface Expect {
    [key: string]: any;
  }

  export interface DoneCallback {
    (...args: any[]): any;
    fail(error?: Error | string): any;
  }
}