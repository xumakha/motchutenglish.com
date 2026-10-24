// Loaded with `--import` for the worker CLI. Domain modules import "server-only", which throws
// outside React Server Components. Scripts usually pass --conditions=react-server to avoid that,
// but that condition also swaps react-dom/server for a build without renderToStaticMarkup, which
// the email templates need. So resolve "server-only" to an empty module instead.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return next(specifier, context);
  },
});
