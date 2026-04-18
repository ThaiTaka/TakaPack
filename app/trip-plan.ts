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
  const contextKind = detectContextKind(prompt);
  const normalized = prompt.toLowerCase();

  if (contextKind === "charity") {
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

  if (contextKind === "farewell") {
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

  if (contextKind === "home-party") {
    return {
      analysis:
        "Sự kiện tổ chức tại nhà, ưu tiên chuẩn bị thực phẩm, dọn dẹp, setup không gian; không cần lều trại hay hậu cần di chuyển phức tạp.",
      roleHints: ["Điều phối", "Ẩm thực", "Setup không gian", "Vệ sinh"]
    };
  }

  if (contextKind === "outdoor") {
    return {
      analysis:
        "Hoạt động ngoài trời ở địa hình tự nhiên, cần bổ sung nhóm nhiệm vụ an toàn, sinh tồn, y tế, thiết bị trú ẩn và điều hướng.",
      roleHints: ["Điều hướng", "Dụng cụ sinh tồn", "Ẩm thực dã ngoại", "Y tế & An toàn"]
    };
  }

  if (contextKind === "celebration") {
    return {
      analysis:
        `Sự kiện dạng tiệc/celebration (${prompt.slice(0, 80)}), cần tách rõ trang trí, đồ ăn thức uống, nội dung chương trình và hậu cần địa điểm để tránh chồng chéo công việc.`,
      roleHints: ["Trang trí", "Ẩm thực", "Chương trình", "Hậu cần"]
    };
  }

  if (contextKind === "workshop") {
    return {
      analysis:
        `Sự kiện học thuật/chia sẻ kiến thức (${prompt.slice(0, 80)}), cần phân vai nội dung, truyền thông, hậu cần phòng ốc và chăm sóc người tham dự.`,
      roleHints: ["Nội dung", "Truyền thông", "Hậu cần phòng", "Tiếp đón người tham dự"]
    };
  }

  if (contextKind === "community") {
    return {
      analysis:
        `Sự kiện cộng đồng/xã hội (${prompt.slice(0, 80)}), cần tách rõ vận động nguồn lực, vận hành hiện trường, truyền thông và chăm sóc đối tượng thụ hưởng.`,
      roleHints: ["Điều phối cộng đồng", "Nguồn lực", "Truyền thông", "Vận hành hiện trường"]
    };
  }

  return {
    analysis: `Sự kiện "${prompt.slice(0, 120)}" chưa thuộc nhóm mẫu có sẵn, vì vậy hệ thống ưu tiên bóc tách mục tiêu chính, đối tượng phục vụ và điều kiện thực tế để giao việc chi tiết, đo lường được cho từng thành viên.`,
    roleHints: ["Điều phối tổng", "Nội dung chính", "Hậu cần thực thi", "Giám sát chất lượng"]
  };
}

type ContextKind =
  | "charity"
  | "farewell"
  | "home-party"
  | "outdoor"
  | "celebration"
  | "workshop"
  | "community"
  | "generic";

function detectContextKind(prompt: string): ContextKind {
  const normalized = prompt.toLowerCase();

  if (/(từ thiện|quyên góp|vô gia cư|phát cơm|suất ăn miễn phí|thiện nguyện)/.test(normalized)) {
    return "charity";
  }

  if (/(chia tay đồng nghiệp|tiệc chia tay|farewell|tạm biệt đồng nghiệp|offboarding)/.test(normalized)) {
    return "farewell";
  }

  if (/(tại nhà|ở nhà|home party|bbq tại nhà|nấu ăn tại nhà)/.test(normalized)) {
    return "home-party";
  }

  if (/(đi rừng|trek|camping|cắm trại|leo núi|sinh tồn)/.test(normalized)) {
    return "outdoor";
  }

  if (/(sinh nhật|kỷ niệm|liên hoan|party|tiệc)/.test(normalized)) {
    return "celebration";
  }

  if (/(workshop|đào tạo|hội thảo|seminar|thuyết trình|khóa học|lớp học)/.test(normalized)) {
    return "workshop";
  }

  if (/(cộng đồng|gây quỹ|chiến dịch|hiến máu|nhặt rác|môi trường)/.test(normalized)) {
    return "community";
  }

  return "generic";
}

function buildTaskTemplateByContext(prompt: string): string[] {
  const contextKind = detectContextKind(prompt);

  if (contextKind === "charity") {
    return [
      "Khảo sát trước điểm phát cơm, chốt sức chứa và khung giờ phát suất trước 16:00, gửi pin map + quy định địa phương vào nhóm",
      "Mua nguyên liệu nấu cơm chay theo định lượng tối thiểu 1 suất/người + 10% dự phòng trước 08:00 ngày nấu, gửi hóa đơn",
      "Nấu và đóng hộp suất cơm chay theo tiêu chuẩn an toàn thực phẩm, dán nhãn giờ nấu trên từng thùng trước giờ xuất phát",
      "Phân luồng phát suất theo hàng đợi, ưu tiên người già/yếu thế và cập nhật số suất đã phát mỗi 30 phút vào nhóm"
    ];
  }

  if (contextKind === "farewell") {
    return [
      "Chốt concept màu và in 2 backdrop chữ cho tiệc chia tay trước 18:00 hôm trước, gửi mockup đã duyệt vào nhóm",
      "Đặt combo finger food + 2 loại nước uống đủ số người trước 10:00 ngày tổ chức, gửi xác nhận đơn hàng và giờ giao",
      "Soạn timeline chương trình 45 phút gồm phát biểu, chiếu ảnh, trao quà trước 12:00, gửi MC script cho cả nhóm",
      "Chuẩn bị quà lưu niệm cá nhân hóa (thiệp + ảnh in) trước giờ khai tiệc 2 tiếng, bàn giao danh sách quà đã dán tên"
    ];
  }

  if (contextKind === "home-party") {
    return [
      "Lập danh sách nguyên liệu chi tiết theo món và đặt mua trước 17:00, gửi hóa đơn dự kiến cho nhóm",
      "Setup khu vực ăn uống gồm bàn ghế, đèn dây và loa mini trước giờ đón khách 90 phút, gửi ảnh hoàn thiện",
      "Sơ chế thịt/rau theo khẩu phần từng người trước 16:00, dán nhãn từng hộp để tránh nhầm",
      "Chuẩn bị bộ dụng cụ dọn dẹp sau tiệc (bao rác, găng tay, khăn lau) và bàn giao checklist cuối buổi"
    ];
  }

  if (contextKind === "outdoor") {
    return [
      "Kiểm tra đủ bộ sinh tồn (dao đa năng, dây dù 20m, đèn pin, pin dự phòng) trước 20:00 hôm trước, chụp ảnh từng món",
      "Chuẩn bị túi y tế gồm thuốc sát trùng, băng gạc, thuốc côn trùng và hướng dẫn sơ cứu, bàn giao cho trưởng nhóm trước khi đi",
      "Chia khẩu phần 3 bữa và tối thiểu 2 lít nước/người, đóng gói theo túi ngày 1/ngày 2 và dán nhãn",
      "Chốt GPX cung đường, điểm nghỉ và mốc quay về an toàn trước 21:00, gửi bản đồ offline vào nhóm"
    ];
  }

  if (contextKind === "workshop") {
    return [
      "Khóa timeline workshop theo block nội dung 15-20 phút trước 20:00 hôm trước, gửi agenda đã chốt cho toàn đội",
      "Chuẩn bị slide, micro và bộ tài liệu in cho người tham dự trước giờ check-in 90 phút, test trình chiếu đầy đủ",
      "Bố trí bàn check-in và QR điểm danh, cập nhật danh sách tham dự theo thời gian thực vào sheet chung",
      "Tổng hợp feedback sau workshop trong 24 giờ và gửi báo cáo cải tiến phiên tiếp theo"
    ];
  }

  if (contextKind === "celebration") {
    return [
      "Chốt concept trang trí theo chủ đề sự kiện trước 18:00 hôm trước, gửi moodboard + danh sách vật tư",
      "Đặt menu đồ ăn/đồ uống đúng ngân sách trước 10:00 ngày tổ chức, lưu xác nhận đơn và giờ giao",
      "Soạn timeline chương trình gồm mở đầu, trò chơi/hoạt động chính, kết thúc; bàn giao MC trước giờ diễn",
      "Chuẩn bị phương án dọn dẹp và hoàn trả mặt bằng trong 60 phút sau sự kiện, phân người phụ trách từng khu"
    ];
  }

  if (contextKind === "community") {
    return [
      "Xác định mục tiêu chiến dịch cộng đồng và chỉ số đo lường trước ngày triển khai 2 ngày, gửi bản tóm tắt cho đội",
      "Chốt điểm tập kết, phân ca nhân sự hiện trường và phương án xử lý sự cố trước giờ bắt đầu 12 tiếng",
      "Chuẩn bị nội dung truyền thông và lịch đăng bài theo mốc thời gian, kiểm tra thông điệp thống nhất",
      "Tổng hợp kết quả chiến dịch (số người tham gia, nguồn lực huy động, ảnh minh chứng) trong 24 giờ sau sự kiện"
    ];
  }

  return [
    `Xác định mục tiêu cụ thể của sự kiện "${prompt.slice(0, 60)}" và chốt tiêu chí hoàn thành trước 20:00 hôm trước, gửi bản tóm tắt vào nhóm`,
    "Phân rã đầu việc theo 4 mảng (nội dung, hậu cần, truyền thông, kiểm soát chất lượng) và gán người phụ trách rõ ràng trước khi triển khai",
    "Thiết lập mốc kiểm tra tiến độ theo giờ trong ngày diễn ra sự kiện, cập nhật trạng thái bằng checklist có minh chứng",
    "Tổng hợp kết quả cuối sự kiện gồm mục tiêu đạt/chưa đạt, chi phí và bài học cải tiến, gửi báo cáo trong 24 giờ"
  ];
}

function buildRoleTaskBank(prompt: string): Record<string, string[]> {
  const contextKind = detectContextKind(prompt);

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
    ],
    "Nội dung": [
      "Soạn kịch bản nội dung chính theo từng phân đoạn và chốt bản cuối trước 20:00 hôm trước",
      "Chuẩn bị tài liệu trình bày/tài liệu phát tay đúng số lượng người tham gia trước giờ bắt đầu 90 phút",
      "Điều phối phần trình bày theo timeline, theo dõi thời lượng thực tế và báo điều chỉnh khi lệch mốc",
      "Tổng hợp phản hồi về chất lượng nội dung và đề xuất chỉnh sửa cho lần tổ chức tiếp theo"
    ],
    "Truyền thông": [
      "Lập lịch truyền thông trước/trong/sau sự kiện với nội dung cụ thể từng mốc giờ, gửi plan cho nhóm duyệt",
      "Thiết kế ấn phẩm truyền thông chủ đạo (poster/banner/caption) và chốt phiên bản dùng chính thức",
      "Cập nhật hình ảnh/video diễn biến tại hiện trường theo timeline, lưu thư mục minh chứng có cấu trúc",
      "Báo cáo hiệu quả truyền thông sau sự kiện bằng số liệu tiếp cận/tương tác và đề xuất cải tiến"
    ],
    "Hậu cần phòng": [
      "Kiểm tra phòng ốc, chỗ ngồi, máy chiếu, âm thanh trước giờ bắt đầu 120 phút và chạy thử toàn bộ",
      "Bố trí bàn check-in, bảng tên, tài liệu theo danh sách tham dự trước giờ mở cửa 45 phút",
      "Chuẩn bị vật tư dự phòng (pin, dây nối, bút, giấy) và phân công người xử lý sự cố tại chỗ",
      "Chốt quy trình trả phòng/thu dọn sau sự kiện và gửi checklist hoàn tất cho nhóm"
    ],
    "Tiếp đón người tham dự": [
      "Xác nhận danh sách tham dự và nhắc lịch trước sự kiện 24 giờ qua email/tin nhắn",
      "Tổ chức đón khách tại điểm check-in, hướng dẫn chỗ ngồi và hỗ trợ thông tin theo từng nhóm",
      "Tiếp nhận câu hỏi/phản hồi trong sự kiện và chuyển đúng đầu mối xử lý theo SLA đã chốt",
      "Tổng hợp tỷ lệ tham dự thực tế và lý do vắng mặt để tối ưu cho lần tổ chức sau"
    ],
    "Điều phối cộng đồng": [
      "Chốt mục tiêu chiến dịch cộng đồng theo chỉ số đo lường và timeline triển khai rõ ràng trước ngày diễn ra",
      "Phân ca đội hiện trường và thiết lập kênh liên lạc khẩn cấp cho từng ca trước giờ tập trung",
      "Theo dõi tiến độ hiện trường theo mốc giờ và xử lý điểm nghẽn ngay khi phát sinh",
      "Tổng hợp báo cáo tác động cộng đồng sau chương trình kèm số liệu và minh chứng"
    ],
    "Nguồn lực": [
      "Lập danh sách nguồn lực cần huy động (tiền, hiện vật, nhân sự) và phân bổ chỉ tiêu theo từng đầu mối",
      "Theo dõi cam kết đóng góp theo ngày và cập nhật dashboard nguồn lực trước thời hạn chốt",
      "Đối soát nguồn lực nhận thực tế với kế hoạch, cảnh báo thiếu hụt để kích hoạt phương án bù",
      "Công khai bảng tổng kết nguồn lực minh bạch sau sự kiện và lưu chứng từ đối chiếu"
    ],
    "Vận hành hiện trường": [
      "Khảo sát hiện trường trước sự kiện và xác định các điểm rủi ro vận hành cần kiểm soát",
      "Thiết lập sơ đồ luồng người/luồng vật tư và phân công người phụ trách từng điểm nóng",
      "Giám sát vận hành tại chỗ theo checklist theo giờ, cập nhật trạng thái liên tục cho điều phối",
      "Đóng hiện trường theo quy trình bàn giao và gửi biên bản hoàn tất ngay sau chương trình"
    ],
    "Điều phối tổng": [
      "Bóc tách mục tiêu sự kiện thành đầu việc có deadline, giao người phụ trách và người dự phòng",
      "Điều phối cuộc họp kick-off 20 phút để chốt phạm vi, KPI và cách cập nhật tiến độ",
      "Theo dõi tiến độ các nhánh công việc theo mốc giờ và xử lý xung đột nguồn lực khi phát sinh",
      "Tổng kết cuối sự kiện bằng báo cáo ngắn: kết quả, chi phí, vấn đề, hành động cải tiến"
    ],
    "Nội dung chính": [
      "Thiết kế luồng nội dung chính theo mục tiêu sự kiện và chốt phiên bản dùng thật trước giờ diễn ra 12 tiếng",
      "Chuẩn bị bộ tài liệu minh chứng cho từng điểm nội dung để đội vận hành triển khai đúng",
      "Giám sát chất lượng nội dung trong thời gian chạy sự kiện và chỉnh sửa trực tiếp khi cần",
      "Tổng hợp phản hồi người tham gia về nội dung để cải tiến bản kế tiếp"
    ],
    "Hậu cần thực thi": [
      "Lập danh sách vật tư cần thiết và chốt lịch nhận hàng/kiểm hàng theo mốc giờ cụ thể",
      "Bố trí khu vực, thiết bị, nhân lực vận hành tại chỗ đúng trước giờ bắt đầu tối thiểu 90 phút",
      "Theo dõi tiêu hao vật tư theo thời gian thực và bổ sung khi xuống ngưỡng cảnh báo",
      "Đối soát vật tư sau sự kiện và bàn giao biên bản tổng kết hậu cần"
    ],
    "Giám sát chất lượng": [
      "Thiết lập checklist tiêu chuẩn chất lượng cho từng hạng mục trước ngày triển khai",
      "Kiểm tra ngẫu nhiên các đầu việc trong sự kiện và ghi nhận sai lệch ngay khi phát hiện",
      "Phát hành cảnh báo chất lượng kèm phương án khắc phục cho đội phụ trách trong vòng 15 phút",
      "Tổng hợp báo cáo chất lượng cuối sự kiện với điểm mạnh/yếu và đề xuất cải tiến cụ thể"
    ]
  };

  if (contextKind === "charity") {
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

  if (contextKind === "farewell") {
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

  if (contextKind === "workshop") {
    return {
      ...commonRoleTaskBank,
      "Nội dung": commonRoleTaskBank["Nội dung"],
      "Truyền thông": commonRoleTaskBank["Truyền thông"],
      "Hậu cần phòng": commonRoleTaskBank["Hậu cần phòng"],
      "Tiếp đón người tham dự": commonRoleTaskBank["Tiếp đón người tham dự"]
    };
  }

  if (contextKind === "community") {
    return {
      ...commonRoleTaskBank,
      "Điều phối cộng đồng": commonRoleTaskBank["Điều phối cộng đồng"],
      "Nguồn lực": commonRoleTaskBank["Nguồn lực"],
      "Truyền thông": commonRoleTaskBank["Truyền thông"],
      "Vận hành hiện trường": commonRoleTaskBank["Vận hành hiện trường"]
    };
  }

  if (contextKind === "celebration") {
    return {
      ...commonRoleTaskBank,
      "Trang trí": [
        "Dựng concept trang trí theo chủ đề và hoàn tất setup trước giờ đón khách 90 phút",
        "Chuẩn bị phụ kiện trang trí (bóng bay, standee, photo corner) và kiểm tra độ ổn định trước khi mở cửa",
        "Bố trí khu vực check-in + chụp ảnh và bàn giao danh mục vật phẩm cho người điều phối",
        "Thu hồi vật phẩm trang trí sau sự kiện theo checklist để tránh thất lạc"
      ],
      "Chương trình": [
        "Soạn timeline chương trình theo block giờ và chốt thứ tự hoạt động trước 14:00 ngày tổ chức",
        "Chuẩn bị kịch bản MC/điều phối viên và chạy thử tổng duyệt trước giờ bắt đầu 2 tiếng",
        "Theo dõi thời lượng từng mục và điều chỉnh linh hoạt để đảm bảo kết thúc đúng giờ",
        "Tổng hợp highlights chương trình và gửi recap cho nhóm trong 12 giờ"
      ],
      "Hậu cần": commonRoleTaskBank["Hậu cần"],
      "Ẩm thực": commonRoleTaskBank["Ẩm thực"]
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
