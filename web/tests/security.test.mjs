import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mergeProgress } from "../lib/progress-merge.ts";

const root = join(import.meta.dirname, "..");
const repo = join(root, "..");

test("frontend uses the Java API and does not grade answers locally", () => {
  const practice = readFileSync(join(root, "app", "practice", "page.tsx"), "utf8");
  assert.match(practice, /apiFetch<AnswerResult>\("\/api\/answers"/);
  assert.doesNotMatch(practice, /picked\s*===\s*q\.correct_answer/);
});

test("progress merge is idempotent and never adds attempt counters", () => {
  const base = { version: 1, history: { q1: { attempts: 2, correct: 1, lastPicked: "B", lastResult: "wrong", type: "CR", ts: 10 } },
    activity: {}, daily: { date: null, level: "Easy", streak: 0, lastPct: null, recent: [] }, adaptive: { level: "Easy" } };
  const remote = structuredClone(base);
  remote.history.q1.attempts = 3; remote.history.q1.correct = 2; remote.history.q1.ts = 20;
  const once = mergeProgress(base, remote);
  const twice = mergeProgress(once, remote);
  assert.equal(once.history.q1.attempts, 3);
  assert.deepEqual(twice, once);
});

test("production public directory contains no answer banks or embeddings", () => {
  for (const name of ["questions-og.json", "questions.json", "questions-quant.json", "embeddings.json"])
    assert.equal(existsSync(join(root, "public", "data", name)), false, name);
});

test("browser never loads corpus embeddings", () => {
  const search = readFileSync(join(root, "components", "SmartSearch.tsx"), "utf8");
  assert.match(search, /\/api\/search/);
  assert.doesNotMatch(search, /embeddings\.json|cosine|dotProduct/);
});

test("Java search and similar endpoints enforce result caps and exclusion", () => {
  const search = readFileSync(join(repo, "backend", "src", "main", "java", "com", "gmattrainer", "controller", "SearchController.java"), "utf8");
  const questions = readFileSync(join(repo, "backend", "src", "main", "java", "com", "gmattrainer", "repository", "QuestionRepository.java"), "utf8");
  assert.match(search, /@Max\(20\)/);
  assert.match(questions, /e\.question_id<>source\.question_id/);
});
