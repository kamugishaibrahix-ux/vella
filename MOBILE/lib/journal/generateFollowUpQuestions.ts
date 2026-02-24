"use server";

export async function generateFollowUpQuestions(text: string | null | undefined): Promise<string[]> {
  const questions = [
    "What part of this story still feels unresolved?",
    "If you trusted yourself fully, what would you do next?",
    "What support would make this feel lighter?",
  ];
  if (!text) return questions.slice(0, 2);
  if (text.includes("?")) {
    questions.unshift("What answer are you hoping to find in that question?");
  }
  return questions.slice(0, 3);
}

