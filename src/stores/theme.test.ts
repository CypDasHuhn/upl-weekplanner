import { afterEach, describe, expect, it } from "vitest";
import { createTheme } from "./theme";

afterEach(() => {
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
  localStorage.clear();
});

describe("theme store", () => {
  it("toggles and persists the theme", () => {
    const store = createTheme("light");

    expect(document.documentElement.classList.contains("dark")).toBe(false);

    store.toggle();

    expect(store.mode.value).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("upl-weekplanner.theme.v1")).toBe("dark");

    store.toggle();

    expect(store.mode.value).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("applies an initial dark theme", () => {
    createTheme("dark");

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
