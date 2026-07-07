import type { TestContext } from "node:test";
import { render as inkRender } from "ink-testing-library";
import type { ReactElement } from "react";

export type RenderResult = ReturnType<typeof inkRender>;

/**
 * Renders an Ink element for testing and registers automatic cleanup via
 * `t.after()`. Without this, components using timers (e.g. ink-spinner's
 * setInterval for the working-indicator) keep the event loop alive and the
 * test process never exits even though all assertions pass.
 */
export function renderForTest(t: TestContext, element: ReactElement): RenderResult {
  const result = inkRender(element);
  t.after(() => {
    result.unmount();
  });
  return result;
}
