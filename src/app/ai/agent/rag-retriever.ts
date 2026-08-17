import { getVectorStore } from "../vector/vector-store";

export async function retrieveRelevantKnowledge(question: string) {
  const store = await getVectorStore();
  const results = await store.similaritySearch(question, 5);
  return results.map((r: any) => r.pageContent).join("\n\n");
}