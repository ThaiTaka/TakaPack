import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { TripPlan } from "./types";

const assignmentSchema = z
  .object({
    assigneeName: z.string().min(1),
    role: z.string().min(1),
    tasks: z.array(z.string().min(1)).min(3).max(4)
  })
  .strict();

export const tripPlanSchema = z.object({
  eventName: z.string().min(1),
  contextAnalysis: z.string().min(1),
  assignments: z.array(assignmentSchema).min(1).max(20)
}).strict();

export function createTripPlanSchemaForMembers(memberNames: string[]) {
  const allowedAssignees = z.enum(memberNames as [string, ...string[]]);

  return z
    .object({
      eventName: z.string().min(1),
      contextAnalysis: z.string().min(1),
      assignments: z
        .array(
          z
            .object({
              assigneeName: allowedAssignees,
              role: z.string().min(1),
              tasks: z.array(z.string().min(1)).min(3).max(4)
            })
            .strict()
        )
        .min(1)
        .max(memberNames.length)
    })
    .strict();
}

export const TRIP_PLANNER_SYSTEM_PROMPT = [
  "Bạn là chuyên gia điều phối chuyến đi nhóm và logistics thực địa.",
  "Bắt buộc phân tích ngữ cảnh sự kiện trước khi chia việc (ví dụ: tại nhà thì không có lều trại/đi rừng; đi rừng phải có an toàn, y tế, định hướng, sinh tồn).",
  "Chỉ phân công đúng cho danh sách thành viên được cung cấp, không thêm người mới.",
  "Mỗi thành viên phải có vai trò rõ ràng và CHÍNH XÁC 3-4 tasks chi tiết.",
  "Mỗi task phải chứa: (1) hành động cụ thể, (2) vật dụng/hạng mục cần chuẩn bị, (3) mốc thời gian hoặc kết quả bàn giao đo được.",
  "Không dùng task chung chung kiểu 'chuẩn bị đồ', 'check lại', 'hỗ trợ team'.",
  "Ưu tiên câu task có cấu trúc rõ: 'Làm gì + cho hạng mục nào + trước thời điểm nào + output mong đợi'.",
  "Luôn trả về JSON nghiêm ngặt đúng schema, không markdown, không giải thích ngoài JSON."
].join(" ");

export function buildTripPlannerPrompt(prompt: string, memberNames: string[]): string {
  return [
    `Yêu cầu chuyến đi: ${prompt}`,
    `Danh sách thành viên (chỉ dùng các tên này): ${memberNames.join(", ")}`,
    "Ràng buộc: mỗi thành viên có 3-4 công việc; role và task phải phù hợp bối cảnh thực tế.",
    "Task phải đủ chi tiết theo mẫu: Hành động + Hạng mục + Mốc thời gian/Kết quả.",
    "Ví dụ tốt: 'Mua đủ 6L nước uống và 2 túi đá trước 17:00, chụp hóa đơn gửi nhóm'.",
    "Ưu tiên chia đều khối lượng công việc và tránh nhiệm vụ trùng lặp không cần thiết.",
    "Trả JSON đúng schema duy nhất."
  ].join("\n");
}

