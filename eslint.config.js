// File: eslint.config.js

import eslint from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	...tseslint.configs.stylisticTypeChecked,
	{
		languageOptions: {
			parserOptions: {
				project: true,
				tsconfigRootDir: __dirname,
			},
		},
		plugins: {
			import: importPlugin,
		},
		rules: {
			// Custom rules from old config
			'new-cap': 'off',
			'@typescript-eslint/prefer-readonly-parameter-types': 'off',
			'import/extensions': ['error', 'ignorePackages'],
			// Enforce `import type` for type-only imports
			'@typescript-eslint/consistent-type-imports': ['error', {
				prefer: 'type-imports',
				fixStyle: 'inline-type-imports',
			}],
			// Modern unused vars rule (replaces no-unused-vars-experimental)
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
				},
			],
		},
	},
	{
		ignores: [
			'dist/**',
			'node_modules/**',
			'web',
			'web/**',
			'data/**',
			'logs/**',
			'migrations/**',
			'*.config.js',
			'*.config.cjs',
			'*.config.mjs',
			'*.d.ts',
			'coverage/**',
			'.cache/**',
			'.git/**',
		],
	},
);
