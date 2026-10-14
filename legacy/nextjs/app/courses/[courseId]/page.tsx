import { notFound } from "next/navigation";
import { courses } from "@/lib/courses";
import { CourseOverview } from "@/components/learning";
import { PageHeading } from "@/components/page-heading";
export function generateStaticParams() {
  return courses.map((c) => ({ courseId: c.id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return { title: courses.find((c) => c.id === courseId)?.title || "Lộ trình" };
}
export default async function Page({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const course = courses.find((c) => c.id === courseId);
  if (!course) notFound();
  return (
    <div className="container page">
      <PageHeading
        back={{ href: "/courses", label: "Tất cả lộ trình" }}
        eyebrow={`${course.level} · ${course.lessons.length} BÀI HỌC`}
        title={course.title}
        description={course.description}
      />
      <CourseOverview course={course} />
    </div>
  );
}
