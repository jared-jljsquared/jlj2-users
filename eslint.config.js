import js from '@eslint/js'
import typescriptEslintPlugin from '@typescript-eslint/eslint-plugin'
import typescriptEslintParser from '@typescript-eslint/parser'
import nPlugin from 'eslint-plugin-n'
import importPlugin from 'eslint-plugin-import'
import prettierPlugin from 'eslint-plugin-prettier'
import prettierConfig from 'eslint-config-prettier'

export default [
  // Base JavaScript recommended rules
  js.configs.recommended,
  // Node.js environment
  {
    languageOptions: {
      globals: {
        console: 'readonly', // Explicitly define console
        process: 'readonly', // Add other Node.js globals if needed
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
  },
  // TypeScript recommended rules
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: typescriptEslintParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslintPlugin,
      n: nPlugin,
      import: importPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      ...typescriptEslintPlugin.configs['recommended'].rules,
      ...typescriptEslintPlugin.configs['recommended-requiring-type-checking']
        .rules,
      ...nPlugin.configs.recommended.rules,
      ...importPlugin.configs.recommended.rules,
      ...prettierConfig.rules,
      ...prettierPlugin.configs.recommended.rules,
      // General JavaScript/Node.js rules
      'no-console': 'off',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-unused-vars': 'off',
      'no-undef': 'error',
      'n/no-unsupported-features/es-syntax': ['error', { version: '>=23.6.0' }],
      'n/file-extension-in-import': [
        'error',
        'always',
        { '.ts': 'never', '.json': 'always' },
      ], // Allow .json explicitly
      'import/no-unresolved': ['error', { ignore: ['\\.ts$', '\\.json$'] }],
      // TypeScript-specific rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ],
      // Import rules
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-duplicates': 'error',
      // Prettier rule
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  // Ignore patterns
  {
    ignores: ['node_modules/', 'dist/', 'build/'],
  },
]
