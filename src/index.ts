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
import { NanoValidator, createNanoValidator } from "nanorpc-validator";
import { NanoMethods, createExpress } from "./server.js";

export class NanoRPCServer {
  public readonly validators: NanoValidator;
  private readonly methods: NanoMethods;
  private readonly app: ReturnType<typeof createExpress>;

  constructor(secret: string, queued = false) {
    this.validators = createNanoValidator();
    this.methods = {};
    this.app = createExpress(secret, this.validators, this.methods, queued);
  }

  on<T, M extends string, P extends Array<unknown>>(
    method: M,
    func: (...args: P) => T | Promise<T>,
  ) {
    if (method in this.methods) {
      throw new Error(`${method} method already registered`);
    }

    this.methods[method] = (rpc) => func(...(rpc.arguments as P));

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
