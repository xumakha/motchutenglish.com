import { notFound } from "next/navigation";
import { listening } from "@/lib/courses";
import { ListeningExercise } from "@/components/learning";
import { PageHeading } from "@/components/page-heading";
export function generateStaticParams() {
  return listening.map((l) => ({ id: l.id }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = listening.find((l) => l.id === id);
  if (!item) notFound();
  return (
    <div className="container page">
      <PageHeading
        back={{ href: "/listening", label: "Thư viện nghe" }}
        eyebrow={`${item.level} · ${item.topic}`}
        title={item.title}
        description="Một hội thoại nhỏ, thêm một chút khả năng nghe hiểu."
      />
      <ListeningExercise key={id} id={id} />
    </div>
  );
}
