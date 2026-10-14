import { DEMO_COURSE, type Course } from './demo/course';
const KEY = 'liveTeacher.course.custom.v1';
export function loadCourse(): Course {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEMO_COURSE);
    const parsed = JSON.parse(raw) as Course;
    if (!parsed || !Array.isArray(parsed.topics) || parsed.topics.length === 0) return structuredClone(DEMO_COURSE);
    return parsed;
  } catch { return structuredClone(DEMO_COURSE); }
}
export function saveCourse(course: Course): void { localStorage.setItem(KEY, JSON.stringify(course)); }
export function resetCourse(): Course { localStorage.removeItem(KEY); return structuredClone(DEMO_COURSE); }