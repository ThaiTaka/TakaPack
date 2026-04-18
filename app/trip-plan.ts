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

  if (/(từ thiện|quyên góp|vô gia cư|phát cơm|suất ăn miễn phí|thiện nguyện)/.test(normalized)) {
    return {
      analysis:
        "Sự kiện thiện nguyện phục vụ suất ăn cho người khó khăn, cần phân vai chặt giữa khâu nấu/đóng gói, hậu cần nguyên liệu, phân phối tại điểm phát và an toàn hiện trường.",
      roleHints: [
        "Tiếp nhận nhu cầu & điểm phát",
        "Bếp chay & đóng hộp",
        "Điều phối phân phát",
        "Nguồn lực & truyền thông",
        "An toàn hiện trường"
      ]
    };
  }

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

  if (/(sinh nhật|kỷ niệm|liên hoan|party|tiệc)/.test(normalized)) {
    return {
      analysis:
        `Sự kiện dạng tiệc/celebration (${prompt.slice(0, 80)}), cần tách rõ trang trí, đồ ăn thức uống, nội dung chương trình và hậu cần địa điểm để tránh chồng chéo công việc.`,
      roleHints: ["Trang trí", "Ẩm thực", "Chương trình", "Hậu cần"]
    };
  }

  if (/(workshop|đào tạo|hội thảo|seminar|thuyết trình)/.test(normalized)) {
    return {
      analysis:
        `Sự kiện học thuật/chia sẻ kiến thức (${prompt.slice(0, 80)}), cần phân vai nội dung, truyền thông, hậu cần phòng ốc và chăm sóc người tham dự.`,
      roleHints: ["Nội dung", "Truyền thông", "Hậu cần phòng", "Tiếp đón người tham dự"]
    };
  }

  return {
    analysis: `Sự kiện "${prompt.slice(0, 120)}" có tính chất tùy biến, cần bóc tách mục tiêu, đối tượng tham gia và điều kiện thực thi để phân công nhiệm vụ cụ thể theo từng người.`,
    roleHints: ["Hậu cần", "Ẩm thực", "An toàn", "Điều phối hoạt động"]
  };
}

