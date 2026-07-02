import * as DelaunatorModule from "./delaunator.umd.js";

const Delaunator = DelaunatorModule.default || globalThis.Delaunator;

if (!Delaunator) {
  throw new Error("Delaunator vendor bundle did not initialize");
}

export default Delaunator;
