# TakaPack

Ứng dụng Next.js (App Router) giúp tự động chia công việc chuẩn bị cho chuyến đi nhóm bằng AI (hoặc mock fallback).

## Stack

- Next.js (App Router)
- Tailwind CSS
- Lucide React
- Vercel AI SDK (`ai`) + `@ai-sdk/openai`

## Chạy local

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`.

## Luồng sử dụng

- Nhập mô tả kế hoạch chuyến đi.
- Nhập danh sách thành viên thật, cách nhau bằng dấu phẩy.
- Nhấn **Phân tích & Chia Task** để nhận phân công.
- Trong lúc xử lý sẽ có trạng thái realtime: **AI đang phân tích ngữ cảnh...**

AI (hoặc mock fallback) trả về:

- `eventName`
- `contextAnalysis`
- `assignments[]` gồm `assigneeName`, `role`, `tasks` (3-4 task mỗi người)

## Nâng cấp UX mới

- Streaming realtime với trạng thái "AI đang phân tích..."
- Skeleton card khi đang stream
- Hiệu ứng stagger/fade-in cho assignment card
- Guardrails JSON chặt hơn: chỉ cho phép phân công đúng danh sách tên đã nhập
- Lưu local state cho prompt, danh sách thành viên, kế hoạch gần nhất
- Checklist task có tiến độ hoàn thành theo phần trăm
- Nút Export JSON để tải kế hoạch về máy
- Preset prompt nhanh để demo/test nhiều bối cảnh

## Biến môi trường (tùy chọn)

Copy file mẫu:

```bash
copy .env.example .env.local
```

Điền `OPENAI_API_KEY` nếu muốn dùng AI thật. Nếu không có key, app tự fallback sang dữ liệu mock.

## File chính

- `app/types.ts`: định nghĩa `TripPlan`
- `app/actions.ts`: server action `generateTripTasks`
- `app/api/trip-plan/route.ts`: API streaming object cho client
- `app/trip-plan.ts`: schema + logic dùng chung (parse tên, infer context, fallback)
- `app/page.tsx`: trang chủ dark mode + glassmorphism
- `components/TripPlanner.tsx`: form prompt + member names, streaming (`experimental_useObject`), loading/error, render kết quả
- `components/AssignmentCard.tsx`: card assignment premium, role editable, checkbox UI
