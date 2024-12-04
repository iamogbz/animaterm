const fs = require("fs");
const nodeFetch = require("node-fetch").default;

const [, , outputPath] = process.argv;
const IMAGE_PATH = process.env.OUTPUT_PATH || outputPath;
// const IMAGE_EXT = IMAGE_PATH.split(".").pop();
const COMMENT_IDENTIFIER = "<!-- GENERATED_IMAGE_COMMENT -->";

async function uploadToCatbox(filePath) {
  // Catbox upload endpoint
  const apiUrl = 'https://catbox.moe/user/api.php';

  // Create a form data object
  const formData = new FormData();
  formData.append('reqtype', 'fileupload'); // Required parameter for Catbox
  formData.append('fileToUpload', filePath); // Append the file to upload

  try {
      // Make the POST request to upload the file
      const response = await fetch(apiUrl, {
          method: 'POST',
          body: formData,
      });

      // Parse the response text
      const responseText = await response.text();

      if (response.ok) {
          console.log('File uploaded successfully! URL:', responseText);
          return responseText; // Return the URL of the uploaded file
      } else {
          console.error('Failed to upload file. Response:', responseText);
          throw new Error('File upload failed');
      }
  } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
  }
}

async function run() {
  const context = process.env.GITHUB_CONTEXT || "{}";
  const github = JSON.parse(context);
  const [owner, repo] = github.repository.split("/");
  const { event_name, event, sha } = github;

  // Convert the image to base64
  // const readParams = { encoding: "base64" };
  // const imageBase64 = fs.readFileSync(IMAGE_PATH, { encoding: "base64" });
  // const imageMarkdown = `![Generated Image](data:image/${IMAGE_EXT};${readParams.encoding},${imageBase64})`;
  const imageMarkdown = `![Generated Image](${await uploadToCatbox(IMAGE_PATH)})`;

  const commentBody = `${COMMENT_IDENTIFIER}\n${imageMarkdown}`;

  // Determine if we are on a PR or commit
  const isPullRequest = event_name === "pull_request";
  const endpoint = [
    `https://api.github.com/repos/${owner}/${repo}/`,
    isPullRequest ? `issues/${event.number}` : `commits/${sha}`,
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
    throw new Error(
      `Could not retrieve comments: ${endpoint} -> ${JSON.stringify(
        existingComments
      )}`
    );

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
