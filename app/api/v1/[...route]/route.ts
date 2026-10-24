import { handleApi } from "@/server/api";

// Every /api/v1/* request goes through one dispatcher (src/server/api.ts).
const handler = async (request: Request, ctx: RouteContext<"/api/v1/[...route]">) =>
  handleApi(request, (await ctx.params).route);

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
