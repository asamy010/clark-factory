import { describe, it, expect } from "vitest";
import { NATIONALITIES, buildStudioPrompt } from "../aiStudioPresets.js";

/* V21.27.133: child nationality control for AI Studio.
   Verifies the data shape (10 real nationalities incl. Egyptian, no Chinese,
   auto default) AND that the chosen nationality is actually injected into the
   generated prompt. */

describe("NATIONALITIES constant", () => {
  const real = NATIONALITIES.filter(n => n.id !== "auto");

  it("has exactly 10 real nationalities + an auto default first", () => {
    expect(NATIONALITIES[0].id).toBe("auto");
    expect(NATIONALITIES[0].subj).toBe("");
    expect(NATIONALITIES[0].prompt).toBe("");
    expect(real).toHaveLength(10);
  });

  it("includes Egyptian", () => {
    const eg = NATIONALITIES.find(n => n.id === "egyptian");
    expect(eg).toBeTruthy();
    expect(eg.label).toContain("مصري");
    expect(eg.subj).toBe("Egyptian");
    expect(eg.prompt.toLowerCase()).toContain("egyptian");
  });

  it("excludes Chinese (Ahmed's rule)", () => {
    const blob = JSON.stringify(NATIONALITIES).toLowerCase();
    expect(blob).not.toContain("chinese");
    expect(blob).not.toContain("china");
  });

  it("every real nationality has a non-empty subj + prompt + label", () => {
    for (const n of real) {
      expect(n.subj.trim().length).toBeGreaterThan(0);
      expect(n.prompt.trim().length).toBeGreaterThan(0);
      expect(n.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("has unique ids", () => {
    const ids = NATIONALITIES.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("buildStudioPrompt — nationality injection (manual model shot)", () => {
  const base = { shotType: "model", genderId: "boy", ageId: "a4_6" };

  it("injects the chosen nationality as a subject prefix", () => {
    const p = buildStudioPrompt({ ...base, nationalityId: "egyptian" });
    expect(p).toContain("Egyptian");
    // appears before the age descriptor (it prefixes the subject)
    expect(p.indexOf("Egyptian")).toBeLessThan(p.indexOf("4 to 6 year old"));
  });

  it("injects a different nationality when chosen", () => {
    expect(buildStudioPrompt({ ...base, nationalityId: "turkish" })).toContain("Turkish");
    expect(buildStudioPrompt({ ...base, nationalityId: "japanese" })).toContain("Japanese");
  });

  it("auto / unset injects nothing extra", () => {
    const auto = buildStudioPrompt({ ...base, nationalityId: "auto" });
    const unset = buildStudioPrompt({ ...base });
    expect(auto).toBe(unset); // auto == no nationality field at all
    // none of the real nationality adjectives leak in on auto
    for (const n of NATIONALITIES.filter(x => x.id !== "auto")) {
      expect(auto).not.toContain(n.subj);
    }
  });
});

describe("ready-prompt injection rule (mirrors runSavedPrompt)", () => {
  // The component builds: natTxt = (id!=="auto" && obj.prompt) ? obj.prompt : ""
  // then pushes an attribute line when natTxt is set.
  const natTxtFor = (id) => {
    const obj = NATIONALITIES.find(x => x.id === id);
    return (obj && id !== "auto" && obj.prompt) ? obj.prompt : "";
  };

  it("produces an injectable clause for a chosen nationality", () => {
    expect(natTxtFor("egyptian")).toContain("Egyptian");
    expect(natTxtFor("indian")).toContain("South-Asian");
  });

  it("produces empty (no injection) for auto", () => {
    expect(natTxtFor("auto")).toBe("");
  });
});
