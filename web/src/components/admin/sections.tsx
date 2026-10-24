import type { Route } from "next";
import Link from "next/link";
import { Fragment } from "react";
import {
  adjustRewardAction,
  articleWorkflowAction,
  entityWorkflowAction,
  lessonWorkflowAction,
  reorderContent,
  requestDataExport,
  retryJobAction,
  saveContentDraft,
  saveContentEntity,
  saveLessonVersion,
  savePageSeoAction,
  saveSiteSetting,
  saveVocabularySetItems,
  setUnitState,
  setUserRole,
  triageReportAction,
} from "@/actions/routes";
import { RouteForm } from "@/components/route-form";
import type { CurrentUser } from "@/auth/session";
import { draftHash } from "@/domain/content/entities";
import { versionHash } from "@/domain/content/lessons";
import { randomHex } from "@/domain/php";
import {
  articleDrafts,
  decode,
  entityDrafts,
  pageSeoFor,
  pageSeoRows,
  pathOptions,
  unitOptions,
  type ImportState,
  type Row,
  type Section,
} from "@/site/queries/admin";
import lessonTemplate from "../../../templates/lesson.json";
import importTemplate from "../../../templates/import.json";
import { ActionForm } from "./action-form";
import { ImportPreviewPanel, ImportStatus } from "./imports";
import { MediaUpload } from "./media-upload";

// The sections of views/product/admin.php and its partials (draft-controls, import-status,
// seo-settings, marketing-funnel). Markup, classes and copy follow the PHP view.

export interface AdminContext {
  section: Section;
  user: CurrentUser;
  query: Record<string, string>;
}

/** PHP json_encode(…, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE). */
export const pretty = (v: unknown) => JSON.stringify(v, null, 4);

/** A table cell value: dates as "Y-m-d H:i:s" (UTC), everything else as text. */
export function cell(v: unknown): string {
  if (v instanceof Date) return v.toISOString().replace("T", " ").slice(0, 19);
  if (v === null || v === undefined) return "";
  // DATETIME(3) columns come back as "2026-10-24 09:14:36.813"; PHP showed whole seconds.
  if (typeof v === "string" && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+$/.test(v))
    return v.slice(0, 19);
  return String(v);
}

const here = (ctx: AdminContext, params: Record<string, string | number>) =>
  `/admin/${ctx.section}?${new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  )}` as Route;

const isAdmin = (ctx: AdminContext) => ctx.user.role === "admin";

// ---- Paths, units, vocabulary, articles, vocabulary sets ----

const ENTITY_FIELDS: Record<string, string[]> = {
  paths: [
    "slug",
    "title",
    "description",
    "level",
    "objectives",
    "prerequisites",
    "image_id",
    "status",
    "sort_order",
  ],
  units: ["path_id", "title", "objectives", "sort_order"],
  vocabulary: [
    "slug",
    "lemma",
    "ipa",
    "part_of_speech",
    "topic",
    "meaning",
    "example",
    "translation",
    "level",
    "audio_id",
    "status",
  ],
  articles: ["slug", "title", "body", "status"],
  "vocabulary-sets": ["slug", "title", "description", "status", "sort_order"],
};
const TEXTAREAS = [
  "body",
  "description",
  "objectives",
  "meaning",
  "example",
  "translation",
  "prerequisites",
];
const OPTIONAL = ["ipa", "audio_id", "image_id", "seo_title", "seo_description"];

