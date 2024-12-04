const fs = require("fs");
const path = require("path");
const NodeFormData = require("form-data");
const nodeFetch = require("node-fetch").default;

const [, , outputPath] = process.argv;
const IMAGE_PATH = path.resolve(process.env.OUTPUT_PATH || outputPath);
// const IMAGE_EXT = IMAGE_PATH.split(".").pop();
const COMMENT_IDENTIFIER = "<!-- GENERATED_IMAGE_COMMENT -->";

async function uploadToCatbox(filePath) {
  // Catbox upload endpoint
  const apiUrl = "https://catbox.moe/user/api.php";

  // Create a form data object
  const formData = new NodeFormData();
  formData.append("reqtype", "fileupload"); // Required parameter for Catbox
  formData.append("fileToUpload", fs.createReadStream(filePath)); // Append the file to upload

  try {
    // Make the POST request to upload the file
    const response = await nodeFetch(apiUrl, {
      method: "POST",
      body: formData,
    });

    // Parse the response text
    const responseText = await response.text();

    if (response.ok) {
      console.log("File uploaded successfully! URL:", responseText);
      return responseText; // Return the URL of the uploaded file
    } else {
      console.error("Failed to upload file. Response:", responseText);
      throw new Error(`File upload failed: ${filePath}`);
    }
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error;
  }
}

async function run() {
  const context = process.env.GITHUB_CONTEXT || "{}";
  const github = JSON.parse(context);
  const [owner, repo] = github.repository.split("/");
  const { event_name, event, sha } = github;

  const imageUrl = await uploadToCatbox(IMAGE_PATH);
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
  const existingComments = await nodeFetch(commentsEndpoint, { headers }).then(
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
  const commentResult = await nodeFetch(params.endpoint, params.requestInit);
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
