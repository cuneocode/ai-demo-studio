import type { Page } from "@playwright/test";

export const PLANNER_FIXTURE_URL = "https://planner.example.test/embed/1.0.0/planner.js";
export async function mockPlanner(page: Page) {
  await page.route("**/api/studio/planner**", route => route.fulfill({ json: {
    configured: true, bundleUrl: PLANNER_FIXTURE_URL, apiBaseUrl: "https://planner.example.test",
  } }));
  await page.route("https://planner.example.test/embed/1.0.0/planner.js", route => route.fulfill({
    contentType: "text/javascript", headers: { "Access-Control-Allow-Origin": "*" }, body: `
      class PlannerFixture extends HTMLElement {
        initialize(seed, configuration) {
          this.seed = seed; this.configuration = configuration;
          const calls = Number(this.getAttribute('data-initializations') || 0) + 1;
          this.setAttribute('data-initializations', String(calls));
          if (calls > 1) { this.dispatchEvent(new CustomEvent('planner-error', {detail: {message: 'Repeated initialization'}})); return; }
          const root = this.attachShadow({mode: 'open'});
          root.innerHTML = '<h3>Requirements</h3><label>Assessment name <input /></label>';
          const input = root.querySelector('input');
          const key = 'planner-fixture:' + seed.useCaseId + ':' + seed.assessmentId;
          input.value = localStorage.getItem(key) || seed.assessment.name;
          input.addEventListener('input', () => localStorage.setItem(key, input.value));
          queueMicrotask(() => {
            this.dispatchEvent(new CustomEvent('planner-ready', {detail: {version: 1, bundleVersion: '1.0.0'}}));
            this.dispatchEvent(new CustomEvent('assessment-changed', {detail: {current: false, snapshot: {assessment: 'private'}}}));
          });
        }
        navigate(section) { this.shadowRoot.querySelector('h3').textContent = section === '/genai-sizing' ? 'Requirements' : section; }
      }
      customElements.define('ai-infrastructure-planner', PlannerFixture);
    `,
  }));
}
