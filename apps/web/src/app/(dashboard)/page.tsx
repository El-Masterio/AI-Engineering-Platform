import { redirect } from "next/navigation";

/** The dashboard root sends you to the project list — there is no separate home. */
export default function Home() {
  redirect("/projects");
}
