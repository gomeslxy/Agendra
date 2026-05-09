import { ComingSoon } from "@/components/ui/coming-soon";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog Agendra",
  description: "Dicas sobre automação, IA e conversão de leads.",
};

export default function BlogPage() {
  return <ComingSoon title="Blog Agendra" />;
}
