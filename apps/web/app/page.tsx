import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing/landing-page";
import { getAuthSession } from "@/lib/server/getAuthSession";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getAuthSession();

  if (session?.user?.id) {
    redirect("/dashboard");
  }

  // The homepage no longer renders constellations.
  // The preserved sky system is intended for a future logged-in surface
  // such as an Observatory experience.
  return <LandingPage />;
}
