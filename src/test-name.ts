// A test's name as the run shows it, the same in the qa fixture and the
// reporter: the project (when named), the describe blocks and the title.
export const testName = (project: string, path: readonly string[]) => [project, ...path].filter(Boolean).join(' › ');
