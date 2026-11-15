// Offline tests for the GitHub calendar parser (a trimmed copy of the real page's markup).
import { test } from "node:test";
import assert from "node:assert/strict";
import { githubWindowStart, parseGithubCalendar } from "../external";

const html = `
<table><tbody><tr>
<td tabindex="0" data-ix="0" aria-selected="false" aria-describedby="contribution-graph-legend-level-1" style="width: 10px" data-date="2026-11-13" id="contribution-day-component-5-50" data-level="1" role="gridcell" class="ContributionCalendar-day"></td>
<td data-date="2026-11-14" id="contribution-day-component-6-50" data-level="3" class="ContributionCalendar-day"></td>
<td id="contribution-day-component-0-51" data-date="2026-11-15" data-level="0" class="ContributionCalendar-day"></td>
</tr></tbody></table>
<tool-tip id="tooltip-a" for="contribution-day-component-5-50" popover="manual" data-direction="n" class="sr-only">1 contribution on November 13th.</tool-tip>
<tool-tip id="tooltip-b" for="contribution-day-component-6-50" popover="manual" class="sr-only">1,204 contributions on November 14th.</tool-tip>
<tool-tip id="tooltip-c" for="contribution-day-component-0-51" class="sr-only">No contributions on November 15th.</tool-tip>
<tool-tip id="tooltip-d" for="something-else" class="sr-only">Unrelated tip</tool-tip>
`;

test("github calendar: joins tooltips to days, handles singular, thousands and none", () => {
  const days = parseGithubCalendar(html);
  assert.deepEqual(Object.fromEntries(days), { "2026-11-13": 1, "2026-11-14": 1204, "2026-11-15": 0 });
});

test("github calendar: a changed page parses to nothing (treated as 'no answer', never as zero)", () => {
  assert.equal(parseGithubCalendar("<html><body>Page moved</body></html>").size, 0);
});

test("github window starts the day before joining", () => {
  assert.equal(githubWindowStart(new Date("2026-11-15T02:00:00Z")), "2026-11-14");
});
