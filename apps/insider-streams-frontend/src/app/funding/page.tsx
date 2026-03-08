import { redirect } from "next/navigation";

export default function FundingPage() {
  redirect("/dashboard#wallet");
}
