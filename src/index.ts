/*
 * index.ts
 *
 * Copyright (c) 2024 Xiongfei Shi
 *
 * Author: Xiongfei Shi <xiongfei.shi(a)icloud.com>
 * License: Apache-2.0
 *
 * https://github.com/shixiongfei/nanorpc-http
 */

import http from "node:http";
import {
  NanoRPCError,
  NanoValidator,
  createNanoValidator,
} from "nanorpc-validator";
import { NanoMethods, createExpress } from "./server.js";

export * from "nanorpc-validator";

export enum NanoRPCStatus {
  OK = 0,
}

export enum NanoRPCErrCode {
  DuplicateMethod = -1,
}

export class NanoRPCServer {
  public readonly validators: NanoValidator;
  private readonly methods: NanoMethods;
  private readonly app: ReturnType<typeof createExpress>;

  constructor(secret: string, queued = false) {
    this.validators = createNanoValidator();
    this.methods = {};
    this.app = createExpress(secret, this.validators, this.methods, queued);
  }

  on<T, P extends Array<unknown>>(
    method: string,
    func: (...args: P) => T | Promise<T>,
  ) {
    if (method in this.methods) {
      throw new NanoRPCError(
        NanoRPCErrCode.DuplicateMethod,
        `${method} method already registered`,
      );
    }

    this.methods[method] = (rpc) => {
      const params = (
        Array.isArray(rpc.params) ? rpc.params : rpc.params ? [rpc.params] : []
      ) as P;

      return func(...params);
    };

    return this;
  }

  run(port: number, listener?: () => void) {
    const server = http.createServer(this.app);

    server.listen(port, listener);

    return () => {
      server.close();
    };
  }
}

export const createNanoRPCServer = (secret: string, queued = false) =>
  new NanoRPCServer(secret, queued);
