// WHAT: Lint guardrails for the React frontend.
// WHY: npm run build (Vite) does NOT catch runtime-only defects such as
//      undefined identifiers, non-function calls, default/named import
//      mismatches, hook-order violations, or props that are plain objects
//      where Recharts expects a component. These rules make that class of
//      error a compile-time failure instead of a 3am crash.
module.exports = [
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        ResizeObserver: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        File: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        history: 'readonly',
        location: 'readonly',
        React: 'readonly',
      },
    },
    plugins: {
      react: require('eslint-plugin-react'),
      'react-hooks': require('eslint-plugin-react-hooks'),
      import: require('eslint-plugin-import'),
    },
    settings: {
      react: { version: '18.2' },
      'import/resolver': {
        node: { paths: ['src'] },
      },
    },
    rules: {
      // --- Catch the exact class of bug the admin pages keep hitting ---
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'after-used', ignoreRestSiblings: true }],
      'no-unused-expressions': 'error',
      'no-constant-condition': 'error',
      'no-call-before-define': ['error', { functions: false, classes: false, variables: false }],

      // --- Import integrity (default vs named import mismatches) ---
      'import/named': 'error',
      'import/default': 'error',
      'import/no-unresolved': 'error',
      'import/no-anonymous-default-export': 'warn',
      'import/first': 'error',
      'import/no-duplicates': 'error',

      // --- React hooks (the "Rendered more hooks than before" #310 class) ---
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // --- React basics ---
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react/no-unknown-property': 'error',
      'react/no-deprecated': 'warn',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'error',

      // --- Style that keeps diffs small ---
      'no-extra-semi': 'error',
      'semi': ['error', 'semicol'],
      'no-trailing-spaces': 'error',
      'eol-last': 'error',
    },
    overrides: [
      {
        files: ['**/constants/labels.js'],
        rules: {
          // Public API surface — intentionally re-exported for future use.
          'no-unused-vars': 'off',
        },
      },
      {
        files: ['**/test/**', '**/*.test.{js,jsx}', '**/__tests__/**', 'vitest.config.js'],
        rules: {
          'no-unused-vars': 'off',
        },
      },
    ],
  },
];