import { RewriterWorkbench } from "@/components/RewriterWorkbench";
import {
  getProviderCapabilities,
  getPublicProviderCatalog,
} from "@/lib/provider-config";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <RewriterWorkbench
      initialProviders={getPublicProviderCatalog()}
      capabilities={getProviderCapabilities()}
    />
  );
}
