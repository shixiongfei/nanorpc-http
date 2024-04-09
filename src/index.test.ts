/*
 * index.test.ts
 *
 * Copyright (c) 2024 Xiongfei Shi
 *
 * Author: Xiongfei Shi <xiongfei.shi(a)icloud.com>
 * License: Apache-2.0
 *
 * https://github.com/shixiongfei/nanorpc-http
 */

import { createNanoRPCServer } from "./index.js";

const rpc = createNanoRPCServer("");

rpc.on("add", (a: number, b: number) => a + b);
rpc.run(4000);
