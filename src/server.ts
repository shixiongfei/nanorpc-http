/*
 * server.ts
 *
 * Copyright (c) 2024 Xiongfei Shi
 *
 * Author: Xiongfei Shi <xiongfei.shi(a)icloud.com>
 * License: Apache-2.0
 *
 * https://github.com/shixiongfei/nanorpc-http
 */

import http from "node:http";
import express from "express";
import cors from "cors";

export class NanoRPCServer {
  private readonly app: ReturnType<typeof express>;

  constructor() {
    this.app = express();

    this.app.set("trust proxy", true);
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  run(port: number) {
    const server = http.createServer(this.app);

    server.listen(port);

    return () => {
      server.close();
    };
  }
}

export const createNanoRPCServer = () => new NanoRPCServer();
