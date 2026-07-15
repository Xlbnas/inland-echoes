import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "极乐迪斯科｜内陆回声文本改写器",
  description: "非官方开源《极乐迪斯科》风格文本改写工具，支持多模型并列比较。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
