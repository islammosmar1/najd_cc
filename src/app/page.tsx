import { configured, db } from "@/lib/supabase/server";
import { Workspace } from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  const ready = configured();
  let signed = false;
  if (ready) {
    const client = await db();
    const {
      data: { user },
    } = await client.auth.getUser();
    signed = Boolean(user);
  }
  return <Workspace configured={ready} signedIn={signed} />;
}
