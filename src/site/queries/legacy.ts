import catalog from "../../../public/assets/json/courses.json";

// The static legacy catalog (assets/json/courses.json, Course_model in the PHP app). It is the
// same file the browser script reads, so pages and the client behaviour agree on ids.

export interface LegacyQuestion {
  prompt: string;
  choices: string[];
  answer: number;
  explanation: string;
}
export interface LegacyCourseLesson {
  id: string;
  title: string;
  text: string;
  translation: string;
  vocabulary: string[];
  question: LegacyQuestion;
}
export interface LegacyCourse {
  id: string;
  title: string;
  level: string;
  icon: string;
  description: string;
  lessons: LegacyCourseLesson[];
}
export interface LegacyListening {
  id: string;
  title: string;
  level: string;
  icon: string;
  topic: string;
  text: string;
  translation: string;
  question: LegacyQuestion;
}
export interface LearningData {
  courses: LegacyCourse[];
  listening: LegacyListening[];
  placementQuestions: LegacyQuestion[];
}

export const learningData = catalog as LearningData;
export const courses = learningData.courses;
export const listening = learningData.listening;

export const findCourse = (id: string) => courses.find((c) => c.id === id) ?? null;
export const findLesson = (course: LegacyCourse, id: string) =>
  course.lessons.find((l) => l.id === id) ?? null;
export const findListening = (id: string) => listening.find((l) => l.id === id) ?? null;

/** url() from site_helper.php: each segment URL-encoded. */
export const legacyUrl = (path: string) =>
  "/" +
  path
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
