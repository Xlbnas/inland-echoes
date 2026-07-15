import { RewriterWorkbench } from "@/components/RewriterWorkbench";
import { getPublicProviderCatalog } from "@/lib/provider-config";

export default function Home() {
  return <RewriterWorkbench initialProviders={getPublicProviderCatalog()} />;
}
