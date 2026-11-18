import { configured, currentUser } from "@/lib/database";
import { Workspace } from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  const ready = configured();
  let signed = false;
  if (ready) {
    signed = Boolean(await currentUser());
  }
  return <Workspace configured={ready} signedIn={signed} />;
}
