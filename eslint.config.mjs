import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tsEslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import prettier from 'eslint-plugin-prettier';
import importEslint from 'eslint-plugin-import';
import { globalIgnores } from 'eslint/config';

export default tsEslint.config({
  extends: [
    js.configs.recommended,
    ...tsEslint.configs.strictTypeChecked,
    globalIgnores(['**/*.js'])
  ],
  files: ['**/*.{ts,tsx}'],
  ignores: ['node_modules', 'dist', 'coverage', '.yarn/*'],
  languageOptions: {
    ecmaVersion: 2023,
    globals: globals.browser,
    parserOptions: {
      projectService: {
        defaultProject: './tsconfig.json'
      },
      tsconfigRootDir: import.meta.dirname
    }
  },
  plugins: {
    import: importEslint,
    'react-hooks': reactHooks,
    'react-refresh': reactRefresh,
    react,
    prettier,
    jsxRuntime: react.configs.flat['jsx-runtime']
  },
  rules: {
    ...reactHooks.configs.recommended.rules,
    'no-useless-assignment': 'off',
    '@typescript-eslint/no-deprecated': 'off',
    '@typescript-eslint/no-useless-default-assignment': 'off',
    '@typescript-eslint/consistent-type-imports': [
      'warn',
      {
        disallowTypeAnnotations: false,
        fixStyle: 'separate-type-imports',
        prefer: 'type-imports'
      }
    ],
    '@typescript-eslint/no-unnecessary-type-arguments': 'off',
    '@typescript-eslint/no-misused-promises': [
      'error',
      { checksVoidReturn: { attributes: false, arguments: false } }
    ],
    '@typescript-eslint/no-confusing-void-expression': 'off',
    '@typescript-eslint/no-invalid-void-type': 'off',
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true }
    ],
    'no-var': 'error',
    curly: 'error',
    'linebreak-style': ['error', 'unix'],
    quotes: ['error', 'single'],
    'prefer-const': [
      'error',
      { destructuring: 'any', ignoreReadBeforeAssign: false }
    ],
    'react/jsx-key': ['warn', { checkFragmentShorthand: true }],
    'react-hooks/refs': 'off',
    'react-hooks/immutability': 'off',
    'react-hooks/set-state-in-effect': 'off',
    'react-hooks/preserve-manual-memoization': 'off',
    'prettier/prettier': ['warn', { trailingComma: 'none', singleQuote: true, arrowParens: 'avoid' }],
    '@typescript-eslint/restrict-template-expressions': [
      'error',
      { allowNumber: true }
    ],
    'import/order': [
      'error',
      {
        groups: [
          'builtin',
          'external',
          'internal',
          ['parent', 'sibling', 'index'],
          'type'
        ],
        pathGroups: [
          { pattern: '@plitzi/nexus/**', group: 'internal' },
          { pattern: '@plitzi/nexus', group: 'internal' }
        ],
        pathGroupsExcludedImportTypes: ['type'],
        alphabetize: { order: 'asc', caseInsensitive: true },
        'newlines-between': 'always'
      }
    ]
  }
});