function buildTaskTemplateByContext(prompt: string): string[] {
  const normalized = prompt.toLowerCase();

  if (/(từ thiện|quyên góp|vô gia cư|phát cơm|suất ăn miễn phí|thiện nguyện)/.test(normalized)) {
    return [
      "Khảo sát trước điểm phát cơm, chốt sức chứa và khung giờ phát suất trước 16:00, gửi pin map + quy định địa phương vào nhóm",
      "Mua nguyên liệu nấu cơm chay theo định lượng tối thiểu 1 suất/người + 10% dự phòng trước 08:00 ngày nấu, gửi hóa đơn",
      "Nấu và đóng hộp suất cơm chay theo tiêu chuẩn an toàn thực phẩm, dán nhãn giờ nấu trên từng thùng trước giờ xuất phát",
      "Phân luồng phát suất theo hàng đợi, ưu tiên người già/yếu thế và cập nhật số suất đã phát mỗi 30 phút vào nhóm"
    ];
  }

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

  const commonRoleTaskBank: Record<string, string[]> = {
    "Hậu cần": [
      "Lập danh sách vật tư chi tiết theo đầu việc và chốt người nhận hàng trước 17:00, gửi bảng theo dõi trạng thái",
      "Chuẩn bị bộ thiết bị vận hành tại chỗ (loa, dây điện, bút, bảng tên) trước giờ sự kiện 120 phút và test toàn bộ",
      "Bố trí sơ đồ khu vực hoạt động theo luồng ra vào, dán biển chỉ dẫn và gửi ảnh hoàn thiện vào nhóm",
      "Lập checklist đóng/mở sự kiện theo mốc giờ và bàn giao người chịu trách nhiệm từng mốc"
    ],
    "Ẩm thực": [
      "Chốt thực đơn theo ngân sách và số người tham gia, đặt hàng trước 1 ngày và gửi xác nhận đơn",
      "Kiểm soát số lượng đồ ăn/đồ uống theo từng khung giờ, cập nhật tồn kho định kỳ 60 phút/lần",
      "Chuẩn bị phương án dị ứng thực phẩm (món thay thế + nhãn cảnh báo), dán nhãn trước giờ bắt đầu",
      "Thu thập và lưu hóa đơn mua thực phẩm, bàn giao bảng chi phí cuối buổi cho trưởng nhóm"
    ],
    "An toàn": [
      "Chuẩn bị túi sơ cứu gồm thuốc cơ bản, băng gạc, dung dịch sát khuẩn và kiểm tra hạn sử dụng trước khi đi",
      "Đánh giá rủi ro địa điểm (thời tiết, giao thông, điện nước), gửi bản cảnh báo ngắn trước giờ tập trung",
      "Phân công 1 đầu mối xử lý sự cố và phổ biến quy trình liên lạc khẩn cấp cho nhóm trước sự kiện",
      "Theo dõi tình trạng an toàn trong suốt sự kiện và gửi tổng kết sự cố nếu có sau khi kết thúc"
    ],
    "Điều phối hoạt động": [
      "Soạn timeline vận hành chi tiết theo mốc giờ và gửi bản chốt trước 20:00 hôm trước",
      "Phân công đầu việc từng người theo năng lực, chốt người backup cho mỗi hạng mục chính",
      "Theo dõi tiến độ thực tế so với timeline, cập nhật trạng thái vào nhóm mỗi 60 phút",
      "Tổng hợp kết quả sau sự kiện gồm việc hoàn thành/chưa hoàn thành và đề xuất cải thiện"
    ],
    "Điều phối": [
      "Soạn lịch triển khai theo giờ và giao việc rõ người chịu trách nhiệm trước ngày tổ chức",
      "Điều hành briefing 15 phút trước giờ bắt đầu để chốt phân vai lần cuối",
      "Theo dõi điểm nghẽn tại hiện trường và điều chỉnh nhân sự theo thời gian thực",
      "Tổng hợp biên bản kết thúc và gửi nhóm ngay sau khi thu dọn"
    ]
  };

  if (/(từ thiện|quyên góp|vô gia cư|phát cơm|suất ăn miễn phí|thiện nguyện)/.test(normalized)) {
    return {
      ...commonRoleTaskBank,
      "Tiếp nhận nhu cầu & điểm phát": [
        "Khảo sát 2 điểm phát tiềm năng, chốt vị trí cuối cùng trước 16:00 và gửi pin map kèm phương án đỗ xe",
        "Làm việc với đại diện địa phương để thống nhất khung giờ phát suất, lưu lại xác nhận bằng tin nhắn",
        "Ước tính số người nhận suất theo khung giờ cao điểm/thấp điểm và gửi bảng dự báo cho nhóm bếp",
        "Chuẩn bị biển thông báo và sơ đồ xếp hàng tại điểm phát trước giờ bắt đầu 45 phút"
      ],
      "Bếp chay & đóng hộp": [
        "Chốt menu cơm chay gồm món chính + rau + canh, tính định lượng cho tổng suất + 10% dự phòng trước 08:00",
        "Mua nguyên liệu tươi theo danh sách đã duyệt, kiểm tra chất lượng đầu vào và chụp hóa đơn gửi nhóm",
        "Tổ chức nấu theo dây chuyền và kiểm soát vệ sinh bếp, hoàn tất đóng hộp trước giờ xuất phát 60 phút",
        "Dán nhãn từng thùng theo loại món và giờ nấu, bàn giao biên bản số lượng cho đội phân phát"
      ],
      "Điều phối phân phát": [
        "Thiết kế luồng xếp hàng 1 chiều tại điểm phát, phân công 2 người hướng dẫn và 1 người kiểm đếm",
        "Phát suất theo thứ tự ưu tiên (người già, phụ nữ có con nhỏ), cập nhật số lượng mỗi 30 phút",
        "Chuẩn bị phương án dự phòng khi phát sinh đông người (chia line A/B) và kích hoạt khi cần",
        "Chốt số suất đã phát/thừa ngay tại hiện trường và gửi báo cáo tóm tắt trước khi rời điểm phát"
      ],
      "Nguồn lực & truyền thông": [
        "Đăng bài kêu gọi nguồn lực đúng thông điệp thiện nguyện, chốt hạn nhận đóng góp trước ngày tổ chức",
        "Theo dõi danh sách ủng hộ tiền/hiện vật, cập nhật minh bạch vào bảng công khai cho nhóm",
        "Ghi nhận hình ảnh hoạt động đúng quy tắc tôn trọng người nhận hỗ trợ, chọn ảnh phù hợp để tổng hợp",
        "Viết báo cáo sau chương trình gồm tổng đóng góp, tổng suất phát và bài học cải tiến cho đợt sau"
      ],
      "An toàn hiện trường": [
        "Chuẩn bị bộ sơ cứu lưu động, nước rửa tay và găng tay dùng một lần trước giờ tập trung 30 phút",
        "Kiểm tra rủi ro khu vực phát (giao thông, mưa, chen lấn), triển khai giải pháp giảm rủi ro trước khi bắt đầu",
        "Giám sát an toàn trong quá trình phát suất và xử lý tình huống phát sinh theo quy trình đã chốt",
        "Tổng kết sự cố/an toàn cuối chương trình và gửi khuyến nghị cải thiện cho lần tổ chức tiếp theo"
      ]
    };
  }

  if (/(chia tay đồng nghiệp|tiệc chia tay|farewell|tạm biệt đồng nghiệp|offboarding)/.test(normalized)) {
    return {
      ...commonRoleTaskBank,
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

  return commonRoleTaskBank;
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
  const inferredContext = inferContext(prompt);
  const roleHints = inferredContext.roleHints;
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
    contextAnalysis:
      !object.contextAnalysis.trim() ||
      /chuyến đi nhóm tổng quát|cân bằng giữa hậu cần, ăn uống, an toàn/i.test(
        object.contextAnalysis
      )
        ? inferredContext.analysis
        : object.contextAnalysis.trim(),
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
