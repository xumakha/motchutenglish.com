import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegacyScripts, Overview } from "@/components/legacy/markup";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { courses, findCourse } from "@/site/queries/legacy";
import { pageMetadata } from "@/site/seo";

// Port of views/courses/show.php (Courses::show).

export function generateStaticParams() {
  return courses.map((c) => ({ course: c.id }));
}

export async function generateMetadata(props: PageProps<"/courses/[course]">): Promise<Metadata> {
  const { course } = await props.params;
  const c = findCourse(course);
  if (!c)
    return pageMetadata(`/courses/${course}`, "Không tìm thấy trang", undefined, { error: true });
  return pageMetadata(`/courses/${c.id}`, c.title);
}

export default async function Page(props: PageProps<"/courses/[course]">) {
  const { course } = await props.params;
  const c = findCourse(course);
  if (!c) notFound();
  return (
    <SiteShell page="courses">
      <PageHeading title={c.title} description={c.description} eyebrow={c.level} />
      <Overview c={c} />
      <LegacyScripts />
    </SiteShell>
  );
}
