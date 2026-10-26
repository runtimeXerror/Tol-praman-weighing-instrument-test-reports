import { redirect } from "next/navigation";

/** Old link: returned cases now live under My Cases → Returned. */
export default function Returned() {
  redirect("/engineer?filter=returned");
}
