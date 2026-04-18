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
  "Mỗi thành viên phải có vai trò riêng và CHÍNH XÁC 3-4 tasks chi tiết, KHÔNG trùng nhiệm vụ chính giữa các thành viên.",
  "Mỗi task bắt buộc chứa: (1) hành động cụ thể, (2) hạng mục/vật dụng cụ thể, (3) mốc thời gian hoặc kết quả bàn giao đo được.",
  "Không dùng task chung chung kiểu 'chuẩn bị checklist', 'phân chia', 'xác nhận phương án', 'hỗ trợ team'.",
  "Nếu là tiệc chia tay đồng nghiệp: phải tách rõ nhóm trang trí, đồ ăn/đồ uống, nội dung chương trình, quà/kỷ niệm và hậu cần hiện trường.",
  "Luôn trả về JSON nghiêm ngặt đúng schema, không markdown, không giải thích ngoài JSON."
].join(" ");

export function buildTripPlannerPrompt(prompt: string, memberNames: string[]): string {
  return [
    `Yêu cầu chuyến đi: ${prompt}`,
    `Danh sách thành viên (chỉ dùng các tên này): ${memberNames.join(", ")}`,
    "Ràng buộc: mỗi thành viên có 3-4 công việc, vai trò khác nhau và nhiệm vụ không trùng việc chính.",
    "Task phải đủ chi tiết theo mẫu: Hành động + Hạng mục cụ thể + Mốc thời gian/Kết quả.",
    "Ví dụ tốt: 'Mua 4kg trái cây + 24 lon nước ngọt trước 16:00, gửi hóa đơn và ảnh giao hàng vào nhóm'.",
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

  if (/(chia tay đồng nghiệp|tiệc chia tay|farewell|tạm biệt đồng nghiệp|offboarding)/.test(normalized)) {
    return {
      analysis:
        "Sự kiện tiệc chia tay đồng nghiệp, cần phân vai rõ giữa trang trí, ăn uống, chương trình phát biểu, quà lưu niệm và hậu cần vận hành tại chỗ.",
      roleHints: [
        "Trang trí không gian",
        "Ẩm thực & Đồ uống",
        "Nội dung chương trình",
        "Quà tặng & Kỷ niệm",
        "Hậu cần hiện trường"
      ]
    };
  }

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

  if (/(chia tay đồng nghiệp|tiệc chia tay|farewell|tạm biệt đồng nghiệp|offboarding)/.test(normalized)) {
    return [
      "Chốt concept màu và in 2 backdrop chữ cho tiệc chia tay trước 18:00 hôm trước, gửi mockup đã duyệt vào nhóm",
      "Đặt combo finger food + 2 loại nước uống đủ số người trước 10:00 ngày tổ chức, gửi xác nhận đơn hàng và giờ giao",
      "Soạn timeline chương trình 45 phút gồm phát biểu, chiếu ảnh, trao quà trước 12:00, gửi MC script cho cả nhóm",
      "Chuẩn bị quà lưu niệm cá nhân hóa (thiệp + ảnh in) trước giờ khai tiệc 2 tiếng, bàn giao danh sách quà đã dán tên"
    ];
  }

  if (/(tại nhà|ở nhà|home party|bbq tại nhà|nấu ăn tại nhà)/.test(normalized)) {
    return [
      "Lập danh sách nguyên liệu chi tiết theo món và đặt mua trước 17:00, gửi hóa đơn dự kiến cho nhóm",
      "Setup khu vực ăn uống gồm bàn ghế, đèn dây và loa mini trước giờ đón khách 90 phút, gửi ảnh hoàn thiện",
      "Sơ chế thịt/rau theo khẩu phần từng người trước 16:00, dán nhãn từng hộp để tránh nhầm",
      "Chuẩn bị bộ dụng cụ dọn dẹp sau tiệc (bao rác, găng tay, khăn lau) và bàn giao checklist cuối buổi"
    ];
  }

  if (/(đi rừng|trek|camping|cắm trại|leo núi|sinh tồn)/.test(normalized)) {
    return [
      "Kiểm tra đủ bộ sinh tồn (dao đa năng, dây dù 20m, đèn pin, pin dự phòng) trước 20:00 hôm trước, chụp ảnh từng món",
      "Chuẩn bị túi y tế gồm thuốc sát trùng, băng gạc, thuốc côn trùng và hướng dẫn sơ cứu, bàn giao cho trưởng nhóm trước khi đi",
      "Chia khẩu phần 3 bữa và tối thiểu 2 lít nước/người, đóng gói theo túi ngày 1/ngày 2 và dán nhãn",
      "Chốt GPX cung đường, điểm nghỉ và mốc quay về an toàn trước 21:00, gửi bản đồ offline vào nhóm"
    ];
  }

  return [
    "Chốt danh sách vật dụng cá nhân + đồ dùng chung theo số người trước 19:00 hôm trước, gửi checklist đã tick đầy đủ",
    "Xác định điểm hẹn, phương tiện và timeline di chuyển chi tiết trước 18:00, gửi pin map + số hotline nhóm",
    "Đặt thực phẩm, đồ uống và vật dụng ăn uống theo ngân sách đã thống nhất, gửi hóa đơn tạm tính trước khi thanh toán",
    "Chuẩn bị phương án an toàn gồm y tế cơ bản, thời tiết và liên hệ khẩn cấp, bàn giao bản tóm tắt 1 trang cho nhóm"
  ];
}

function buildRoleTaskBank(prompt: string): Record<string, string[]> {
  const normalized = prompt.toLowerCase();

  if (/(chia tay đồng nghiệp|tiệc chia tay|farewell|tạm biệt đồng nghiệp|offboarding)/.test(normalized)) {
    return {
      "Trang trí không gian": [
        "Dựng concept trang trí theo tông màu công ty, in backdrop 2.5m và hoàn tất setup trước giờ khai tiệc 90 phút",
        "Chuẩn bị bóng bay chữ + dây đèn + standee ảnh kỷ niệm, kiểm tra độ chắc chắn và chụp ảnh hiện trường sau setup",
        "Bố trí bàn gallery ảnh theo timeline làm việc của đồng nghiệp, dán chú thích từng mốc trước khi khách vào",
        "Chuẩn bị góc check-in gồm khung ảnh cầm tay và props, bàn giao danh mục vật phẩm cho người điều phối"
      ],
      "Ẩm thực & Đồ uống": [
        "Lên menu finger food gồm 6 món mặn/2 món ngọt, chốt số lượng theo đầu người và đặt trước 10:00 ngày tổ chức",
        "Mua nước ngọt, trà và đá lạnh đủ 1.5 suất/người, nhận hàng trước giờ khai tiệc 60 phút và gửi hóa đơn",
        "Bố trí line buffet theo luồng di chuyển, dán nhãn món và dị ứng thực phẩm trước khi đón khách",
        "Chuẩn bị bộ dụng cụ ăn uống (ly, dĩa, khăn giấy) có dư 20%, kiểm tra tồn kho lần cuối trước 17:00"
      ],
      "Nội dung chương trình": [
        "Soạn timeline chương trình 45 phút gồm mở đầu, phát biểu, chiếu video và trao quà; gửi bản lock trước 14:00",
        "Chuẩn bị kịch bản MC 2 phiên bản (đủ thời gian/rút gọn), bàn giao cho MC trước giờ chạy thử 2 tiếng",
        "Tổng hợp lời chúc từ đồng nghiệp thành 1 video 3-5 phút, xuất file Full HD và test trình chiếu trước sự kiện",
        "Điều phối danh sách người phát biểu theo thứ tự và thời lượng, chốt với từng người trước giờ khai tiệc"
      ],
      "Quà tặng & Kỷ niệm": [
        "Chốt ngân sách quà chia tay và đặt quà chính trước 3 ngày, lưu chứng từ mua hàng trong thư mục chung",
        "In thiệp chúc cá nhân hóa theo từng nhóm phòng ban, hoàn tất ký tên trước ngày tổ chức 1 ngày",
        "Chuẩn bị album ảnh kỷ niệm 20-30 tấm đã chú thích, đóng gói hộp quà trước giờ bắt đầu 2 tiếng",
        "Bố trí quy trình trao quà đúng timeline chương trình, bàn giao thứ tự quà cho người điều phối sân khấu"
      ],
      "Hậu cần hiện trường": [
        "Chốt danh sách thiết bị sự kiện (loa, micro, máy chiếu, dây nối) và kiểm tra hoạt động trước giờ khai tiệc 120 phút",
        "Phân công trực check-in và hướng dẫn chỗ ngồi, in danh sách khách xác nhận tham gia trước 16:00",
        "Chuẩn bị phương án dự phòng điện/âm thanh và bộ dụng cụ sửa lỗi nhanh tại chỗ trước giờ chạy thử",
        "Lập kế hoạch dọn dẹp sau tiệc theo 3 chặng (thu gom, phân loại rác, trả mặt bằng), chốt người phụ trách từng chặng"
      ]
    };
  }

  return {};
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

function isGenericTask(task: string): boolean {
  const normalized = task.toLowerCase();
  return /checklist|phương án|phân chia|xác nhận|hỗ trợ|chuẩn bị đồ|kiểm tra hạng mục/.test(normalized);
}

function buildRoleSpecificTasks(
  role: string,
  prompt: string,
  memberIndex: number,
  targetCount: number
): string[] {
  const roleTaskBank = buildRoleTaskBank(prompt);
  const fallbackPool = buildTaskTemplateByContext(prompt);
  const pool = roleTaskBank[role] ?? fallbackPool;

  const start = memberIndex % pool.length;
  const detailedTasks: string[] = [];

  for (let offset = 0; detailedTasks.length < targetCount; offset += 1) {
    const task = pool[(start + offset) % pool.length];
    if (!detailedTasks.includes(task)) {
      detailedTasks.push(task);
    }

    if (offset > pool.length + 6) {
      break;
    }
  }

  return detailedTasks;
}

function enforceDetailedDistinctTasks(
  currentTasks: string[],
  role: string,
  assigneeName: string,
  prompt: string,
  memberIndex: number,
  usedTaskSet: Set<string>
): string[] {
  const targetCount = Math.min(Math.max(currentTasks.length, 3), 4);
  const roleDetailedPool = buildRoleSpecificTasks(role, prompt, memberIndex, 6);

  const finalTasks: string[] = [];
  let poolCursor = 0;

  const pushUniqueTask = (candidate: string) => {
    const normalized = candidate.trim();
    if (!normalized) {
      return false;
    }

    if (usedTaskSet.has(normalized)) {
      return false;
    }

    usedTaskSet.add(normalized);
    finalTasks.push(normalized);
    return true;
  };

  for (const task of currentTasks) {
    if (finalTasks.length >= targetCount) {
      break;
    }

    if (!isGenericTask(task) && task.trim().length >= 35 && pushUniqueTask(task)) {
      continue;
    }

    while (poolCursor < roleDetailedPool.length && !pushUniqueTask(roleDetailedPool[poolCursor])) {
      poolCursor += 1;
    }

    poolCursor += 1;
  }

  while (finalTasks.length < targetCount) {
    const fallbackTask = roleDetailedPool[poolCursor % roleDetailedPool.length];
    const uniqueVariant = `${fallbackTask} (đầu mối: ${assigneeName})`;

    if (!pushUniqueTask(fallbackTask)) {
      pushUniqueTask(uniqueVariant);
    }

    poolCursor += 1;
  }

  return finalTasks;
}

export function normalizeTripPlan(object: TripPlan, memberNames: string[], prompt: string): TripPlan {
  const fallbackTasks = buildTaskTemplateByContext(prompt);
  const roleHints = inferContext(prompt).roleHints;
  const usedTaskSet = new Set<string>();

  const assignmentByName = new Map(
    object.assignments.map((assignment) => [assignment.assigneeName.toLowerCase(), assignment])
  );

  const assignments = memberNames.map((name, index) => {
    const fromAi = assignmentByName.get(name.toLowerCase());
    const resolvedRole = fromAi?.role?.trim() || roleHints[index % roleHints.length];

    return {
      assigneeName: name,
      role: resolvedRole,
      tasks: enforceDetailedDistinctTasks(
        enforceThreeToFourTasks(fromAi?.tasks ?? [], fallbackTasks),
        resolvedRole,
        name,
        prompt,
        index,
        usedTaskSet
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
  const usedTaskSet = new Set<string>();

  const assignments = memberNames.map((memberName, index) => ({
    assigneeName: memberName,
    role: context.roleHints[index % context.roleHints.length],
    tasks: enforceDetailedDistinctTasks(
      fallbackTasks,
      context.roleHints[index % context.roleHints.length],
      memberName,
      prompt,
      index,
      usedTaskSet
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
