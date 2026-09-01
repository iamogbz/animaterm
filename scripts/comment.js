const fs = require("fs");
const path = require("path");
const { getArgs } = require("../src/core");
const nodeFetch = require("node-fetch").default;

const args = getArgs();
const IMAGE_PATH = path.resolve(args.animationOutput);
const COMMENT_IDENTIFIER = "<!-- GENERATED_IMAGE_COMMENT -->";
const DEFAULT_BRANCH = "main";

/**
 * Helper function to resolve MIME type natively
 * @param {string} filePath
 */
function getMimeType(filePath) {
  const mimeMap = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
  };
  const ext = path.extname(filePath).toLowerCase();
  // @ts-expect-error cause regular js can be stupid sometimes
  return mimeMap[ext] || "application/octet-stream";
}

/**
 * Upload to github user assets
 * @param {string} filePath local file path
 * @param {string} owner
 * @param {string} repo
 * @param {string} token
 * @returns uploaded image path
 */
async function uploadToAssets(filePath, owner, repo, token) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const mimeType = getMimeType(filePath);
    const repoUrl = `https://api.github.com/repos/${owner}/${repo}`;

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "NodeJS-Script", // GitHub API requires a User-Agent
    };

    // Step 1: Get the Repository ID
    console.log("Fetching repository metadata...", repoUrl);
    const repoResponse = await fetch(repoUrl, { headers });
    if (!repoResponse.ok)
      throw new Error(`Repo fetch failed: ${repoResponse.statusText}`);
    const repoData = await repoResponse.json();
    const repoId = repoData.id;

    // Step 2: Upload the binary image file
    const encodedFileName = encodeURIComponent(fileName);
    const encodedContentType = encodeURIComponent(mimeType);
    const uploadUrl = `https://uploads.github.com/user-attachments/assets?name=${encodedFileName}&content_type=${encodedContentType}&repository_id=${repoId}`;
    console.log("Uploading image asset...", uploadUrl);

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": mimeType,
        "User-Agent": "NodeJS-Script",
      },
      body: fileBuffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed (${uploadResponse.status}): ${errorText}`);
    }

    const uploadData = await uploadResponse.json();
    const imageUrl = uploadData.asset.href;
    console.log(`Image for commit uploaded successfully! URL: ${imageUrl}`);
    return imageUrl;
  } catch (error) {
    console.error("Error executing workflow:", error);
  }
}

/**
 * Upload to github repo contents
 * @param {string} filePath local file path
 * @param {string} owner
 * @param {string} repo
 * @param {string} token
 * @returns uploaded image path
 */
async function uploadToGitHub(filePath, owner, repo, token) {
  // Read file and encode to base64 for GitHub Contents API
  const content = fs.readFileSync(filePath, { encoding: "base64" });
  const fileName = path.basename(filePath);

  // Ensure it uploads to the correct branch if running on a PR or specific branch
  const branch =
    process.env.GITHUB_HEAD_REF ||
    process.env.GITHUB_REF_NAME ||
    DEFAULT_BRANCH;

  // Calculate relative path in the repo to use as the destination path
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const repoRelativePath = path
    .relative(workspace, filePath)
    .split(path.sep)
    .join("/");

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${repoRelativePath}?ref=${branch}`;
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

  const body = {
    message: `Upload ${fileName}`,
    content,
  };

  if (branch) Object.assign(body, { branch });
  if (fileSha) Object.assign(body, { sha: fileSha });

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

  if (!token) {
    console.error("No GITHUB_TOKEN detected in environment");
    process.exit(1);
  }

  // Determine if we are on a PR or commit
  const isPullRequest = event_name === "pull_request";

  const imageUrl = await (isPullRequest
    ? uploadToGitHub(IMAGE_PATH, owner, repo, token)
    : uploadToAssets(IMAGE_PATH, owner, repo, token));
  const imageMarkdown = `![Generated Image](${imageUrl})`;

  const commentBody = `${COMMENT_IDENTIFIER}\n${imageMarkdown}`;

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

  let method = "POST";
  if (existingComment) {
    // Update existing comment
    console.log("Updating existing comment", existingComment.id);
    if (isPullRequest) {
      params.endpoint = `${repoEndpoint}issues/comments`;
    }
    params.endpoint = `${params.endpoint}/${existingComment.id}`;
    method = "PATCH";
  } else {
    // Post new comment
    console.log("Creating new comment");
  }
  Object.assign(params.requestInit, { method });

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
