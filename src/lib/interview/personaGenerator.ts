export interface InterviewerPersona {
  id: string;
  name: string;
  role: string;
  style: string;
}

export function getDefaultPersonas(): InterviewerPersona[] {
  return [
    {
      id: "1",
      name: "Amit",
      role: "Senior Backend Engineer",
      style: "strict, technical, asks deep follow-ups",
    },
    {
      id: "2",
      name: "Riya",
      role: "HR Manager",
      style: "friendly, behavioral, focuses on communication",
    },
  ];
}
