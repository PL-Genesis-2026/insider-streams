import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
        <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
        }}
      >
        <svg
          viewBox="0 0 32 32"
          width="32"
          height="32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            x="16"
            y="2"
            width="19.8"
            height="19.8"
            rx="2"
            transform="rotate(45 16 2)"
            stroke="#c3926e"
            strokeWidth="2.2"
            fill="none"
          />
          <path
            d="M8.5 20.5 Q16 15 23.5 12"
            stroke="#c3926e"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M8.5 14.5 Q16 19 23.5 22"
            stroke="#c3926e"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
