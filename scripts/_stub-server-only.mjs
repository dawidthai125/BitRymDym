import Module from "node:module";

const req = Module.createRequire(import.meta.url);
const id = req.resolve("server-only");
req.cache[id] = {
  id,
  filename: id,
  loaded: true,
  exports: {},
  children: [],
  path: "",
  paths: [],
};
