import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "180px",
          height: "180px",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          borderRadius: "20px",
          background: "#101a1d",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: "142px",
            height: "146px",
            border: "13px solid #d8b45b",
            borderRightColor: "transparent",
            borderRadius: "48% 52% 46% 54%",
            transform: "rotate(-17deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "100px",
            height: "106px",
            border: "11px solid rgba(216,180,91,0.88)",
            borderRightColor: "transparent",
            borderRadius: "52% 48% 55% 45%",
            transform: "rotate(-11deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "62px",
            height: "66px",
            border: "9px solid rgba(216,180,91,0.72)",
            borderRightColor: "transparent",
            borderRadius: "46% 54% 49% 51%",
            transform: "rotate(-7deg)",
          }}
        />
        <div
          style={{
            width: "28px",
            height: "28px",
            background: "#bd704f",
            transform: "rotate(45deg)",
          }}
        />
      </div>
    ),
    size,
  );
}
