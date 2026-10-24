"use client";

import { useEffect, useRef, useState } from "react";

// Header behaviour from assets/js/app.js: the mobile menu (Escape closes, focus leaving closes,
// desktop width resets), the measured header height for scroll padding, and the skip link.

export function MenuButton() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const nav = document.getElementById("navigation");
    nav?.classList.toggle("open", open);
    if (open) nav?.querySelector<HTMLElement>("a,button")?.focus();
  }, [open]);

  useEffect(() => {
    const nav = document.getElementById("navigation");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && nav?.classList.contains("open")) {
        e.preventDefault();
        setOpen(false);
        button.current?.focus();
      }
    };
    const onFocus = (e: FocusEvent) => {
      if (
        nav?.classList.contains("open") &&
        !nav.contains(e.target as Node) &&
        e.target !== button.current
      )
        setOpen(false);
    };
    const mobile = matchMedia("(max-width:900px)");
    const onWidth = () => {
      if (!mobile.matches) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    mobile.addEventListener("change", onWidth);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
      mobile.removeEventListener("change", onWidth);
    };
  }, []);

  return (
    <button
      ref={button}
      className="menu"
      type="button"
      aria-controls="navigation"
      aria-expanded={open}
      aria-label={open ? "Đóng menu" : "Mở menu"}
      onClick={() => setOpen((v) => !v)}
    >
      ☰
    </button>
  );
}

/** Keeps --header-offset equal to the sticky header height (used for scroll padding). */
export function HeaderOffset() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header");
    if (!header) return;
    const update = () =>
      document.documentElement.style.setProperty(
        "--header-offset",
        `${Math.ceil(header.getBoundingClientRect().height)}px`,
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return null;
}

export function SkipLink() {
  return (
    <a
      className="skip-link"
      href="#main-content"
      onClick={(e) => {
        const main = document.getElementById("main-content");
        if (!main) return;
        e.preventDefault();
        document.getElementById("navigation")?.classList.remove("open");
        main.focus();
        main.scrollIntoView({ block: "start", behavior: "instant" });
      }}
    >
      Đến nội dung chính
    </a>
  );
}

/** Turns animations off for this page (learner preference). */
export function NoMotion() {
  useEffect(() => {
    const frame = document.querySelector(".site-frame");
    frame?.classList.add("mce-no-motion");
    return () => frame?.classList.remove("mce-no-motion");
  }, []);
  return null;
}
