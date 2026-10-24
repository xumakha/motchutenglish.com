// The reward hooks the study module calls (kept as a separate entry point so study does not
// depend on the whole motivation module).
export { ensureQuests, lessonCompleted, questEvent } from "./rewards";
