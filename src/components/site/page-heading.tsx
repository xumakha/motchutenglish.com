/** The PHP heading() helper: eyebrow, title and lead inside div.page-heading. */
export function PageHeading({
  title,
  description = "",
  eyebrow = "MỘT CHÚT MỖI NGÀY",
}: {
  title: string;
  description?: string;
  eyebrow?: string;
}) {
  return (
    <div className="page-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
