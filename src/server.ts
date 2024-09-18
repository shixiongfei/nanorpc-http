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
import express from "express";
import cors from "cors";
import { P, match } from "ts-pattern";
import { Mutex } from "async-mutex";
import {
  NanoRPC,
  NanoRPCError,
  NanoValidator,
  createNanoRPCError,
  createNanoReply,
} from "nanorpc-validator";

export type NanoMethods = {
  [method: string]: (rpc: NanoRPC<unknown[]>) => unknown | Promise<unknown>;
};

export const createExpress = (
  secret: string,
  validators: NanoValidator,
  methods: NanoMethods,
  queued: boolean,
) => {
  const mutex = queued ? new Mutex() : undefined;
  const app = express();

  app.set("trust proxy", true);
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    const sign = match(req.body.sign)
      .with(P.string, R.identity)
      .otherwise(() => undefined);

    if (R.isNil(sign)) {
      return res
        .status(400)
        .json(createNanoRPCError("", 400, 400, "Missing Signature"));
    }

    const payload = R.join(
      "\n",
      R.sort(
        R.comparator((a, b) => a.localeCompare(b) < 0),
        R.map(
          (kv) => JSON.stringify(kv),
          R.toPairs(R.dissoc("sign", req.body)),
        ),
      ),
    );

    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${payload}\n${secret}`)
      .digest()
      .toString("hex");

    if (signature !== sign) {
      return res
        .status(400)
        .json(createNanoRPCError("", 400, 400, "Check Signature Failed"));
    }

    next();
  });

  app.post("/nanorpcs/:method", async (req, res) => {
    const id = match(req.body.id)
      .with(P.number, R.toString)
      .with(P.string, R.identity)
      .otherwise(() => undefined);

    if (R.isNil(id)) {
      return res
        .status(400)
        .json(createNanoRPCError("", 400, 400, "Missing ID"));
    }

    const method = req.params.method;
    const func = methods[method];

    if (!func) {
      return res
        .status(405)
        .json(createNanoRPCError(id, 405, 405, "Missing Method"));
    }

    const params = match(req.body.params)
      .with(P.array(P.any), R.identity)
      .otherwise(() => undefined);

    if (R.isNil(params)) {
      return res
        .status(400)
        .json(createNanoRPCError(id, 400, 400, "Missing Arguments"));
    }

    const timestamp = match(req.body.timestamp)
      .with(P.number, R.identity)
      .with(P.string, (timestamp) => parseInt(timestamp))
      .otherwise(() => undefined);

    if (R.isNil(timestamp) || isNaN(timestamp)) {
      return res
        .status(400)
        .json(createNanoRPCError(id, 400, 400, "Missing Timestamp"));
    }

    if (Math.abs(Date.now() - timestamp) > 60 * 1000) {
      return res
        .status(425)
        .json(createNanoRPCError(id, 425, 425, "Time difference is too large"));
    }

    const rpc: NanoRPC<unknown[]> = { id, method, params };

    const validator = validators.getValidator(method);

    if (validator && !validator(rpc)) {
      const lines = validator.errors!.map(
        (err) => `${err.keyword}: ${err.instancePath}, ${err.message}`,
      );

      return res
        .status(406)
        .json(createNanoRPCError(id, 406, 406, lines.join("\n")));
    }

    const doFunc = async () => {
      const result = func(rpc);
      return isPromise(result) ? await result : result;
    };

    try {
      const retval = mutex ? await mutex.runExclusive(doFunc) : await doFunc();

      return res.json(createNanoReply(id, 200, retval));
    } catch (error) {
      return res
        .status(417)
        .json(
          error instanceof NanoRPCError
            ? createNanoRPCError(rpc.id, 417, error.code, error.message)
            : createNanoRPCError(
                rpc.id,
                417,
                417,
                typeof error === "string"
                  ? error
                  : error instanceof Error
                    ? error.message
                    : `${error}`,
              ),
        );
    }
  });

  app.use((_, res) =>
    res.status(404).json(createNanoRPCError("", 404, 404, "Not Found")),
  );

  return app;
};
