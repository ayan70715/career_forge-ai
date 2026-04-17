"use client";

import Avatar from "./Avatar";

type AvatarState = "idle" | "listening" | "thinking" | "speaking";

interface Interviewer {
  id: string;
  name: string;
  state: AvatarState;
}

interface AvatarGridProps {
  interviewers: Interviewer[];
  speakingIntensity: number;
}

export default function AvatarGrid({ interviewers, speakingIntensity }: AvatarGridProps) {
  const count = interviewers.length;

  // 🧠 Layout logic
  const getGridClass = () => {
    if (count === 1) return "flex justify-center";
    if (count === 2) return "grid grid-cols-2 gap-6";
    return "grid grid-cols-2 gap-6"; // 3 handled manually below
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* 1 or 2 interviewers */}
      {count <= 2 && (
        <div className={getGridClass()}>
          {interviewers.map((i) => (
            <Avatar
               key={i.id}
               name={i.name}
               state={i.state}
               intensity={i.state === "speaking" ? speakingIntensity : 0}
            />
          ))}
        </div>
      )}

      {/* 3 interviewers (triangle layout) */}
      {count === 3 && (
        <div className="flex flex-col items-center gap-6">
          {/* Top */}
          <Avatar
            key={interviewers[0].id}
            name={interviewers[0].name}
            state={interviewers[0].state}
          />

          {/* Bottom row */}
          <div className="grid grid-cols-2 gap-6">
            <Avatar
              key={interviewers[1].id}
              name={interviewers[1].name}
              state={interviewers[1].state}
            />
            <Avatar
              key={interviewers[2].id}
              name={interviewers[2].name}
              state={interviewers[2].state}
            />
          </div>
        </div>
      )}
    </div>
  );
}