export function parseMemberNames(membersInput: string): string[] {
  const seen = new Set<string>();

  return membersInput
    .split(",")
    .map((name) => name.trim())
    .filter((name) => {
      if (!name) {
        return false;
      }

      const key = name.toLowerCase();
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

export function inferContext(prompt: string): { analysis: string; roleHints: string[] } {
  const normalized = prompt.toLowerCase();

  if (/(tại nhà|ở nhà|home party|bbq tại nhà|nấu ăn tại nhà)/.test(normalized)) {
    return {
      analysis:
        "Sự kiện tổ chức tại nhà, ưu tiên chuẩn bị thực phẩm, dọn dẹp, setup không gian; không cần lều trại hay hậu cần di chuyển phức tạp.",
      roleHints: ["Điều phối", "Ẩm thực", "Setup không gian", "Vệ sinh"]
    };
  }

  if (/(đi rừng|trek|camping|cắm trại|leo núi|sinh tồn)/.test(normalized)) {
    return {
      analysis:
        "Hoạt động ngoài trời ở địa hình tự nhiên, cần bổ sung nhóm nhiệm vụ an toàn, sinh tồn, y tế, thiết bị trú ẩn và điều hướng.",
      roleHints: ["Điều hướng", "Dụng cụ sinh tồn", "Ẩm thực dã ngoại", "Y tế & An toàn"]
    };
  }

  return {
    analysis:
      "Chuyến đi nhóm tổng quát, cần cân bằng giữa hậu cần, ăn uống, an toàn và trải nghiệm để mọi thành viên có trách nhiệm rõ ràng.",
    roleHints: ["Hậu cần", "Ẩm thực", "An toàn", "Điều phối hoạt động"]
  };
}

function buildTaskTemplateByContext(prompt: string): string[] {
  const normalized = prompt.toLowerCase();

  if (/(tại nhà|ở nhà|home party|bbq tại nhà|nấu ăn tại nhà)/.test(normalized)) {
    return [
      "Lập danh sách nguyên liệu và vật dụng nấu nướng cần mua",
      "Chuẩn bị khu vực ăn uống, bàn ghế và ánh sáng",
      "Phân công sơ chế món chính và đồ uống",
      "Sắp xếp checklist dọn dẹp trước/sau sự kiện"
    ];
  }

  if (/(đi rừng|trek|camping|cắm trại|leo núi|sinh tồn)/.test(normalized)) {
    return [
      "Kiểm tra thiết bị sinh tồn: dao đa năng, dây dù, đèn, pin",
      "Chuẩn bị bộ y tế và phương án xử lý chấn thương nhẹ",
      "Lên kế hoạch nước uống, khẩu phần và bữa chính",
      "Xác nhận cung đường, điểm nghỉ và thời gian quay về an toàn"
    ];
  }

  return [
    "Chuẩn bị checklist đồ cá nhân và đồ dùng chung",
    "Xác nhận phương án di chuyển, giờ tập trung và liên lạc",
    "Phân chia mua sắm thực phẩm, đồ uống, vật dụng ăn uống",
    "Kiểm tra hạng mục an toàn: y tế cơ bản, dự báo thời tiết"
  ];
}

function enforceThreeToFourTasks(tasks: string[], fallbackPool: string[]): string[] {
  const normalized = tasks.map((item) => item.trim()).filter(Boolean);

  if (normalized.length >= 3 && normalized.length <= 4) {
    return normalized;
  }

  if (normalized.length > 4) {
    return normalized.slice(0, 4);
  }

  const next = [...normalized];
  for (let index = 0; next.length < 3; index += 1) {
    next.push(fallbackPool[index % fallbackPool.length]);
  }

  return next;
}

function enrichTaskDetail(task: string, assigneeName: string, role: string, prompt: string): string {
  const baseTask = task.trim();
  if (!baseTask) {
    return `${assigneeName} hoàn tất checklist theo vai trò ${role} trước giờ tập trung và gửi xác nhận vào nhóm chat.`;
  }

  const normalized = baseTask.toLowerCase();
  const hasDeadline = /trước|trong vòng|trước giờ|\d{1,2}:\d{2}|ngày|đêm|sáng|chiều|tối/.test(
    normalized
  );
  const hasDeliverable = /gửi|báo|xác nhận|checklist|danh sách|hóa đơn|ảnh|bàn giao/.test(normalized);

  if (hasDeadline && hasDeliverable && baseTask.length >= 45) {
    return baseTask;
  }

  const isHome = /(tại nhà|ở nhà|home party|bbq tại nhà|nấu ăn tại nhà)/.test(
    prompt.toLowerCase()
  );
  const isForest = /(đi rừng|trek|camping|cắm trại|leo núi|sinh tồn)/.test(
    prompt.toLowerCase()
  );

  const deadline = isForest
    ? "trước 20:00 tối trước ngày khởi hành"
    : "trước giờ tập trung 1 ngày";
  const output = isHome
    ? "gửi checklist + ảnh setup vào nhóm"
    : isForest
      ? "báo cáo số lượng vật dụng và trạng thái an toàn vào nhóm"
      : "gửi checklist xác nhận hoàn tất vào nhóm";

  return `${baseTask} (${assigneeName} phụ trách vai trò ${role}, ${deadline}, ${output}).`;
}

function enrichAssignmentTasks(
  tasks: string[],
  assigneeName: string,
  role: string,
  prompt: string
): string[] {
  return tasks.map((task) => enrichTaskDetail(task, assigneeName, role, prompt));
}

export function normalizeTripPlan(object: TripPlan, memberNames: string[], prompt: string): TripPlan {
  const fallbackTasks = buildTaskTemplateByContext(prompt);
  const roleHints = inferContext(prompt).roleHints;

  const assignmentByName = new Map(
    object.assignments.map((assignment) => [assignment.assigneeName.toLowerCase(), assignment])
  );

  const assignments = memberNames.map((name, index) => {
    const fromAi = assignmentByName.get(name.toLowerCase());
    return {
      assigneeName: name,
      role: fromAi?.role?.trim() || `${roleHints[index % roleHints.length]} Lead`,
      tasks: enrichAssignmentTasks(
        enforceThreeToFourTasks(fromAi?.tasks ?? [], fallbackTasks),
        name,
        fromAi?.role?.trim() || `${roleHints[index % roleHints.length]} Lead`,
        prompt
      )
    };
  });

  return {
    eventName: object.eventName.trim() || "Kế hoạch chuyến đi nhóm",
    contextAnalysis: object.contextAnalysis.trim() || inferContext(prompt).analysis,
    assignments
  };
}

export function buildMockTripPlan(prompt: string, memberNames: string[]): TripPlan {
  const context = inferContext(prompt);
  const fallbackTasks = buildTaskTemplateByContext(prompt);

  const assignments = memberNames.map((memberName, index) => ({
    assigneeName: memberName,
    role: context.roleHints[index % context.roleHints.length],
    tasks: enrichAssignmentTasks(
      fallbackTasks.map((task) => `${task}${index % 2 === 0 ? "" : " (phụ trách chính)"}`),
      memberName,
      context.roleHints[index % context.roleHints.length],
      prompt
    )
  }));

  return {
    eventName: prompt.slice(0, 120) || "Kế hoạch chuyến đi nhóm",
    contextAnalysis: context.analysis,
    assignments
  };
}

export async function generateTripTasks(prompt: string, memberNamesInput: string): Promise<TripPlan> {
  const safePrompt = prompt.trim();
  const memberNames = parseMemberNames(memberNamesInput);

  if (!safePrompt) {
    throw new Error("Vui lòng nhập kế hoạch chuyến đi.");
  }

  if (memberNames.length === 0) {
    throw new Error("Vui lòng nhập tên thành viên, cách nhau bằng dấu phẩy.");
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const runtimeSchema = createTripPlanSchemaForMembers(memberNames);

      const { object } = await generateObject({
        model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
        schema: runtimeSchema,
        system: TRIP_PLANNER_SYSTEM_PROMPT,
        prompt: buildTripPlannerPrompt(safePrompt, memberNames)
      });

      return normalizeTripPlan(runtimeSchema.parse(object), memberNames, safePrompt);
    } catch (error) {
      console.error("AI generation failed. Falling back to mock plan.", error);
    }
  }

  return buildMockTripPlan(safePrompt, memberNames);
}
