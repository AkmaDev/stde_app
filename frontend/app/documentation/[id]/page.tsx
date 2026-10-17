import { getBatiments } from "@/lib/api";
import DocumentationScreen from "@/components/DocumentationScreen";

export default async function DocumentationPage({ params }: { params: { id: string } }) {
  const batiments = await getBatiments();
  return <DocumentationScreen batiments={batiments} batimentId={Number(params.id)} />;
}
