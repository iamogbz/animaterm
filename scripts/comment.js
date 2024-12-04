const fs = require("fs");
const nodeFetch = require("node-fetch").default;

const [, , outputPath] = process.argv;
const IMAGE_PATH = process.env.OUTPUT_PATH || outputPath;
const IMAGE_EXT = IMAGE_PATH.split(".").pop();
const COMMENT_IDENTIFIER = "<!-- GENERATED_IMAGE_COMMENT -->";

async function run() {
  const context = process.env.GITHUB_CONTEXT || "{}";
  const github = JSON.parse(context);
  const [repo, owner] = github.repository.split("/");
  const { event_name, pull_request, sha } = github;

  // Convert the image to base64
  const readParams = { encoding: "base64" };
  const imageBase64 = fs.readFileSync(IMAGE_PATH, { encoding: "base64" });
  const imageMarkdown = `![Generated Image](data:image/${IMAGE_EXT};${readParams.encoding},${imageBase64})`;

  const commentBody = `${COMMENT_IDENTIFIER}\n${imageMarkdown}`;

  // Determine if we are on a PR or commit
  const isPullRequest = event_name === "pull_request";
  const endpoint = [
    `https://api.github.com/repos/${owner}/${repo}/`,
    isPullRequest ? `issues/${pull_request.number}` : `commits/${sha}`,
    "/comments",
  ].join("");

  const Authorization = `token ${process.env.GITHUB_TOKEN}`;
  const headers = {
    Authorization,
    "Content-Type": "application/json",
  };

  // Get existing comments
  const existingComments = await nodeFetch(endpoint, {
    headers: { Authorization },
  }).then((res) => res.json());

  if (!Array.isArray(existingComments))
    throw new Error("Could not retrieve comments");

  const existingComment = existingComments.find(
    (/** @type {{ body: string }} */ comment) =>
      comment.body.includes(COMMENT_IDENTIFIER)
  );

  const requestInit = Object.freeze({
    headers,
    body: JSON.stringify({ body: commentBody }),
  });

  if (existingComment) {
    // Update existing comment
    await nodeFetch(`${endpoint}/${existingComment.id}`, {
      method: "PATCH",
      ...requestInit,
    });
  } else {
    // Post new comment
    await nodeFetch(endpoint, {
      method: "POST",
      ...requestInit,
    });
  }
}

run().catch((error) => {
  console.error("Failed to post or update the comment:", error);
  process.exit(1);
});
