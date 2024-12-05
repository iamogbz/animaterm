const fs = require("fs");
const path = require("path");

const [, , outputPath] = process.argv;
const finalOutputPath = outputPath || process.env.OUTPUT_PATH || outputPath;
const IMAGE_PATH = path.resolve(finalOutputPath);
const COMMENT_IDENTIFIER = "<!-- GENERATED_IMAGE_COMMENT -->";

async function generateImageDataURL(filePath) {
  try {
    const imageBuffer = fs.readFileSync(filePath);
    const imageExt = filePath.split(".").pop();
    const base64Image = imageBuffer.toString("base64");
    const dataURL = `data:image/${imageExt};base64,${base64Image}`;
    return dataURL;
  } catch (error) {
    console.error("Error generating data URL:", error);
    throw error; // Re-throw to handle in the calling function
  }
}

async function run() {
  const context = process.env.GITHUB_CONTEXT || "{}";
  const github = JSON.parse(context);
  const [owner, repo] = github.repository.split("/");
  const { event_name, event, sha } = github;

  const imageUrl = await generateImageDataURL(IMAGE_PATH);
  const imageMarkdown = `![Generated Image](${imageUrl})`;

  const commentBody = `${COMMENT_IDENTIFIER}\n${imageMarkdown}`;

  // Determine if we are on a PR or commit
  const isPullRequest = event_name === "pull_request";
  const repoEndpoint = `https://api.github.com/repos/${owner}/${repo}/`;
  const commentsEndpoint = [
    repoEndpoint,
    isPullRequest ? `issues/${event.number}` : `commits/${sha}`,
    "/comments",
  ].join("");

  const Authorization = `token ${process.env.GITHUB_TOKEN}`;
  const headers = {
    Authorization,
    "Content-Type": "application/json",
  };

  // Get existing comments
  const existingComments = await fetch(commentsEndpoint, { headers }).then(
    (res) => res.json()
  );

  if (!Array.isArray(existingComments))
    throw new Error(
      `Could not retrieve comments: ${commentsEndpoint} -> ${JSON.stringify(
        existingComments
      )}`
    );

  const existingComment = existingComments.find(
    (/** @type {{ body: string }} */ comment) =>
      comment.body.includes(COMMENT_IDENTIFIER)
  );

  const params = {
    endpoint: commentsEndpoint,
    requestInit: {
      headers,
      body: JSON.stringify({ body: commentBody }),
    },
  };

  if (existingComment) {
    // Update existing comment
    console.log("Updating existing comment", existingComment.id);
    if (isPullRequest) {
      params.endpoint = `${repoEndpoint}issues/comments`;
    }
    params.endpoint = `${params.endpoint}/${existingComment.id}`;
    params.requestInit.method = "PATCH";
  } else {
    // Post new comment
    console.log("Creating new comment");
    params.requestInit.method = "POST";
  }

  console.log("Comment request", params);
  const commentResult = await fetch(params.endpoint, params.requestInit);
  console.log("Comment response", {
    body: await commentResult.text(),
    status: commentResult.status,
    statusText: commentResult.statusText,
  });
}

run().catch((error) => {
  console.error("Failed to post or update the comment:", error);
  process.exit(1);
});
