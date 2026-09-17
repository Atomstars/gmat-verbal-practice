import { apiFetch } from "./api";
import type { Question } from "./types";

let cache: Question[] | null = null;
let loading: Promise<Question[]> | null = null;

/** Fetch safe catalog metadata. Question bodies are delivered only in a server-created session. */
export async function loadAll(): Promise<Question[]> {
  if (cache) return cache;
  if (loading) return loading;
  loading = (async () => {
    const result =
    await apiFetch<{ questions:Array<Partial<Question> & Pick<Question, "id" | "bank" | "type" | "format">> }>("/api/questions/catalog");
    cache = result.questions.map((q) => ({
      ...q, title: null, passage: null, question: "", options: [], chapter: q.chapter ?? null,
    })) as Question[];
    return cache;
  })();
  return loading;
}

export const playable = (q: Question) =>
  q.format !== "open_ended";
