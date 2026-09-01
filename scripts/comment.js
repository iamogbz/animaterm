const fs = require("fs");
const path = require("path");
const nodeFetch = require("node-fetch").default;

const [, , outputPath] = process.argv;
const finalOutputPath = outputPath || process.env.OUTPUT_PATH || outputPath;
const IMAGE_PATH = path.resolve(finalOutputPath);
// const IMAGE_EXT = IMAGE_PATH.split(".").pop();
const COMMENT_IDENTIFIER = "<!-- GENERATED_IMAGE_COMMENT -->";

async function uploadToGitHub(filePath, owner, repo, token) {
  // Read file and encode to base64 for GitHub Contents API
  const content = fs.readFileSync(filePath, { encoding: "base64" });
  const fileName = path.basename(filePath);
  
  // Calculate relative path in the repo to use as the destination path
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const repoRelativePath = path.relative(workspace, filePath).split(path.sep).join("/");

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${repoRelativePath}`;
  const headers = {
    Authorization: `token ${token}`,
    "Content-Type": "application/json",
  };

  // Check if file exists to get its SHA (required for updating an existing file)
  let fileSha;
  try {
    const getFileResponse = await nodeFetch(apiUrl, { headers });
    if (getFileResponse.ok) {
      const getFileData = await getFileResponse.json();
      fileSha = getFileData.sha;
    }
  } catch (error) {
    // Silently ignore, file likely does not exist yet
  }

  // Ensure it uploads to the correct branch if running on a PR or specific branch
  const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;

  const body = {
    message: `Upload ${fileName}`,
    content,
  };

  if (branch) body.branch = branch;
  if (fileSha) body.sha = fileSha;

  try {
    const response = await nodeFetch(apiUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });

    const responseData = await response.json();

    if (response.ok) {
      // Using html_url with ?raw=true ensures it renders properly in markdown, even in private repos
      const rawUrl = `${responseData.content.html_url}?raw=true`;
      console.log("File uploaded successfully! URL:", rawUrl);
      return rawUrl;
    } else {
      console.error("Failed to upload file. Response:", responseData);
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
  const token = process.env.GITHUB_TOKEN;

  const imageUrl = await uploadToGitHub(IMAGE_PATH, owner, repo, token);
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

  const Authorization = `token ${token}`;
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
