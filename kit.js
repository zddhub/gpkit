import { CsvFile } from "https://deno.land/x/csv_file/mod.ts";

const DOING_COLUMN_NAME = "Doing";
const DONE_COLUMN_NAME = "Done";
const CODE_COMMIT_COLUMN_NAME = "PR ready";
const DEPLOYED_COLUMN_NAME = "Analytics QA";

const OUTPUT_FILE = Deno.args[0] || "output.csv";

const sql = `
{
  repository(owner: "${Deno.env.get("GITHUB_OWNER")}", name: "${
  Deno.env.get("GITHUB_PROJECT_NAME")
}") {
    milestones(last: 13) {
      nodes {
        title
        issues(last: 100, states: CLOSED) {
          nodes {
            title
            url
            labels(first: 10) {
              nodes {
                name
              }
            }
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

const getPoints = (labels) =>  {
  return labels.filter(label => label.name.match(/\d{1,2} Point*/)).map(label => parseInt(label.name.split())).reduce((a, b) => a + b, 0)
}

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
    const commitedAt = timelines.filter((timeline) =>
      timeline.projectColumnName === CODE_COMMIT_COLUMN_NAME
    ).shift()?.createdAt || doingAt;
    const deployedAt = timelines.filter((timeline) =>
      timeline.projectColumnName === DEPLOYED_COLUMN_NAME
    ).pop()?.createdAt || doneAt;
    const labels = issue?.labels.nodes
    return {
      title: issue.title,
      url: issue.url,
      doingAt,
      doneAt,
      commitedAt,
      deployedAt,
      cycleTime: `${daysBetween(doneAt, doingAt)}`,
      leadTime: `${daysBetween(deployedAt, commitedAt)}`,
      points: `${getPoints(labels || [])}`,
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
  "Commited At",
  "Deployed At",
  "Circle Time (days)",
  "Lead Time (days)",
  "Points",
  "Milestone",
]);

results.map((result) => {
  result.events.map((event) => {
    csv.writeRecordSync([
      event.title,
      event.url,
      event.doingAt,
      event.doneAt,
      event.commitedAt,
      event.deployedAt,
      event.cycleTime,
      event.leadTime,
      event.points,
      result.title,
    ]);
  });
});

csv.close();
