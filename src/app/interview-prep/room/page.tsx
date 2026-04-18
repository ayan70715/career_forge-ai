"use client";

import dynamic from "next/dynamic";

// Three.js / R3F must never run on the server — dynamic import with ssr:false
const InterviewRoomClient = dynamic(() => import("./InterviewRoomClient"), {
  ssr: false,
  loading: () => (
    <div style={{
      height: "100vh",
      background: "#060a10",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "rgba(255,255,255,0.3)",
      fontFamily: "monospace",
      fontSize: "13px",
      letterSpacing: "0.12em",
    }}>
      INITIALISING ROOM...
    </div>
  ),
});

export default function InterviewRoomPage() {
  return <InterviewRoomClient />;
}
