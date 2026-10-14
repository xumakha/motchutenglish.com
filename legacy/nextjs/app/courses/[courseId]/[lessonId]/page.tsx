import { notFound } from "next/navigation";
import { courses } from "@/lib/courses";
import { LessonView } from "@/components/learning";
import { PageHeading } from "@/components/page-heading";
export function generateStaticParams() {
  return courses.flatMap((c) =>
    c.lessons.map((l) => ({ courseId: c.id, lessonId: l.id })),
  );
}
export default async function Page({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  const course = courses.find((c) => c.id === courseId);
  const lesson = course?.lessons.find((l) => l.id === lessonId);
  if (!course || !lesson) notFound();
  return (
    <div className="container page">
      <PageHeading
        back={{ href: `/courses/${course.id}`, label: course.title }}
        eyebrow={`BÀI ${course.lessons.indexOf(lesson) + 1} · 10–15 PHÚT`}
        title={lesson.title}
        description="Đọc, nghe và thực hành. Học một chút, nhớ lâu hơn."
      />
      <LessonView key={lesson.id} course={course} lessonId={lesson.id} />
    </div>
  );
}
