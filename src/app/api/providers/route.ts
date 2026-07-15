import {
  getProviderCapabilities,
  getPublicProviderCatalog,
} from "@/lib/provider-config";

export const runtime = "nodejs";

export function GET() {
  return Response.json({
    providers: getPublicProviderCatalog(),
    capabilities: getProviderCapabilities(),
  });
}
