import { describe, expect, it } from "vitest";
import {
  buildMockTripPlan,
  createTripPlanSchemaForMembers,
  normalizeTripPlan,
  parseMemberNames
} from "../app/trip-plan";

describe("parseMemberNames", () => {
  it("deduplicates and trims names", () => {
    const result = parseMemberNames(" Taka, Nhi, taka ,  Nam ,, ");
    expect(result).toEqual(["Taka", "Nhi", "Nam"]);
  });
});

describe("createTripPlanSchemaForMembers", () => {
  it("accepts only provided assignee names", () => {
    const schema = createTripPlanSchemaForMembers(["Taka", "Nhi"]);

    const parsed = schema.safeParse({
      eventName: "Test",
      contextAnalysis: "Context",
      assignments: [
        {
          assigneeName: "Taka",
          role: "Lead",
          tasks: ["A", "B", "C"]
        }
      ]
    });

    expect(parsed.success).toBe(true);

    const invalid = schema.safeParse({
      eventName: "Test",
      contextAnalysis: "Context",
      assignments: [
        {
          assigneeName: "KhacNguoi",
          role: "Lead",
          tasks: ["A", "B", "C"]
        }
      ]
    });

    expect(invalid.success).toBe(false);
  });
});

describe("normalizeTripPlan", () => {
  it("guarantees each member has 3-4 tasks", () => {
    const members = ["Taka", "Nhi"];
    const source = buildMockTripPlan("Cắm trại rừng", members);

    const normalized = normalizeTripPlan(source, members, "Cắm trại rừng");

    for (const assignment of normalized.assignments) {
      expect(assignment.tasks.length).toBeGreaterThanOrEqual(3);
      expect(assignment.tasks.length).toBeLessThanOrEqual(4);
    }
  });

  it("enriches tasks with deadline or deliverable details", () => {
    const members = ["Taka"];
    const normalized = normalizeTripPlan(
      {
        eventName: "BBQ sân thượng",
        contextAnalysis: "Tại nhà",
        assignments: [
          {
            assigneeName: "Taka",
            role: "Ẩm thực",
            tasks: ["Mua nước uống", "Sơ chế thịt nướng", "Chuẩn bị đá lạnh"]
          }
        ]
      },
      members,
      "BBQ tại nhà"
    );

    const tasks = normalized.assignments[0].tasks.join(" ").toLowerCase();
    expect(tasks).toContain("trước");
    expect(/gửi|báo|checklist|xác nhận/.test(tasks)).toBe(true);
  });
});
