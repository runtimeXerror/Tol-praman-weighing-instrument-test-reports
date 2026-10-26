import { redirect } from "next/navigation";

/** The Lab In-charge tracks assignments only; the old case list now lives in History. */
export default function InchargeCases() {
  redirect("/incharge/history");
}
