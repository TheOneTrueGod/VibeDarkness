/**
 * Sandboxed Playwright fixtures for agent smoke + e2e specs.
 * Prefer `import { test, expect } from './fixtures/sandboxed'` over `@playwright/test`.
 */

import { test as base, expect } from '@playwright/test';
import { installPlaywrightSandbox } from './sandbox';

export const test = base.extend({
    context: async ({ context }, use) => {
        await installPlaywrightSandbox(context);
        await use(context);
    },
});

export { expect };
