import { describe, it, expect } from "vitest";
import { computeFunnel, type FunnelDay } from "../funnel";

function day(p: Partial<FunnelDay>): FunnelDay {
  return { leads: 0, hot: 0, warm: 0, converted: 0, fInteragiu: 0, fAgendou: 0, ...p };
}

describe("computeFunnel", () => {
  it("returns the five stages in order", () => {
    const stages = computeFunnel([]);
    expect(stages.map((s) => s.label)).toEqual([
      "Captados", "Interagiram", "Qualificados", "Agendaram", "Convertidos",
    ]);
  });

  it("is monotonic non-increasing for well-formed gate data", () => {
    // Gates are supersets by construction in page.tsx; the funnel must never invert.
    const series = [
      day({ leads: 10, hot: 2, warm: 3, converted: 1, fInteragiu: 8, fAgendou: 4 }),
      day({ leads: 5, hot: 1, warm: 1, converted: 2, fInteragiu: 4, fAgendou: 3 }),
    ];
    const values = computeFunnel(series).map((s) => s.value);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
    }
  });

  it("Captados equals Σ leads and Convertidos equals Σ converted (KPI identity)", () => {
    const series = [
      day({ leads: 7, converted: 2, hot: 1, warm: 1, fInteragiu: 6, fAgendou: 3 }),
      day({ leads: 3, converted: 1, hot: 0, warm: 1, fInteragiu: 2, fAgendou: 2 }),
    ];
    const stages = computeFunnel(series);
    expect(stages[0].value).toBe(10); // Captados == 7 + 3
    expect(stages[4].value).toBe(3); // Convertidos == 2 + 1
  });

  it("Qualificados counts hot + warm + converted", () => {
    const stages = computeFunnel([day({ leads: 5, hot: 2, warm: 1, converted: 1, fInteragiu: 5, fAgendou: 4 })]);
    expect(stages[2].value).toBe(4); // 2 + 1 + 1
  });

  it("yields all-zero stages for an empty period (safe fallback)", () => {
    expect(computeFunnel([]).every((s) => s.value === 0)).toBe(true);
  });
});
