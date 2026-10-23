import { describe, expect, it } from "vitest";
import { z } from "zod";
import { mapDbError, affectedRows } from "@/db/tx";
import { safeValues, zodFieldErrors } from "./action";
import { AppError } from "./errors";
import { themeColors } from "./settings";

const mysqlError = (errno: number) => Object.assign(new Error("db"), { errno });

describe("mapDbError (mce_transaction error mapping)", () => {
  it.each([1062, 1205, 1213])("maps errno %i to 409", (errno) => {
    const mapped = mapDbError(mysqlError(errno));
    expect(mapped).toBeInstanceOf(AppError);
    expect((mapped as AppError).status).toBe(409);
  });
  it.each([1451, 1452])("maps errno %i to 422", (errno) => {
    expect((mapDbError(mysqlError(errno)) as AppError).status).toBe(422);
  });
  it("finds the driver error inside a wrapped cause", () => {
    const wrapped = new Error("query failed", { cause: mysqlError(1062) });
    expect((mapDbError(wrapped) as AppError).status).toBe(409);
  });
  it("leaves other errors untouched", () => {
    const error = new Error("boom");
    expect(mapDbError(error)).toBe(error);
  });
});

describe("affectedRows", () => {
  it("reads mysql2 result headers", () => {
    expect(affectedRows([{ affectedRows: 1 }, undefined])).toBe(1);
    expect(affectedRows({ affectedRows: 0 })).toBe(0);
    expect(affectedRows(undefined)).toBe(0);
  });
});

describe("form helpers", () => {
  it("never echoes secrets back into the form", () => {
    const form = new FormData();
    form.set("email", "a@b.vn");
    form.set("password", "x");
    form.set("password_confirm", "x");
    form.set("current", "x");
    form.set("token", "x");
    form.set("$ACTION_ID_1", "");
    expect(safeValues(form)).toEqual({ email: "a@b.vn" });
  });
  it("keeps the first message per field", () => {
    const result = z
      .object({ a: z.string().min(2, "ngắn").max(1, "dài"), b: z.number() })
      .safeParse({ a: "x", b: "y" });
    expect(result.success).toBe(false);
    if (!result.success) expect(zodFieldErrors(result.error)).toMatchObject({ a: "ngắn" });
  });
});

describe("themeColors (theme.css rules)", () => {
  it("uses defaults, accepts #RRGGBB and falls back on invalid values", () => {
    expect(themeColors({})).toEqual({ primary: "#2864dc", accent: "#f5823b" });
    expect(themeColors({ primary: "#112233" }).primary).toBe("#112233");
    expect(themeColors({ primary: "red", accent: "#12" })).toEqual({
      primary: "#146b50",
      accent: "#f7ce53",
    });
  });
});
