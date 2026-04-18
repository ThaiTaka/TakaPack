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

  it("creates differentiated detailed tasks for farewell party members", () => {
    const members = ["Khang", "Linh", "Tuấn"];
    const normalized = normalizeTripPlan(
      {
        eventName: "Tiệc chia tay đồng nghiệp",
        contextAnalysis: "Farewell",
        assignments: [
          {
            assigneeName: "Khang",
            role: "Trang trí không gian",
            tasks: ["Chuẩn bị", "Hỗ trợ team", "Làm checklist"]
          },
          {
            assigneeName: "Linh",
            role: "Ẩm thực & Đồ uống",
            tasks: ["Chuẩn bị", "Hỗ trợ team", "Làm checklist"]
          },
          {
            assigneeName: "Tuấn",
            role: "Nội dung chương trình",
            tasks: ["Chuẩn bị", "Hỗ trợ team", "Làm checklist"]
          }
        ]
      },
      members,
      "Tổ chức tiệc chia tay đồng nghiệp phòng kỹ thuật"
    );

    const khangTasks = normalized.assignments[0].tasks.join(" ").toLowerCase();
    const linhTasks = normalized.assignments[1].tasks.join(" ").toLowerCase();
    const tuanTasks = normalized.assignments[2].tasks.join(" ").toLowerCase();

    expect(khangTasks).toMatch(/backdrop|trang trí|check-in|gallery/);
    expect(linhTasks).toMatch(/menu|nước|buffet|món/);
    expect(tuanTasks).toMatch(/timeline|mc|phát biểu|video/);

    const allTasks = normalized.assignments.flatMap((assignment) => assignment.tasks);
    expect(new Set(allTasks).size).toBe(allTasks.length);
  });

  it("uses charity-specific context analysis instead of generic fallback", () => {
    const members = ["Thái", "Khang", "Danh"];
    const plan = buildMockTripPlan("làm 1 bữa từ thiện cơm chay cho người vô gia cư", members);

    expect(plan.contextAnalysis.toLowerCase()).toContain("thiện nguyện");
    expect(plan.contextAnalysis.toLowerCase()).toContain("người khó khăn");
    expect(plan.contextAnalysis.toLowerCase()).not.toContain("chuyến đi nhóm tổng quát");
  });

  it("avoids repeated generic tasks for random event prompts", () => {
    const members = ["An", "Bình", "Chi"];
    const plan = buildMockTripPlan("Tổ chức workshop kỹ năng giao tiếp cho sinh viên năm nhất", members);

    const allTasks = plan.assignments.flatMap((assignment) => assignment.tasks);
    expect(new Set(allTasks).size).toBe(allTasks.length);

    const joinedTasks = allTasks.join(" ").toLowerCase();
    expect(joinedTasks).not.toMatch(/chuẩn bị checklist đồ cá nhân|xác nhận phương án di chuyển/);
  });
});
