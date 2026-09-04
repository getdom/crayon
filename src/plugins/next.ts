import path from "node:path";
import { fileURLToPath } from "node:url";

type AnyConfig = Record<string, any>;

function loaderPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "loader.cjs");
}

/**
 * Wrap your Next config: `export default withCrayon(nextConfig)`.
 * Does nothing unless the Crayon CLI started the dev server, so it is safe to leave in place.
 */
export function withCrayon<T extends AnyConfig>(config: T = {} as T): T {
  if (!process.env.CRAYON) return config;
  const loader = loaderPath();
  const rules = { ...(config.turbopack?.rules ?? {}) };
  for (const ext of ["tsx", "jsx"]) {
    rules[`*.${ext}`] = { loaders: [loader] };
  }
  const userWebpack = config.webpack;
  return {
    ...config,
    turbopack: { ...(config.turbopack ?? {}), rules },
    webpack(wp: any, ctx: any) {
      wp.module.rules.push({
        test: /\.[jt]sx$/,
        exclude: /node_modules/,
        enforce: "pre",
        use: [{ loader }],
      });
      return typeof userWebpack === "function" ? userWebpack(wp, ctx) : wp;
    },
  };
}

export default withCrayon;
