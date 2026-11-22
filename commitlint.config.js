// Conventional commits: https://www.conventionalcommits.org
// `level` is a project-specific type for new or updated levels.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Keep headers short and scannable (`type: subject`)
    'header-max-length': [2, 'always', 72],
    'type-enum': [
      2,
      'always',
      [
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'level',
        'perf',
        'refactor',
        'revert',
        'style',
        'test',
      ],
    ],
  },
};
