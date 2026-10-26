import { redirect } from "next/navigation";

/** Cases are now received and assigned by the Lab In-charge. */
export default function NewCase() {
  redirect("/approver");
}
