import type { Metadata, Viewport } from "next";
import { MotionProvider } from "@/components/motion/MotionProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "极乐迪斯科｜内陆回声文本改写器",
  description: "非官方开源《极乐迪斯科》风格文本改写工具，支持多模型并列比较。",
};

export const viewport: Viewport = {
  themeColor: "#101a1d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <a className="skip-link" href="#main-content">跳到主要内容</a>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
