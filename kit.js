import { CsvFile } from "https://deno.land/x/csv_file/mod.ts";

const DOING_COLUMN_NAME = "Doing";
const DONE_COLUMN_NAME = "Done";

const OUTPUT_FILE = Deno.args[0] || "output.csv";

const sql = `
{
  repository(owner: "${Deno.env.get("GITHUB_OWNER")}", name: "${
  Deno.env.get("GITHUB_PROJECT_NAME")
}") {
    milestones(first: 20) {
      nodes {
        title
        issues(last: 100, states: CLOSED) {
          nodes {
            title
            url
            timelineItems(itemTypes: [MOVED_COLUMNS_IN_PROJECT_EVENT, ADDED_TO_PROJECT_EVENT], first: 100) {
              nodes {
                __typename
                ... on MovedColumnsInProjectEvent {
                  createdAt
                  projectColumnName
                }
                ... on AddedToProjectEvent {
                  createdAt
                  projectColumnName
                }
              }
            }
          }
        }
      }
    }
  }
}
`;

const daysBetween = (endDate, startDate) => {
  return Math.ceil(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) /
      (1000 * 60 * 60 * 24),
  );
};

const response = await fetch(Deno.env.get("GRAPHQL_ENDPOINT"), {
  method: "POST",
  headers: {
    "X-Transaction-id": "trace-test",
    "Authorization": `bearer ${Deno.env.get("GITHUB_TOKEN")}`,
    "Accept": "application/vnd.github.starfox-preview+json",
  },
  body: JSON.stringify({ query: sql }),
});

const responseBody = await response.json();
// console.log(JSON.stringify(responseBody))

const milestones = responseBody.data.repository.milestones.nodes;

const results = milestones.map((milestone) => {
  const issues = milestone.issues.nodes;
  const events = issues.map((issue) => {
    const timelines = issue.timelineItems.nodes;
    const doingAt = timelines.filter((timeline) =>
      timeline.projectColumnName === DOING_COLUMN_NAME
    ).shift()?.createdAt || "";
    const doneAt = timelines.filter((timeline) =>
      timeline.projectColumnName === DONE_COLUMN_NAME
    ).pop().createdAt || "";
    return {
      title: issue.title,
      url: issue.url,
      doingAt,
      doneAt,
      cycleTime: `${daysBetween(doneAt, doingAt)}`,
    };
  }).sort((a, b) => new Date(a.doneAt) - new Date(b.doneAt));

  return {
    title: milestone.title,
    events,
  };
});

console.log(JSON.stringify(results, null, 2));

const csv = new CsvFile(
  await Deno.open(OUTPUT_FILE, {
    read: true,
    write: true,
    create: true,
    truncate: true,
  }),
);
csv.writeRecordSync([
  "Title",
  "Url",
  "Doing At",
  "Done At",
  "Circle Time (days)",
  "Milestone",
]);

results.map((result) => {
  result.events.map((event) => {
    csv.writeRecordSync([
      event.title,
      event.url,
      event.doingAt,
      event.doneAt,
      event.cycleTime,
      result.title,
    ]);
  });
});

csv.close();
