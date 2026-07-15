import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "内陆回声｜中文文本侧写台",
  description: "将普通中文改写为原创的心理黑色叙事。支持多模型并列比较。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
