import { SeasonView } from "./SeasonView";

export default async function SeasonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SeasonView id={id} />;
}
