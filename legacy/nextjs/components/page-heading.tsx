import Link from "next/link";
export function PageHeading({
  eyebrow,
  title,
  description,
  back,
}: {
  eyebrow: string;
  title: string;
  description: string;
  back?: { href: string; label: string };
}) {
  return (
    <div className="page-heading">
      {back && (
        <Link className="breadcrumb" href={back.href}>
          ← {back.label}
        </Link>
      )}
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
