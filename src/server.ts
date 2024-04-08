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

import * as R from "ramda";
import { isPromise } from "node:util/types";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import cors from "cors";
import { P, match } from "ts-pattern";
import { NanoValidator, createNanoValidator } from "nanorpc-validator";
import { NanoRPC, createNanoReply } from "nanorpc-validator";

export class NanoRPCServer {
  readonly validators: NanoValidator;
  private readonly methods: {
    [method: string]: (
      rpc: NanoRPC<string, unknown[]>,
    ) => unknown | Promise<unknown>;
  };
  private readonly app: ReturnType<typeof express>;

  constructor(secret: string) {
    this.validators = createNanoValidator();
    this.methods = {};

    this.app = express();

    this.app.set("trust proxy", true);
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    this.app.use((req, res, next) => {
      const params = R.map(
        ([key, value]) => `${key.toString()}=${value}`,
        R.toPairs(R.dissoc("sign", req.body)),
      );

      const payload = R.join(
        "\n",
        R.sort(
          R.comparator((a, b) => a.localeCompare(b) < 0),
          params,
        ),
      );

      const sign = match(req.body.sign)
        .with(P.string, R.identity)
        .otherwise(() => undefined);

      if (R.isNil(sign)) {
        return res.status(400).json({
          code: 400,
          error: { name: "Bad Request", message: "Missing Signature" },
        });
      }

      const signature = crypto
        .createHmac("sha256", secret)
        .update(`${payload}\n${secret}`)
        .digest()
        .toString("hex");

      if (signature !== sign) {
        return res.status(400).json({
          code: 400,
          error: { name: "Bad Request", message: "Check Signature Failed" },
        });
      }

      next();
    });

    this.app.post("/nanorpcs/:method", async (req, res) => {
      const method = req.params.method;

      const id = match(req.body.id)
        .with(P.number, R.toString)
        .with(P.string, R.identity)
        .otherwise(() => undefined);

      if (R.isNil(id)) {
        return res.status(400).json({
          code: 400,
          error: { name: "Bad Request", message: "Missing ID" },
        });
      }

      const args = match(req.body.arguments)
        .with(P.array(P.any), R.identity)
        .otherwise(() => undefined);

      if (R.isNil(args)) {
        return res.status(400).json({
          code: 400,
          error: { name: "Bad Request", message: "Missing Arguments" },
        });
      }

      const timestamp = match(req.body.timestamp)
        .with(P.number, R.identity)
        .with(P.string, (timestamp) => parseInt(timestamp))
        .otherwise(() => undefined);

      if (R.isNil(timestamp) || isNaN(timestamp)) {
        return res.status(400).json({
          code: 400,
          error: { name: "Bad Request", message: "Missing Timestamp" },
        });
      }

      const rpc: NanoRPC<string, unknown[]> = {
        id,
        method,
        arguments: args,
        timestamp,
      };

      const validator = this.validators.getValidator(method);

      if (validator && !validator(rpc)) {
        const lines = validator.errors!.map(
          (err) => `${err.keyword}: ${err.instancePath}, ${err.message}`,
        );

        return res.status(406).json({
          code: 406,
          error: { name: "Not Acceptable", message: lines.join("\n") },
        });
      }

      const func = this.methods[method];

      if (!func) {
        return res.status(405).json({
          code: 405,
          error: { name: "Method Not Allowed", message: "Missing Method" },
        });
      }

      try {
        const result = func(rpc);
        const retval = isPromise(result) ? await result : result;
        const reply = createNanoReply(id, 0, "OK", retval);

        return res.json({ code: 200, data: reply });
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : `${error}`;

        return res.status(417).json({
          code: 417,
          error: { name: "Expectation Failed", message },
        });
      }
    });

    this.app.use((_, res) =>
      res.status(404).json({
        code: 404,
        error: { name: "Not Found", message: "Page Not Found" },
      }),
    );
  }

  run(port: number) {
    const server = http.createServer(this.app);

    server.listen(port);

    return () => {
      server.close();
    };
  }
}

export const createNanoRPCServer = (secret: string) =>
  new NanoRPCServer(secret);