export async function EntitySection({ ctx, data }: { ctx: AdminContext; data: Row[] }) {
  const { section } = ctx;
  const fields = [
    ...ENTITY_FIELDS[section]!,
    ...(section !== "units" ? ["seo_title", "seo_description"] : []),
  ];
  const editId = Number(ctx.query.edit) || 0;
  const edit = data.find((r) => Number(r.id) === editId) ?? null;
  const paths = fields.includes("path_id") ? await pathOptions() : [];
  const statuses = isAdmin(ctx)
    ? [
        ...new Set([
          "draft",
          "in_review",
          ...(edit?.status === "published" ? ["published"] : []),
          "archived",
        ]),
      ]
    : ["draft", "in_review"];
  const value = (f: string) =>
    cell(edit?.[f] ?? (f === "level" ? "A1" : f === "sort_order" ? "0" : ""));

  return (
    <>
      <section className="panel">
        <h2>{edit ? "Sửa nội dung" : "Thêm nội dung"}</h2>
        <ActionForm
          key={editId}
          action={saveContentEntity}
          className="auth-form"
          resetOnSuccess={!edit}
        >
          <input type="hidden" name="kind" value={section.replace(/-/g, "_")} />
          {edit ? <input type="hidden" name="id" value={cell(edit.id)} /> : null}
          {fields.map((f) => (
            <label key={f}>
              {f}
              {f === "status" ? (
                <select name="status" defaultValue={cell(edit?.status)}>
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ) : f === "path_id" ? (
                <select name="path_id" defaultValue={cell(edit?.path_id)}>
                  {paths.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              ) : TEXTAREAS.includes(f) ? (
                <textarea name={f} rows={4} maxLength={15000} defaultValue={value(f)} />
              ) : (
                <input
                  name={f}
                  defaultValue={value(f)}
                  {...(f === "sort_order"
                    ? { type: "number" }
                    : {
                        maxLength: f === "seo_title" ? 160 : f === "seo_description" ? 320 : 200,
                      })}
                  required={!OPTIONAL.includes(f)}
                />
              )}
            </label>
          ))}
          <button className="button">Lưu nội dung</button>
        </ActionForm>
      </section>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nội dung</th>
              <th>Trạng thái</th>
              <th>Sửa</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={cell(row.id)}>
                <td>{cell(row.id)}</td>
                <td>{cell(row.title ?? row.lemma)}</td>
                <td>{cell(row.status ?? (row.archived ? "Đã lưu trữ" : "Đang dùng"))}</td>
                <td>
                  <Link href={here(ctx, { edit: cell(row.id) })}>Sửa</Link>
                  {section === "units" && isAdmin(ctx) ? (
                    <RouteForm
                      action={setUnitState}
                      label={row.archived ? "Khôi phục" : "Lưu trữ"}
                      fields={{ unitId: cell(row.id), archived: row.archived ? 0 : 1 }}
                      buttonClass="button secondary"
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---- Lessons and questions (versions) ----

export async function LessonSection({ ctx, data }: { ctx: AdminContext; data: Row[] }) {
  const editId = Number(ctx.query.edit) || 0;
  const edit = data.find((v) => Number(v.id) === editId) ?? null;
  const editingDraft = edit?.status === "draft";
  const [units, expected] = await Promise.all([
    unitOptions(),
    editingDraft ? versionHash(Number(edit.id)) : null,
  ]);
  const doc = edit ? decode(edit.document) : lessonTemplate;
  const filter = (k: string) => ctx.query[k] ?? "";

  return (
    <>
      <section className="panel">
        <h2>{edit ? "Tạo/sửa phiên bản từ bài hiện có" : "Tạo bài học và phiên bản"}</h2>
        <p>
          Document dùng schema của dự án, kiểm tra từng dạng câu hỏi trước khi lưu.{" "}
          <Link href="/admin/imports">Mẫu nhập/xuất</Link>. Bản đã xuất bản không bị ghi đè; lưu tạo
          bản nháp mới.
        </p>
        <ActionForm key={editId} action={saveLessonVersion} className="auth-form">
          {edit ? <input type="hidden" name="lessonId" value={cell(edit.lesson_id)} /> : null}
          {editingDraft ? (
            <>
              <input type="hidden" name="versionId" value={cell(edit.id)} />
              {expected ? <input type="hidden" name="expected" value={expected} /> : null}
            </>
          ) : null}
          <label>
            Chương
            <select name="unitId" defaultValue={cell(edit?.unit_id)}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Slug
            <input name="slug" defaultValue={cell(edit?.slug)} required maxLength={150} />
          </label>
          <label>
            Tên bài
            <input name="title" defaultValue={cell(edit?.title)} required maxLength={200} />
          </label>
          <label>
            Loại bài
            <select name="subtype">
              <option value="lesson">Bài học</option>
              <option value="checkpoint">Checkpoint</option>
              <option value="placement">Kiểm tra gợi ý</option>
            </select>
          </label>
          <label>
            Document JSON
            <textarea
              name="document"
              rows={22}
              required
              className="code-input"
              defaultValue={pretty(doc)}
            />
          </label>
          <button className="button">Lưu phiên bản nháp</button>
        </ActionForm>
      </section>
      <form method="get" className="search-form">
        <label>
          Tìm câu hỏi theo từ khóa, tag, trình độ, loại hoặc trạng thái
          <input name="q" maxLength={100} defaultValue={filter("q")} />
        </label>
        <label>
          Loại
          <input name="type" maxLength={30} defaultValue={filter("type")} />
        </label>
        <label>
          Trình độ
          <input name="level" maxLength={20} defaultValue={filter("level")} />
        </label>
        <label>
          Tag
          <input name="tag" maxLength={80} defaultValue={filter("tag")} />
        </label>
        <label>
          Trạng thái
          <input name="status" maxLength={20} defaultValue={filter("status")} />
        </label>
        <button className="button secondary">Lọc</button>
      </form>
      {data.map((v) => {
        const id = cell(v.id);
        return (
          <article key={id} className="panel">
            <span className="badge">
              {cell(v.status)}
              {v.archived ? " - archived" : ""}
            </span>
            <h2>{cell(v.title)}</h2>
            <p>
              Phiên bản {id} - Bài {cell(v.lesson_id)}
            </p>
            <Link className="button secondary" href={`/admin/lesson-preview/${id}`}>
              Xem trước
            </Link>
            <Link className="button secondary" href={here(ctx, { edit: id })}>
              {v.status === "draft" ? "Sửa nháp" : "Tạo nháp mới"}
            </Link>
            {v.status === "draft" ? (
              <RouteForm
                action={lessonWorkflowAction}
                label="Gửi duyệt"
                fields={{ versionId: id, action: "review" }}
              />
            ) : null}
            {isAdmin(ctx) && v.status === "in_review" ? (
              <>
                <RouteForm
                  action={lessonWorkflowAction}
                  label="Xuất bản"
                  fields={{ versionId: id, action: "publish" }}
                />
                <RouteForm
                  action={lessonWorkflowAction}
                  label="Trả lại nháp"
                  fields={{ versionId: id, action: "return" }}
                  buttonClass="button secondary"
                />
              </>
            ) : null}
            {isAdmin(ctx) && v.status === "published" ? (
              <RouteForm
                action={lessonWorkflowAction}
                label="Lưu trữ bài"
                fields={{ versionId: id, action: "archive" }}
                buttonClass="button secondary"
              />
            ) : null}
          </article>
        );
      })}
    </>
  );
}

// ---- Media ----

export function MediaSection({ data }: { data: Row[] }) {
  return (
    <>
      <section className="panel">
        <h2>Tải media có quyền sử dụng</h2>
        <MediaUpload />
      </section>
      {data.map((m) => (
        <section key={cell(m.id)} className="panel">
          <h3>{cell(m.filename)}</h3>
          <p>
            ID: {cell(m.id)} - {cell(m.mime)} - {cell(m.bytes)} bytes
          </p>
          <p>
            {cell(m.alt_text)} - {cell(m.license_text)}
          </p>
          {cell(m.mime).startsWith("audio/") ? (
            <audio controls preload="none" src={`/media/${cell(m.id)}`}></audio>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded /media file
            <img src={`/media/${cell(m.id)}`} alt={cell(m.alt_text)} width={240} loading="lazy" />
          )}
        </section>
      ))}
    </>
  );
}

// ---- Imports ----

const TEMPLATE_LINKS: [string, string][] = [
  ["template-import", "Mẫu JSON nhập bài"],
  ["template-csv", "Mẫu CSV từ vựng"],
  ["template-exercises", "Các dạng bài tập"],
  ["template-paths", "Lộ trình"],
  ["template-units", "Chương"],
  ["template-articles", "Bài viết"],
  ["template-vocabulary_sets", "Bộ từ"],
];

export function ImportSection({ states }: { states: ImportState[] }) {
  return (
    <>
      <ImportPreviewPanel template={JSON.stringify(importTemplate, null, 2)}>
        <h2>Nhập JSON/CSV - kiểm tra trước khi ghi nội dung</h2>
        <p>
          {TEMPLATE_LINKS.map(([file, label], i) => (
            <Fragment key={file}>
              {i ? " - " : null}
              <a href={`/du-lieu/${file}`}>{label}</a>
            </Fragment>
          ))}
        </p>
        <p>
          Giới hạn 1 MB và 1000 record/batch (trên 100 record sẽ vào hàng đợi), atomic, mặc định tạo
          nháp, không ghi đè published. Bản preview chỉ lưu hồ sơ nhập và lỗi, chưa tạo bài.
        </p>
      </ImportPreviewPanel>
      <section className="panel">
        <h2>Xuất nội dung</h2>
        <p>Không chứa tài khoản, mật khẩu, token hoặc ghi chú học viên.</p>
        <RouteForm
          action={requestDataExport}
          label="Chuẩn bị bản xuất nội dung"
          fields={{ kind: "content", requestKey: randomHex(16) }}
          buttonClass="button secondary"
        />
        <p>
          <Link href="/tai-khoan">Xem trạng thái và tải bản xuất của bạn</Link>
        </p>
      </section>
      {states.map((s) => (
        <ImportStatus key={`${s.id}-${s.status}-${s.processed}`} initial={s} />
      ))}
    </>
  );
}

// ---- Reports ----

const REPORT_STATUSES = ["open", "in_progress", "resolved", "rejected"];

export function ReportSection({ data }: { data: Row[] }) {
  return data.map((r) => (
    <section key={cell(r.id)} className="panel">
      <h2>
        Báo lỗi #{cell(r.id)} - {cell(r.category)}
      </h2>
      <p>
        Phiên bản {cell(r.version_id)}, vị trí {cell(r.position)}
      </p>
      <p>{cell(r.description)}</p>
      <ActionForm action={triageReportAction} className="auth-form">
        <input type="hidden" name="id" value={cell(r.id)} />
        <label>
          Trạng thái
          <select name="status" defaultValue={cell(r.status)}>
            {REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Lý do/xử lý
          <textarea name="resolution" maxLength={2000} required defaultValue={cell(r.resolution)} />
        </label>
        <button className="button">Lưu xử lý</button>
      </ActionForm>
    </section>
  ));
}

// ---- Users ----

export function UserSection({ data }: { data: Row[] }) {
  return data.map((u) => (
    <section key={cell(u.id)} className="panel">
      <h2>{cell(u.name)}</h2>
      <p>{cell(u.email)}</p>
      <ActionForm action={setUserRole}>
        <input type="hidden" name="userId" value={cell(u.id)} />
        <label>
          Vai trò
          <select name="role" defaultValue={cell(u.role)}>
            {["learner", "editor", "admin"].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <button className="button secondary">Đổi vai trò</button>
      </ActionForm>
    </section>
  ));
}

// ---- Settings (incl. page SEO) ----

const SETTING_KEYS = [
  "site_name",
  "primary",
  "accent",
  "logo_media_id",
  "favicon_media_id",
  "social_url",
  "default_minutes",
  "gamification",
  "contact_email",
  "privacy_text",
  "terms_text",
];

export async function SettingsSection({ ctx, data }: { ctx: AdminContext; data: Row[] }) {
  const [seo, seoRows] = await Promise.all([pageSeoFor(ctx.query.seoPath ?? "/"), pageSeoRows()]);
  return (
    <>
      <section className="panel">
        <h2>SEO trang public</h2>
        <p>
          Dùng cho trang chủ (/), catalog, chiến dịch, giới thiệu, liên hệ, điều khoản và các trang
          public cũ. URL bắt đầu bằng /, không có domain, query hoặc fragment. Tên thương hiệu được
          nối sau tiêu đề như hiện tại. Để trống để dùng giá trị tự sinh; để trống cả hai để xóa tùy
          chỉnh.
        </p>
        <p>
          SEO riêng của lộ trình, nghĩa từ, bộ từ, bài viết nằm trong form nội dung
          (seo_title/seo_description) và phải qua duyệt. Bài học dùng seo.title/description trong
          document phiên bản.
        </p>
        <ActionForm key={seo.path} action={savePageSeoAction} className="auth-form">
          <label>
            URL public
            <input
              name="path"
              required
              maxLength={255}
              defaultValue={seo.path}
              placeholder="/lo-trinh"
            />
          </label>
          <label>
            Tiêu đề SEO (tối đa 160 ký tự)
            <input name="title" maxLength={160} defaultValue={seo.title} />
          </label>
          <label>
            Mô tả SEO (tối đa 320 ký tự)
            <input name="description" maxLength={320} defaultValue={seo.description} />
          </label>
          <button className="button">Lưu SEO</button>
        </ActionForm>
        {seoRows.map((row) => (
          <p key={row.path}>
            <Link href={here(ctx, { seoPath: row.path })}>{row.path}</Link> — {row.title} —{" "}
            {row.description}
          </p>
        ))}
      </section>
      <section className="panel">
        <h2>Cấu hình an toàn</h2>
        <ActionForm action={saveSiteSetting} className="auth-form">
          <label>
            Khóa
            <select name="name">
              {SETTING_KEYS.map((key) => (
                <option key={key}>{key}</option>
              ))}
            </select>
          </label>
          <label>
            Giá trị
            <textarea name="value" maxLength={15000} required />
          </label>
          <button className="button">Lưu cấu hình</button>
        </ActionForm>
        <p>Không nhận HTML hoặc JavaScript.</p>
        {data.map((s) => (
          <p key={cell(s.name)}>
            {cell(s.name)} = {cell(s.value)}
          </p>
        ))}
      </section>
    </>
  );
}

// ---- Operations ----

export interface OperationsData {
  funnel: Row[];
  counts: { type: string; count: number }[];
  jobs: {
    id: number;
    type: string;
    status: string;
    attempts: number;
    lastError: string | null;
    availableAt: Date | null;
  }[];
  cohorts: Row[];
}

const FUNNEL_STEPS = ["landings", "trials", "signups", "first_lessons", "returns"];

export function OperationsSection({ data }: { data: OperationsData }) {
  const jobs = data.jobs.map((j) => ({
    id: j.id,
    type: j.type,
    status: j.status,
    attempts: j.attempts,
    last_error: j.lastError,
    available_at: j.availableAt ? cell(j.availableAt) : null,
  }));
  const cohorts = data.cohorts.map((c) =>
    Object.fromEntries(
      Object.entries(c).map(([k, v]) => [k, v instanceof Date ? cell(v).slice(0, 10) : v]),
    ),
  );
  return (
    <>
      <section className="panel">
        <h2>Hành trình chiến dịch — 30 ngày gần nhất</h2>
        <p>
          Chỉ các phiên đã đồng ý đo lường. Ghi nhận nguồn đầu tiên trong 30 ngày; tải lại trang
          không tạo thêm một lượt. Quay lại: bắt đầu/hoàn thành bài ít nhất 24 giờ sau bài đầu tiên,
          không tính chỉ đăng nhập hoặc kiểm tra gợi ý. Không đại diện toàn bộ khách truy cập. Hiển
          thị tối đa 100 nhóm có nhiều hành trình nhất.
        </p>
        {!data.funnel.length ? (
          <p>Chưa có hành trình đã đồng ý trong khoảng này.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Lộ trình / nguồn / phương tiện / chiến dịch</th>
                  <th>Đến trang</th>
                  <th>Học thử</th>
                  <th>Đăng ký sau học thử</th>
                  <th>Bài đầu</th>
                  <th>Quay lại</th>
                </tr>
              </thead>
              <tbody>
                {data.funnel.map((f, i) => (
                  <tr key={i}>
                    <td>
                      {cell(f.path_slug)} / {cell(f.source)} / {cell(f.medium)} /{" "}
                      {cell(f.campaign) || "Không gắn nhãn"}
                    </td>
                    {FUNNEL_STEPS.map((step) => (
                      <td key={step}>{cell(f[step])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Sự kiện vận hành</h2>
        <p>Số liệu lấy từ database, không phụ thuộc analytics bên ngoài.</p>
        <pre>{pretty(data.counts)}</pre>
      </section>
      <section className="panel">
        <h2>Hàng đợi và lỗi</h2>
        <pre>{pretty(jobs)}</pre>
      </section>
      <section className="panel">
        <h2>Cohort D1/D7</h2>
        <p>
          Người có hoạt động học hợp lệ ở ngày +1/+7 sau đăng ký, không tính chỉ đăng nhập. Ngày
          đăng ký được chốt cùng múi giờ lúc tạo hồ sơ; dùng hoạt động học, không dùng lần đăng
          nhập.
        </p>
        <pre>{pretty(cohorts)}</pre>
      </section>
    </>
  );
}

export function OperationsForms() {
  return (
    <>
      <section className="panel">
        <h2>Điều chỉnh sổ thưởng có ghi audit</h2>
        <ActionForm action={adjustRewardAction} className="auth-form" resetOnSuccess>
          <input type="hidden" name="requestKey" value={randomHex(16)} />
          <label>
            ID tài khoản
            <input name="userId" type="number" min={1} required />
          </label>
          <label>
            Loại điểm
            <select name="currency">
              <option value="xp">XP</option>
              <option value="coin">Xu</option>
            </select>
          </label>
          <label>
            Số điều chỉnh có dấu
            <input name="amount" type="number" min={-10000} max={10000} required />
          </label>
          <label>
            Lý do
            <textarea name="reason" maxLength={1000} required />
          </label>
          <button className="button secondary">Ghi bút toán điều chỉnh</button>
        </ActionForm>
      </section>
      <section className="panel">
        <h2>Retry tác vụ thất bại xác định chưa gửi</h2>
        <ActionForm action={retryJobAction}>
          <label>
            ID tác vụ
            <input name="jobId" type="number" min={1} required />
          </label>
          <button className="button secondary">Đưa lại vào hàng đợi</button>
        </ActionForm>
        <p>Không tự gửi lại email có trạng thái chưa rõ đã được SMTP nhận hay chưa.</p>
      </section>
    </>
  );
}

// ---- Audit ----

export function AuditSection({ data }: { data: Row[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Thời gian UTC</th>
            <th>Người thực hiện</th>
            <th>Thao tác</th>
            <th>Đối tượng</th>
          </tr>
        </thead>
        <tbody>
          {data.map((a) => (
            <tr key={cell(a.id)}>
              <td>{cell(a.occurred_at)}</td>
              <td>{cell(a.actor_id ?? "Đã ẩn danh")}</td>
              <td>{cell(a.action)}</td>
              <td>{cell(a.target)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Shared footer blocks ----

export function Pagination({ ctx }: { ctx: AdminContext }) {
  const page = Math.max(1, Number.parseInt(ctx.query.pageNo ?? "1", 10) || 1);
  return (
    <nav className="product-nav" aria-label="Phân trang">
      <Link href={here(ctx, { pageNo: Math.max(1, page - 1) })}>Trang trước</Link>
      <span>Trang {page}</span>
      <Link href={here(ctx, { pageNo: page + 1 })}>Trang sau</Link>
    </nav>
  );
}

export function ReorderForm({ ctx }: { ctx: AdminContext }) {
  return (
    <section className="panel">
      <h2>Sắp xếp theo thứ tự</h2>
      <ActionForm action={reorderContent} className="auth-form">
        <input type="hidden" name="kind" value={ctx.section.replace(/-/g, "_")} />
        <label>
          Danh sách ID theo thứ tự, cách nhau bằng dấu phẩy
          <input name="ids" placeholder="3,1,2" required />
        </label>
        <button className="button secondary">Lưu thứ tự</button>
      </ActionForm>
    </section>
  );
}

export function SetItemsForm() {
  return (
    <section className="panel">
      <h2>Quản lý các nghĩa trong bộ từ</h2>
      <ActionForm action={saveVocabularySetItems} className="auth-form">
        <label>
          ID bộ từ
          <input name="setId" type="number" min={1} required />
        </label>
        <label>
          Danh sách ID nghĩa từ, cách nhau bằng dấu phẩy
          <input name="ids" placeholder="1,2,3" data-split="," data-field="ids" />
        </label>
        <button className="button">Lưu danh sách</button>
      </ActionForm>
      <p>
        Bộ nháp: lưu trực tiếp. Bộ đã xuất bản: tạo đề xuất nháp, gửi duyệt rồi quản trị viên xuất
        bản. Bộ đang chờ duyệt không cho sửa thành viên.
      </p>
    </section>
  );
}

// ---- Drafts (draft-controls.php) ----

async function DraftControls({
  ctx,
  type,
  record,
  doc,
}: {
  ctx: AdminContext;
  type: "entity" | "article";
  record: Row;
  doc: Record<string, unknown>;
}) {
  const id = cell(record.id);
  const status = type === "article" ? cell(doc.status) : cell(record.status);
  const workflow = type === "article" ? articleWorkflowAction : entityWorkflowAction;
  const key = type === "article" ? "versionId" : "draftId";
  const reason = (doc.reviewFeedback as { reason?: string } | undefined)?.reason;
  const { reviewFeedback: _f, baseSenseIds: _b, ...rest } = doc;
  const editDocument = { ...rest, status: "draft" };
  const expected = status === "draft" ? await draftHash(type, Number(id)) : null;
  return (
    <>
      {reason ? (
        <p>
          <strong>Lý do trả lại:</strong> {reason}
        </p>
      ) : null}
      {status === "draft" ? (
        <>
          <details open={ctx.query.draft !== undefined}>
            <summary>Sửa bản nháp #{id}</summary>
            <ActionForm action={saveContentDraft} className="auth-form">
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="draftId" value={id} />
              <input type="hidden" name="expected" value={expected ?? ""} />
              <label>
                Nội dung JSON của đúng bản nháp này
                <textarea
                  name="document"
                  rows={14}
                  className="code-input"
                  required
                  defaultValue={pretty(editDocument)}
                />
              </label>
              <p>
                Lưu chỉ sửa bản nháp này. Sau khi sửa, gửi duyệt lại. Nội dung đang công khai được
                giữ nguyên.
              </p>
              <button className="button">Lưu bản nháp #{id}</button>
            </ActionForm>
          </details>
          <Link href={here(ctx, { draft: id })}>Mở riêng bản nháp #{id}</Link>
        </>
      ) : null}
      {status === "in_review" && isAdmin(ctx) ? (
        <ActionForm action={workflow} className="auth-form">
          <input type="hidden" name={key} value={id} />
          <input type="hidden" name="action" value="return" />
          <label>
            Lý do trả về nháp
            <textarea name="reason" required maxLength={2000} rows={2} />
          </label>
          <button className="button secondary">Trả về nháp</button>
        </ActionForm>
      ) : null}
    </>
  );
}

export async function ArticleDrafts({ ctx }: { ctx: AdminContext }) {
  const drafts = await articleDrafts(Number(ctx.query.draft) || 0);
  return (
    <section className="panel">
      <h2>Bản thảo bài viết chờ duyệt</h2>
      {drafts.map(({ row, doc }) => {
        const id = cell(row.id);
        return (
          <article key={id} className="panel">
            <h3>{cell(doc.title)}</h3>
            <p>{cell(doc.status)}</p>
            <div className="prose">{cell(doc.body)}</div>
            <DraftControls ctx={ctx} type="article" record={row} doc={doc} />
            {doc.status === "draft" ? (
              <RouteForm
                action={articleWorkflowAction}
                label="Gửi duyệt"
                fields={{ versionId: id, action: "review" }}
              />
            ) : null}
            {doc.status === "in_review" && isAdmin(ctx) ? (
              <RouteForm
                action={articleWorkflowAction}
                label="Xuất bản phiên bản"
                fields={{ versionId: id, action: "publish" }}
              />
            ) : null}
          </article>
        );
      })}
    </section>
  );
}

export async function EntityDrafts({ ctx }: { ctx: AdminContext }) {
  const drafts = await entityDrafts(ctx.section, Number(ctx.query.draft) || 0);
  return (
    <section className="panel">
      <h2>Bản nội dung và đề xuất chờ duyệt</h2>
      {drafts.map(({ row, doc }) => {
        const id = cell(row.id);
        return (
          <article key={id} className="panel">
            <h3>{cell(doc.title ?? doc.lemma)}</h3>
            <p>{cell(row.status)}</p>
            <pre>{pretty(doc)}</pre>
            <DraftControls ctx={ctx} type="entity" record={row} doc={doc} />
            {row.status === "draft" ? (
              <RouteForm
                action={entityWorkflowAction}
                label="Gửi duyệt"
                fields={{ draftId: id, action: "review" }}
              />
            ) : null}
            {row.status === "in_review" && isAdmin(ctx) ? (
              <RouteForm
                action={entityWorkflowAction}
                label="Xuất bản đề xuất"
                fields={{ draftId: id, action: "publish" }}
              />
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
