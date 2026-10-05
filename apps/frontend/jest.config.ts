/* Frontend (React / jsdom) jest config.
 * Run: npx jest --config apps/frontend/jest.config.ts
 * Separate from the root node-env projects; scoped to apps/frontend/src specs. */
import type { Config } from 'jest';

const config: Config = {
  displayName: 'frontend',
  rootDir: '.',
  testEnvironment: '<rootDir>/test/jsdom-no-canvas.env.js',
  testMatch: ['<rootDir>/src/**/*.spec.{ts,tsx}'],
  transform: {
    '^.+\\.(t|j)sx?$': [
      'ts-jest',
      {
        tsconfig: {
          isolatedModules: true,
          jsx: 'react-jsx',
          esModuleInterop: true,
          allowJs: true,
          module: 'commonjs',
          moduleResolution: 'node',
          skipLibCheck: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@gitroom/frontend/(.*)$': '<rootDir>/src/$1',
    '^@gitroom/react/(.*)$': '<rootDir>/../../libraries/react-shared-libraries/src/$1',
    '^@gitroom/helpers/(.*)$': '<rootDir>/../../libraries/helpers/src/$1',
    '^@gitroom/nestjs-libraries/(.*)$': '<rootDir>/../../libraries/nestjs-libraries/src/$1',
    '\\.(css|scss|sass|less)$': 'identity-obj-proxy',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  clearMocks: true,
};

export default config;
