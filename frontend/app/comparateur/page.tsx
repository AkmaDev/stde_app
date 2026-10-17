import { getLeviers, getBatimentsPourLevier } from "@/lib/api";
import ComparateurClient from "@/components/ComparateurClient";

export default async function ComparateurPage({ searchParams }: { searchParams: { levier?: string } }) {
  const leviers = await getLeviers();
  const donnees = await Promise.all(leviers.map((l) => getBatimentsPourLevier(l.id)));
  const initialLevierId = searchParams.levier ? Number(searchParams.levier) : undefined;
  return <ComparateurClient leviers={leviers} donnees={donnees} initialLevierId={initialLevierId} />;
}
