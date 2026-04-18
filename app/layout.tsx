import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TakaPack",
  description: "AI chia công việc và chuẩn bị đồ đạc cho chuyến đi nhóm"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
