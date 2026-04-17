export interface InterviewerPersona {
  id: string;
  name: string;
  role: string;
  style: string;
}

export function getDefaultPersonas(count: number = 2) {
  const all = [
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
    {
       id: "3",
       name: "John",
      role: "Product Manager",
      style: "excited, disciplined, focuses on solving problems",
    },
  ]
  return all.slice(0, count);
}
