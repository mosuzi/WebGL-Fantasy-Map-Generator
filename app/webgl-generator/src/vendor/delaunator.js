const module = await import("./delaunator.umd.js");
const Delaunator = module.default || globalThis.Delaunator;

if (!Delaunator) {
  throw new Error("Delaunator vendor bundle did not initialize");
}

export default Delaunator;
