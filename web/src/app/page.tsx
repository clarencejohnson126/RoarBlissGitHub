import { redirect } from "next/navigation";

/**
 * The cinematic /story experience is the homepage. The old section-based landing is retired
 * (its components stay in the repo, just unused). Visiting / lands on the real site.
 */
export default function Home() {
  redirect("/story");
}
